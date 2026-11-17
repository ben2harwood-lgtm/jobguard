import {randomUUID} from "node:crypto";
import {FinalCheckCompletionRepository} from "../src/shadow-detection-repository.js";
import {readFile} from "node:fs/promises";
import type {PoolClient} from "pg";
import {afterAll,beforeAll,expect,it} from "vitest";
import {MIGRATION_URLS,migrate} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,insertFinalCheckEvidence,finalCheckProposal,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
const own='0238_final_check.sql';const tables=['job','evidence_object','final_account_revision','final_account_line','final_account_lock','final_check_manifest','final_check_manifest_source','shadow_signal_classification','shadow_signal_disposition','recovery_case'];
const ident=(s:string)=>`"${s.replaceAll('"','""')}"`;
type Snapshot={columns:Array<{name:string;type:string}>;keys:string[];identities:string[];bytes:string[]};
async function columns(db:Pick<PoolClient,'query'>,table:string){return (await db.query("SELECT attname name,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[`app.${table}`])).rows as Snapshot['columns'];}
async function rows(db:Pick<PoolClient,'query'>,table:string,s:Snapshot){return (await db.query(`SELECT row_to_json(t)::text bytes FROM (SELECT ${s.columns.map(c=>ident(c.name)).join(',')} FROM app.${ident(table)} r WHERE (SELECT row_to_json(k)::text FROM (SELECT ${s.keys.map(ident).join(',')}) k)=ANY($1::text[])) t ORDER BY row_to_json(t)::text COLLATE "C"`,[s.identities])).rows.map(r=>r.bytes as string);}
async function snapshot(db:Pick<PoolClient,'query'>){const all:Record<string,Snapshot>={};for(const table of tables){const cols=await columns(db,table),keys=(await db.query("SELECT a.attname FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.ordinal",[`app.${table}`])).rows.map(r=>r.attname as string);expect(keys.length).toBeGreaterThan(0);const identities=(await db.query(`SELECT row_to_json(k)::text identity FROM (SELECT ${keys.map(ident).join(',')} FROM app.${ident(table)}) k`)).rows.map(r=>r.identity as string);expect(identities.length,`${table} pre-existing row guard`).toBeGreaterThan(0);const s={columns:cols,keys,identities,bytes:[] as string[]};s.bytes=await rows(db,table,s);all[table]=s;}return all;}
async function compare(db:Pick<PoolClient,'query'>,before:Record<string,Snapshot>){for(const [table,s]of Object.entries(before)){expect((await columns(db,table)).filter(c=>s.columns.some(old=>old.name===c.name))).toEqual(s.columns);expect(await rows(db,table,s)).toEqual(s.bytes);}}
async function manifestProtection(db:Pick<PoolClient,'query'>){
 const names=['app.final_check_manifest','app.final_check_manifest_source'];
 return {
  relations:(await db.query("SELECT c.oid::regclass::text name,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.oid=ANY($1::regclass[]) ORDER BY 1",[names])).rows,
  policies:(await db.query("SELECT * FROM pg_policies WHERE schemaname='app' AND tablename IN('final_check_manifest','final_check_manifest_source') ORDER BY tablename,policyname")).rows,
  constraints:(await db.query("SELECT conrelid::regclass::text name,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=ANY($1::regclass[]) ORDER BY 1,2",[names])).rows,
 };
}
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture(false)},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-31 SV5-34 populated own-migration comparison preserves named bytes/types/identities; rolled-back controls reject microsecond and retype but permit later additions",async()=>{
 const n=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith(own));expect(n).toBeGreaterThan(0);
 await f.admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
 for(const url of MIGRATION_URLS.slice(0,n)){await f.admin.query(await readFile(url,'utf8'));await f.admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)',[url.pathname.split('/').at(-1)]);}
 // Logins were allocated before roles existed. Bind them after the pre-N install.
 await f.admin.query(`GRANT jobguard_runtime TO ${f.runtime.options.user}`);await f.admin.query(`GRANT jobguard_shadow TO ${f.shadow.options.user}`);
 await installLegacySyntheticPartyFixtures(f.admin);const a=await seedFinalCheckJob(f);const evidence=await insertFinalCheckEvidence(f,a),signal=await finalCheckProposal(f,a,evidence),run=randomUUID();
 await finalCheckTenant(f.admin,a.tenantId,async db=>{
  await db.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) VALUES($1,$2,$3,'final-check.reconciliation.v1',clock_timestamp(),'completed')",[a.tenantId,a.jobId,run]);
  await db.query("INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'not_enough_evidence')",[a.tenantId,a.jobId,randomUUID(),run,signal]);
  await db.query("INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES($1,$2,$3,$4,$5,'not_completed')",[a.tenantId,a.jobId,randomUUID(),run,signal]);
  await db.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,synthetic) VALUES($1,$2,$3,100,'GBP','identified',true)",[randomUUID(),a.tenantId,a.jobId]);
 });
 await a.lock();await new FinalCheckCompletionRepository(f.shadow).freeze(a.context,{version:'final-check-manifest.v1',jobId:a.jobId,manifestId:randomUUID(),detectorVersion:'shadow-detection.v1',reconciliationVersion:'final-check.reconciliation.v1'});
 await f.admin.query("CREATE FUNCTION app.sv5_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
 const protection=await manifestProtection(f.admin);const before=await snapshot(f.admin);await f.admin.query(await readFile(MIGRATION_URLS[n]!,'utf8'));await compare(f.admin,before);
 const afterProtection=await manifestProtection(f.admin);expect(afterProtection.relations).toEqual(protection.relations);expect(afterProtection.policies).toEqual(protection.policies);for(const constraint of protection.constraints)expect(afterProtection.constraints).toContainEqual(constraint);
 await f.admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)',[own]);await migrate(f.admin);await migrate(f.admin);await compare(f.admin,before);
 for(const mutation of ["UPDATE app.evidence_object SET server_received_at=server_received_at+interval '1 microsecond'","ALTER TABLE app.job ALTER COLUMN title TYPE text"]){const db=await f.admin.connect();try{await db.query('BEGIN');await db.query("SET LOCAL session_replication_role='replica'");await db.query(mutation);await expect(compare(db,before)).rejects.toThrow();}finally{await db.query('ROLLBACK');db.release();}}
 const db=await f.admin.connect();try{await db.query('BEGIN');await db.query('ALTER TABLE app.final_account_revision ADD COLUMN sv5_later_nullable text');await db.query("CREATE OR REPLACE FUNCTION app.sv5_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 2'");await compare(db,before);
 await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,final_account_revision_id,line_kind,gen_random_uuid(),scope_item_id,commercial_revision_id,'Synthetic later row',0,2 FROM app.final_account_line WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.lineId]);await compare(db,before);
 }finally{await db.query('ROLLBACK');db.release();}
},60000);
