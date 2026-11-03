import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs } from "./migration-proof-loader.js";

it("loads 0562 alongside main's proofs and preserves existing allowances", () => {
  const directory = new URL("./migration-proofs/", import.meta.url);
  // Validate the complete migration set, then exercise this branch's isolated allowances.
  const proofs = loadMigrationProofs(directory.pathname).proofs.filter(
    proof => proof.migration === "0528_customer_evidence_approval_guard.sql",
  );
  expect(proofs).toHaveLength(1);
  const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
  const combined = parseInventory(combineLp0(baseline, proofs));
  expect(combined.entries).toEqual(baseline.entries);
  expect(combined.recorded.routines).toEqual([...baseline.recorded.routines, expect.objectContaining({
    identity: "function:app.variation_customer_evidence_guard()", owner: "jobguard_migration",
    securityDefiner: false, runtimeExecute: false, publicExecute: false, returnsTrigger: true,
  })]);
  expect(combined.recorded.triggers).toEqual([...baseline.recorded.triggers,
    "app.variation_approval|variation_customer_evidence_guard|app.variation_customer_evidence_guard|BEFORE INSERT|O"]);
  const snapshot = { rows: {}, routines: [], relations: [], policies: [] };
  expect(applyUpgradeProofs(snapshot, proofs, { jobguard_migration: 42 })).toEqual({ ...snapshot, routines: [{
    nspname: "app", proname: "variation_customer_evidence_guard", args: "", proowner: 42,
    proacl: "{jobguard_migration=X/jobguard_migration}", prosecdef: false, proconfig: ["search_path=pg_catalog"],
  }] });
  const tables = [{ relname: "variation_approval", owner: "jobguard_migration" }];
  expect(applyTenancyProofs(tables, proofs, "owner")).toEqual(tables);
  expect(proofs[0]!.tenancy).toEqual([]);
});
