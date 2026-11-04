import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { currentCommandRegistryRows, lp5RegistryRows, lateSourceRegistryRow, managedRecoveryRegistryRow } from "./lp5-command-catalog.js";
import { parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs } from "./migration-proof-loader.js";

it("M2-4 and its sibling proofs preserve main and keep tables guarded and routines private", () => {
  // Main's separately owned pending 0510 proof must not mask validation of these fragments.
  const directory = mkdtempSync(join(tmpdir(), "jg-supplier-proofs-"));
  const migrations = ["0598_dark_merchant_order.sql", "0599_supplier_line_corrections.sql"];
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
    const registryChange = proofs[0]!.upgrade.find(change => change.section === "rows" && change.before?.table === "app.command_type_registry");
    if (registryChange?.section !== "rows") throw new Error("Missing registry upgrade proof");
    const registryBefore = registryChange.before!.data;
    expect(registryBefore).toHaveLength(lp5RegistryRows.length + 2);
    expect(registryBefore).toEqual(expect.arrayContaining([...lp5RegistryRows, lateSourceRegistryRow, managedRecoveryRegistryRow]));
    const expected = applyUpgradeProofs({ rows: { "app.command_type_registry": registryBefore }, routines: [], relations: [], policies: [] }, proofs, { jobguard_migration: 42 });
    expect(Object.keys(expected.rows).sort()).toEqual([
      "app.command_type_registry", "app.purchase_order_manual_attestation", "app.supplier_line_match_correction", "app.supplier_line_match_snapshot",
    ]);
    expect(expected.rows["app.command_type_registry"]).toHaveLength(currentCommandRegistryRows.length);
    expect(expected.rows["app.command_type_registry"]).toEqual(expect.arrayContaining(currentCommandRegistryRows));
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
