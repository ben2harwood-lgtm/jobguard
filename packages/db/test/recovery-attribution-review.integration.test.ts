// CI only: actual PostgreSQL, real SV-5 invoice/receipt/allocator chain.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {attributionPredicates,attributionReviewResultV1,type RecoveryAttributionRevisionV1} from "@jobguard/core";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import {StoredReceiptCaseAllocationRepository} from "../src/stored-receipt-case-allocation-repository.js";
import {RecoveryAttributionRepository} from "../src/recovery-attribution-repository.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
async function prepared(){
 const x=await realReceiptFixture(f),repo=new RecoveryAttributionRepository(f.runtime);
 const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.caseId])).rows[0].revision as number;
 const p={version:"stored-receipt-case-command.v1",commandId:randomUUID(),action:"review",factLineId:x.fact.lineAllocationId,caseId:x.caseId,workId:x.workId,expectedCaseRevision:revision};
 const allocator=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo"),review=await allocator.command(x.context,x.jobId,x.auth.digest,p);
 await allocator.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 const assessment=await repo.assess(x.context,x.jobId,x.auth.digest,{version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:revision,expectedAttributionRevision:0});
 const hash=(await f.admin.query("SELECT app.final_lock_hash($1::jsonb) hash",[assessment])).rows[0].hash as string;
 const intent={version:"recovery-attribution-command.v1",action:"approve_review",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:revision,expectedAttributionRevision:assessment.revision,assessmentId:assessment.assessmentId,expectedSourceHash:assessment.sourceHash,reviewArtifactHash:hash};
 return {...x,repo,assessment,intent,approve:(p:unknown=intent)=>repo.approveReview(x.context,x.jobId,x.auth.digest,p)};
}
it("exact owner review is audited once; concurrent replay returns the same receipt and creates no assessment or money",async()=>{
 const x=await prepared();const moneyBefore=(await f.admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[x.context.tenantId])).rows;const [first,replay]=await Promise.all([x.approve(),x.approve()]);expect(replay).toEqual(first);
 expect(attributionReviewResultV1.parse(first)).toMatchObject({effect:"review_recorded",assessmentId:x.assessment.assessmentId,sourceHash:x.assessment.sourceHash,reviewArtifactHash:x.intent.reviewArtifactHash,productionEnabled:false,realExternalActions:0});
 const rows=await f.admin.query("SELECT a.*,r.resolution FROM app.action_authorization a JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id WHERE a.tenant_id=$1 AND a.id=$2",[x.context.tenantId,first.reviewAuthorizationId]);
 expect(rows.rows[0]).toMatchObject({action_type:"recovery.attribution_review",resolution:"approved",content_hash:x.intent.reviewArtifactHash,aggregate_revision:1,actor_membership_id:x.actor.membershipId,amount_pence:null});
 expect(await x.repo.history(x.context,x.jobId,x.auth.digest)).toEqual([x.assessment]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[x.context.tenantId])).rows).toEqual(moneyBefore);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.attribution_reviewed'",[x.context.tenantId,x.jobId])).rows).toEqual([{n:1}]);
 await expect(x.approve({...x.intent,commandId:randomUUID()})).rejects.toThrow("RECOVERY_ATTRIBUTION_REVIEW_ALREADY_RECORDED");
 await expect(x.approve({...x.intent,reviewArtifactHash:"0".repeat(64)})).rejects.toThrow("RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT");
});
it("stale revisions, assessment identity, source hash and review artifact are all refused",async()=>{
 const x=await prepared();
 for(const patch of [{expectedCaseRevision:x.intent.expectedCaseRevision+1},{expectedAttributionRevision:0},{assessmentId:randomUUID()},{expectedSourceHash:"0".repeat(64)},{lineId:randomUUID()},{lockId:randomUUID()},{workId:randomUUID()}])await expect(x.approve({...x.intent,...patch})).rejects.toThrow("RECOVERY_ATTRIBUTION_STALE");
 await expect(x.approve({...x.intent,reviewArtifactHash:"0".repeat(64)})).rejects.toThrow("RECOVERY_ATTRIBUTION_REVIEW_ARTIFACT_CHANGED");
});
it.each(["evidence","refund","credit"] as const)("changed %s refuses a fresh review; earlier replay remains historical",async kind=>{
 const x=await prepared();const first=await x.approve();
 if(kind==="evidence")await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
 else if(kind==="refund")await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 else {const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:40000,reason:"Fictional credit"});await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:40000,reason:"Fictional credit",previewHash:preview.previewHash});}
 await expect(x.approve({...x.intent,commandId:randomUUID()})).rejects.toThrow("RECOVERY_ATTRIBUTION_STALE");expect(await x.approve()).toEqual(first);
});
it("other company, job or session cannot review or replay an owner's result",async()=>{
 const x=await prepared(),other=await realReceiptFixture(f);await x.approve();
 await expect(x.repo.approveReview(testTenantContext("33333333-3333-4333-8333-333333333333"),x.jobId,x.auth.digest,x.intent)).rejects.toThrow();
 await expect(x.repo.approveReview(x.context,other.jobId,other.auth.digest,x.intent)).rejects.toThrow("RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT");
 await expect(x.repo.approveReview(x.context,x.jobId,other.auth.digest,x.intent)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
});
it.each(attributionPredicates)("failed stored conjunct %s cannot acquire review authority",async predicate=>{
 const x=await prepared();
 // Corruption attack, rolled back: even a forged eligible flag cannot hide a false conjunct.
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  const document=structuredClone(x.assessment) as unknown as RecoveryAttributionRevisionV1;
  const raw=JSON.parse(JSON.stringify(document));raw.facts.facts[predicate].holds=false;
  await db.query("ALTER TABLE app.recovery_attribution_revision DISABLE TRIGGER attribution_immutable");
  await db.query("UPDATE app.recovery_attribution_revision SET document=$1 WHERE tenant_id=$2 AND id=$3",[raw,x.context.tenantId,x.assessment.assessmentId]);
  await db.query("ALTER TABLE app.recovery_attribution_revision ENABLE TRIGGER attribution_immutable");
  await db.query("SET LOCAL ROLE jobguard_runtime");
  await db.query("SELECT app.assess_recovery_attribution($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,x.intent]);
 })).rejects.toThrow("RECOVERY_ATTRIBUTION_REVIEW_EXCLUDED");
 expect(await x.repo.history(x.context,x.jobId,x.auth.digest)).toEqual([x.assessment]);
});
it.each(["member","revoked","expired"])("%s owner membership cannot review or replay",async state=>{
 const x=await prepared();await x.approve();
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  if(state==="member")await db.query("UPDATE app.membership SET role='member' WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.actor.membershipId]);
  else await db.query(`UPDATE app.membership SET ${state==="revoked"?"revoked_at":"expires_at"}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`,[x.context.tenantId,x.actor.membershipId]);
  await db.query("SET LOCAL ROLE jobguard_runtime");await db.query("SELECT app.assess_recovery_attribution($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,x.intent]);
 })).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
});
it("audit failure rolls back Decision, authorization and receipt; the same command can retry",async()=>{
 const x=await prepared();
 await f.admin.query(`CREATE FUNCTION app.sv6_review_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.attribution_reviewed' THEN RAISE EXCEPTION 'SV6_REVIEW_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sv6_review_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sv6_review_audit_failure()`);
 try {await expect(x.approve()).rejects.toThrow("SV6_REVIEW_AUDIT_FAILURE");}
 finally {await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER sv6_review_audit_failure");}
 expect((await f.admin.query("SELECT count(*)::int n FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2 AND action_type='recovery.attribution_review'",[x.context.tenantId,x.assessment.assessmentId])).rows).toEqual([{n:0}]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_attribution_command WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,x.intent.commandId])).rows).toEqual([{n:0}]);
 await x.approve();
});
it("a successor assessment supersedes the exact earlier review target",async()=>{
 const x=await prepared();
 const {assessmentId:_a,expectedSourceHash:_s,reviewArtifactHash:_h,...selection}=x.intent;
 await x.repo.assess(x.context,x.jobId,x.auth.digest,{...selection,action:"assess",commandId:randomUUID()});
 await expect(x.approve()).rejects.toThrow("RECOVERY_ATTRIBUTION_STALE");
});
it.each(["cap","locked_bill"] as const)("review independently preserves the %s source guard",async attack=>{
 const x=await prepared();
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  if(attack==="cap"){
   await db.query("ALTER TABLE app.stored_receipt_case_allocation DISABLE TRIGGER USER");
   await db.query("UPDATE app.stored_receipt_case_allocation SET net_numerator='80001' WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   await db.query("ALTER TABLE app.stored_receipt_case_allocation ENABLE TRIGGER USER");
  }else{
   await db.query("ALTER TABLE app.final_account_line DISABLE TRIGGER USER");
   await db.query("UPDATE app.final_account_line SET final_account_revision_id=$1 WHERE tenant_id=$2 AND job_id=$3 AND id=$4",[x.lock.finalAccountRevisionId,x.context.tenantId,x.jobId,x.line]);
   await db.query("ALTER TABLE app.final_account_line ENABLE TRIGGER USER");
  }
  await db.query("SET LOCAL ROLE jobguard_runtime");
  await db.query("SELECT app.assess_recovery_attribution($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,x.intent]);
 })).rejects.toThrow(attack==="cap"?"RECEIPT_LINE_CAPACITY_EXCEEDED":"STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
