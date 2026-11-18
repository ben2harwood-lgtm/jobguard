import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs } from "./migration-proof-loader.js";
import { loadReviewedInventory } from "./lp-0-catalog.js";
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const migration = "0762_northside_hosted_agreement.sql";
const sql = read(`../migrations/${migration}`);
it("keeps every original Northside binding, lifetime, made-up-instance and settings refusal in the forward body", () => {
  const body = (source: string) => source.match(/CREATE OR REPLACE FUNCTION app.northside_register\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/)![1]!;
  const normalize = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const old = body(read("../migrations/0749_lp6d_remaining_routines.sql"));
  const changed = body(sql);
  // Compare each existing executable statement, permitting additions and the required exclusive tenant fence.
  for (const statement of old.split(";").map(s => s.replace(/--[^\n]*/g, "").trim()).filter(Boolean)) {
    if (statement.startsWith("DECLARE ") || statement.includes("IF current_database()")) continue;
    expect(normalize(changed), statement).toContain(normalize(statement.replace("pg_advisory_xact_lock_shared(hashtextextended(t::text,54))", "pg_advisory_xact_lock(hashtextextended(t::text,54))")));
  }
  expect(changed).toContain("current_setting('transaction_isolation')<>'read committed'");
  expect(changed).toContain("agreement_status<>'active'");
  expect(changed).toContain("assignment.actor_ref IS DISTINCT FROM 'operations:synthetic-generator'");
  expect(sql).not.toMatch(/ALTER TABLE|DROP |UPDATE app\.(?:contractor_agreement_status_revision|enterprise_agreement_version)/u);
});
it("registers the exact routine successor and finance entrypoint without table privileges", async () => {
  const loaded = loadMigrationProofs();
  const proof = loaded.proofs.find(p => p.migration === migration)!;
  expect(proof).toBeDefined();
  const { inventory } = await loadReviewedInventory();
  expect(inventory.recorded.routines.find(r => r.identity === "function:app.northside_register(uuid,jsonb)")?.staticWrites)
    .toEqual(["app.contractor_agreement_status_revision", "app.enterprise_agreement_version", "app.northside_run"]);
  expect(proof.upgrade).toHaveLength(1);
  expect(sql).toContain("RETURN app.ef_derive(p_session,p_command,ag,p_period)");
  expect(sql).not.toMatch(/GRANT .* ON (?:TABLE|SCHEMA)/u);
});
