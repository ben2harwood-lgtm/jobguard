import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { createWorkFixture,closeWorkFixture,seedWorkJob,prepareWorkAccount,type WorkFixture } from "./job-work-state-fixtures.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
const own="0144_job_work_state.sql";
const tables=["job","quote_document_version","quote_acceptance","evidence_upload","evidence_object","supplier_document","supplier_document_version","extra_origin","final_account_lock","customer_invoice","command_receipt","audit_event"];
const ident=(v:string)=>`"${v.replaceAll('"','""')}"`;
type Snapshot={columns:{name:string;type:string}[];keys:string[];ids:string[];bytes:string[]};
async function columns(db:Pick<PoolClient,"query">,table:string){return (await db.query("SELECT attname name,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[`app.${table}`])).rows as Snapshot["columns"]}
async function bytes(db:Pick<PoolClient,"query">,table:string,s:Snapshot){
 return (await db.query(`SELECT row_to_json(t)::text bytes FROM (SELECT ${s.columns.map(c=>ident(c.name)).join(",")} FROM app.${ident(table)} r WHERE (SELECT row_to_json(k)::text FROM (SELECT ${s.keys.map(ident).join(",")}) k)=ANY($1::text[])) t ORDER BY row_to_json(t)::text COLLATE "C"`,[s.ids])).rows.map(r=>r.bytes as string);
}
async function snapshot(db:Pick<PoolClient,"query">){const result:Record<string,Snapshot>={};for(const table of tables){
 const names=await columns(db,table),keys=(await db.query("SELECT a.attname FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.ordinal",[`app.${table}`])).rows.map(r=>r.attname as string);
 expect(keys.length).toBeGreaterThan(0);const ids=(await db.query(`SELECT row_to_json(k)::text id FROM (SELECT ${keys.map(ident).join(",")} FROM app.${ident(table)}) k ORDER BY row_to_json(k)::text COLLATE "C"`)).rows.map(r=>r.id as string);
 expect(ids.length,`${table}: at least one pre-existing row`).toBeGreaterThan(0);const s={columns:names,keys,ids,bytes:[] as string[]};s.bytes=await bytes(db,table,s);result[table]=s;
 }return result;}
async function compare(db:Pick<PoolClient,"query">,before:Record<string,Snapshot>){for(const [table,s]of Object.entries(before)){
 expect((await columns(db,table)).filter(c=>s.columns.some(old=>old.name===c.name)),`${table} column names and full types`).toEqual(s.columns);
 expect(await bytes(db,table,s),`${table} canonical original-row bytes and identities`).toEqual(s.bytes);
}}
async function grants(db:Pick<PoolClient,"query">){return (await db.query(`SELECT 'table:'||n.nspname||'.'||c.relname name,c.relacl::text acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane')
 UNION ALL SELECT 'function:'||p.oid::regprocedure::text,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane')
 UNION ALL SELECT 'column:'||n.nspname||'.'||c.relname||'.'||a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1`)).rows;}
describe("CH-4 own-migration upgrade",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false)},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A24 own migration preserves original rows/types/PK identities/grants; later migrations twice; comparator controls",async()=>{
  const n=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith(own));expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,n)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)])}
  await installLegacySyntheticPartyFixtures(f.admin);await seedEvidencePackFixture(f.admin,{withVariation:true});
  const a=await seedWorkJob(f),account=await prepareWorkAccount(f,a),repo=new FinalAccountLockRepository(f.runtime);
  await repo.acceptTerms(a.context,{actorMembershipId:a.actorId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
  await repo.disposition(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),scopeItemId:a.scopeId,disposition:"done"});
  await repo.lock(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),finalAccountRevisionId:account.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"});
  await f.admin.query("CREATE FUNCTION app.ch4_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
  const before=await snapshot(f.admin),acl=await grants(f.admin);
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  await compare(f.admin,before);const names=new Set(acl.map(r=>r.name));expect((await grants(f.admin)).filter(r=>names.has(r.name))).toEqual(acl);
  await migrate(f.admin);await migrate(f.admin);await compare(f.admin,before);
  for(const mutation of ["UPDATE app.evidence_object SET server_received_at=server_received_at+interval '1 microsecond'","ALTER TABLE app.job ALTER COLUMN title TYPE text"]){
   const db=await f.admin.connect();try{await db.query("BEGIN");await db.query("SET LOCAL session_replication_role='replica'");await db.query(mutation);await expect(compare(db,before)).rejects.toThrow()}finally{await db.query("ROLLBACK");db.release()}
  }
  const db=await f.admin.connect();try{
   await db.query("BEGIN");await db.query("ALTER TABLE app.job ADD COLUMN ch4_later_nullable text");await db.query("CREATE OR REPLACE FUNCTION app.ch4_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 2'");await compare(db,before);
   await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional later row')",[randomUUID(),a.tenantId]);await compare(db,before);
  }finally{await db.query("ROLLBACK");db.release()}
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_work_state_event")).rows[0].n).toBe(0);
 });
});
