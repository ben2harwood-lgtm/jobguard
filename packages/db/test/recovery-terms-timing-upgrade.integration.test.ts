// PostgreSQL suites are NOT RUN locally by dispatcher instruction. No mocked database proof.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolConfig } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { recoveryCaseTermsHash } from "@jobguard/core";
import { migrate, MIGRATION_URLS, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryCaseTermsRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, withTenant, appendAuditBatch } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
const ctx=testTenantContext(T),actor={membershipId:M,identityUserId:U};
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,runtimeConfig:PoolConfig,adminConfig:PoolConfig;
const previousEnvironment=process.env.JOBGUARD_ENV;
async function start(){
 process.env.JOBGUARD_ENV="synthetic_demo";
 const directory=await mkdtemp(join(tmpdir(),"jg-dw3-")),port=await freePort(62000,100),value=randomUUID();
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:value,persistent:true,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 adminConfig={host:"127.0.0.1",port,database:"postgres",user:"postgres",password:value};admin=new Pool(adminConfig);
 await admin.query(`CREATE ROLE dw3_login LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 runtimeConfig={...adminConfig,user:"dw3_login"};runtime=new Pool(runtimeConfig);
}
async function identity(){
 await admin.query("GRANT jobguard_runtime TO dw3_login");
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional DW3 builder')",[A,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
}
afterAll(async()=>{await closeTestPools(runtime,admin);if(postgres)await postgres.stop();if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;});

async function fixture(type="withheld_customer_payment",before=false){
 const sessionId=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,sessionId),jobId=randomUUID();
 await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)VALUES($1,$2,'Explicit new v3 DW3 fixture',$3,'capture','imported',100000,'reference_fee_policy_v3',1500)",[jobId,T,auth.digest]);
 const cases=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest)),feed=new PracticeFeedRepository(runtime,"synthetic_demo");let revision=0;
 const advance=async(movement:string,step="settled")=>{const reply=await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:revision,action:revision===0?"connect":"advance",...(revision===0?{}:{movement,step})});revision=reply.revision;};
 await advance("receipt-384");if(before)await advance("receipt-384");
 const c=await cases.command(ctx,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:type,claimedNetPence:300000,counterparty:"Fictional debtor",book:type==="withheld_customer_payment"?"builder_customer":"supplier_cost",sourceType:type==="withheld_customer_payment"?"customer_invoice":"supplier_documents",sourceRefs:type==="withheld_customer_payment"?["Generated customer invoice INV-18800"]:["Supplier invoice INV-320"],expectedRevision:0},actor);
 return {auth,jobId,c,cases,advance,repo:new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime,auth.digest),"synthetic_demo")};
}
const review=(c:{id:string;revision:number},fixture:string,expectedReviewRevision=0)=>({version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,expectedReviewRevision,fixture});

const note="This came in before your fee terms were agreed, so it isn't counted as recovered money and there's no fee on it.";
const termsCommand=(caseId:string)=>({version:"recovery-case-terms-command.v1",action:"approve",commandId:randomUUID(),caseId,termsVersion:"synthetic_recovery_fee_terms.v1",feePolicyVersion:"reference_fee_policy_v3",eligibilityPolicyVersion:"reference_recovery_eligibility_policy_v3",termsHash:recoveryCaseTermsHash(caseId)});
type Fixture=Awaited<ReturnType<typeof fixture>>;
const approve=(f:Fixture)=>new RecoveryCaseTermsRepository(practiceMaterialPool(runtime,f.auth.digest)).approve(ctx,f.jobId,termsCommand(f.c.id),actor);
const save=(f:Fixture,command=review(f.c,"F18"))=>f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);

const position=MIGRATION_URLS.findIndex(u=>basename(fileURLToPath(u))==="0199_recovery_eligibility_terms_timing.sql");
beforeAll(async()=>{
 await start();expect(position).toBeGreaterThan(0);
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const u of MIGRATION_URLS.slice(0,position)){await admin.query(await readFile(u,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(u))]);}
 await identity();
});
it("DW3UpgradePreservesHistory / LaterApprovalPreservesEarlierReview",async()=>{
 const f=await fixture();await f.advance("receipt-3000");await approve(f);
 // Historical A-schema outcome is inserted as a historical fact, not evaluated by the new core.
 // A allowed this receipt despite later terms. Use SQL's existing audit/line requirements.
 const command=review(f.c,"F19"),id=randomUUID(),payload=createHash("sha256").update(JSON.stringify({jobId:f.jobId,...command})).digest("hex");
 const historical={version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:"F19",outcome:"eligible_for_review",qualifyingPrincipal:{pence:250000,currency:"GBP"},reason:"Fixed statutory compensation is not part of the fee base",reasonHeld:false,terminal:false,productionEnabled:false,lines:[
  {kind:"principal",debtorType:"individual",netPence:250000,qualifyingPrincipal:{pence:250000,currency:"GBP"},reason:null,reasonHeld:false},
  {kind:"statutory_interest",debtorType:"individual",netPence:12000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.",reasonHeld:false},
  {kind:"fixed_compensation",debtorType:"individual",netPence:7000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Fixed statutory compensation is not part of the fee base",reasonHeld:false}]};
 // Populate an immutable historical snapshot with a real A guard through a local historical writer.
 await withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  const client=db.$client;
  await client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const event=(await client.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key='receipt-3000' AND event_kind='settled'",[T,f.jobId])).rows[0].id;
  const h=(await client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,'F19',$6,$7,$8,$9,$10)RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') h",[id,T,f.jobId,f.c.id,f.c.revision,event,M,command.commandId,payload,JSON.stringify(historical)])).rows[0].h;
  for(const l of historical.lines)await client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),T,f.jobId,f.c.id,id,l.kind,l.debtorType,l.netPence]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{jobId:f.jobId,reviewId:id,commandId:command.commandId,sourceEventId:event},hashes:{command:payload,result:h},classifications:{recovery:"financial"}}}]);
 });
 const replay=command,saved=await save(f,replay);
 expect(saved.result).toEqual(historical);
 // Explicit immutable v1 history for the populated A-schema upgrade proof.
 const historicalClient=await admin.connect();try{
  await historicalClient.query("BEGIN");await historicalClient.query("SET LOCAL session_replication_role=replica");
  await historicalClient.query("INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)VALUES($1,$2,$3,$4,1,1,1,'reference-d03.v1',1,'pending_money','excluded',NULL,'GBP','Pending money cannot qualify','[]','reviewed','historical-fixture',$5,$6)",[randomUUID(),T,f.jobId,f.c.id,randomUUID(),"b".repeat(64)]);
  await historicalClient.query("COMMIT");
 }finally{historicalClient.release();}
 const tables=["app.recovery_eligibility_revision","app.recovery_eligibility_v3_review","app.recovery_claim_line","app.recovery_case_terms_approval","app.audit_event"];
 const proof=await proofBefore(admin,tables);for(const p of Object.values(proof))expect(Object.keys(p.rows).length).toBeGreaterThan(0);
 const security=async()=>({
  routines:(await admin.query("SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid IN('app.guard_recovery_eligibility_v3()'::regprocedure,'app.require_recovery_eligibility_v3_effect()'::regprocedure) ORDER BY oid")).rows,
  tables:(await admin.query("SELECT oid,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace ORDER BY oid")).rows,
  columns:(await admin.query("SELECT attrelid,attnum,attname,format_type(atttypid,atttypmod) type,attnotnull FROM pg_attribute WHERE attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='app'::regnamespace) AND attnum>0 AND NOT attisdropped ORDER BY attrelid,attnum")).rows,
  constraints:(await admin.query("SELECT oid,conrelid,conname,pg_get_constraintdef(oid) definition FROM pg_constraint ORDER BY oid")).rows,
  triggers:(await admin.query("SELECT oid,tgrelid,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger ORDER BY oid")).rows,
  otherRoutines:(await admin.query("SELECT oid,proowner,proacl::text,prosecdef,proconfig,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace AND prokind='f' AND proname NOT IN('guard_recovery_eligibility_v3','require_recovery_eligibility_v3_effect') ORDER BY oid")).rows,
  policies:(await admin.query("SELECT oid,polrelid,polname,polqual::text,polwithcheck::text FROM pg_policy ORDER BY oid")).rows});
 const before=await security();await admin.query(await readFile(MIGRATION_URLS[position]!,"utf8"));
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});expect(await security()).toEqual(before);
 await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(MIGRATION_URLS[position]!))]);await migrate(admin);await migrate(admin);
 expect(await save(f,replay)).toEqual(saved);
 expect((await save(f,review(f.c,"F19",1))).result).toMatchObject({qualifyingPrincipal:{pence:0},reason:note});
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
 await rolledBack(admin,async db=>{await db.query("SET LOCAL session_replication_role=replica");await db.query("UPDATE app.recovery_case_terms_approval SET approved_at=approved_at+interval '1 microsecond'");expect((await proofDifferences(db,proof)).rows.length).toBeGreaterThan(0);});
 await rolledBack(admin,async db=>{await db.query("ALTER TABLE app.recovery_claim_line ALTER COLUMN net_pence TYPE numeric(20,0)");expect((await proofDifferences(db,proof)).types.length).toBeGreaterThan(0);});
 await rolledBack(admin,async db=>{await db.query("ALTER TABLE app.recovery_claim_line ADD COLUMN dw3_control text");expect(await proofDifferences(db,proof)).toEqual({rows:[],types:[]});});
 await rolledBack(admin,async db=>{await db.query("SET LOCAL session_replication_role=replica");await db.query("DELETE FROM app.recovery_claim_line WHERE tenant_id=$1 AND review_id=$2",[T,saved.id]);expect((await proofDifferences(db,proof)).rows.some(r=>r.endsWith(": missing"))).toBe(true);});
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
});
