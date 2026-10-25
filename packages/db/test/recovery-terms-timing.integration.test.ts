// PostgreSQL suites are NOT RUN locally by dispatcher instruction. No mocked database proof.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolConfig } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { recoveryCaseTermsHash, evaluateRecoveryEligibilityV3 } from "@jobguard/core";
import { migrate, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryCaseTermsRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, withTenant, appendAuditBatch } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
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
beforeAll(async()=>{await start();await migrate(admin);await identity();});
async function fixture(type="withheld_customer_payment",before=false){
 const sessionId=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,sessionId),jobId=randomUUID();
 await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)VALUES($1,$2,'Explicit new v3 DW3 fixture',$3,'capture','imported',100000,'reference_fee_policy_v3',1500)",[jobId,T,auth.digest]);
 const cases=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest)),feed=new PracticeFeedRepository(runtime,"synthetic_demo");
 // Facts commands (including interest) share this feed's revision sequence.
 const advance=async(movement:string,step="settled")=>{const {revision}=await feed.view(ctx,actor,auth.digest,jobId);await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:revision,action:revision===0?"connect":"advance",...(revision===0?{}:{movement,step})});};
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
async function interest(f:Fixture,step="settled"){
 const feed=new PracticeFeedRepository(runtime,"synthetic_demo"),view=await feed.factsView(ctx,actor,f.auth.digest,f.jobId);
 await feed.factsCommand(ctx,actor,f.auth.digest,f.jobId,{version:"practice-facts-command.v1",commandId:randomUUID(),expectedRevision:view.revision,action:"advance",movement:"receipt-interest-120",step});
}
async function counts(f:Fixture){
 const result:Record<string,number>={};
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line","audit_event","recovery_fee_journal","action_outbox"])
  result[table]=Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`,[T])).rows[0].n);
 return result;
}
async function source(f:Fixture){return (await admin.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key='receipt-3000' AND event_kind='settled' AND identity='identified' ORDER BY created_at,id LIMIT 1",[T,f.jobId])).rows[0].id as string;}
async function raw(f:Fixture,result:ReturnType<typeof evaluateRecoveryEligibilityV3>,approvalId:string){
 const sourceEventId=await source(f),id=randomUUID(),commandId=randomUUID(),payloadHash=createHash("sha256").update(commandId).digest("hex");
 return withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const inserted=await db.$client.query<{h:string}>("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,'F18',$6,$7,$8,$9,$10) RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') h",[id,T,f.jobId,f.c.id,f.c.revision,sourceEventId,M,commandId,payloadHash,JSON.stringify(result)]);
  for(const l of result.lines)await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),T,f.jobId,f.c.id,id,l.kind,l.debtorType,l.netPence]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{jobId:f.jobId,reviewId:id,commandId,sourceEventId,termsApprovalId:approvalId},hashes:{command:payloadHash,result:inserted.rows[0]!.h},classifications:{recovery:"financial"}}}]);
 });
}
const candidate=(f:Fixture,timing="after_settlement")=>evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:T,jobId:f.jobId,caseId:f.c.id,fixture:"F18",payer:"not_insurer",settlement:"settled",paymentTiming:"after_opening",sourceRef:f.c.id,termsTiming:timing});

it("ReceiptBeforeTermsNeverRescued",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const a=await approve(f);
 // Superuser test-only timestamp control, after real authorized approval. Preserve six digits.
 const client=await admin.connect();try{
  await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");
  await client.query("UPDATE app.recovery_case SET created_at='2026-10-01T12:00:00.000100Z' WHERE tenant_id=$1 AND id=$2",[T,f.c.id]);
  await client.query("UPDATE app.practice_feed_event SET created_at='2026-10-01T12:00:00.000200Z' WHERE tenant_id=$1 AND id=$2",[T,await source(f)]);
  await client.query("UPDATE app.recovery_case_terms_approval SET approved_at='2026-10-01T12:00:00.000900Z' WHERE tenant_id=$1 AND id=$2",[T,a.id]);await client.query("COMMIT");
 }finally{client.release();}
 const command=review(f.c,"F18"),saved=await save(f,command);
 expect(saved.result).toMatchObject({qualifyingPrincipal:{pence:0},reason:note,reasonHeld:false});
 await f.advance("receipt-3000","alternate_representation");
 expect((await save(f,review(f.c,"F18",1))).result).toEqual(saved.result);
 expect(await save(f,command)).toEqual(saved);
 const audit=(await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'reviewId'=$2",[T,saved.id])).rows[0];
 expect(audit.payload.references.termsApprovalId).toBe(a.id);
});
it("Decision 123 (ruling 131): money settled first, fee terms approved strictly later => excluded and not counted, never a throw or the qualifying value",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const a=await approve(f);
 // Superuser test-only timestamp control, after the real authorized approval: pin approved_at exactly one microsecond after the settled receipt (full precision, clock-independent).
 const client=await admin.connect();try{
  await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");
  await client.query("UPDATE app.recovery_case_terms_approval a SET approved_at=e.created_at+interval '1 microsecond' FROM app.practice_feed_event e WHERE a.tenant_id=$1 AND a.id=$2 AND e.tenant_id=a.tenant_id AND e.id=$3",[T,a.id,await source(f)]);
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 expect((await admin.query("SELECT a.approved_at>e.created_at later FROM app.recovery_case_terms_approval a JOIN app.practice_feed_event e ON e.tenant_id=a.tenant_id AND e.id=$3 WHERE a.tenant_id=$1 AND a.id=$2",[T,a.id,await source(f)])).rows[0].later).toBe(true);
 const saved=await save(f);
 expect(saved.result).toMatchObject({outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:note,reasonHeld:false});
 expect(saved.result.lines.every(l=>l.qualifyingPrincipal.pence===0)).toBe(true);
 expect(saved.result.lines[0]).toMatchObject({kind:"principal",qualifyingPrincipal:{pence:0},reason:note});
 const audit=(await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'reviewId'=$2",[T,saved.id])).rows[0];
 expect(audit.payload.references.termsApprovalId).toBe(a.id);
});
it("SeparateInterestUsesOwnSettlementTime",async()=>{
 const f=await fixture();await interest(f);await approve(f);await f.advance("receipt-3000");
 const r=await save(f);expect(r.result.qualifyingPrincipal.pence).toBe(250000);
 expect(r.result.lines[1]).toMatchObject({qualifyingPrincipal:{pence:0},reason:note});
 const g=await fixture();await approve(g);await g.advance("receipt-3000");
 expect((await save(g)).result.qualifyingPrincipal.pence).toBe(250000);
 await interest(g);expect((await save(g,review(g.c,"F18",1))).result.qualifyingPrincipal.pence).toBe(262000);
});
it.each(["positive header","positive line","foreign approval","forged flag","forged timestamp"])("ForgedTermsTimingRefused: %s",async mode=>{
 const f=await fixture();await f.advance("receipt-3000");const a=await approve(f),other=await fixture(),foreign=await approve(other);
 const r=candidate(f);if(mode==="positive header")r.qualifyingPrincipal.pence=262000;
 if(mode==="positive line")r.lines[0]!.qualifyingPrincipal.pence=250000;
 if(mode==="forged flag")Object.assign(r,{feeTermsApprovedBeforePursuit:true});
 if(mode==="forged timestamp")Object.assign(r,{approvedAt:"2000-01-01T00:00:00.000001Z"});
 const before=await counts(f);await expect(raw(f,r,mode==="foreign approval"?foreign.id:a.id)).rejects.toMatchObject({code:"23514"});expect(await counts(f)).toEqual(before);
});
it("ruling 130 option B: a review with no fee-terms approval never throws; it evaluates as before DW3 and cites no approval",async()=>{
 const f=await fixture();await f.advance("receipt-3000");
 const b0=await counts(f),saved=await save(f),b1=await counts(f);
 expect(saved.result).toMatchObject({outcome:"eligible_for_review",qualifyingPrincipal:{pence:250000,currency:"GBP"},reason:"Pending money cannot qualify",reasonHeld:false});
 expect(b1.recovery_eligibility_v3_review!-b0.recovery_eligibility_v3_review!).toBe(1);expect(b1.recovery_claim_line!-b0.recovery_claim_line!).toBe(3);
 expect(b1.recovery_fee_journal).toBe(b0.recovery_fee_journal);expect(b1.action_outbox).toBe(b0.action_outbox);
 await interest(f);
 const second=await save(f,review(f.c,"F18",1));
 expect(second.result).toMatchObject({outcome:"eligible_for_review",qualifyingPrincipal:{pence:262000,currency:"GBP"},reason:"Fixed statutory compensation is not part of the fee base"});
 for(const r of [saved,second])expect((await admin.query("SELECT payload->'references' ? 'termsApprovalId' cited FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'reviewId'=$2",[T,r.id])).rows[0].cited).toBe(false);
});
it("TermsReviewConcurrency: shared case lock blocks review until rollback",async()=>{
 const f=await fixture();await f.advance("receipt-3000");await approve(f);
 const held=await runtime.connect();let reviewing:Promise<unknown>|undefined;
 try{
  await held.query("BEGIN");await held.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[T,f.c.id]);
  reviewing=save(f);let waiting=false;
  for(let i=0;i<100&&!waiting;i++)waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND usename='dw3_login') waiting")).rows[0].waiting;
  expect(waiting).toBe(true);await held.query("ROLLBACK");
  expect(await reviewing).toMatchObject({result:{qualifyingPrincipal:{pence:0},reason:note}});
 }finally{await held.query("ROLLBACK");held.release();await reviewing;}
});
it.todo("LaterApprovalPreservesEarlierReview: historical replay covered by the upgrade suite (the missing-approval case is no longer a STOP: ruling 130 option B)");
it.todo("TermsReviewConcurrency: reversed transaction-start/commit order remains undecided; approval/settlement equality is not excluded under ruling 130's strictly-after rule (no natural equality to construct)");
it.each(["commit","rollback"] as const)("TermsReviewConcurrency: authorized approval %s serializes with review",async outcome=>{
 const f=await fixture();await f.advance("receipt-3000");
 let ready!:()=>void,rollback!:()=>void;
 const atCommit=new Promise<void>(resolve=>{ready=resolve;}),releaseCommit=new Promise<void>(resolve=>{rollback=resolve;});
 const intercepted=Object.create(runtime) as Pool;
 intercepted.connect=(async()=>{
  const client=await runtime.connect();
  return new Proxy(client,{get(target,key){
   if(key==="query")return async(...args:unknown[])=>{
    if(args[0]==="COMMIT"){ready();await releaseCommit;if(outcome==="rollback"){await target.query("ROLLBACK");throw new Error("DW3 injected rollback");}}
    return Reflect.apply(target.query,target,args);
   };
   const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }});
 }) as Pool["connect"];
 const approval=new RecoveryCaseTermsRepository(practiceMaterialPool(intercepted,f.auth.digest)).approve(ctx,f.jobId,termsCommand(f.c.id),actor).then(()=>"committed",error=>(error as Error).message);
 await Promise.race([atCommit,approval.then(result=>{throw new Error(`Approval completed before barrier: ${result}`);})]);
 const reviewing=save(f).then(value=>value.result.qualifyingPrincipal.pence,error=>(error as Error).message);
 try{
  let waiting=false;for(let i=0;i<100&&!waiting;i++)waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND usename='dw3_login') waiting")).rows[0].waiting;
  expect(waiting).toBe(true);
 }finally{rollback();}
 expect(await approval).toBe(outcome==="rollback"?"DW3 injected rollback":"committed");expect(await reviewing).toBe(outcome==="rollback"?250000:0);
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(outcome==="rollback"?0:1);
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type IN('recovery.terms.approved','recovery.eligibility.v3_reviewed')",[T,f.c.id])).rows[0].n).toBe(outcome==="rollback"?1:2);
});
it("DW3 preserves replay conflicts, stale revisions and same-tenant session ownership",async()=>{
 const f=await fixture();await f.advance("receipt-3000");await approve(f);
 const g=await fixture(),command=review(f.c,"F18"),saved=await save(f,command);
 await expect(save(f,{...command,fixture:"F19"})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
 await expect(save(f,review(f.c,"F18"))).rejects.toThrow("ELIGIBILITY_STALE_REVISION");
 await expect(new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime,g.auth.digest),"synthetic_demo").review(ctx,f.jobId,command,actor,g.auth.digest)).rejects.toThrow("RECOVERY_JOB_NOT_FOUND");
 expect(await save(f,command)).toEqual(saved);
});
it.each(["revoked","expired","non-owner"])("DW3 %s cannot review with zero effects",async state=>{
 const f=await fixture();await f.advance("receipt-3000");await approve(f);
 const was=(await admin.query("SELECT role,revoked_at,expires_at FROM app.membership WHERE tenant_id=$1 AND id=$2",[T,M])).rows[0];
 try{
  await admin.query("UPDATE app.membership SET role=CASE WHEN $3='non-owner' THEN 'member' ELSE role END,revoked_at=CASE WHEN $3='revoked' THEN clock_timestamp() ELSE revoked_at END,expires_at=CASE WHEN $3='expired' THEN clock_timestamp()-interval '1 minute' ELSE expires_at END WHERE tenant_id=$1 AND id=$2",[T,M,state]);
  const before=await counts(f);await expect(save(f)).rejects.toThrow();expect(await counts(f)).toEqual(before);
 }finally{await admin.query("UPDATE app.membership SET role=$3,revoked_at=$4,expires_at=$5 WHERE tenant_id=$1 AND id=$2",[T,M,was.role,was.revoked_at,was.expires_at]);}
});
it("DW3 pending and duplicate-held sources remain zero; review creates no fee, allocation or send",async()=>{
 const f=await fixture();await approve(f);await f.advance("receipt-3000","pending");
 expect((await save(f)).result).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Pending money cannot qualify"});
 await f.advance("receipt-3000");await f.advance("receipt-3000","unknown_duplicate");
 const tables=(await admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('app','infrastructure') ORDER BY schemaname,tablename")).rows;
 const snapshot=async()=>{
  const rows:Record<string,number>={};for(const table of tables)rows[`${table.schemaname}.${table.tablename}`]=Number((await admin.query(`SELECT count(*) n FROM "${table.schemaname}"."${table.tablename}"`)).rows[0].n);return rows;
 };
 const before=await snapshot();expect((await save(f,review(f.c,"F18",1))).result).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Pending money cannot qualify"});
 const after=await snapshot();
 for(const table of Object.keys(before))expect(after[table]!-before[table]!,table).toBe(table==="app.recovery_eligibility_v3_review"||table==="app.audit_event"?1:table==="app.recovery_claim_line"?3:0);
});
it("ForgedTermsTimingRefused: real foreign-tenant approval cannot authorize this review",async()=>{
 const tenant=randomUUID(),account=randomUUID(),user=randomUUID(),member=randomUUID(),job=randomUUID(),caseId=randomUUID();
 const owner=await admin.connect();try{
  await owner.query("BEGIN");
  await owner.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[tenant]);
  await owner.query("INSERT INTO identity.identity_user(id)VALUES($1)",[user]);
  await owner.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'DW3 foreign fictional builder')",[account,tenant]);
  await owner.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[member,tenant,account,user]);
  // Source setup only. The approval itself must use the authorized command below.
  await owner.query("SET LOCAL session_replication_role=replica");
  await owner.query("INSERT INTO app.job(id,tenant_id,title,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)VALUES($1,$2,'Foreign v3 fixture','imported',100000,'reference_fee_policy_v3',1500)",[job,tenant]);
  await owner.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)VALUES($1,$2,$3,300000,'GBP','identified',0,true,'withheld_customer_payment','Fictional debtor','builder_customer','customer_invoice','[\"Generated customer invoice INV-18800\"]')",[caseId,tenant,job]);
  await owner.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)VALUES($1,$2,$3,$4,1,300000,'GBP','fixture-owner',$5)",[randomUUID(),tenant,job,caseId,"a".repeat(64)]);
  await owner.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash)VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)",[randomUUID(),tenant,job,caseId,randomUUID(),"a".repeat(64)]);
  await owner.query("COMMIT");
 }catch(error){await owner.query("ROLLBACK");throw error;}finally{owner.release();}
 const foreign=await new RecoveryCaseTermsRepository(runtime).approve(testTenantContext(tenant),job,termsCommand(caseId),{membershipId:member,identityUserId:user});
 const f=await fixture();await f.advance("receipt-3000");await approve(f);
 const before=await counts(f);await expect(raw(f,candidate(f),foreign.id)).rejects.toMatchObject({code:"23514",message:"ELIGIBILITY_AUDIT_REQUIRED"});expect(await counts(f)).toEqual(before);
});
