import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs, PROOF_DIRECTORY, type MigrationProofSnapshot } from "./migration-proof-loader.js";
import { parseInventory, pathCompleteness } from "./lp-0-catalog.js";
import { fileURLToPath } from "node:url";

// Validate the full registry, then compose only this piece and its dependency.
const proofs = loadMigrationProofs(PROOF_DIRECTORY).proofs.filter(proof =>
  ["0584_privacy_operations.sql", "0585_dsar_offboarding.sql"].includes(proof.migration));
const tables = ["privacy_artifact", "privacy_command", "privacy_request", "privacy_subject"];
const owner = "jobguard_migration";

describe("M5-11 and its M0-13c dependency proof composition", () => {
  it("uses main's sealed audit writer for both new privacy command bodies", () => {
    for (const stem of ["0584_privacy_operations", "0585_dsar_offboarding"]) {
      const sql = readFileSync(new URL(`../migrations/${stem}.sql`, import.meta.url), "utf8");
      expect(sql).toContain("PERFORM app.lp4_seal_audit(");
      expect(sql).toContain("'checked_operation'");
      expect(sql).not.toMatch(/INSERT INTO app\.audit_event|app\.(?:lock_audit_head|advance_audit_head)\(/);
    }
  });
  it("combines exact capabilities into a complete inventory without direct privacy table grants", () => {
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const inventory = parseInventory(combineLp0(baseline, proofs));
    expect(pathCompleteness(inventory, p => existsSync(fileURLToPath(new URL(`../../../${p}`, import.meta.url))))).toEqual([]);
    expect(inventory.entries.filter(e => e.key.includes("app.privacy_") && e.key.startsWith("acl|"))).toEqual([
      { key: "acl|routine|function:app.privacy_command(uuid,text,jsonb)|jobguard_runtime|EXECUTE|-", group: "a-exec-privacy-rehearsal" },
      { key: "acl|routine|function:app.privacy_read(uuid,text,uuid)|jobguard_runtime|EXECUTE|-", group: "a-exec-privacy-rehearsal" },
    ]);
  });
  it("keeps the dependency proof separate from M5-11's private fence", () => {
    expect(proofs[0]!.lp0.some(c => JSON.stringify(c).includes("0585_dsar_offboarding.sql"))).toBe(false);
    expect(proofs[1]!.lp0.filter(c => c.section === "routines")).toEqual([
      expect.objectContaining({ before: null, after: expect.objectContaining({
        identity: "function:app.privacy_inventory_fence()", runtimeExecute: false, publicExecute: false,
      }) }),
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


describe("M5-11 recorded privacy check proof", () => {
  const all = loadMigrationProofs(PROOF_DIRECTORY).proofs;
  const facts = all.find(p => p.migration === "1045_privacy_review_facts.sql")!;
  it("adds one private forced-RLS table and extends only the existing command writer", () => {
    expect(facts).toBeDefined();
    expect(applyTenancyProofs([], [facts], "rls")).toEqual([
      { relname: "privacy_review_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
    ]);
    const combined = [...proofs, facts];
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const inventory = parseInventory(combineLp0(baseline, combined));
    expect(inventory.entries.filter(e => e.key.includes("privacy_review_fact"))).toEqual([]);
    expect(inventory.recorded.routines.find(r => r.identity === "function:app.privacy_command(uuid,text,jsonb)")?.staticWrites)
      .toEqual(["app.privacy_artifact", "app.privacy_command", "app.privacy_request", "app.privacy_review_fact", "app.privacy_subject"]);
    const result = applyUpgradeProofs<MigrationProofSnapshot>({ rows: {}, routines: [], relations: [], policies: [] }, combined, { [owner]: 42 });
    expect(Object.keys(result.rows).sort()).toEqual([...tables, "privacy_review_fact"].map(t => `app.${t}`).sort());
    expect(result.relations.filter(r => String(r.relname).startsWith("privacy_review_fact")).map(r => r.relname))
      .toEqual(["privacy_review_fact", "privacy_review_fact_pkey"]);
    const routineChanges = facts.upgrade.filter(c => c.section === "routines");
    expect(routineChanges).toHaveLength(1);
    expect(routineChanges[0]!.before).toEqual(routineChanges[0]!.after);
    expect(routineChanges[0]!.after).toMatchObject({ proname: "privacy_command", args: "t uuid, digest text, v jsonb" });
  });
  it("changes no other routine, keeps the trusted database fence and seals only reference/hash audit", () => {
    const sql = readFileSync(new URL("../migrations/1045_privacy_review_facts.sql", import.meta.url), "utf8");
    expect(sql.match(/CREATE OR REPLACE FUNCTION [^(]+/g)).toEqual(["CREATE OR REPLACE FUNCTION app.privacy_command"]);
    expect(sql.match(/CREATE TABLE [^ (]+/g)).toEqual(["CREATE TABLE app.privacy_review_fact"]);
    expect(sql).toContain("IF current_database()<>'jobguard_synthetic_demo'");
    expect(sql).toContain("PERFORM app.lp4_seal_audit(");
    expect(sql).toContain("req.review_record->>'inventoryHash' IS DISTINCT FROM snapshot");
    expect(sql).not.toMatch(/GRANT |SET app\.|INSERT INTO app\.audit_event/);
    const previous = readFileSync(new URL("../migrations/0585_dsar_offboarding.sql", import.meta.url), "utf8");
    const auditBody = (text: string) => text.split(" -- Seal the event")[1]!.split("END $$;")[0];
    expect(auditBody(sql)).toEqual(auditBody(previous));
  });
});
