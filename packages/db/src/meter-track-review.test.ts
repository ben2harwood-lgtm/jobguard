import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const migration = read("0385_meter_track_review.sql");
describe("MON-1 track review migration source inspection", () => {
 it("preserves the latest parent admission body except the Decision-only addition", () => {
  const parent = read("0367_meter_work_admission.sql");
  const start = "CREATE OR REPLACE FUNCTION app.ch4_admit_place";
  const original = parent.slice(parent.indexOf(start), parent.indexOf("\n-- Keep the generic"));
  const updated = migration.slice(migration.indexOf(start), migration.indexOf("\n-- Billing detectors"));
  expect(updated.replace(/ -- MON-1 Decisions begin[\s\S]*? -- MON-1 Decisions end\n/u, "").trim()).toBe(original.trim());
 });
 it("keeps Decisions tenant scoped, idempotent and without approvals or financial writes", () => {
  const admission = migration.slice(0, migration.indexOf("-- Billing detectors"));
  expect(admission).toContain("after_count>before_count AND after_count>(CASE plan WHEN 'Solo' THEN 5 ELSE 12 END)");
  expect(admission).toContain("plan='Builder' AND after_count>13");
  expect(admission).toContain("'subscription.upgrade'");
  expect(admission).toContain("'subscription.track_review'");
  expect(admission).toContain("ON CONFLICT (tenant_id,id) DO NOTHING");
  expect(admission).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) app\.(?:action_authorization|decision_resolution|subscription_agreement_revision|job_commercial_track|journal|recovery_fee_journal|platform_statement)/u);
  expect(migration).not.toMatch(/CREATE (?:TABLE|POLICY)|GRANT /u);
 });
 it.each(["mon2_issue", "mon2_review"])("%s only reuses an existing immediate Decision", name => {
  const parent = read("0195_subscription_persistence.sql");
  const start = `CREATE FUNCTION app.${name}(`;
  const original = parent.slice(parent.indexOf(start), parent.indexOf("\nEND $$;", parent.indexOf(start)) + 8);
  const updatedStart = `CREATE OR REPLACE FUNCTION app.${name}(`;
  const updated = migration.slice(migration.indexOf(updatedStart), migration.indexOf("\nEND $$;", migration.indexOf(updatedStart)) + 8);
  expect(updated.replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION").replace(/  -- Reuse the immediate[\s\S]*?  -- End Decision reuse\n/u, "  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,t,'subscription',t::text,'subscription.track_review');\n")).toBe(original);
 });
});
