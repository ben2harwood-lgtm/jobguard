import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineLp0, proofSchema } from "./migration-proof-loader.js";
import { parseInventory } from "./lp-0-catalog.js";

const migration = readFileSync(new URL("../migrations/0606_dark_merchant_order.sql", import.meta.url), "utf8");
const priorSource = readFileSync(new URL("../migrations/0303_job_source_intake.sql", import.meta.url), "utf8");
const commandKinds = (sql: string) => [...sql.matchAll(/'((?:WorkState|JobSource)\.[^']+|[a-z_]+\.[a-z_]+)'/gu)].map(match => match[1]!);

describe("M2-1 migration compatibility (source checks, not PostgreSQL evidence)", () => {
  it("retains every pre-existing command kind, including 0380 resume, while adding manual attestation", () => {
    const before = priorSource.slice(priorSource.indexOf("CHECK(command_type IN("), priorSource.indexOf("-- Expose"));
    const after = migration.slice(migration.indexOf("CHECK(command_type IN("), migration.indexOf("-- Existing orders"));
    const kinds = commandKinds(after);
    expect(kinds).toEqual(expect.arrayContaining([...commandKinds(before), "WorkState.resume", "purchase_order.attest_manual"]));
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("composes the owned proof with the shared LP-0 baseline exactly once", () => {
    const proof = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0606_dark_merchant_order.proof.json", import.meta.url), "utf8")));
    expect(proof.migration).toBe("0606_dark_merchant_order.sql");
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const inventory = parseInventory(combineLp0(baseline, [proof]));
    for (const change of proof.lp0.filter(c => c.section === "entries")) {
      expect(inventory.entries.filter(entry => entry.key === (change.after as { key: string }).key)).toEqual([change.after]);
    }
    for (const name of ["guard_dark_order_revision", "guard_manual_order_effect"]) {
      const identity = `function:app.${name}()`;
      // Unreachable helpers carry no owner row, the same as guard_receipt_fact_line on main.
      expect(inventory.entries.filter(entry => entry.key === `owner|routine|${identity}|jobguard_migration`)).toEqual([]);
      expect(inventory.recorded.routines.filter(r => r.identity === identity)).toEqual([{
        identity, owner: "jobguard_migration", securityDefiner: false,
        searchPath: "search_path=pg_catalog, app", returnsTrigger: true, extension: null,
        reachable: false, runtimeExecute: false, publicExecute: false, otherExecute: [],
        // No PostgreSQL definition digest is claimed by this source-only proof.
        definitionSha256: null, staticWrites: [], staticCalls: [],
      }]);
    }
    expect(proof.upgrade.filter(c => c.section === "routines").map(c => c.after)).toEqual([
      expect.objectContaining({ proname: "guard_dark_order_revision", args: "", prosecdef: false }),
      expect.objectContaining({ proname: "guard_manual_order_effect", args: "", prosecdef: false }),
    ]);
    expect(proof.upgrade.filter(c => c.section === "policies").map(c => c.after)).toEqual([
      expect.objectContaining({ tablename: "purchase_order_manual_attestation", roles: "{jobguard_runtime}" }),
    ]);
    expect(proof.tenancy).toEqual([{
      relname: "purchase_order_manual_attestation", before: null,
      after: { relrowsecurity: true, relforcerowsecurity: true, guarded: true, owner: "jobguard_migration" },
    }]);
  });
});

describe("M2-1 checked command compatibility", () => {
  it("preserves every latest-main result adapter outside the exact dark-order branch", () => {
    const current = readFileSync(new URL("../migrations/0573_site_supervisor_query.sql", import.meta.url), "utf8");
    const body = (sql: string) => {
      const start = sql.indexOf("CREATE OR REPLACE FUNCTION app.lp5_command_result(");
      return sql.slice(start, sql.indexOf("END $$;", start) + 8);
    };
    const withoutDark = body(migration).replace(/  IF r\.command_type='purchase_order\.send\.dark' THEN[\s\S]*?  ELSE\n/u, "")
      .replace("  END IF;\n WHEN 'recovery_terms' THEN", " WHEN 'recovery_terms' THEN");
    expect(withoutDark).toBe(body(current));
    expect(migration).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION app\.(?:begin_command|complete_command|lp5_check_command_completion)\(/u);
    expect(migration).toContain("AND (o.immutable_content::jsonb)->>'revisionAuthorityHash'=v.authority_hash");
    expect(migration).toContain("o.content_hash=encode(sha256(convert_to(o.immutable_content,'UTF8')),'hex')");
  });

  it("registers only the exact dark command with the fake merchant outbox", async () => {
    const { darkOrderRegistryRow, currentCommandRegistryRows } = await import("./lp5-command-catalog.js");
    const seeds = migration.split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!;
    const values = seeds.match(/\(([^()]+)\)/u)![1]!.split(",").map(value => value.trim().slice(1, -1));
    expect(Object.fromEntries(Object.keys(darkOrderRegistryRow).map((key, index) => [key, values[index]]))).toEqual(darkOrderRegistryRow);
    const proof = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0606_dark_merchant_order.proof.json", import.meta.url), "utf8")));
    const delta = proof.upgrade.find(change => change.section === "rows" && change.after?.table === "app.command_type_registry")!;
    if (delta.section !== "rows") throw new Error("Missing registry proof");
    const historicalCommandRegistryRows = currentCommandRegistryRows.filter(row => row.command_type !== "rate.suggestion_accept")
      .map(row => row.command_type === "IssueClientApproval" ? { ...row, permission_rule: "owner" } : row);
    expect(delta.after!.data).toEqual(expect.arrayContaining(historicalCommandRegistryRows));
    expect(delta.after!.data).toHaveLength(historicalCommandRegistryRows.length);
    expect(delta.after!.data.filter(row => (row as { command_type: string }).command_type !== "purchase_order.send.dark")).toEqual(delta.before!.data);
  });
});
