// CI only: real PostgreSQL, using the existing real-writer F7 catch chain.
import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import {StoredReceiptCaseAllocationRepository} from "../src/stored-receipt-case-allocation-repository.js";
import {RecoveryAttributionRepository} from "../src/recovery-attribution-repository.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
import {rolledBack} from "./upgrade-proof-utils.js";
import {attributionValueReceipt} from "../../../apps/api/src/recovery-attribution-value.js";
let f:FinalCheckFixture;const environment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
type Fixture=Awaited<ReturnType<typeof realReceiptFixture>>;
async function allocate(x:Fixture,factLineId=x.fact.lineAllocationId){
 const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.caseId])).rows[0].revision as number;
 const p={version:"stored-receipt-case-command.v1",commandId:randomUUID(),action:"review",factLineId,caseId:x.caseId,workId:x.workId,expectedCaseRevision:revision};
 const repo=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo"),review=await repo.command(x.context,x.jobId,x.auth.digest,p);
 return repo.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
}
async function command(x:Fixture,expectedAttributionRevision=0){
 return {version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,lockId:x.fact.invoiceBinding.lockId,
  expectedCaseRevision:(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.caseId])).rows[0].revision as number,expectedAttributionRevision};
}
const assess=(x:Fixture,p:unknown)=>new RecoveryAttributionRepository(f.runtime).assess(x.context,x.jobId,x.auth.digest,p);
it("persists the real catch → approved supplementary invoice → settled receipt → allocation → £800/£80/£720 chain",async()=>{
 const x=await realReceiptFixture(f);const saved=await allocate(x),p=await command(x),result=await assess(x,p);
 expect(result.assessmentOutcome).toBe("eligible_for_review");expect(Object.values(result.facts.facts).every(fact=>fact.holds)).toBe(true);
 expect(result.sourceManifest).toContainEqual(expect.objectContaining({kind:"line_allocation",sourceId:saved.allocationId}));
 expect(result.completeManifests.find(m=>m.kind==="locked_bill_manifest")!.itemIds).not.toContain(x.line);
 expect(result.remainingPrincipal).toEqual({numerator:"80000",denominator:"1"});
 const value=attributionValueReceipt(result);
 expect(value.display).toEqual({recovered:"£800.00",fee:"£80.00",yoursBeforeVatAndTax:"£720.00"});
 expect(value).toMatchObject({recovered:{numerator:"80000",denominator:"1"},fee:{pence:8000,currency:"GBP"},yoursBeforeVatAndTax:{numerator:"72000",denominator:"1"},qualification:"unreviewed",productionEnabled:false,realExternalActions:0});
 expect(await assess(x,p)).toEqual(result);
 const history=await new RecoveryAttributionRepository(f.runtime).history(x.context,x.jobId,x.auth.digest);expect(history).toEqual([result]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.attribution_assessed'",[x.context.tenantId,x.jobId])).rows).toEqual([{n:1}]);
 await expect(assess(x,{...p,workId:randomUUID()})).rejects.toThrow("RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT");
 await expect(assess(x,{...p,commandId:randomUUID()})).rejects.toThrow("RECOVERY_ATTRIBUTION_STALE");
});
it("#368 rejects a different lock, an original locked bill line, and a same-job line in another revision",async()=>{
 const x=await realReceiptFixture(f);await allocate(x);const p=await command(x);
 const original=(await f.admin.query("SELECT id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 LIMIT 1",[x.context.tenantId,x.jobId,x.lock.finalAccountRevisionId])).rows[0].id;
 const other=(await f.admin.query("SELECT id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline' LIMIT 1",[x.context.tenantId,x.jobId,x.fact.invoiceBinding.revisionId])).rows[0].id;
 for(const patch of [{lockId:randomUUID()},{lineId:original},{lineId:other}])await expect(assess(x,{...p,...patch})).rejects.toThrow("RECOVERY_ATTRIBUTION_SOURCE_REQUIRED");
});
it("#356 requires the signal's one coalesced work, and never reallocates an already consumed line",async()=>{
 const x=await realReceiptFixture(f);await allocate(x);const p=await command(x);
 await expect(assess(x,{...p,workId:randomUUID()})).rejects.toThrow("RECOVERY_ATTRIBUTION_SOURCE_REQUIRED");
 await expect(allocate(x)).rejects.toThrow("RECEIPT_LINE_CAPACITY_EXCEEDED");
 expect((await assess(x,p)).remainingPrincipal).toEqual({numerator:"80000",denominator:"1"});
});
it("#346 refuses another job/session/tenant, even when IDs and saved facts are valid",async()=>{
 const x=await realReceiptFixture(f),other=await realReceiptFixture(f);await allocate(x);const p=await command(x),repo=new RecoveryAttributionRepository(f.runtime);
 await expect(repo.assess(x.context,other.jobId,other.auth.digest,p)).rejects.toThrow("RECOVERY_ATTRIBUTION_SOURCE_REQUIRED");
 await expect(repo.assess(x.context,x.jobId,other.auth.digest,p)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
 await expect(repo.assess(testTenantContext(randomUUID()),x.jobId,x.auth.digest,p)).rejects.toThrow();
 // A forged 0258 source FK can point at a same-tenant, other-job movement.
 // Deliberately corrupt only that immutable source inside a rolled-back admin
 // transaction: the producer approval/hash remains intact, so the writer itself
 // must check job binding independently of the composite FK backstop.
 await expect(rolledBack(f.admin,async db=>{
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DISABLE TRIGGER USER");
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DROP CONSTRAINT receipt_fact_source_job_movement_fk");
  const movement=(await db.query("SELECT movement_id,movement_hash FROM app.receipt_allocation_fact_source WHERE tenant_id=$1 AND job_id=$2 LIMIT 1",[x.context.tenantId,other.jobId])).rows[0];
  await db.query("UPDATE app.receipt_allocation_fact_source SET movement_id=$1,movement_hash=$2 WHERE tenant_id=$3 AND job_id=$4",[movement.movement_id,movement.movement_hash,x.context.tenantId,x.jobId]);
  await db.query("ALTER TABLE app.receipt_allocation_fact_source ENABLE TRIGGER USER");
  // Invoke the private resolver as its owning role, not as a fake authenticated runtime.
  await db.query("SELECT app.recovery_attribution_sources($1,$2,$3,$4)",[x.context.tenantId,x.jobId,p,x.actor.membershipId]);
 })).rejects.toThrow("RECOVERY_ATTRIBUTION_MOVEMENT_JOB_REQUIRED");
 expect((await f.admin.query("SELECT convalidated FROM pg_constraint WHERE conrelid='app.receipt_allocation_fact_source'::regclass AND conname='receipt_fact_source_job_movement_fk'")).rows).toEqual([{convalidated:true}]);
});
it.each(["refund","credit","evidence"] as const)("%s appends an excluded assessment and preserves the prior £800 assessment",async kind=>{
 const x=await realReceiptFixture(f);await allocate(x);const first=await assess(x,await command(x));
 if(kind==="refund")await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 else if(kind==="credit"){
  const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:80000,reason:"Fictional credit"});
  await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:80000,reason:"Fictional credit",previewHash:preview.previewHash});
 }else await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
 const next=await assess(x,await command(x,1));expect(next.previousAssessmentId).toBe(first.assessmentId);expect(next.sourceHash).not.toBe(first.sourceHash);expect(next.assessmentOutcome).toBe("excluded");
 expect(attributionValueReceipt(next).fee.pence).toBe(0);
 expect((await new RecoveryAttributionRepository(f.runtime).history(x.context,x.jobId,x.auth.digest))[0]).toEqual(first);
});
it("audit failure rolls back assessment and command atomically; retry creates one effect",async()=>{
 const x=await realReceiptFixture(f);await allocate(x);const p=await command(x);
 await f.admin.query(`CREATE FUNCTION app.sv6_hookup_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.attribution_assessed' THEN RAISE EXCEPTION 'SV6_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sv6_hookup_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sv6_hookup_audit_failure()`);
 try{await expect(assess(x,p)).rejects.toThrow("SV6_AUDIT_FAILURE");}
 finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER sv6_hookup_audit_failure");}
 expect(await new RecoveryAttributionRepository(f.runtime).history(x.context,x.jobId,x.auth.digest)).toEqual([]);
 await assess(x,p);
});
it("a saved partial credit reduces principal without editing the original assessment",async()=>{
 const x=await realReceiptFixture(f);await allocate(x);const first=await assess(x,await command(x));
 const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:40000,reason:"Fictional partial credit"});
 const credit=await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:40000,reason:"Fictional partial credit",previewHash:preview.previewHash});
 const pending=await assess(x,await command(x,1));expect(pending.assessmentOutcome).toBe("excluded");
 const snapshot=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 const review=await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"receipt-line-facts-command.v1",action:"review_reverse",commandId:randomUUID(),allocationRevisionId:x.produced.allocationRevisionId,reversalSource:{kind:"credit_note",sourceId:credit.creditNoteId},expectedSourceRevision:snapshot.revision});
 await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"receipt-line-facts-command.v1",action:"reverse",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash,expectedSourceRevision:review.sourceRevision});
 const after=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 await allocate(x,after.rows.find(r=>r.direction==="reversal"&&r.lineId===x.line)!.lineAllocationId);
 const partial=await assess(x,await command(x,2));expect(partial.assessmentOutcome).toBe("eligible_for_review");
 expect(attributionValueReceipt(partial)).toMatchObject({recovered:{numerator:"40000",denominator:"1"},fee:{pence:4000},yoursBeforeVatAndTax:{numerator:"36000",denominator:"1"}});
 expect((await new RecoveryAttributionRepository(f.runtime).history(x.context,x.jobId,x.auth.digest))[0]).toEqual(first);
});
it("#356 the assessment resolver independently caps corrupted saved net at the immutable line net",async()=>{
 const x=await realReceiptFixture(f);await allocate(x);const p=await command(x);
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  await db.query("ALTER TABLE app.stored_receipt_case_allocation DISABLE TRIGGER USER");
  await db.query("UPDATE app.stored_receipt_case_allocation SET net_numerator='80001' WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
  await db.query("ALTER TABLE app.stored_receipt_case_allocation ENABLE TRIGGER USER");
  await db.query("SELECT app.recovery_attribution_sources($1,$2,$3,$4)",[x.context.tenantId,x.jobId,p,x.actor.membershipId]);
 })).rejects.toThrow("RECEIPT_LINE_CAPACITY_EXCEEDED");
});
it("#368 same-job foreign keys cannot substitute a line from outside the bound bill revision",async()=>{
 const x=await realReceiptFixture(f);await allocate(x);const p=await command(x);
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  await db.query("ALTER TABLE app.final_account_line DISABLE TRIGGER USER");
  await db.query("UPDATE app.final_account_line SET final_account_revision_id=$1 WHERE tenant_id=$2 AND job_id=$3 AND id=$4",[x.lock.finalAccountRevisionId,x.context.tenantId,x.jobId,x.line]);
  await db.query("ALTER TABLE app.final_account_line ENABLE TRIGGER USER");
  await db.query("SELECT app.recovery_attribution_sources($1,$2,$3,$4)",[x.context.tenantId,x.jobId,p,x.actor.membershipId]);
 })).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
