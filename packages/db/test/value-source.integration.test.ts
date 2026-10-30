// CI only: PostgreSQL and real synthetic writers; no providers or live money.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { ValueV3Reader } from "../src/value-v3-reader.js";
import { ValueBusinessReader } from "../src/value-business-reader.js";
import { preparedPeriod } from "./subscription-persistence-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let f:FinalCheckFixture;const environment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";f=await createFinalCheckFixture();},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
type Fixture=Awaited<ReturnType<typeof realReceiptFixture>>;
async function assess(x:Fixture,expectedAttributionRevision=0){
 const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.caseId])).rows[0].revision;
 return new RecoveryAttributionRepository(f.runtime).assess(x.context,x.jobId,x.auth.digest,{version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:revision,expectedAttributionRevision});
}
async function allocated(){
 const x=await realReceiptFixture(f),revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.caseId])).rows[0].revision;
 const repo=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo"),command={version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,factLineId:x.fact.lineAllocationId,expectedCaseRevision:revision};
 const review=await repo.command(x.context,x.jobId,x.auth.digest,command);
 await repo.command(x.context,x.jobId,x.auth.digest,{...command,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 await assess(x);return x;
}
it("reads the real £800/£80/£720 chain without allocating or appending on replay",async()=>{
 const x=await allocated();
 // The fixture returns auth digest; its original opaque cookie is not exposed.
 const read=()=>finalCheckTenant(f.runtime,x.context.tenantId,async db=>(await db.query("SELECT app.read_value_job($1,$2) result",[x.jobId,x.auth.digest])).rows[0].result);
 const before=(await f.admin.query("SELECT count(*)::int n FROM app.audit_event")).rows;
 const raw=await read();expect(await read()).toEqual(raw);
 const {mapValueReceipt}=await import("@jobguard/core");const receipt=mapValueReceipt(raw);
 expect(receipt.found).toMatchObject({recovered:{pence:80000},fee:{pence:8000},yoursBeforeVatAndTax:{pence:72000}});
 expect(receipt.sources.assessments[0]?.document.lineId).toBe(x.line);
 expect(receipt.sources.lockedRevisionId).toBe(x.lock.finalAccountRevisionId);
 expect(receipt.sources.tracked).toEqual([]);expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event")).rows).toEqual(before);
});
it("refund immediately refuses stale money, then exposes a linked negative movement after reassessment",async()=>{
 const x=await allocated(),read=()=>finalCheckTenant(f.runtime,x.context.tenantId,async db=>(await db.query("SELECT app.read_value_job($1,$2) result",[x.jobId,x.auth.digest])).rows[0].result);
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 const {mapValueReceipt}=await import("@jobguard/core");expect(mapValueReceipt(await read()).found.recovered).toBeNull();
 await assess(x,1);const receipt=mapValueReceipt(await read());expect(receipt.found.recovered?.pence).toBe(0);
 expect(receipt.found.movements[1]).toMatchObject({kind:"reversal",recovered:{pence:-80000},fee:{numerator:"-8000",denominator:"1"}});
});
it("only original locked bill builder captures are tracked and never fee-bearing",async()=>{
 const x=await realReceiptFixture(f,"F5"),raw=await finalCheckTenant(f.runtime,x.context.tenantId,async db=>(await db.query("SELECT app.read_value_job($1,$2) result",[x.jobId,x.auth.digest])).rows[0].result);
 const {mapValueReceipt}=await import("@jobguard/core");expect(mapValueReceipt(raw)).toMatchObject({tracked:{pence:80000},trackedFee:{pence:0}});
});
it("cross-session/job/tenant access fails before source disclosure",async()=>{
 const x=await allocated(),other=await realReceiptFixture(f);
 await expect(finalCheckTenant(f.runtime,x.context.tenantId,db=>db.query("SELECT app.read_value_job($1,$2)",[x.jobId,other.auth.digest]))).rejects.toThrow("VALUE_FORBIDDEN");
 await expect(finalCheckTenant(f.runtime,randomUUID(),db=>db.query("SELECT app.read_value_job($1,$2)",[x.jobId,x.auth.digest]))).rejects.toThrow();
 await expect(new ValueV3Reader(f.runtime,randomUUID()).readJob(x.jobId)).rejects.toHaveProperty("code");
});
it("subscription periods reproduce MON-1/MON-2A statements and are never apportioned to a job",async()=>{
 const {a,issued}=await preparedPeriod(f),reader=new ValueBusinessReader(f.runtime);
 const first=await reader.readBusiness(a.context,a.digest,issued.periodId);expect(await reader.readBusiness(a.context,a.digest,issued.periodId)).toEqual(first);
 expect(first.subscription).toHaveLength(1);expect(first.subscription[0]).toMatchObject({periodId:issued.periodId,statementId:issued.statementId,sourceId:issued.sourceId,amount:{pence:issued.amountPence,currency:"GBP"}});
 await expect(reader.readBusiness(testTenantContext(randomUUID()),a.digest)).rejects.toThrow();
 await expect(reader.readBusiness(a.context,a.digest,randomUUID())).rejects.toThrow("VALUE_PERIOD_UNAVAILABLE");
 await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
 await expect(reader.readBusiness(a.context,a.digest)).rejects.toThrow();
});
it("grants only controlled runtime reads; private resolver and business tables remain inaccessible",async()=>{
 const rows=(await f.admin.query("SELECT p.proname,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') shadow FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN('read_value_job','read_value_business','recovery_attribution_sources') ORDER BY p.proname")).rows;
 expect(rows).toEqual([{proname:"read_value_business",runtime:true,shadow:false},{proname:"read_value_job",runtime:true,shadow:false},{proname:"recovery_attribution_sources",runtime:false,shadow:false}]);
});
it.each(["cap","locked_revision"] as const)("the read resolver refuses corrupted %s sources instead of displaying their money",async kind=>{
 const x=await allocated();
 const login=f.runtime.options.user!;
 if(!/^[a-z0-9_]+$/u.test(login))throw new Error("Unexpected generated test login");
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  if(kind==="cap"){
   await db.query("ALTER TABLE app.stored_receipt_case_allocation DISABLE TRIGGER USER");
   await db.query("UPDATE app.stored_receipt_case_allocation SET net_numerator='80001' WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   await db.query("ALTER TABLE app.stored_receipt_case_allocation ENABLE TRIGGER USER");
  }else{
   await db.query("ALTER TABLE app.final_account_line DISABLE TRIGGER USER");
   await db.query("UPDATE app.final_account_line SET final_account_revision_id=$1 WHERE tenant_id=$2 AND job_id=$3 AND id=$4",[x.lock.finalAccountRevisionId,x.context.tenantId,x.jobId,x.line]);
   await db.query("ALTER TABLE app.final_account_line ENABLE TRIGGER USER");
  }
  // A disposable admin corruption is read through the actual runtime login;
  // the expected failure rolls back both corruption and session authorization.
  await db.query(`SET LOCAL SESSION AUTHORIZATION "${login}"`);
  await db.query("SELECT app.read_value_job($1,$2)",[x.jobId,x.auth.digest]);
 })).rejects.toThrow(kind==="cap"?"RECEIPT_LINE_CAPACITY_EXCEEDED":"STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
