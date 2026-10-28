import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";

// No local database execution: fresh installation is covered by the admission
// suite; this test proves the predecessor and already-finalized reader upgrade.
describe("MON-1 0305 upgrade (PostgreSQL CI)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f=await createWorkFixture(false); },60000);
 afterAll(async () => closeWorkFixture(f));
 it("preserves business rows and predecessor grants; finalization retires the stale reader atomically", async () => {
  const own="0305_meter_work_admission.sql", position=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(`/${own}`));
  expect(position).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,position)) {
   await f.admin.query(await readFile(url,"utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin); await seedWorkJob(f);
  const before=await proofBefore(f.admin,["app.account","app.membership","app.job","app.job_party_binding"]);
  // Simulate the predecessor's finalized reader. The migration must not try to
  // replace a routine owned by the structurally separate meter owner.
  await f.admin.query("GRANT CREATE ON SCHEMA app TO jobguard_meter_owner");
  await f.admin.query("ALTER FUNCTION app.mon1_counted_meter_today(uuid,text) OWNER TO jobguard_meter_owner; ALTER FUNCTION app.mon1_counted_meter_today(uuid,text) SECURITY DEFINER");
  await f.admin.query("REVOKE CREATE ON SCHEMA app FROM jobguard_meter_owner");
  const grants=(await f.admin.query("SELECT oid,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid")).rows;
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  expect((await f.admin.query("SELECT oid,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid",[grants.map(row=>row.oid)])).rows).toEqual(grants);
  const admin=await f.admin.connect();
  try { await finalizeMeterLifecycleOwnership(admin); await finalizeMeterLifecycleOwnership(admin); } finally { admin.release(); }
  expect((await f.admin.query(`SELECT proname,pg_get_userbyid(proowner) owner,prosecdef,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime
   FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('mon1_counted_meter_today','mon1_fresh_counted_meter_today') ORDER BY proname`)).rows).toEqual([
    {proname:"mon1_counted_meter_today",owner:"jobguard_meter_owner",prosecdef:true,runtime:false},
    {proname:"mon1_fresh_counted_meter_today",owner:"jobguard_meter_owner",prosecdef:true,runtime:true},
   ]);
  expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[own])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.meter_work_ledger'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
 });
});
