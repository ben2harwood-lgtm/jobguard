import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source inspection only. Runtime SQL guarantees belong to PostgreSQL CI.
const migration = readFileSync(new URL("../migrations/0348_meter_work_admission.sql", import.meta.url), "utf8");
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

it("unknown imports make refresh unavailable without throwing; only admission refuses", () => {
 const refresh=migration.slice(migration.indexOf('CREATE FUNCTION app.mon1_refresh_work_ledger'),migration.indexOf('CREATE OR REPLACE FUNCTION app.ch4_admit_place'));
 expect(refresh).toContain("THEN RETURN stored; END IF;");
 expect(refresh).not.toContain("RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'");
 expect(migration).toContain("IF ledger.source_hash IS NULL THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'");
 expect(migration).toContain("AND NOT app.mon1_work_committed(NEW.tenant_id,NEW.job_id,a.activated_at,clock_timestamp())");
});
it("source reuse keys include tenant, London date and builder source changes; SQL final lock takes 184 early", () => {
 expect(migration).toContain("'recipe','mon1-today-source.v1','tenant',t,'date',today");
 for(const field of ['agreements','activations','events','locks','trips','observations','links'])expect(migration).toContain(`'${field}',(SELECT`);
 expect(migration).toContain("captured:=app.mon1_lifecycle_rebuild(t,digest,existing.id)");
 expect(migration).toContain("captured:=app.mon1_lifecycle_capture(t,digest,source_key,start_day,expected)");
 expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_tenant::text,184))");
 expect(migration).toContain("ORDER BY fact_at,id,sequence LOOP");
});

it("capacity joins actual source writes after job/identity locks, leaving generic live guards compatible", () => {
 const context=readFileSync(new URL("../src/tenant-context.ts",import.meta.url),"utf8");
 expect(context).not.toContain("pg_advisory_xact_lock");
 for(const signature of ["app.require_watchdog_live(uuid)","app.ch4_source_job(uuid,uuid)"]) expect(migration).not.toContain(`pg_get_functiondef('${signature}'::regprocedure)`);
 expect(migration).toContain("pg_get_functiondef('app.ch4_capture_site_source()'::regprocedure)");
 expect(migration).toContain("hashtextextended(r.tenant_id::text,184)");
 expect(migration).toContain("r.job_id::text,144)");
 // Command identity is acquired before capacity, not in the function prologue.
 expect(migration).toContain("changed:=replace(original,marker,marker||chr(10)||' PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));')");
 expect(migration).not.toContain("regexp_replace(original,'BEGIN'");
 expect(migration).toContain("changed:=replace(original,' server_time:=clock_timestamp();'");
});
