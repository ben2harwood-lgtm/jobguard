// CI ONLY: made-up receipts through real writers, no provider or network calls.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import {PracticeFeedRepository} from "../src/practice-feed-repository.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
let f:FinalCheckFixture;
const environment=process.env.JOBGUARD_ENV,version="receipt-line-allocation-command.v1";
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
type Fixture=Awaited<ReturnType<typeof realReceiptFixture>>;
const execute=(x:Fixture,p:unknown)=>x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,p);
async function reviewCommand(x:Fixture,paymentId=x.paymentId){
 const current=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 return {version,action:"review",commandId:randomUUID(),expectedSourceRevision:current.revision,paymentId};
}
it.each(["F5","F7"] as const)("v1 saves %s exact allocations, replays one effect, and refuses double allocation",async kind=>{
 const x=await realReceiptFixture(f,kind,version);
 expect(x.fact.gross).toEqual({numerator:kind==="F5"?"48000":"96000",denominator:"1"});
 expect(x.fact.net).toEqual({numerator:kind==="F5"?"40000":"80000",denominator:"1"});
 expect(x.fact.rule).toBe(kind==="F5"?"pro_rata":"separate_invoice");
 if(kind==="F5"){
  const rows=(await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId})).rows;
  expect(rows.filter(r=>r.paymentId===x.deposit).every(r=>r.lineId!==x.line)).toBe(true);
 }else expect(x.fact.invoiceBinding.revisionId).not.toBe(x.lock.finalAccountRevisionId);
 const approval={version,action:"approve",commandId:x.produced.commandId,reviewId:x.produced.reviewId,approvalHash:x.produced.approvalHash,expectedSourceRevision:x.produced.sourceRevision};
 expect(await execute(x,approval)).toEqual({...x.produced,replayed:true});
 await expect(execute(x,{...approval,version:"receipt-line-facts-command.v1"})).rejects.toThrow("RECEIPT_LINE_IDEMPOTENCY_CONFLICT");
 await expect(execute(x,{...approval,approvalHash:"b".repeat(64)})).rejects.toThrow("RECEIPT_LINE_IDEMPOTENCY_CONFLICT");
 await expect(execute(x,await reviewCommand(x))).rejects.toThrow("RECEIPT_LINE_NOT_AVAILABLE");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:kind==="F5"?2:1}]);
});
it("v1 refuses unsettled receipts and settled receipts beyond the invoice line cap",async()=>{
 const x=await realReceiptFixture(f,"F7",version);
 const payment=await x.invoices.recordReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),paidOn:"2026-10-28",amountPence:38400,method:"bank_transfer",reference:"Fictional over-cap receipt"});
 await expect(execute(x,await reviewCommand(x,payment.paymentId))).rejects.toThrow("RECEIPT_LINE_SETTLEMENT_REQUIRED");
 const feed=new PracticeFeedRepository(f.runtime,"synthetic_demo");
 const view=await feed.view(x.context,x.actor,x.auth.digest,x.jobId);
 const pending=await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:view.revision,movement:"receipt-384",step:"pending"});
 await expect(execute(x,await reviewCommand(x,payment.paymentId))).rejects.toThrow("RECEIPT_LINE_SETTLEMENT_REQUIRED");
 const settled=await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:pending.revision,movement:"receipt-384",step:"settled"});
 await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"match_receipt",commandId:randomUUID(),expectedRevision:settled.revision,movement:"receipt-384",paymentId:payment.paymentId});
 await expect(execute(x,await reviewCommand(x,payment.paymentId))).rejects.toThrow("RECEIPT_LINE_NOT_AVAILABLE");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:1}]);
});
it("v1 cannot borrow another job's settled movement or another tenant's authority",async()=>{
 const x=await realReceiptFixture(f,"F7",version),other=await realReceiptFixture(f,"F7",version);
 await expect(execute(other,await reviewCommand(other,x.paymentId))).rejects.toThrow("RECEIPT_LINE_FORBIDDEN");
 await expect(x.producer.command(testTenantContext(randomUUID()),x.actor,x.auth.digest,x.jobId,await reviewCommand(x))).rejects.toThrow();
 const binding=x.fact.invoiceBinding;
 await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("SELECT app.receipt_fact_invoice_line($1,$2,$3,$4,$5,$6,$7)",[x.context.tenantId,x.jobId,x.invoiceId,x.line,x.lock.finalAccountRevisionId,binding.lockId,binding.checkId]))).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
it.each(["payment_reversal","credit_note"] as const)("v1 %s derives reversal money, appends linked rows and replays one effect",async kind=>{
 const x=await realReceiptFixture(f,"F7",version);
 const original=(await f.admin.query("SELECT row_to_json(l)::text bytes FROM app.receipt_allocation_fact_line l WHERE tenant_id=$1 AND job_id=$2 ORDER BY id",[x.context.tenantId,x.jobId])).rows;
 let sourceId:string;
 if(kind==="payment_reversal"){
  await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
  sourceId=(await f.admin.query("SELECT id FROM app.customer_payment_reversal WHERE tenant_id=$1 AND payment_id=$2",[x.context.tenantId,x.paymentId])).rows[0].id;
 }else{
  const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:80000,reason:"Fictional credit"});
  sourceId=(await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:80000,reason:"Fictional credit",previewHash:preview.previewHash})).creditNoteId;
 }
 const current=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 const request={version,action:"review_reverse",commandId:randomUUID(),expectedSourceRevision:current.revision,allocationRevisionId:x.produced.allocationRevisionId,reversalSource:{kind,sourceId},grossPence:96000};
 for(const grossPence of [1,96001]) await expect(execute(x,{...request,commandId:randomUUID(),grossPence})).rejects.toThrow("RECEIPT_LINE_REVERSAL_AMOUNT_CHANGED");
 const review=await execute(x,request);
 expect(await execute(x,request)).toEqual({...review,replayed:true});
 const approval={version,action:"reverse",commandId:randomUUID(),expectedSourceRevision:review.sourceRevision,reviewId:review.reviewId,approvalHash:review.approvalHash};
 await expect(execute(x,{...approval,version:"receipt-line-facts-command.v1"})).rejects.toThrow("RECEIPT_LINE_APPROVAL_CHANGED");
 await expect(execute(x,{...approval,approvalHash:"b".repeat(64)})).rejects.toThrow("RECEIPT_LINE_APPROVAL_CHANGED");
 const result=await execute(x,approval);
 expect(await execute(x,approval)).toEqual({...result,replayed:true});
 const after=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 expect(after.rows).toHaveLength(2);
 expect(after.rows.find(r=>r.direction==="reversal")).toMatchObject({gross:{numerator:"-96000",denominator:"1"},net:{numerator:"-80000",denominator:"1"},reversesLineAllocationId:x.fact.lineAllocationId});
 expect((await f.admin.query("SELECT row_to_json(l)::text bytes FROM app.receipt_allocation_fact_line l WHERE tenant_id=$1 AND job_id=$2 AND reverses_line_allocation_id IS NULL ORDER BY id",[x.context.tenantId,x.jobId])).rows).toEqual(original);
 await expect(execute(x,{...request,commandId:randomUUID(),expectedSourceRevision:after.revision})).rejects.toThrow("RECEIPT_LINE_NOT_AVAILABLE");
});
