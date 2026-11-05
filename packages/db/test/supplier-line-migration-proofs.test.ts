import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lp5RegistryRows, lateSourceRegistryRow, managedRecoveryRegistryRow, siteSupervisorQueryRegistryRow, darkOrderRegistryRow } from "./lp5-command-catalog.js";
import { parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs } from "./migration-proof-loader.js";

it("M2-4 and its sibling proofs preserve main and keep tables guarded and routines private", () => {
  // Main's separately owned pending 0510 proof must not mask validation of these fragments.
  const directory = mkdtempSync(join(tmpdir(), "jg-supplier-proofs-"));
  const migrations = ["0606_dark_merchant_order.sql", "1200_supplier_line_corrections.sql"];
  try {
    writeFileSync(join(directory, "legacy-migrations.json"), "[]");
    for (const migration of migrations) {
      const file = migration.replace(/\.sql$/, ".proof.json");
      writeFileSync(join(directory, file), readFileSync(new URL(`./migration-proofs/${file}`, import.meta.url)));
    }
    const { proofs } = loadMigrationProofs(directory, migrations);
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const original = structuredClone(baseline);
    const combined = parseInventory(combineLp0(baseline, proofs));
    expect(baseline).toEqual(original);
    expect(combined.entries.filter(e => !baseline.entries.some(b => b.key === e.key))).toHaveLength(9);
    expect(combined.entries.filter(e => e.key.includes("supplier_line_match_audit_guard"))).toEqual([]);
    const registryProof = proofs[0]!.upgrade.find(change => change.section === "rows" && change.before?.table === "app.command_type_registry")!;
    if (registryProof.section !== "rows") throw new Error("Missing registry proof");
    // SQL catalogue snapshots retain their own row order; independently check
    // every predecessor entry before using that exact snapshot as the baseline.
    expect(registryProof.before!.data).toEqual(expect.arrayContaining([...lp5RegistryRows, lateSourceRegistryRow, managedRecoveryRegistryRow, siteSupervisorQueryRegistryRow]));
    expect(registryProof.before!.data).toHaveLength(lp5RegistryRows.length + 3);
    const expected = applyUpgradeProofs({ rows: { "app.command_type_registry": registryProof.before!.data }, routines: [], relations: [], policies: [] }, proofs, { jobguard_migration: 42 });
    expect(Object.keys(expected.rows).sort()).toEqual([
      "app.command_type_registry", "app.purchase_order_manual_attestation", "app.supplier_line_match_correction", "app.supplier_line_match_snapshot",
    ]);
    // This fixture stops at 0606; main adds rate.suggestion_accept in 0609.
    const registryAt0606 = [...lp5RegistryRows, lateSourceRegistryRow, managedRecoveryRegistryRow, siteSupervisorQueryRegistryRow, darkOrderRegistryRow];
    expect(expected.rows["app.command_type_registry"]).toEqual(expect.arrayContaining(registryAt0606));
    expect(expected.rows["app.command_type_registry"]).toHaveLength(registryAt0606.length);
    expect(expected.routines).toHaveLength(3);
    for (const routine of expected.routines) expect(routine).toMatchObject({
      proowner: 42, proacl: "{jobguard_migration=X/jobguard_migration}", prosecdef: false,
    });
    const tables = applyTenancyProofs([], proofs, "rls");
    expect(tables).toHaveLength(3);
    for (const table of tables) expect(table).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, guarded: true });
    expect(expected.relations).toHaveLength(16);
    expect(expected.policies).toHaveLength(3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
