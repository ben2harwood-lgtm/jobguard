import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { closeWorkFixture,createWorkFixture,seedWorkJob,type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore,proofDifferences,rolledBack } from "./upgrade-proof-utils.js";

describe("MON1-A own 0244 upgrade proof, CI PostgreSQL only",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false)},60000);afterAll(async()=>closeWorkFixture(f));
 it("M1A-10 applies after 0209 alone, preserves predecessor rows/types/security; successors twice and comparator control",async()=>{
  const own="0244_meter_place_admission.sql",n=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith(own));
  expect(n).toBeGreaterThan(0);expect(MIGRATION_URLS[n-1]?.pathname).toMatch(/0209_meter_lifecycle_source.sql$/u);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const u of MIGRATION_URLS.slice(0,n)){
   await f.admin.query(await readFile(u,"utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[u.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);const a=await seedWorkJob(f);
  const before=await proofBefore(f.admin,["app.account","app.membership","app.job","app.scope_identity"]);
  for(const table of Object.values(before))expect(Object.keys(table.rows).length).toBeGreaterThan(0);
  const catalogSql="SELECT oid,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid";
  const catalog=(await f.admin.query(catalogSql)).rows;
  const policySql="SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname";
  const policies=(await f.admin.query(policySql)).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  expect((await f.admin.query(catalogSql)).rows).toEqual(catalog);expect((await f.admin.query(policySql)).rows).toEqual(policies);
  const definition=(await f.admin.query("SELECT pg_get_functiondef('app.mon1_admit_place(uuid,uuid,text,uuid)'::regprocedure) body")).rows[0].body;
  expect(definition).toContain("METER_PLACE_SOURCE_HANDOFF_HELD");
  expect(definition).not.toMatch(/INSERT|UPDATE|DELETE|app\.append|pg_advisory_xact_lock\(/u);
  await migrate(f.admin);await migrate(f.admin);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  await rolledBack(f.admin,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1",[a.tenantId]);
   expect(await proofDifferences(db,before)).not.toEqual({rows:[],types:[]});
  });
 });
});
