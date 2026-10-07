import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant, verifiedTenantContextFromMembership } from "../src/tenant-context.js";
import { closeTestPools } from "./pool-test-utils.js";
const T=randomUUID(), O=randomUUID(), J=randomUUID(), K=randomUUID(), L=randomUUID(), M=randomUUID(), U=randomUUID(), H="a".repeat(64);
const context=(tenantId:string=T)=>verifiedTenantContextFromMembership({tenantId,membershipId:M,identityUserId:U} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
let postgres:EmbeddedPostgres, admin:Pool, runtime:Pool, shadow:Pool, emergency:Pool, directory:string;
const migrationURL=new URL("../migrations/0100_shadow_persistence.sql",import.meta.url);
async function signal(jobId:string=J,tenantId:string=T,state="candidate") {
 const id=randomUUID();await admin.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
 VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-v1',clock_timestamp(),'Fictional outside tap','low',$5)`,[tenantId,jobId,id,randomUUID(),state]);return id;
}
async function setup() {
 directory=await mkdtemp(join(tmpdir(),"sv2-pg16-"));const port=59000+Math.floor(Math.random()*500);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);
 for(const [tenant,job] of [[T,J],[T,K],[O,L]]) {
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[tenant]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional SV-2 job','live')",[job,tenant]);
 }
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);const a=randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-2')",[a,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,a,U]);
 for(const [login,role] of [["sv2_runtime","jobguard_runtime"],["sv2_shadow","jobguard_shadow"],["sv2_emergency","jobguard_shadow_emergency_access"]]) {
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT ${role} TO ${login}`);
 }
 const pool=(user:string)=>new Pool({host:"127.0.0.1",port,user,password:"synthetic",max:4});
 runtime=pool("sv2_runtime");shadow=pool("sv2_shadow");emergency=pool("sv2_emergency");
}
async function cleanup(){await closeTestPools(runtime,shadow,emergency,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});}
import { VariationRepository } from "../src/variation-repository.js";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, DEMO_ACCOUNT_ID } from "../src/demo-seed.js";
import { issuePracticeSession, authenticatePracticeSession } from "../src/practice-session.js";
const proposal=()=>({version:"variation-proposal.v1",id:randomUUID(),jobId:J,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional outside tap fitted",description:"Synthetic tap",suggestion:null});
const capture=()=>({version:"log-builder-extra.v1",proposal:proposal(),actorMembershipId:M,price:null,deviceId:"synthetic-device",deviceCapturedAt:"2026-09-30T10:00:00Z"});
describe("SV-2 small-builder origins and withdrawal (B2, B3, DW4, DW5, DW8)",()=>{
 beforeAll(setup,60000);afterAll(cleanup);
 it("writes one full command origin, replays unchanged, conflicts on changed payload and races safely",async()=>{
  const repo=new VariationRepository(runtime),input=capture();
  const outcomes=await Promise.all([repo.logBuilderExtra(context(),input),repo.logBuilderExtra(context(),input)]);
  expect(outcomes[0]).toEqual(outcomes[1]);
  const rows=(await admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[T,input.proposal.id])).rows;
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:"builder_logged",job_track:"small_builder",command_id:input.proposal.id,raising_membership_id:M,raising_role:"owner",provenance:"command",device_id:"synthetic-device",source_signal_id:null,device_captured_at:new Date(input.deviceCapturedAt)});
  expect(rows[0].source_capture_hash).toMatch(/^[a-f0-9]{64}$/);expect(rows[0].source_capture_kind).toBe("text");
  const receipt=(await admin.query("SELECT * FROM app.command_receipt WHERE command_id=$1",[input.proposal.id])).rows[0];
  expect(receipt).toMatchObject({command_type:"LogBuilderExtra",semantic_key:`extra-origin:${J}:${input.proposal.id}`,status:"succeeded"});expect(rows[0].server_recorded_at).toEqual(receipt.created_at);
  await expect(repo.logBuilderExtra(context(),{...input,proposal:{...input.proposal,captureText:"Changed text"}})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
  await expect(admin.query("INSERT INTO app.extra_origin SELECT * FROM app.extra_origin WHERE variation_id=$1",[input.proposal.id])).rejects.toMatchObject({code:"23514"});
  expect((await admin.query("SELECT * FROM app.extra_origin WHERE variation_id=$1",[input.proposal.id])).rowCount).toBe(1);
  await expect(repo.logBuilderExtra(context(O),capture())).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(repo.logBuilderExtra(context(),{...capture(),actorMembershipId:randomUUID()})).rejects.toMatchObject({code:"FORBIDDEN"});
 });
 it("rejects revoked membership and rolls capture/origin/receipt back if audit append fails",async()=>{
  const repo=new VariationRepository(runtime),input=capture();
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[T,M]);
  try{await expect(repo.logBuilderExtra(context(),input)).rejects.toMatchObject({code:"FORBIDDEN"})}finally{await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[T,M])}
  await admin.query("REVOKE INSERT ON app.audit_event FROM jobguard_runtime");
  try{await expect(repo.logBuilderExtra(context(),input)).rejects.toMatchObject({code:"42501"})}finally{await admin.query("GRANT INSERT ON app.audit_event TO jobguard_runtime")}
  expect((await admin.query("SELECT * FROM app.variation WHERE id=$1",[input.proposal.id])).rowCount).toBe(0);
  expect((await admin.query("SELECT * FROM app.extra_origin WHERE variation_id=$1",[input.proposal.id])).rowCount).toBe(0);
  expect((await admin.query("SELECT * FROM app.command_receipt WHERE command_id=$1",[input.proposal.id])).rowCount).toBe(0);
 });
 it("the existing application propose action issues LogBuilderExtra, with price, and replays",async()=>{
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic application')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  try {
  const session=await issuePracticeSession(runtime),stranger=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,session);
  // SBOX's issuance routine creates the live home job with immutable ownership.
  const job=(await admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",[DEMO_TENANT_ID,auth.digest])).rows[0].id as string,scope=randomUUID();
  await admin.query("UPDATE app.job SET accepted_net_value_pence=10000,recovery_cap_pence=150 WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,job]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,DEMO_TENANT_ID,job]);
  const input={version:"variation-command.v1",action:"propose",proposalId:randomUUID(),scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:scope,description:"Synthetic tap",captureText:"Synthetic captured tap",price:{quantity:"1",unit:"item",unitRatePence:80000,direction:"addition"}};
  const application=new VariationApplication(runtime,session);
  const effects=async()=> (await admin.query("SELECT (SELECT count(*)::int FROM app.variation WHERE tenant_id=$1 AND job_id=$2) variations,(SELECT count(*)::int FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2) origins,(SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1) receipts,(SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audit",[DEMO_TENANT_ID,job])).rows[0];
  const untouched=await effects();
  for(const [cookie,code] of [[undefined,"UNAUTHENTICATED"],[stranger,"NOT_FOUND"]] as const) {
   const denied=new VariationApplication(runtime,cookie);
   await expect(denied.get(job)).rejects.toMatchObject({code});
   await expect(denied.command(job,input)).rejects.toMatchObject({code});
   expect(await effects()).toEqual(untouched);
  }
  const first=await application.command(job,input),replayed=await application.command(job,input);
  expect(replayed).toEqual(first);expect(first.variations).toEqual([expect.objectContaining({id:input.proposalId,state:"priced"})]);
  expect((await admin.query("SELECT kind,provenance,raising_membership_id FROM app.extra_origin WHERE variation_id=$1",[input.proposalId])).rows).toEqual([{kind:"builder_logged",provenance:"command",raising_membership_id:DEMO_MEMBERSHIP_ID}]);
  const captured=await effects();
  await expect(new VariationApplication(runtime,stranger).command(job,input)).rejects.toMatchObject({code:"NOT_FOUND"});
  expect(await effects()).toEqual(captured);
  expect(await application.get(job)).toEqual(first);
  } finally { vi.unstubAllEnvs(); }
 });
 it("uniformly refuses runtime signal-id probes before any FK lookup",async()=>{
  const existing=await signal();
  const attempt=(id:string)=>withTenant(runtime,context(),db=>db.$client.query(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id) VALUES($1,$2,$3,'small_builder','jobguard_catch',$4,$5,'owner','command',$6)`,[T,J,randomUUID(),randomUUID(),M,id]));
  const error=async(id:string)=>{try{await attempt(id);throw new Error("probe succeeded")}catch(e){const p=e as {code:string;message:string;detail?:string;constraint?:string};return {code:p.code,message:p.message,detail:p.detail,constraint:p.constraint}}};
  const found=await error(existing),missing=await error(randomUUID());expect(found).toEqual(missing);expect(found).toMatchObject({code:"42501",message:"shadow origin unavailable through runtime"});
 });
 it("enforces source only for catches and tenant/job-qualified references without adding future commands",async()=>{
  const existing=await signal(),wrongJob=await signal(K),wrongTenant=await signal(L,O);
  const insert=async(kind:string,source:string|null)=>{
   const client=await admin.connect(),p=proposal(),command=randomUUID();
   try{await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[T]);
    const type=kind==="jobguard_catch"?"ConfirmJobGuardCatch":kind==="final_review"?"AddFinalReviewExtra":"LogBuilderExtra";
    await client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,$3,$4,$5,'processing',$6)",[T,command,type,`extra-origin:${J}:${p.id}`,H,M]);
    await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'reserved')",[p.scopeItemId,T,J]);
    await client.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,origin) VALUES($1,$2,$3,$4,'text','Fictional capture','Synthetic',$5)",[p.id,T,J,p.scopeItemId,kind]);
    await client.query("INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id) VALUES($1,$2,$3,'small_builder',$4,$5,$6,'owner','command',$7)",[T,J,p.id,kind,command,M,source]);
    await client.query("COMMIT");return p.id;
   }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
  };
  await expect(insert("jobguard_catch",null)).rejects.toMatchObject({code:"23514"});
  await expect(insert("builder_logged",existing)).rejects.toMatchObject({code:"23514"});
  await expect(insert("final_review",existing)).rejects.toMatchObject({code:"23514"});
  for(const id of [wrongJob,wrongTenant,randomUUID()])await expect(insert("jobguard_catch",id)).rejects.toMatchObject({code:"23503"});
  const id=await insert("jobguard_catch",existing);await expect(admin.query("INSERT INTO app.extra_origin SELECT * FROM app.extra_origin WHERE variation_id=$1",[id])).rejects.toMatchObject({code:"23505"});expect((await admin.query("SELECT source_signal_id FROM app.extra_origin WHERE variation_id=$1",[id])).rows[0].source_signal_id).toBe(existing);
  await insert("final_review",null);
  await expect(insert("site_user",null)).rejects.toMatchObject({code:"23514"});
 });
 it("appends withdrawal while retaining capture identity and denies deletion of both",async()=>{
  const repo=new VariationRepository(runtime),input=capture();await repo.logBuilderExtra(context(),input);
  await repo.recordWithdrawal(context(),{version:"variation-withdrawal.v1",id:randomUUID(),jobId:J,variationId:input.proposal.id,actorMembershipId:M,reasonCode:"builder_withdrawn"});
  expect((await withTenant(runtime,context(),db=>db.$client.query("SELECT v.id,o.kind,w.reason_code FROM app.variation v JOIN app.extra_origin o ON(o.tenant_id,o.variation_id)=(v.tenant_id,v.id) JOIN app.variation_withdrawal w ON(w.tenant_id,w.variation_id)=(v.tenant_id,v.id) WHERE v.id=$1",[input.proposal.id]))).rows).toEqual([{id:input.proposal.id,kind:"builder_logged",reason_code:"builder_withdrawn"}]);
  for(const table of ["variation","variation_withdrawal"])await expect(withTenant(runtime,context(),db=>db.$client.query(`DELETE FROM app.${table}`))).rejects.toMatchObject({code:"42501"});
  const unwithdrawn=capture();await repo.logBuilderExtra(context(),unwithdrawn);
  await expect(admin.query("INSERT INTO app.variation_withdrawal(tenant_id,job_id,id,variation_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,$5,'builder_withdrawn')",[T,K,randomUUID(),unwithdrawn.proposal.id,M])).rejects.toMatchObject({code:"23503"});
 });
 it("upgrades seeded SH-1 backfill with no second backfill and preserves exact labels and counts",async()=>{
  const client=await admin.connect(),schema=`sv2_upgrade_${randomUUID().replaceAll('-','')}`;
  // Isolated real database: apply the exact supported predecessor, seed before SH-1,
  // and compare origins before/after 0100. No second hand-written backfill.
  await client.query(`CREATE DATABASE ${schema}`);client.release();
  const upgrade=new Pool({...admin.options,database:schema});
  try{
   const urls=MIGRATION_URLS.slice(0,-1),sh1=urls.findIndex(u=>u.pathname.endsWith("0053_shared_money_origin.sql"));
   for(const url of urls.slice(0,sh1))await upgrade.query(await readFile(url,"utf8"));
   const t=randomUUID(),j=randomUUID(),s=randomUUID(),v=randomUUID();
   await upgrade.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[t]);
   await upgrade.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic upgrade','live')",[j,t]);
   await upgrade.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[s,t,j]);
   await upgrade.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description) VALUES($1,$2,$3,$4,'text','Fictional legacy capture','Synthetic legacy')",[v,t,j,s]);
   for(const url of urls.slice(sh1))await upgrade.query(await readFile(url,"utf8"));
   const before=(await upgrade.query("SELECT * FROM app.extra_origin")).rows;
   expect(before).toHaveLength(1);expect(before[0]).toMatchObject({kind:"builder_logged",provenance:"backfilled_synthetic_fixture",raising_role:"legacy_unrecorded",raising_membership_id:null,command_id:null});
   // Snapshot SBOX's exact ownership boundary on the supported predecessor.
   // 0100 must leave its policies, grants, bindings, triggers and routines intact.
   const sboxCatalog=async()=>({
    policies:(await upgrade.query("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE policyname LIKE 'practice_%' ORDER BY schemaname,tablename,policyname")).rows,
    bindings:(await upgrade.query("SELECT table_schema,table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE column_name IN ('practice_session_digest','practice_scenario') ORDER BY table_schema,table_name,column_name")).rows,
    constraints:(await upgrade.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname LIKE 'practice_%' ORDER BY conname,conrelid")).rows,
    triggers:(await upgrade.query("SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgname LIKE 'practice_%' ORDER BY tgname,tgrelid")).rows,
    routines:(await upgrade.query("SELECT proname,pg_get_functiondef(oid) definition,proacl::text grants FROM pg_proc WHERE proname IN ('authenticate_practice_session','issue_practice_session') OR proname LIKE 'guard_practice_%' ORDER BY proname")).rows,
   });
   const sboxBefore=await sboxCatalog();
   expect(sboxBefore.policies.filter(row=>row.policyname==='practice_material_isolation')).toHaveLength(5);
   expect(sboxBefore.routines).toHaveLength(5);
   await upgrade.query(await readFile(migrationURL,"utf8"));
   const after=(await upgrade.query("SELECT * FROM app.extra_origin")).rows;
   expect(after).toEqual(before.map(row=>({...row,source_signal_id:null})));
   expect(await sboxCatalog()).toEqual(sboxBefore);
  }finally{await upgrade.end();await admin.query(`DROP DATABASE ${schema}`)}
 });
});
