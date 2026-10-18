import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, keyParent, snapshot, store, type WorkFixture } from "./free-first-job-keys-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
const own="0193_free_first_job_keys.sql";
describe("MON3P-UPGRADE-01 own migration",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false);},60000);afterAll(async()=>closeWorkFixture(f));
 it("populated predecessor named-column/type/identity comparison, own migration alone, later migrations twice and damage controls",async()=>{
  const n=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(own));expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,n)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);}
  await installLegacySyntheticPartyFixtures(f.admin);const parent=await keyParent(f);
  const before=await proofBefore(f.admin,["app.account","app.membership","app.job","app.job_activation"]);
  for(const value of Object.values(before))expect(Object.keys(value.rows).length).toBeGreaterThan(0);
  const acl=(await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid")).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  expect((await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid",[acl.map(row=>row.oid)])).rows).toEqual(acl);
  await store(f,snapshot(parent));const claims=await proofBefore(f.admin,["app.trial_identity_snapshot","app.trial_identity_key_claim"]);
  await migrate(f.admin);await migrate(f.admin);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});expect(await proofDifferences(f.admin,claims)).toEqual({rows:[],types:[]});
  for(const sql of ["UPDATE app.job SET created_at=created_at+interval '1 microsecond'","ALTER TABLE app.job ALTER COLUMN title TYPE text","DELETE FROM app.job"]){
   await rolledBack(f.admin,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query(sql);expect(await proofDifferences(db,before)).not.toEqual({rows:[],types:[]});});
  }
  for(const sql of ["UPDATE app.trial_identity_snapshot SET verified_at=verified_at+interval '1 microsecond'","DELETE FROM app.trial_identity_key_claim","ALTER TABLE app.trial_identity_snapshot ALTER COLUMN verified_at TYPE timestamp"]){
   await rolledBack(f.admin,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query(sql);expect(await proofDifferences(db,claims)).not.toEqual({rows:[],types:[]});});
  }
  await rolledBack(f.admin,async db=>{await db.query("ALTER TABLE app.job ADD COLUMN mon3pa_future text");expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});});
 });
});
