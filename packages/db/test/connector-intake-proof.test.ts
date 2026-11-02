import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareInventory, parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, proofSchema } from "./migration-proof-loader.js";

const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
const proof = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0574_connector_intake.proof.json", import.meta.url), "utf8")));

describe("ENT-13a isolated connector proof", () => {
  it("extends the reviewed baseline without duplicating or replacing main allowances", () => {
    expect(proof.migration).toBe("0574_connector_intake.sql");
    expect(proof.lp0.every(change => change.before === null)).toBe(true);
    const inventory = parseInventory(combineLp0(baseline, [proof]));
    expect(inventory.entries).toHaveLength(baseline.entries.length + 5);
    expect(inventory.entries).toEqual(expect.arrayContaining(baseline.entries));
    expect(inventory.groups).toEqual(expect.arrayContaining(baseline.groups));
    expect(inventory.recorded.routines).toEqual(expect.arrayContaining(baseline.recorded.routines));
    expect(inventory.held).toEqual(baseline.held);
    expect(() => combineLp0(inventory, [proof])).toThrow(/before allowance mismatch/);
    // Intake EXECUTE cannot silently broaden into source-table access.
    expect(compareInventory(inventory, [{ key: "acl|rel|table|connector.input_event|jobguard_connector|SELECT|-",
      category: "acl", objectClass: "table", object: "connector.input_event" }]).ok).toBe(false);
  });
  it("preserves the existing upgrade and app-tenancy snapshot boundaries", () => {
    expect(proof.upgrade).toEqual([]);
    expect(proof.tenancy).toEqual([]);
    const snapshot = { rows: { "app.history": [{ id: "fixture:unchanged" }] }, routines: [], relations: [], policies: [] };
    expect(applyUpgradeProofs(snapshot, [proof], {})).toEqual(snapshot);
    const tenancy = [{ relname: "history", relrowsecurity: true, relforcerowsecurity: true, guarded: true }];
    expect(applyTenancyProofs(tenancy, [proof], "rls")).toEqual(tenancy);
  });
});
