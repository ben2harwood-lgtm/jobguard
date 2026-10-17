import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {MIGRATION_URLS,migrate} from "../src/migrate.js";
import {createWorkFixture,closeWorkFixture,seedWorkJob,type WorkFixture} from "./job-work-state-fixtures.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences,rolledBack,scratchReplaceFunction} from "./upgrade-proof-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
const own="0184_meter_persistence.sql";
describe("MON-1B own-migration upgrade",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false)},60000);afterAll(async()=>closeWorkFixture(f));
 it("MON1-A32 named-column canonical text and full types preserve original PK identities; later migrations twice and rolled-back controls",async()=>{
  const n=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(own));expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,n)){
   await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const a=await seedWorkJob(f),tables=["app.account","app.membership","app.job"];
  const before=await proofBefore(f.admin,tables);
  for(const table of tables)expect(Object.keys(before[table]!.rows).length,`${table} pre-existing rows`).toBeGreaterThan(0);
  const unchanged=async(db:Parameters<typeof proofDifferences>[0])=>expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});
  // Snapshot ACLs/policies only across N alone. Later pieces may evolve them.
  const oldAcl=(await f.admin.query("SELECT c.oid,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity') AND c.relkind='r' ORDER BY c.oid")).rows;
  const oldFunctions=(await f.admin.query("SELECT p.oid,pg_get_functiondef(p.oid) definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity') AND p.prokind='f' ORDER BY p.oid")).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  await unchanged(f.admin);
  expect((await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid",[oldAcl.map(row=>row.oid)])).rows).toEqual(oldAcl);
  expect((await f.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[]) ORDER BY oid",[oldFunctions.map(row=>row.oid)])).rows).toEqual(oldFunctions);
  await migrate(f.admin);await migrate(f.admin);await unchanged(f.admin);
  for(const sql of ["UPDATE app.job SET created_at=created_at+interval '1 microsecond'","ALTER TABLE app.job ALTER COLUMN title TYPE text"]){
   await rolledBack(f.admin,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query(sql);await expect(unchanged(db)).rejects.toThrow();});
  }
  await rolledBack(f.admin,async db=>{
   await db.query("ALTER TABLE app.job ADD COLUMN mon1b_later_nullable text");
   expect(await scratchReplaceFunction(db,"app.mon1_project(uuid,jsonb)")).toBe(true);await unchanged(db);
   await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional later row')",[randomUUID(),a.tenantId]);await unchanged(db);
  });
 });
});
