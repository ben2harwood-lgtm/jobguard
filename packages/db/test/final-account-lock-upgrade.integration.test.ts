import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createLockFixture, closeLockFixture, seedAccount, asFixtureTenant, LOCK_OWNER, type LockFixture } from "./final-account-lock.integration.test.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
const OWN = "0130_final_account_lock.sql";
const tables = ["customer_invoice","final_account_revision","final_account_line","final_account_draft","job"] as const;
const fingerprinted = ["quote_document_version","quote_acceptance","evidence_object","variation_revision","variation_approval","recovery_claim_revision","recovery_case_event","material_rate_revision","supplier_document_version","supplier_document","customer_invoice","discrepancy_review_outcome"];
const ident = (name:string) => `"${name.replaceAll('"','""')}"`;
type Snapshot={columns:Array<{name:string;type:string}>;keys:string[];identities:string[];rows:string[]};
async function columns(db:Pick<PoolClient,'query'>,table:string){return (await db.query("SELECT attname name,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[`app.${table}`])).rows as Snapshot['columns'];}
async function rows(db:Pick<PoolClient,'query'>,table:string,s:Pick<Snapshot,'columns'|'keys'|'identities'>){
 const select=s.columns.map(c=>ident(c.name)).join(',');const key=s.keys.map(ident).join(',');
 return (await db.query(`SELECT row_to_json(t)::text bytes FROM (SELECT ${select} FROM app.${ident(table)} r WHERE (SELECT row_to_json(k)::text FROM (SELECT ${key}) k)=ANY($1::text[])) t ORDER BY row_to_json(t)::text COLLATE "C"`,[s.identities])).rows.map(r=>r.bytes as string);
}
async function snapshot(db:Pick<PoolClient,'query'>){const out:Record<string,Snapshot>={};for(const table of tables){
 const names=await columns(db,table),keys=(await db.query("SELECT a.attname FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.ordinal",[`app.${table}`])).rows.map(r=>r.attname as string);
 expect(keys.length,`${table} primary key`).toBeGreaterThan(0);
 const identities=(await db.query(`SELECT row_to_json(k)::text identity FROM (SELECT ${keys.map(ident).join(',')} FROM app.${ident(table)}) k ORDER BY row_to_json(k)::text COLLATE "C"`)).rows.map(r=>r.identity as string);
 expect(identities.length,`${table} seeded rows`).toBeGreaterThan(0);const s={columns:names,keys,identities,rows:[] as string[]};s.rows=await rows(db,table,s);out[table]=s;
 }return out;}
async function compare(db:Pick<PoolClient,'query'>,before:Record<string,Snapshot>){for(const [table,s]of Object.entries(before)){
 const current=(await columns(db,table)).filter(c=>s.columns.some(old=>old.name===c.name));expect(current,`${table} pre-existing column names AND full types`).toEqual(s.columns);
 expect(await rows(db,table,s),`${table} canonical original-row bytes`).toEqual(s.rows);
}}
async function grants(db:Pick<PoolClient,'query'>){return {
 tables:(await db.query("SELECT n.nspname,c.relname,c.relacl::text grants FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane') ORDER BY 1,2")).rows,
 columns:(await db.query("SELECT n.nspname,c.relname,a.attname,a.attacl::text grants FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3")).rows,
 functions:(await db.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.proacl::text grants FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane') ORDER BY 1,2,3")).rows,
 schemas:(await db.query("SELECT nspname,nspacl::text grants FROM pg_namespace WHERE nspname IN('app','identity','control_plane') ORDER BY 1")).rows,
 roles:(await db.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname LIKE 'jobguard_%' ORDER BY rolname")).rows,
 memberships:(await db.query("SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,admin_option FROM pg_auth_members ORDER BY 1,2")).rows,
};}
async function issueLegacy(db:LockFixture['admin'],a:Awaited<ReturnType<typeof seedAccount>>){await asFixtureTenant(db,a.tenantId,client=>client.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)",[a.tenantId,a.jobId,a.revisionId,LOCK_OWNER,randomUUID(),'practice-customer@example.invalid','2026-10-12']));}
describe("SV-4 own-migration upgrade proof and fingerprint/grant catalogue",()=>{
 let f:LockFixture;
 beforeAll(async()=>{f=await createLockFixture(false)},60000);afterAll(async()=>closeLockFixture(f));
 it("installs before 0130, compares 0130 alone, all later twice, and exercises the same comparator's rolled-back controls",async()=>{
  const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith(OWN));expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,own)){
   const name=url.pathname.split('/').at(-1)!;await f.admin.query(await readFile(url,'utf8'));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);const a=await seedAccount(f.admin);await issueLegacy(f.admin,a);
  await f.admin.query("CREATE FUNCTION app.sv4_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
  const before=await snapshot(f.admin),catalog=await grants(f.admin),fingerprint:Record<string,Snapshot['columns']>={};
  for(const table of fingerprinted)fingerprint[table]=await columns(f.admin,table);
  await f.admin.query(await readFile(MIGRATION_URLS[own]!,'utf8'));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[OWN]);
  await compare(f.admin,before);
  const after=await grants(f.admin);
  // Only pre-existing objects are compared; 0130 owns every new object and grants only on them.
  for(const key of ['tables','columns','functions']as const){const names=new Set(catalog[key].map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='grants')))));expect(after[key].filter(r=>names.has(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='grants')))))).toEqual(catalog[key]);}
  for(const key of ['schemas','roles','memberships']as const)expect(after[key]).toEqual(catalog[key]);
  await migrate(f.admin);await migrate(f.admin);await compare(f.admin,before);
  for(const table of fingerprinted)expect(await columns(f.admin,table),`${table}: fingerprinted rows cannot gain columns`).toEqual(fingerprint[table]);
  // FAIL: a one-microsecond stored-time change is visible despite pg Date millisecond truncation.
  for(const mutation of ["UPDATE app.customer_invoice SET created_at=created_at+interval '1 microsecond'","ALTER TABLE app.job ALTER COLUMN title TYPE text"]){
   const db=await f.admin.connect();try{await db.query('BEGIN');await db.query("SET LOCAL session_replication_role='replica'");await db.query(mutation);await expect(compare(db,before)).rejects.toThrow();}finally{await db.query('ROLLBACK');db.release();}
  }
  // PASS: a later nullable column, replaced function, and inserted rows are outside the snapshot identities.
  const db=await f.admin.connect();try{
   await db.query('BEGIN');await db.query("ALTER TABLE app.final_account_draft ADD COLUMN sv4_later_nullable text");await db.query("CREATE OR REPLACE FUNCTION app.sv4_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 2'");await compare(db,before);
   const original=(await db.query("SELECT id,tenant_id,job_id FROM app.final_account_line WHERE id=$1",[a.lineId])).rows[0];
   await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,final_account_revision_id,line_kind,gen_random_uuid(),scope_item_id,commercial_revision_id,'Synthetic later inserted line',0,2 FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[original.tenant_id,original.job_id,original.id]);
   await compare(db,before);
  }finally{await db.query('ROLLBACK');db.release();}
 });
});
