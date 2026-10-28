import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source inspection only. Runtime SQL guarantees belong to PostgreSQL CI.
const migration = readFileSync(new URL("../migrations/0305_meter_work_admission.sql", import.meta.url), "utf8");
const admission = migration.slice(0,migration.indexOf("-- The administrative finalizer"));
describe("MON-1 admission source boundaries", () => {
 it("reads stored builder facts and excludes hidden inputs", () => {
  expect(migration).toContain("app.job_work_state_event");
  expect(migration).toContain("app.job_activation_terms");
  expect(migration).toContain("app.job_small_trip_event");
  expect(admission).not.toMatch(/app\.(?:shadow|recovery|finding|eligibility|meter_day_ledger|meter_lifecycle_day_ledger)/u);
  expect(migration).toContain("GROUP BY prospective,customer_id,site_id");
  expect(migration).toContain("after_count>6 AND after_count>before_count");
 });
 it("keeps helpers private and covers explicit/implicit starts plus live sources", () => {
  for (const name of ["mon1_work_committed", "mon1_admit_work_event", "mon1_admit_live_source", "mon1_refresh_work_ledger", "mon1_refresh_after_source"]) {
   expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION app\\.${name}\\([^;]* FROM PUBLIC,jobguard_runtime`, "u"));
  }
  expect(migration).toContain("event_kind:=''resumed''");
  expect(migration).toContain("CREATE TRIGGER mon1_live_admission AFTER INSERT ON app.job_activation_terms");
  expect(migration).toContain("CREATE TRIGGER mon1_import_admission AFTER INSERT ON app.imported_job_baseline");
  expect(migration).toContain("NEW.kind='site_activity'");
  expect(migration).not.toContain("NEW.kind='first_site_evidence'");
 });
});

it("admission consumes a synchronously refreshed stored ledger; source changes refresh after insertion", () => {
 expect(admission).toContain("OR command_type=''WorkState.resume''");
 expect(admission).toContain("ledger:=app.mon1_refresh_work_ledger(t)");
 expect(admission).toContain("FROM jsonb_array_elements(ledger.jobs)");
 for (const table of ["job_work_state_event","final_account_lock","job_small_trip_event","subscription_agreement_revision"]) expect(admission).toContain(`AFTER INSERT ON app.${table}`);
 expect(admission).toContain("stored.jobs,stored.plan,stored.agreement_id,stored.london_date");
 expect(admission).toContain("RAISE EXCEPTION 'METER_PROJECTION_MISMATCH'");
});
