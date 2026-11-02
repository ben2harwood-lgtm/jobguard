import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs } from "./migration-proof-loader.js";

it("M2-4 and its sibling proofs preserve main and keep tables guarded and routines private", () => {
  // Main's separately owned pending 0510 proof must not mask validation of these fragments.
  const directory = mkdtempSync(join(tmpdir(), "jg-supplier-proofs-"));
  const migrations = ["0465_dark_merchant_order.sql", "0494_supplier_line_corrections.sql"];
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
    const expected = applyUpgradeProofs({ rows: {}, routines: [], relations: [], policies: [] }, proofs, { jobguard_migration: 42 });
    expect(Object.keys(expected.rows).sort()).toEqual([
      "app.purchase_order_manual_attestation", "app.supplier_line_match_correction", "app.supplier_line_match_snapshot",
    ]);
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
