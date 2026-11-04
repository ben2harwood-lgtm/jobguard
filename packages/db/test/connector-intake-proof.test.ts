import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareInventory, parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, proofSchema } from "./migration-proof-loader.js";

const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
const proof = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0554_connector_intake.proof.json", import.meta.url), "utf8")));

describe("ENT-13a isolated connector proof", () => {
  it("uses the sealed audit writer and tolerates the bootstrap-created connector role", () => {
    const sql = readFileSync(new URL("../migrations/0554_connector_intake.sql", import.meta.url), "utf8");
    expect(sql).toContain("IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_connector')");
    expect(sql).toContain("PERFORM app.lp4_seal_audit(");
    expect(sql).toContain("'checked_operation'");
    expect(sql).not.toMatch(/INSERT INTO app\.audit_event|app\.advance_audit_head|app\.lock_audit_head/u);
    const routine = proof.lp0.find(change => change.section === "routines" &&
      typeof change.after === "object" && change.after !== null &&
      "identity" in change.after && change.after.identity === "function:connector.intake(uuid,text,jsonb)")?.after;
    expect(routine).toMatchObject({ staticWrites: ["connector.input_event"],
      staticCalls: ["app.final_lock_hash", "app.lp4_seal_audit"] });
  });
  it("extends the reviewed baseline without duplicating or replacing main allowances", () => {
    expect(proof.migration).toBe("0554_connector_intake.sql");
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
  it("0576 widens only kind validation, retaining the latest intake body and all existing allowances", () => {
    const addition = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0576_connector_materials_stage.proof.json", import.meta.url), "utf8")));
    expect(addition).toEqual({ migration: "0576_connector_materials_stage.sql", lp0: [], upgrade: [], tenancy: [] });
    const previous = readFileSync(new URL("../migrations/0554_connector_intake.sql", import.meta.url), "utf8");
    const sql = readFileSync(new URL("../migrations/0576_connector_materials_stage.sql", import.meta.url), "utf8");
    const body = previous.slice(previous.indexOf("CREATE FUNCTION connector.intake"), previous.indexOf("ALTER FUNCTION connector.intake"))
      .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
      .replace("v_kind NOT IN('work_order','billing_status')", "v_kind NOT IN('work_order','billing_status','materials_issue')")
      .replace("v_kind='work_order' AND", "v_kind IN('work_order','materials_issue') AND");
    expect(sql).toContain(body);
    expect(sql).not.toMatch(/\bGRANT\b|CREATE TABLE|CREATE SCHEMA|CREATE ROLE|app\.materials_issue_fact/u);
    expect(combineLp0(baseline, [proof, addition])).toEqual(combineLp0(baseline, [proof]));
  });
});
