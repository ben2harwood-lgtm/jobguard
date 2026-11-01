import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs, PROOF_DIRECTORY, type MigrationProofSnapshot } from "./migration-proof-loader.js";
import { parseInventory, pathCompleteness } from "./lp-0-catalog.js";
import { fileURLToPath } from "node:url";

// Check this branch's fragments independently of main's missing 0510 proof (#502).
// The unchanged whole-registry loader test and PostgreSQL suites remain CI gates.
const legacy: string[] = JSON.parse(readFileSync(`${PROOF_DIRECTORY}/legacy-migrations.json`, "utf8"));
const { proofs } = loadMigrationProofs(PROOF_DIRECTORY, [...legacy, "0539_privacy_operations.sql", "0546_dsar_offboarding.sql"]);
const tables = ["privacy_artifact", "privacy_command", "privacy_request", "privacy_subject"];
const owner = "jobguard_migration";

describe("M5-11 and its M0-13c dependency proof composition", () => {
  it("combines exact capabilities into a complete inventory without direct privacy table grants", () => {
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const inventory = parseInventory(combineLp0(baseline, proofs));
    expect(pathCompleteness(inventory, p => existsSync(fileURLToPath(new URL(`../../../${p}`, import.meta.url))))).toEqual([]);
    expect(inventory.entries.filter(e => e.key.includes("app.privacy_") && e.key.startsWith("acl|"))).toEqual([
      { key: "acl|routine|function:app.privacy_command(uuid,text,jsonb)|jobguard_runtime|EXECUTE|-", group: "a-exec-privacy-rehearsal" },
      { key: "acl|routine|function:app.privacy_read(uuid,text,uuid)|jobguard_runtime|EXECUTE|-", group: "a-exec-privacy-rehearsal" },
    ]);
  });
  it("extends tenancy exactly once and preserves forced RLS on every privacy table", () => {
    expect(applyTenancyProofs([], proofs, "rls")).toEqual(tables.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true, guarded: true })));
    expect(proofs[1]!.tenancy).toEqual([]);
  });
  it("adds only the named tables, primary keys, policies and routines to the upgrade snapshot", () => {
    const result = applyUpgradeProofs<MigrationProofSnapshot>({ rows: {}, routines: [], relations: [], policies: [] }, proofs, { [owner]: 42 });
    expect(Object.keys(result.rows).sort()).toEqual(tables.map(t => `app.${t}`));
    expect(result.relations.map(r => r.relname)).toEqual(tables.flatMap(t => [t, `${t}_pkey`]));
    expect(result.relations.filter(r => !r.relrowsecurity).map(r => r.relname)).toEqual(tables.map(t => `${t}_pkey`));
    expect(result.policies.map(p => p.tablename)).toEqual(tables);
    expect(result.routines.map(r => r.proname)).toEqual(["privacy_command", "privacy_inventory_fence", "privacy_read"]);
    expect(result.routines.find(r => r.proname === "privacy_inventory_fence")).toMatchObject({ proowner: 42, proacl: "{jobguard_migration=X/jobguard_migration}", prosecdef: true, proconfig: ["search_path=pg_catalog"] });
  });
});
