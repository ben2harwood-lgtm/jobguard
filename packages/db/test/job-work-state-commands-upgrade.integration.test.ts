import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { PoolClient } from "pg";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { closeWorkFixture,createWorkFixture,fixtureLifecycle,insertPhoto,seedWorkJob,type WorkFixture } from "./job-work-state-fixtures.js";
const own="0194_job_work_state_commands.sql";
const tables=["job","job_work_state_event","job_site_source_receipt","job_link","job_photo_purpose","command_receipt","audit_event","watchdog_command_identity"];
type DB=Pick<PoolClient,"query">;
async function snapshot(db:DB){
 const result: Record<string,unknown>={};
 for(const table of tables){
  result[`${table}:rows`]=(await db.query(`SELECT row_to_json(t)::text bytes FROM app.${table} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;
  result[`${table}:columns`]=(await db.query("SELECT attname,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[`app.${table}`])).rows;
  result[`${table}:keys`]=(await db.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype IN('p','u','f') ORDER BY definition",[`app.${table}`])).rows;
  result[`${table}:acl`]=(await db.query("SELECT relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows;
 }
 return result;
}
async function compareOriginal(db:DB,before:Record<string,unknown>){
 for(const table of tables){
  const columns=before[`${table}:columns`] as {attname:string;type:string}[];
  const current=(await db.query("SELECT attname,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[`app.${table}`])).rows;
  expect(current.filter(c=>columns.some(old=>old.attname===c.attname))).toEqual(columns);
  const keys=(await db.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype IN('p','u','f') ORDER BY definition",[`app.${table}`])).rows;
  for(const key of before[`${table}:keys`] as {definition:string}[])expect(keys).toContainEqual(key);
  const projection=columns.map(c=>`"${c.attname.replaceAll('"','""')}"`).join(',');
  const rows=(await db.query(`SELECT row_to_json(t)::text bytes FROM (SELECT ${projection} FROM app.${table}) t`)).rows.map(r=>r.bytes as string);
  for(const row of before[`${table}:rows`] as {bytes:string}[])expect(rows).toContain(row.bytes);
 }
}
async function functionCatalog(db:DB){return(await db.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.prokind='f' ORDER BY signature")).rows as {signature:string;definition:string;acl:string|null}[]}
describe("CH-4-C isolated forward migration proof",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false)},120000);afterAll(async()=>closeWorkFixture(f));
 it("populated predecessor through 0187; apply N alone; unchanged original rows/types/PKs; later migrations twice; rollback comparator controls",async()=>{
  const index=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith(own));expect(index).toBeGreaterThan(0);
  expect(MIGRATION_URLS.slice(0,index).some(u=>u.pathname.endsWith("0187_final_account_sources_and_pdf.sql"))).toBe(true);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,index)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)])}
  await installLegacySyntheticPartyFixtures(f.admin);const a=await seedWorkJob(f);await insertPhoto(f,a);await fixtureLifecycle(f,a,"finished_on_site");
  const before=await snapshot(f.admin),functions=await functionCatalog(f.admin);
  await f.admin.query(await readFile(MIGRATION_URLS[index]!,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  expect(await snapshot(f.admin)).toEqual(before);
  const after=await functionCatalog(f.admin),changes=after.filter(row=>{const old=functions.find(x=>x.signature===row.signature);return old&&old.definition!==row.definition});
  const added=after.filter(row=>!functions.some(old=>old.signature===row.signature)).map(row=>row.signature).sort();
  expect(added).toEqual(["app.ch4_require_command_owner(uuid,uuid,text)","app.ch4_require_open(uuid,uuid)","app.ch4_admit_place(uuid,uuid,text)","app.ch4_work_state_command(uuid,uuid,text,jsonb)","app.ch4_record_work_state(uuid,uuid,text,jsonb)","app.ch4_link_post_lock_job(uuid,uuid,text,jsonb)"].sort());
  // Definitions may change only in the explicitly authorized guard/use seams.
  const allowedDefinitions=["app.ch4_guard_final_check_admission()","app.job_source_insert_guard()","app.reveal_shadow_signals(uuid,uuid)","app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)","app.ch4_guard_new_site_work()"];
  for(const row of changes)expect(allowedDefinitions).toContain(row.signature);
  for(const old of functions){const current=after.find(row=>row.signature===old.signature);expect(current,old.signature).toBeDefined();expect(current!.acl,old.signature).toEqual(old.acl)}
  for(const signature of ["app.ch4_record_work_state(uuid,uuid,text,jsonb)","app.ch4_link_post_lock_job(uuid,uuid,text,jsonb)"])expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[signature])).rows[0].allowed).toBe(true);
  await migrate(f.admin);await migrate(f.admin);
  // Compare original columns/rows before adding any new command history.
  await compareOriginal(f.admin,before);
  const control=await f.admin.connect();try{
   await control.query("BEGIN");await control.query("SET LOCAL session_replication_role='replica'");
   await control.query("UPDATE app.job_work_state_event SET fact_at=fact_at+interval '1 microsecond' WHERE tenant_id=$1",[a.tenantId]);
   await expect(compareOriginal(control,before)).rejects.toThrow();
  }finally{await control.query("ROLLBACK");control.release()}
  await compareOriginal(f.admin,before);
  const typeControl=await f.admin.connect();try{
   await typeControl.query("BEGIN");
   await typeControl.query("ALTER TABLE app.job_work_state_event ALTER COLUMN close_note TYPE varchar(2000)");
   await expect(compareOriginal(typeControl,before)).rejects.toThrow();
  }finally{await typeControl.query("ROLLBACK");typeControl.release()}
  const additive=await f.admin.connect();try{
   await additive.query("BEGIN");await additive.query("SET LOCAL session_replication_role='replica'");
   await additive.query("ALTER TABLE app.job_work_state_event ADD COLUMN later_nullable_fixture text");
   await additive.query("CREATE OR REPLACE FUNCTION app.ch4_admit_place(t uuid,j uuid,action text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'LATER_FIXTURE_UNAVAILABLE'; END $$");
   await additive.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at) VALUES($1,gen_random_uuid(),'ch4.later-fixture','later-fixture',repeat('a',64),'succeeded','{}',$2,clock_timestamp())",[a.tenantId,a.actorId]);
   await compareOriginal(additive,before);
  }finally{await additive.query("ROLLBACK");additive.release()}
  await compareOriginal(f.admin,before);
 });
});
