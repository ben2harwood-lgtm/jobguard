import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant} from "../src/tenant-context.js";
import { closeTestPools } from "./pool-test-utils.js";
import { SwitchJobLiveMutation } from "../src/activation-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
const T=randomUUID(), OTHER=randomUUID(), M=randomUUID(), OTHER_M=randomUUID(), J=randomUUID(), V=randomUUID(), S=randomUUID(), R=randomUUID(), H="a".repeat(64);
const ctx=(tenantId:string=T)=>testTenantContext(tenantId);
let pg:EmbeddedPostgres, admin:Pool, runtime:Pool, dir:string, port:number;
const migrationURL=MIGRATION_URLS.find(url=>url.pathname.endsWith("0053_shared_money_origin.sql"))!;
async function seedIdentity(tenant:string,member:string) {
 const account=randomUUID(),user=randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[user]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SH-1')",[account,tenant]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[member,tenant,account,user]);
}
async function job(id=randomUUID(),status="live",tenant=T) {
 await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional SH-1 job',$3)",[id,tenant,status]); return id;
}
async function insertVariation(client:Pick<PoolClient,"query">,id:string,jobId:string,track:string|null=null,kind:string|null=null,tenant=T) {
 const scope=randomUUID();
 await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,tenant,jobId]);
 await client.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,job_track,origin) VALUES($1,$2,$3,$4,'text','Fictional capture','Synthetic extra',$5,$6)",[id,tenant,jobId,scope,track,kind]);
}
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),"sh-1-pg-"));port=59600+Math.floor(Math.random()*100);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,MIGRATION_URLS.indexOf(migrationURL))) {
  await admin.query(await readFile(url,"utf8"));
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
 }
 await seedIdentity(T,M);await seedIdentity(OTHER,OTHER_M);await job(J);
 await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[S,T,J]);
 await admin.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,created_at) VALUES($1,$2,$3,$4,'text','Original fictional capture','Legacy synthetic extra','2026-09-01T12:00:00Z')",[V,T,J,S]);
 await admin.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
  VALUES($1,$2,$3,$4,$5,1,'Legacy reviewed extra','1','item',1000,1000,$6,$7,'human_entered','synthetic://original-price',$6,'legacy-price-v1')`,[R,T,J,V,S,H,M]);
 await admin.query("UPDATE app.variation SET state='priced',current_revision_id=$1 WHERE tenant_id=$2 AND id=$3",[R,T,V]);
 await migrate(admin);
 await admin.query("CREATE ROLE sh1_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO sh1_login");
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"sh1_login",password:"synthetic",max:4});
},60000);
afterAll(async()=>{await closeTestPools(runtime,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true});});
async function commandOrigin(db:PoolClient,jobId:string,id:string,kind="site_user",commandType="LogSiteExtra",overrides:Record<string,unknown>={},finalize=true) {
 const command=randomUUID();
 await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,$3,$4,$5,'processing',$6)",[T,command,commandType,`extra-origin:${jobId}:${id}`,H,M]);
 const value={tenant:T,job:jobId,variation:id,track:"contractor",kind,command,actor:M,role:"owner",...overrides};
 await db.query(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,server_recorded_at,device_id,device_captured_at,evidence_hash,provenance,source_capture_kind,source_capture_hash)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'1900-01-01T00:00:00Z','fictional-device','1901-01-01T00:00:00Z',$9,'command','text',$9)`,[value.tenant,value.job,value.variation,value.track,value.kind,value.command,value.actor,value.role,H]);
 if(finalize)await db.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2",[T,command]);
 return command;
}
async function contractorJob() {
 const id=await job(randomUUID(),"draft");
 await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')",[T,id]);return id;
}
describe("SH-1 real PostgreSQL origin and track guarantees",()=>{
 it("upgrades existing synthetic rows without losing identity, source or time; reruns backfill idempotently",async()=>{
  const before=(await admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[T,V])).rows;
  expect(before[0]).toMatchObject({job_id:J,variation_id:V,kind:"builder_logged",job_track:"small_builder",command_id:null,raising_membership_id:null,raising_role:"legacy_unrecorded",provenance:"backfilled_synthetic_fixture",server_recorded_at:new Date("2026-09-01T12:00:00Z")});
  const sql=await readFile(migrationURL,"utf8"),block=sql.split("-- SH-1 BACKFILL START: re-executable under the migration owner, per tenant.")[1]!.split("-- SH-1 BACKFILL END")[0]!;
  const client=await admin.connect();try {await client.query("BEGIN;SET LOCAL ROLE jobguard_migration");await client.query(block);await client.query(block);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  expect((await admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[T,V])).rows).toEqual(before);
  expect((await admin.query("SELECT current_revision_id,state FROM app.variation WHERE tenant_id=$1 AND id=$2",[T,V])).rows[0]).toEqual({current_revision_id:R,state:"priced"});
  expect((await admin.query("SELECT rate_source_ref,confirmed_by_membership_id FROM app.variation_revision WHERE id=$1",[R])).rows[0]).toEqual({rate_source_ref:"synthetic://original-price",confirmed_by_membership_id:M});
  expect((await admin.query("SELECT capture_text,scope_item_id,origin FROM app.variation WHERE tenant_id=$1 AND id=$2",[T,V])).rows[0]).toEqual({capture_text:"Original fictional capture",scope_item_id:S,origin:"builder_logged"});
 });
 it("inspects actual ownership, FORCE RLS, grants, composite keys and role posture",async()=>{
  const rows=(await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname,
   has_table_privilege('jobguard_runtime',c.oid,'UPDATE,DELETE,TRUNCATE') AS mutable
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
   WHERE n.nspname='app' AND c.relname IN ('extra_origin','job_commercial_track') ORDER BY c.relname`)).rows;
  expect(rows).toHaveLength(2);for(const r of rows)expect(r).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,rolname:"jobguard_migration",mutable:false});
  expect((await admin.query("SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname='jobguard_runtime'")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false,rolcreaterole:false});
  const fks=(await admin.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('variation_job_track_fk','extra_origin_exact_variation_fk','variation_requires_origin')")).rows;
  expect(fks).toHaveLength(3);expect(fks.find(r=>r.conname==="variation_requires_origin").definition).toContain("DEFERRABLE INITIALLY DEFERRED");
  const functions=(await admin.query("SELECT p.proname,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') allowed FROM pg_proc p WHERE p.proname IN ('bind_small_builder_track','record_legacy_builder_origin','validate_extra_origin','guard_variation_origin')")).rows;
  expect(functions).toHaveLength(4);expect(functions.every(r=>!r.allowed)).toBe(true);
 });
 it("fails reads/writes closed for missing, malformed and other-tenant contexts",async()=>{
  expect((await runtime.query("SELECT * FROM app.extra_origin")).rows).toEqual([]);
  expect((await withTenant(runtime,ctx(OTHER),db=>db.$client.query("SELECT * FROM app.extra_origin WHERE variation_id=$1",[V]))).rows).toEqual([]);
  await expect(withTenant(runtime,ctx("malformed"),async()=>undefined)).rejects.toMatchObject({code:"INVALID_TENANT_CONTEXT"});
  await expect(insertVariation(runtime as unknown as PoolClient,randomUUID(),J)).rejects.toMatchObject({code:"42501"});
  expect((await runtime.query("SELECT * FROM app.job_commercial_track")).rows).toEqual([]);
 });
 it("denies runtime UPDATE/DELETE/TRUNCATE and origin/track changes, and rejects privileged mutation too",async()=>{
  await expect(withTenant(runtime,ctx(),db=>db.$client.query("INSERT INTO app.extra_origin SELECT * FROM app.extra_origin WHERE tenant_id=$1 LIMIT 1",[T]))).rejects.toMatchObject({code:"42501"});
  for(const sql of ["UPDATE app.extra_origin SET kind='final_review'","DELETE FROM app.extra_origin","TRUNCATE app.extra_origin","UPDATE app.job_commercial_track SET job_track='contractor'","DELETE FROM app.job_commercial_track","TRUNCATE app.job_commercial_track","UPDATE app.variation SET origin='final_review'","UPDATE app.variation SET job_track='contractor'"])
   await expect(withTenant(runtime,ctx(),db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(runtime,ctx(),db=>db.$client.query("INSERT INTO app.extra_origin SELECT * FROM app.extra_origin WHERE tenant_id=$1 LIMIT 1",[T]))).rejects.toMatchObject({code:"42501"});
  for(const sql of ["UPDATE app.extra_origin SET kind='final_review' WHERE tenant_id=$1","DELETE FROM app.extra_origin WHERE tenant_id=$1","UPDATE app.job_commercial_track SET job_track='contractor' WHERE tenant_id=$1","UPDATE app.variation SET origin='final_review' WHERE tenant_id=$1"])
   await expect(admin.query(sql,[T])).rejects.toMatchObject({code:"55000"});
  await expect(withTenant(runtime,ctx(),db=>db.$client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')",[T,J]))).rejects.toMatchObject({code:"42501"});
 });
 it("rejects wrong-track kinds, forged tracks, missing bindings and cross-tenant/cross-job links",async()=>{
  const contractor=await contractorJob(),missing=await job(randomUUID(),"draft");
  for(const [jobId,track,kind,code] of [[J,"small_builder","site_user","23514"],[contractor,"contractor","builder_logged","23514"],[J,"contractor","site_user","23503"],[missing,"small_builder","builder_logged","23503"]] as const)
   await expect(withTenant(runtime,ctx(),db=>insertVariation(db.$client,randomUUID(),jobId,track,kind))).rejects.toMatchObject({code});
  await expect(withTenant(runtime,ctx(),db=>insertVariation(db.$client,randomUUID(),J,null,null,OTHER))).rejects.toMatchObject({code:"42501"});
  const id=randomUUID();await expect(withTenant(runtime,ctx(),async db=>{await insertVariation(db.$client,id,contractor,"contractor","site_user");await commandOrigin(db.$client,J,id);})).rejects.toBeTruthy();
  const otherJob=await job(randomUUID(),"live",OTHER);
  await expect(withTenant(runtime,ctx(),async db=>{await insertVariation(db.$client,randomUUID(),otherJob,"small_builder","builder_logged");})).rejects.toBeTruthy();
  expect((await admin.query("SELECT * FROM app.variation WHERE id=$1",[id])).rowCount).toBe(0);
 });
 it("requires one origin at commit, binds kind/actor to command and writes server time",async()=>{
  const contractor=await contractorJob();
  const absent=randomUUID();await expect(withTenant(runtime,ctx(),db=>insertVariation(db.$client,absent,contractor,"contractor","site_user"))).rejects.toMatchObject({code:"23503"});
  expect((await admin.query("SELECT * FROM app.variation WHERE id=$1",[absent])).rowCount).toBe(0);
  for(const overrides of [{actor:OTHER_M},{role:"operative"},{kind:"office_entry"},{job:J},{tenant:OTHER}]) {
   await expect(withTenant(runtime,ctx(),async db=>{const id=randomUUID();await insertVariation(db.$client,id,contractor,"contractor","site_user");await commandOrigin(db.$client,contractor,id,"site_user","LogSiteExtra",overrides);})).rejects.toBeTruthy();
  }
  await expect(withTenant(runtime,ctx(),async db=>{
   const duplicate=randomUUID();await insertVariation(db.$client,duplicate,contractor,"contractor","site_user");
   await commandOrigin(db.$client,contractor,duplicate,"site_user","LogSiteExtra",{},false);
   await db.$client.query("INSERT INTO app.extra_origin SELECT * FROM app.extra_origin WHERE variation_id=$1",[duplicate]);
  })).rejects.toMatchObject({code:"23505"});
  const id=randomUUID(),command=await withTenant(runtime,ctx(),async db=>{await insertVariation(db.$client,id,contractor,"contractor","site_user");return commandOrigin(db.$client,contractor,id);});
  const row=(await admin.query("SELECT o.*,c.created_at command_time FROM app.extra_origin o JOIN app.command_receipt c ON (c.tenant_id,c.command_id)=(o.tenant_id,o.command_id) WHERE o.variation_id=$1",[id])).rows[0];
  expect(row.server_recorded_at).toEqual(row.command_time);expect(row.device_captured_at).toEqual(new Date("1901-01-01T00:00:00Z"));expect(row.raising_membership_id).toBe(M);expect(row.command_id).toBe(command);
  expect(row.source_capture_hash).not.toBe(H);
  await expect(withTenant(runtime,ctx(),db=>commandOrigin(db.$client,contractor,id))).rejects.toMatchObject({code:"23505"});
 });
 it("maps every raising command to exactly one allowed origin, including command-backed builder capture",async()=>{
  const contractor=await contractorJob();
  for(const [track,kind,type] of [
   ["small_builder","builder_logged","LogBuilderExtra"],["small_builder","final_review","AddFinalReviewExtra"],["small_builder","jobguard_catch","ConfirmJobGuardCatch"],
   ["contractor","site_user","LogSiteExtra"],["contractor","jobguard_surfaced_confirmed","ConfirmPrompt"],["contractor","office_entry","RecordOfficeExtra"],["contractor","client_instruction","RecordClientInstruction"],
  ] as const) {
   const id=randomUUID(),command=randomUUID(),target=track==="small_builder"?J:contractor;
   await withTenant(runtime,ctx(),async db=>{
    await db.$client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,$3,$4,$5,'processing',$6)",[T,command,type,`extra-origin:${target}:${id}`,H,M]);
    await insertVariation(db.$client,id,target,track,kind);
    await db.$client.query(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance)
     VALUES($1,$2,$3,$4,$5,$6,$7,'owner','command')`,[T,target,id,track,kind,command,M]);
    await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2",[T,command]);
   });
   expect((await admin.query("SELECT kind,command_id,provenance FROM app.extra_origin WHERE variation_id=$1",[id])).rows).toEqual([{kind,command_id:command,provenance:"command"}]);
  }
 });
 it("creates exactly one legacy origin atomically and preserves it after pricing/state updates",async()=>{
  const id=randomUUID();await withTenant(runtime,ctx(),db=>insertVariation(db.$client,id,J));
  const before=(await admin.query("SELECT * FROM app.extra_origin WHERE variation_id=$1",[id])).rows;
  expect(before).toHaveLength(1);expect(before[0]).toMatchObject({kind:"builder_logged",provenance:"legacy_synthetic_capture",raising_membership_id:null});
  await withTenant(runtime,ctx(),db=>db.$client.query("UPDATE app.variation SET state='rejected' WHERE id=$1",[id]));
  expect((await admin.query("SELECT * FROM app.extra_origin WHERE variation_id=$1",[id])).rows).toEqual(before);
 });
 it("new adoption import binds inside its transaction, and rollback removes both job and binding",async()=>{
  const imported=randomUUID(),rolled=randomUUID();
  const adopt=(db:PoolClient,id:string)=>db.query("SELECT app.adopt_in_flight_job($1,$2,$3,'Fictional import','live',$4,'Synthetic baseline',10000,150,'reference_fee_policy_v1','synthetic_import_terms_candidate.v1',$5,'2026-09-01T00:00:00Z')",[T,id,randomUUID(),H,M]);
  await withTenant(runtime,ctx(),db=>adopt(db.$client,imported));
  expect((await admin.query("SELECT job_track,environment FROM app.job_commercial_track WHERE job_id=$1",[imported])).rows).toEqual([{job_track:"small_builder",environment:"synthetic_demo"}]);
  await expect(withTenant(runtime,ctx(),async db=>{await adopt(db.$client,rolled);throw new Error("synthetic fault after import");})).rejects.toThrow("synthetic fault");
  for(const table of ["job","job_commercial_track","imported_job_baseline"])expect((await admin.query(`SELECT * FROM app.${table} WHERE ${table==="job"?"id":"job_id"}=$1`,[rolled])).rowCount).toBe(0);
 });
 it("the real switch-live command binds atomically; a conflicting track rolls everything back",async()=>{
  const make=async()=>{
   const id=await job(randomUUID(),"accepted"),draft=randomUUID(),document=randomUUID();
   await admin.query("INSERT INTO app.quote_draft(id,tenant_id,job_id,revision) VALUES($1,$2,$3,1)",[draft,T,id]);
   await admin.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
    VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',10000,0,10000,2000,12000,true,'[]')`,[document,T,id,draft]);
   await admin.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
    VALUES($1,$2,$3,$1,1,'SH-1',$4,'synthetic','synthetic-v1',1,'{}','{}','{"netPence":10000,"totalPence":12000}')`,[document,T,id,H]);
   await admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')",[document,T,id,H]);
   await admin.query("UPDATE app.job SET accepted_quote_version_id=$1 WHERE tenant_id=$2 AND id=$3",[document,T,id]);
   await admin.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
    VALUES($1,$2,$3,$4,1,$5,12000,'GBP','builder_attestation',$6,'Fictional customer','verbal',now())`,[randomUUID(),T,id,document,H,M]);
   const input={version:"switch-live.v1" as const,activationId:randomUUID(),capSnapshotId:randomUUID(),syntheticObligationId:randomUUID(),jobId:id,acceptedDocumentId:document,acceptedDocumentVersion:1,acceptedDocumentHash:H,expectedJobRevision:0,acceptedNetValuePence:10000,recoveryCapPence:150,mode:"synthetic_demo" as const,activationTermsVersion:"synthetic_demo_illustrative.v1" as const,feePolicyVersion:"reference_fee_policy_v1" as const,activatedAt:new Date()};
   const command={version:"command.v1" as const,commandId:randomUUID(),commandType:"job.switch_live",semanticKey:`switch:${id}`,actorMembershipId:M,subjectType:"job",subjectRef:id,action:{actionType:"job.switch_live",recipient:null,contentHash:H,aggregateRevision:1,amountPence:7900,currency:"GBP" as const,policyVersion:input.activationTermsVersion,expiresAt:new Date(Date.now()+60000)}};
   return {id,input,command};
  };
  const good=await make(),dispatcher=new UserCommandDispatcher(runtime);
  expect((await admin.query("SELECT * FROM app.job_commercial_track WHERE job_id=$1",[good.id])).rowCount).toBe(0);
  const results=await Promise.all([dispatcher.dispatch(ctx(),good.command,new SwitchJobLiveMutation(T,"synthetic_demo",good.input)),dispatcher.dispatch(ctx(),good.command,new SwitchJobLiveMutation(T,"synthetic_demo",good.input))]);
  expect(results[0]).toEqual(results[1]);
  expect((await admin.query("SELECT job_track,provenance,source_id FROM app.job_commercial_track WHERE job_id=$1",[good.id])).rows).toEqual([{job_track:"small_builder",provenance:"quote_activation",source_id:good.input.activationId}]);
  // Earlier synthetic quotes can select the existing no-charge scenario after
  // rollout; that mode flag must not change their established commercial track.
  const legacy=await make();await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')",[T,legacy.id]);
  const noCharge={...legacy.input,mode:"pilot_no_charge" as const,activationTermsVersion:"pilot_no_charge.v1" as const,syntheticObligationId:null};
  const noChargeCommand={...legacy.command,action:{...legacy.command.action,amountPence:null,currency:null,policyVersion:"pilot_no_charge.v1"}};
  await dispatcher.dispatch(ctx(),noChargeCommand,new SwitchJobLiveMutation(T,"pilot_no_charge",noCharge));
  expect((await admin.query("SELECT job_track,environment FROM app.job_commercial_track WHERE job_id=$1",[legacy.id])).rows).toEqual([{job_track:"small_builder",environment:"synthetic_demo"}]);
  expect((await admin.query("SELECT * FROM app.synthetic_obligation WHERE job_id=$1",[legacy.id])).rowCount).toBe(0);
  const bad=await make();await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')",[T,bad.id]);
  await expect(dispatcher.dispatch(ctx(),bad.command,new SwitchJobLiveMutation(T,"synthetic_demo",bad.input))).rejects.toThrow("immutable job track conflict");
  for(const table of ["job_activation","cap_snapshot","synthetic_obligation"])expect((await admin.query(`SELECT * FROM app.${table} WHERE job_id=$1`,[bad.id])).rowCount).toBe(0);
  expect((await admin.query("SELECT * FROM app.command_receipt WHERE command_id=$1",[bad.command.commandId])).rowCount).toBe(0);
  expect((await admin.query("SELECT * FROM app.audit_event WHERE subject_ref=$1",[bad.id])).rowCount).toBe(0);
 });
 it("fresh installation also creates the new schema without fixtures",async()=>{
  await admin.query("CREATE DATABASE sh1_fresh");const fresh=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic",database:"sh1_fresh"});
  try {await migrate(fresh);expect((await fresh.query("SELECT count(*)::int n FROM app.extra_origin")).rows[0].n).toBe(0);expect((await fresh.query("SELECT count(*)::int n FROM public.jobguard_schema_migration")).rows[0].n).toBe(MIGRATION_URLS.length);}finally{await fresh.end();}
 },60000);
});
