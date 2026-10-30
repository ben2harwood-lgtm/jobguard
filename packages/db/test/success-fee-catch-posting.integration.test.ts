// CI ONLY: actual PostgreSQL and v1 producer; no seeded qualifying fee facts.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {RecoveryAttributionRepository} from "../src/recovery-attribution-repository.js";
import {rolledBack} from "./upgrade-proof-utils.js";
import {SuccessFeeRepository} from "../src/success-fee-repository.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import {catchFeeFixture} from "./success-fee-catch-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
const approve=(review:Awaited<ReturnType<Awaited<ReturnType<typeof catchFeeFixture>>["execute"]>>)=>({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:review.postingRevision,reviewId:review.reviewId,statementHash:review.statementHash});
async function counts(x:{context:{tenantId:string};jobId:string}){
 const result:Record<string,number>={};
 for(const n of ["command","review","derivation","source","journal","journal_line"])
  result[n]=(await f.admin.query(`SELECT count(*)::int n FROM app.success_fee_${n} WHERE tenant_id=$1 AND job_id=$2`,[x.context.tenantId,x.jobId])).rows[0].n;
 return result;
}
it("F13: approved SV-6 + settled v1 allocation -> GBP80, replay/concurrent requests post once, new approval is zero",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),p=approve(review);
 expect(await counts(x)).toMatchObject({review:1,derivation:0,journal:0});
 expect(review.statement).toMatchObject({qualifyingPrincipal:{numerator:"80000",denominator:"1"},feePence:8000,deltaPence:8000});
 const [first,second]=await Promise.all([x.execute(p),new SuccessFeeRepository(f.runtime).command(x.context,x.jobId,x.auth.digest,p)]);
 expect({...second,replayed:false}).toEqual({...first,replayed:false});
 expect([first.replayed,second.replayed].sort()).toEqual([false,true]);
 expect(await counts(x)).toEqual({command:2,review:1,derivation:1,source:1,journal:1,journal_line:2});
 const zero=await x.execute({...x.command,commandId:randomUUID(),expectedPostingRevision:1});
 const saved=await x.execute(approve(zero));expect(saved).toMatchObject({journalId:null,postingRevision:2,statement:{deltaPence:0}});
 expect(await counts(x)).toMatchObject({derivation:2,journal:1});
 await expect(x.execute({...p,statementHash:"0".repeat(64)})).rejects.toThrow("SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
});
it("two distinct approvals of the same source at the same revision cannot both post",async()=>{
 const x=await catchFeeFixture(f),a=await x.execute(),b=await x.execute({...x.command,commandId:randomUUID()});
 const outcomes=await Promise.allSettled([x.execute(approve(a)),x.execute(approve(b))]);
 expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect((outcomes.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.message).toBe("SUCCESS_FEE_STALE");
 expect(await counts(x)).toMatchObject({derivation:1,journal:1});
});
it("no SV-6 approval and no settled case allocation acquire any posting identity",async()=>{
 const x=await catchFeeFixture(f,false);await expect(x.execute()).rejects.toThrow("SUCCESS_FEE_REVIEW_REQUIRED");
 expect(await counts(x)).toMatchObject({command:0,journal:0});
 const y=await realReceiptFixture(f,"F7","receipt-line-allocation-command.v1");
 await expect(new SuccessFeeRepository(f.runtime).command(y.context,y.jobId,y.auth.digest,x.command)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
 expect(await counts(y)).toMatchObject({command:0,journal:0});
});
it.each(["refund","credit","evidence"] as const)("a stored %s after statement review refuses approval without an effect",async kind=>{
 const x=await catchFeeFixture(f),review=await x.execute(),before=await counts(x);
 if(kind==="refund")await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 else if(kind==="credit"){
  const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:40000,reason:"Fictional credit"});
  await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:40000,reason:"Fictional credit",previewHash:preview.previewHash});
 }else await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
 await expect(x.execute(approve(review))).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");expect(await counts(x)).toEqual(before);
});
it("source fence observes an invalidation committed while a fee approval waits",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),db=await f.admin.connect();
 try{
  await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
  await db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]);
  const outcome=x.execute(approve(review)).then(()=>({ok:true,error:""}),error=>({ok:false,error:error.message as string}));
  let waiting=false;
  for(let attempt=0;attempt<1000&&!waiting;attempt++){
   waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='app.evidence_invalidation'::regclass AND mode='ShareLock' AND NOT granted) waiting")).rows[0].waiting as boolean;
   if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
  }
  expect(waiting).toBe(true);
  await db.query("COMMIT");expect(await outcome).toEqual({ok:false,error:"SUCCESS_FEE_SOURCE_CHANGED"});
 }finally{await db.query("ROLLBACK");db.release();}
 expect(await counts(x)).toMatchObject({journal:0,derivation:0});
});
it("foreign tenants/sessions and altered statement hashes cannot approve or replay",async()=>{
 const x=await catchFeeFixture(f),y=await realReceiptFixture(f),review=await x.execute(),p=approve(review);
 await expect(x.execute({...p,statementHash:"0".repeat(64)})).rejects.toThrow("SUCCESS_FEE_STALE");
 await x.execute(p);
 await expect(x.repo.command(testTenantContext(randomUUID()),x.jobId,x.auth.digest,p)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(x.repo.command(x.context,x.jobId,y.auth.digest,p)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 expect(await counts(x)).toMatchObject({journal:1,derivation:1});
});
it("audit failure rolls back all fee effects; retry keeps one effect",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),p=approve(review),before=await counts(x);
 const decision=(await f.admin.query("SELECT decision_id FROM app.success_fee_review WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,review.reviewId])).rows[0].decision_id as string;
 await f.admin.query(`CREATE FUNCTION app.sf_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='success_fee.approve' THEN RAISE EXCEPTION 'SF_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sf_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sf_test_audit_failure()`);
 try{
  await expect(x.execute(p)).rejects.toThrow("SF_TEST_AUDIT_FAILURE");expect(await counts(x)).toEqual(before);
  for(const table of ["decision_resolution","action_authorization"])
   expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND decision_id=$2`,[x.context.tenantId,decision])).rows).toEqual([{n:0}]);
 }
 finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER sf_test_audit_failure");}
 await x.execute(p);expect(await counts(x)).toMatchObject({journal:1,derivation:1});
});
it("Q2 and Q3 stay closed, and journal history cannot be edited or truncated",async()=>{
 const noncatch=await realReceiptFixture(f,"F5","receipt-line-allocation-command.v1"),repo=new SuccessFeeRepository(f.runtime);
 await expect(repo.command(noncatch.context,noncatch.jobId,noncatch.auth.digest,{version:"success-fee-command.v1",action:"review",commandId:randomUUID(),expectedPostingRevision:0})).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
 const x=await catchFeeFixture(f),review=await x.execute();await x.execute(approve(review));
 await expect(x.execute({...x.command,action:"reverse",commandId:randomUUID()})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 for(const sql of ["UPDATE app.success_fee_journal SET amount_pence=1 WHERE tenant_id=$1 AND job_id=$2","DELETE FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2"])
  await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query(sql,[x.context.tenantId,x.jobId]))).rejects.toThrow();
 for(const name of ["command","review","derivation","source","journal","journal_line"]){
  await expect(f.runtime.query(`SELECT * FROM app.success_fee_${name}`)).rejects.toMatchObject({code:"42501"});
  await expect(f.runtime.query(`INSERT INTO app.success_fee_${name} DEFAULT VALUES`)).rejects.toMatchObject({code:"42501"});
  await expect(f.runtime.query(`TRUNCATE app.success_fee_${name}`)).rejects.toMatchObject({code:"42501"});
 }
});
it.each(["movement_hash","allocation_limit","locked_bill"] as const)("writer independently refuses %s source corruption",async attack=>{
 const x=await catchFeeFixture(f),review=await x.execute(),p=approve(review),before=await counts(x);
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  if(attack==="movement_hash"){
   await db.query("ALTER TABLE app.practice_feed_event DISABLE TRIGGER USER");
   await db.query("UPDATE app.practice_feed_event SET source_hash=CASE WHEN source_hash=repeat('0',64) THEN repeat('1',64) ELSE repeat('0',64) END WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[x.context.tenantId,x.jobId,x.fact.movementId]);
   await db.query("ALTER TABLE app.practice_feed_event ENABLE TRIGGER USER");
  }else if(attack==="allocation_limit"){
   await db.query("ALTER TABLE app.stored_receipt_case_allocation DISABLE TRIGGER USER");
   await db.query("UPDATE app.stored_receipt_case_allocation SET net_numerator='80001' WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   await db.query("ALTER TABLE app.stored_receipt_case_allocation ENABLE TRIGGER USER");
  }else{
   await db.query("ALTER TABLE app.final_account_line DISABLE TRIGGER USER");
   await db.query("UPDATE app.final_account_line SET final_account_revision_id=$1 WHERE tenant_id=$2 AND job_id=$3 AND id=$4",[x.lock.finalAccountRevisionId,x.context.tenantId,x.jobId,x.line]);
   await db.query("ALTER TABLE app.final_account_line ENABLE TRIGGER USER");
  }
  await db.query("SET LOCAL ROLE jobguard_runtime");await db.query("SELECT app.write_success_fee_v3($1,$2,$3::jsonb,NULL)",[x.jobId,x.auth.digest,p]);
 })).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 expect(await counts(x)).toEqual(before);
});
it("a zero derivation cannot acquire an unbalanced or spurious journal even through owner SQL",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),first=await x.execute(approve(review));
 const zero=await x.execute({...x.command,commandId:randomUUID(),expectedPostingRevision:1}),saved=await x.execute(approve(zero));
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  await db.query("INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency) VALUES($1,$2,$3,$4,1,'GBP')",[x.context.tenantId,x.jobId,randomUUID(),saved.derivationId]);
  await db.query("SET CONSTRAINTS ALL IMMEDIATE");
 })).rejects.toThrow("SUCCESS_FEE_JOURNAL_INVALID");
 expect((await f.admin.query("SELECT derivation_id,amount_pence FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{derivation_id:first.derivationId,amount_pence:"8000"}]);
});

it("revoked attribution approval cannot authorize a new fee statement or posting",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),before=await counts(x);
 await f.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,review.statement.sources[0]!.reviewAuthorizationId]);
 await expect(x.execute(approve(review))).rejects.toThrow("SUCCESS_FEE_REVIEW_REQUIRED");
 expect(await counts(x)).toEqual(before);
});

// R1: count every fee effect, including authority/audit rows outside the six private tables.
async function feeEffects(x:Awaited<ReturnType<typeof catchFeeFixture>>){
 return {
  ...await counts(x),
  decisions:(await f.admin.query("SELECT count(*)::int n FROM app.decision WHERE tenant_id=$1 AND subject_type='success_fee'",[x.context.tenantId])).rows[0].n,
  resolutions:(await f.admin.query("SELECT count(*)::int n FROM app.decision_resolution r JOIN app.decision d ON(d.tenant_id,d.id)=(r.tenant_id,r.decision_id) WHERE d.tenant_id=$1 AND d.subject_type='success_fee'",[x.context.tenantId])).rows[0].n,
  authorizations:(await f.admin.query("SELECT count(*)::int n FROM app.action_authorization WHERE tenant_id=$1 AND action_type='success_fee.post'",[x.context.tenantId])).rows[0].n,
  audit:(await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type LIKE 'success_fee.%'",[x.context.tenantId,x.jobId])).rows[0].n,
 };
}
it.each(["approve_review","recovery.attribution_review"])("a directly inserted %s authorization without an SV-6 command cannot review or post",async action=>{
 const x=await catchFeeFixture(f,false),decision=randomUUID(),resolution=randomUUID(),authorization=randomUUID();
 expect(x.assessment.assessmentOutcome).toBe("eligible_for_review");
 const artifact=(await f.admin.query("SELECT app.final_lock_hash($1::jsonb) hash",[x.assessment])).rows[0].hash as string;
 const deadline=(await f.admin.query("SELECT expires_at FROM control_plane.practice_session WHERE token_digest=$1",[x.auth.digest])).rows[0].expires_at as Date;
 // Deliberately bypass SV-6's writer using the runtime's existing generic authority grants.
 // Both the literal command action and the canonical authorization action are covered.
 await finalCheckTenant(f.runtime,x.context.tenantId,async db=>{
  await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'recovery_attribution',$3,$4)",[decision,x.context.tenantId,x.assessment.assessmentId,action]);
  await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[resolution,x.context.tenantId,decision,x.actor.membershipId]);
  await db.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
   [authorization,x.context.tenantId,decision,resolution,x.actor.membershipId,action,x.assessment.assessmentId,artifact,x.assessment.revision,x.assessment.eligibilityPolicyVersion,deadline]);
 });
 expect((await f.admin.query("SELECT count(*)::int n FROM app.action_authorization WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,authorization])).rows).toEqual([{n:1}]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_attribution_command WHERE tenant_id=$1 AND assessment_id=$2 AND payload->>'action'='approve_review'",[x.context.tenantId,x.assessment.assessmentId])).rows).toEqual([{n:0}]);
 const before=await feeEffects(x);
 await expect(x.execute()).rejects.toThrow("SUCCESS_FEE_REVIEW_REQUIRED");
 await expect(x.execute({...x.command,action:"approve",commandId:randomUUID(),reviewId:randomUUID(),statementHash:artifact})).rejects.toThrow("SUCCESS_FEE_REVIEW_REQUIRED");
 expect(await feeEffects(x)).toEqual(before);
 expect(await counts(x)).toEqual({command:0,review:0,derivation:0,source:0,journal:0,journal_line:0});
});
it("a newer unapproved assessment supersedes the assessment in an already saved fee review",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute();
 expect(review.statement.sources[0]!.assessmentId).toBe(x.assessment.assessmentId);
 const successor=await new RecoveryAttributionRepository(f.runtime).assess(x.context,x.jobId,x.auth.digest,{
  version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,
  lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:x.assessment.caseRevision,expectedAttributionRevision:x.assessment.revision,
 });
 expect(successor).toMatchObject({previousAssessmentId:x.assessment.assessmentId,revision:x.assessment.revision+1,sourceHash:x.assessment.sourceHash,assessmentOutcome:"eligible_for_review"});
 expect(successor.assessmentId).not.toBe(x.assessment.assessmentId);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_attribution_command WHERE tenant_id=$1 AND assessment_id=$2 AND payload->>'action'='approve_review'",[x.context.tenantId,successor.assessmentId])).rows).toEqual([{n:0}]);
 const before=await feeEffects(x);
 await expect(x.execute(approve(review))).rejects.toThrow("SUCCESS_FEE_REVIEW_REQUIRED");
 await expect(x.execute({...x.command,commandId:randomUUID()})).rejects.toThrow("SUCCESS_FEE_REVIEW_REQUIRED");
 expect(await feeEffects(x)).toEqual(before);
 expect(await counts(x)).toEqual({command:1,review:1,derivation:0,source:0,journal:0,journal_line:0});
});
it("no case allocations fails in SQL before saving a review with null allocationIds",async()=>{
 const x=await catchFeeFixture(f),before=await feeEffects(x);
 // Rollback-only corruption attack: retain the genuine approved assessment/binding,
 // remove its case allocations temporarily, and call SQL directly (no Zod rollback).
 await expect(rolledBack(f.admin,async db=>{
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
  await db.query("ALTER TABLE app.stored_receipt_case_allocation DISABLE TRIGGER USER");
  await db.query("DELETE FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
  await db.query("ALTER TABLE app.stored_receipt_case_allocation ENABLE TRIGGER USER");
  expect((await db.query("SELECT count(*)::int n,jsonb_agg(id) allocation_ids FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:0,allocation_ids:null}]);
  expect((await db.query("SELECT count(*)::int n FROM app.stored_receipt_case_binding WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:1}]);
  await db.query("SET LOCAL ROLE jobguard_runtime");
  return db.query("SELECT app.write_success_fee_v3($1,$2,$3::jsonb,NULL)",[x.jobId,x.auth.digest,x.command]);
 })).rejects.toMatchObject({code:"40001",message:"SUCCESS_FEE_SOURCE_CHANGED"});
 expect(await feeEffects(x)).toEqual(before);
 expect(await counts(x)).toEqual({command:0,review:0,derivation:0,source:0,journal:0,journal_line:0});
 // The attack transaction restores the immutable source; the ordinary positive path remains valid.
 const review=await x.execute();expect(review.statement.sources[0]!.allocationIds).toEqual([expect.any(String)]);
});
