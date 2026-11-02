import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineLp0, proofSchema } from "./migration-proof-loader.js";
import { parseInventory } from "./lp-0-catalog.js";

const migration = readFileSync(new URL("../migrations/0554_dark_merchant_order.sql", import.meta.url), "utf8");
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
    const proof = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0554_dark_merchant_order.proof.json", import.meta.url), "utf8")));
    expect(proof.migration).toBe("0554_dark_merchant_order.sql");
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
