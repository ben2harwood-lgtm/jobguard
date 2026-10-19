// Written before 0195/core activation. PostgreSQL NOT RUN in the builder sandbox.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolConfig } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, readRecoveryEligibilityV3, withTenant, appendAuditBatch } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const reason="Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.";
const expected={version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:"F21",outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason,reasonHeld:false,terminal:false,productionEnabled:false,
 lines:[{kind:"principal",debtorType:"business",netPence:9000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason,reasonHeld:false}]};
const ctx=testTenantContext(T),actor={membershipId:M,identityUserId:U};
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,runtimeConfig:PoolConfig,adminConfig:PoolConfig;
const previousEnvironment=process.env.JOBGUARD_ENV;
async function start(){
 process.env.JOBGUARD_ENV="synthetic_demo";
 const directory=await mkdtemp(join(tmpdir(),"jg-f21-")),port=await freePort(62000,100),value=randomUUID();
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:value,persistent:true,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 adminConfig={host:"127.0.0.1",port,database:"postgres",user:"postgres",password:value};admin=new Pool(adminConfig);
 await admin.query(`CREATE ROLE f21_login LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 runtimeConfig={...adminConfig,user:"f21_login"};runtime=new Pool(runtimeConfig);
}
async function identity(){
 await admin.query("GRANT jobguard_runtime TO f21_login");
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional F21 builder')",[A,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
}
afterAll(async()=>{await closeTestPools(runtime,admin);if(postgres)await postgres.stop();if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;});
beforeAll(async()=>{await start();await migrate(admin);await identity();});
async function fixture(type="withheld_customer_payment",before=false){
 const sessionId=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,sessionId),jobId=randomUUID();
 await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'CH-7 generated job',$3,'capture')",[jobId,T,auth.digest]);
 const cases=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest)),feed=new PracticeFeedRepository(runtime,"synthetic_demo");let revision=0;
 const advance=async(movement:string,step="settled")=>{const reply=await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:revision,action:revision===0?"connect":"advance",...(revision===0?{}:{movement,step})});revision=reply.revision;};
 await advance("receipt-384");if(before)await advance("receipt-384");
 const c=await cases.command(ctx,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:type,claimedNetPence:300000,counterparty:"Fictional debtor",book:type==="withheld_customer_payment"?"builder_customer":"supplier_cost",sourceType:type==="withheld_customer_payment"?"customer_invoice":"supplier_documents",sourceRefs:type==="withheld_customer_payment"?["Generated customer invoice INV-18800"]:["Supplier invoice INV-320"],expectedRevision:0},actor);
 return {auth,jobId,c,cases,advance,repo:new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime,auth.digest),"synthetic_demo")};
}
const review=(c:{id:string;revision:number},fixture:string,expectedReviewRevision=0)=>({version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,expectedReviewRevision,fixture});

async function counts(){
 const tables=(await admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('app','infrastructure') ORDER BY schemaname,tablename")).rows;
 const result:Record<string,number>={};
 for(const t of tables)result[`${t.schemaname}.${t.tablename}`]=Number((await admin.query(`SELECT count(*) n FROM "${t.schemaname}"."${t.tablename}"`)).rows[0].n);
 return result;
}
const save=(f:Awaited<ReturnType<typeof fixture>>,command=review(f.c,"F21"))=>f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);

it("F21SavedReasonSurvivesReconnect",async()=>{
 const f=await fixture("merchant_overcharge"),saved=await save(f);
 expect(saved.result).toEqual(expected);expect(saved.sourceEventId).toBeNull();
 const fresh=new Pool(runtimeConfig);
 try{
  const reread=await withTenant(practiceMaterialPool(fresh,f.auth.digest),ctx,db=>readRecoveryEligibilityV3(db,T,f.c.id));
  expect(reread).toEqual(saved);
  expect((await new RecoveryCaseRepository(practiceMaterialPool(fresh,f.auth.digest)).listForMember(ctx,f.jobId,actor)).find(c=>c.id===f.c.id)?.eligibilityV3).toEqual(saved);
 }finally{await closeTestPools(fresh);}
});
type ProbeResult={reason?:string|null;reasonHeld:boolean;qualifyingPrincipal:{pence:number};lines:Array<{reason?:string|null;reasonHeld:boolean;qualifyingPrincipal:{pence:number};netPence:number;kind:string}>};
const malformed=[
 ["header omitted",(r:ProbeResult)=>{delete r.reason;}],["header null",(r:ProbeResult)=>{r.reason=null;}],
 ["header wrong",(r:ProbeResult)=>{r.reason="Pending money cannot qualify";}],["header ASCII",(r:ProbeResult)=>{r.reason=reason.replaceAll("’","'");}],
 ["header held",(r:ProbeResult)=>{r.reasonHeld=true;}],["header Q",(r:ProbeResult)=>{r.qualifyingPrincipal.pence=1;}],
 ["line omitted",(r:ProbeResult)=>{delete r.lines[0].reason;}],["line null",(r:ProbeResult)=>{r.lines[0].reason=null;}],
 ["line wrong",(r:ProbeResult)=>{r.lines[0].reason="Pending money cannot qualify";}],["line ASCII",(r:ProbeResult)=>{r.lines[0].reason=reason.replaceAll("’","'");}],
 ["line held",(r:ProbeResult)=>{r.lines[0].reasonHeld=true;}],["line Q",(r:ProbeResult)=>{r.lines[0].qualifyingPrincipal.pence=1;}],
 ["line net",(r:ProbeResult)=>{r.lines[0].netPence=9001;}],["line kind",(r:ProbeResult)=>{r.lines[0].kind="statutory_interest";}],
] as const;
async function raw(f:Awaited<ReturnType<typeof fixture>>,result:unknown){
 const id=randomUUID(),commandId=randomUUID(),payloadHash=createHash("sha256").update(commandId).digest("hex");
 return withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const inserted=await db.$client.query<{h:string}>("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,'F21',NULL,$6,$7,$8,$9) RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') h",[id,T,f.jobId,f.c.id,f.c.revision,M,commandId,payloadHash,JSON.stringify(result)]);
  await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'principal','business',9000)",[randomUUID(),T,f.jobId,f.c.id,id]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{jobId:f.jobId,reviewId:id,commandId},hashes:{command:payloadHash,result:inserted.rows[0]!.h},classifications:{recovery:"financial"}}}]);
 });
}
it.each(malformed)("F21MalformedHeaderAndLineCannotCommit: %s",async(label,change)=>{
 const f=await fixture("merchant_overcharge"),before=await counts(),result=structuredClone(expected);change(result);
 await expect(raw(f,result)).rejects.toMatchObject({code:"23514",message:label.startsWith("header")?"ELIGIBILITY_FIXTURE_MISMATCH":"ELIGIBILITY_LINES_REQUIRED"});
 expect(await counts()).toEqual(before);
 expect(await withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,db=>readRecoveryEligibilityV3(db,T,f.c.id))).toBeNull();
});
it("F21MalformedHeaderAndLineCannotCommit: complete valid raw control commits",async()=>{
 const f=await fixture("merchant_overcharge");await raw(f,expected);
 expect((await admin.query("SELECT result FROM app.recovery_eligibility_v3_review WHERE case_id=$1",[f.c.id])).rows).toEqual([{result:expected}]);
});
it("F21ExactReplayAndConflict",async()=>{
 const f=await fixture("merchant_overcharge"),command=review(f.c,"F21"),first=await save(f,command),before=await counts();
 expect(await save(f,command)).toEqual(first);expect(await counts()).toEqual(before);
 await expect(save(f,{...command,expectedReviewRevision:1})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
 await expect(save(f)).rejects.toThrow("ELIGIBILITY_STALE_REVISION");
 await expect(save(f,{...review(f.c,"F21",1),expectedCaseRevision:f.c.revision+1})).rejects.toThrow("ELIGIBILITY_STALE_REVISION");
 expect(await counts()).toEqual(before);
});
it("F21TenantJobSessionIsolation",async()=>{
 const f=await fixture("merchant_overcharge"),other=await fixture("merchant_overcharge"),command=review(f.c,"F21");await save(f,command);
 const sameJob=randomUUID();await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'Same session other job',$3,'capture')",[sameJob,T,f.auth.digest]);
 const before=await counts();
 for(const input of [command,{...command,commandId:randomUUID(),expectedReviewRevision:1}]){
  await expect(f.repo.review(testTenantContext(randomUUID()),f.jobId,input,actor,f.auth.digest)).rejects.toThrow();
  await expect(f.repo.review(ctx,sameJob,input,actor,f.auth.digest)).rejects.toThrow();
  await expect(other.repo.review(ctx,f.jobId,input,actor,other.auth.digest)).rejects.toThrow();
 }
 await admin.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[T,M]);
 try{for(const input of [command,{...command,commandId:randomUUID(),expectedReviewRevision:1}])await expect(save(f,input)).rejects.toThrow();}
 finally{await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[T,M]);}
 await admin.query("UPDATE control_plane.practice_session SET revoked_at=now() WHERE token_digest=$1",[f.auth.digest]);
 for(const input of [command,{...command,commandId:randomUUID(),expectedReviewRevision:1}])await expect(save(f,input)).rejects.toThrow();
 expect(await counts()).toEqual(before);
});
it("F21NoFinancialOrExternalEffects",async()=>{
 const f=await fixture("merchant_overcharge"),before=await counts();await save(f);const after=await counts();
 expect(Object.fromEntries(Object.keys(after).filter(k=>after[k]!==before[k]).map(k=>[k,after[k]!-before[k]!]))).toEqual({"app.recovery_eligibility_v3_review":1,"app.recovery_claim_line":1,"app.audit_event":1});
 const stored=(await admin.query("SELECT source_event_id,result FROM app.recovery_eligibility_v3_review WHERE case_id=$1",[f.c.id])).rows;
 expect(stored).toEqual([{source_event_id:null,result:expected}]);
});
