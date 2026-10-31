// CI only: genuine PostgreSQL writers, no provider, settlement or accounting-row overrides.
import { randomUUID,createHash } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture } from "./final-check-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let f:FinalCheckFixture,repo:SimulationFeeCollectionRepository,statements:SimulationFeeStatementRepository;
beforeAll(async()=>{f=await createFinalCheckFixture();repo=new SimulationFeeCollectionRepository(f.runtime);statements=new SimulationFeeStatementRepository(f.runtime);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
const version="simulation-fee-collection-command.v1";
async function setup(collection282=false){
 const x=await catchFeeFixture(f,true,collection282),review=await x.execute();
 await x.execute({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:review.reviewId,statementHash:review.statementHash});
 const issue=()=>statements.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
 const saved=await issue();
 // Only the CI fake-rail operator connection supplies terminal outcomes. No HTTP path.
 const rail=(raw:unknown)=>finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  await db.query("SELECT set_config('app.practice_material_digest',$1,true)",[x.auth.digest]);
  return (await db.query("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb) result",[x.jobId,x.auth.digest,raw])).rows[0].result;
 });
 const run=(raw:unknown)=> {
  const action=(raw as {action:string}).action;
  return action==="settle"||action==="fail"?rail(raw):repo.command(x.context,x.jobId,x.auth.digest,raw);
 };
 const view=()=>repo.view(x.context,x.jobId,x.auth.digest);
 const reserve=(action="collect",statement=saved,amountPence=8000)=>({version,commandId:randomUUID(),action,statementId:statement.statementId,statementHash:statement.documentHash,amountPence});
 const event=(attemptId:string,action="settle")=>({version,commandId:randomUUID(),action,attemptId});
 return {...x,saved,issue,run,rail,view,reserve,event};
}
it("atomically reserves once across concurrent clicks, retries and new IDs; redirect never settles; terminal replays are unique",async()=>{
 const x=await setup(),c=x.reserve();
 const results=await Promise.allSettled([x.run(c),x.run(c)]);
 const success=results.filter(r=>r.status==="fulfilled");expect(success).toHaveLength(2);
 const first=success[0]!;if(first.status!=="fulfilled")throw new Error();const id=first.value.attemptId;
 expect(await x.view()).toMatchObject({settledPrincipal:0,collectionReserved:8000,outstandingPrincipal:8000,attempts:[{id,state:"pending",amountPence:8000}]});
 await x.run(x.event(id,"redirect"));expect((await x.view()).settledPrincipal).toBe(0);
 const settled=x.event(id);await x.run(settled);await x.run(settled);await x.run(x.event(id));
 expect(await x.view()).toMatchObject({settledPrincipal:8000,outstandingPrincipal:0,collectionReserved:0});
 await expect(x.run(x.reserve())).rejects.toThrow("SUCCESS_FEE_STALE");
 await expect(x.run(x.event(id,"fail"))).rejects.toThrow("SUCCESS_FEE_STALE");
 await expect(x.run({...c,amountPence:1})).rejects.toThrow("SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
});
it("unknown outcomes fence every new attempt until explicit fake reconciliation; definite failure releases capacity",async()=>{
 const x=await setup(),a=await x.run(x.reserve());await x.run(x.event(a.attemptId,"unknown"));
 await expect(x.run(x.reserve())).rejects.toThrow("SUCCESS_FEE_STALE");
 await x.run(x.event(a.attemptId,"redirect"));expect((await x.view()).unknownOutcome).toBe(true);
 await x.run(x.event(a.attemptId,"fail"));expect((await x.view()).collectionReserved).toBe(0);
 const b=await x.run(x.reserve());expect(b.attemptId).not.toBe(a.attemptId);
 await x.run(x.event(b.attemptId));expect((await x.view()).settledPrincipal).toBe(8000);
});
it("refunds require current correction, exact amount and settled principal; concurrent refunds and replay cannot over-refund",async()=>{
 const x=await setup();await expect(x.run(x.reserve("refund"))).rejects.toThrow("SUCCESS_FEE_STALE");
 await expect(x.run(x.reserve("collect",x.saved,7999))).rejects.toThrow("SUCCESS_FEE_STALE");
 await expect(x.run({...x.reserve(),statementHash:"0".repeat(64)})).rejects.toThrow("SUCCESS_FEE_STALE");
 const a=await x.run(x.reserve());await x.run(x.event(a.attemptId));
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 expect(await x.view()).toMatchObject({refundDue:8000,retainedPrincipal:8000});
 await expect(x.run(x.reserve("refund"))).rejects.toThrow("SUCCESS_FEE_STALE");
 const correction=await x.issue();
 await expect(x.run(x.reserve("refund",correction,8001))).rejects.toThrow("SUCCESS_FEE_STALE");
 const c=x.reserve("refund",correction),results=await Promise.allSettled([x.run(c),x.run(c)]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(2);
 await expect(x.run(x.reserve("refund",correction))).rejects.toThrow("SUCCESS_FEE_STALE");
 const refund=await x.run(c);await x.run(x.event(refund.attemptId,"unknown"));
 await expect(x.run(x.reserve())).rejects.toThrow("SUCCESS_FEE_STALE");
 await x.run(x.event(refund.attemptId));await x.run(x.event(refund.attemptId));
 expect(await x.view()).toMatchObject({settledPrincipal:8000,refundedPrincipal:8000,retainedPrincipal:0,refundDue:0});
 await expect(x.run(x.reserve("refund",correction))).rejects.toThrow("SUCCESS_FEE_STALE");
});
it("fresh access is required before replay; job-scoped attempts, FORCE RLS and owner-only immutable tables prevent cross-customer access",async()=>{
 const x=await setup(),y=await setup(),c=x.reserve(),a=await x.run(c);
 await expect(repo.command(x.context,x.jobId,y.auth.digest,c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(y.run(y.event(a.attemptId))).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(repo.view(testTenantContext(randomUUID()),x.jobId,x.auth.digest)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 for(const table of ["platform_fee_attempt","platform_fee_attempt_event","platform_fee_collection_command"]){
  for(const sql of [`SELECT * FROM app.${table}`,`INSERT INTO app.${table} DEFAULT VALUES`,`TRUNCATE app.${table}`])await expect(f.runtime.query(sql)).rejects.toMatchObject({code:"42501"});
  for(const sql of [`UPDATE app.${table} SET job_id=job_id WHERE tenant_id=$1`,`DELETE FROM app.${table} WHERE tenant_id=$1`])await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query(sql,[x.context.tenantId]))).rejects.toThrow();
  expect(await finalCheckTenant(f.admin,randomUUID(),async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query(`SELECT * FROM app.${table}`)).rows;})).toEqual([]);
 }
});
it("audit failure rolls back reservation, approval, event and receipt together",async()=>{
 const x=await setup(),c=x.reserve();
 const counts=async()=> (await f.admin.query("SELECT (SELECT count(*) FROM app.platform_fee_attempt WHERE tenant_id=$1) attempts,(SELECT count(*) FROM app.platform_fee_attempt_event WHERE tenant_id=$1) events,(SELECT count(*) FROM app.platform_fee_collection_command WHERE tenant_id=$1) commands,(SELECT count(*) FROM app.action_authorization WHERE tenant_id=$1) approvals,(SELECT count(*) FROM app.decision WHERE tenant_id=$1) decisions",[x.context.tenantId])).rows;
 const before=await counts();
 await f.admin.query(`CREATE FUNCTION app.fc_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='simulation_fee_collection.collect' THEN RAISE EXCEPTION 'FC_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fc_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.fc_test_audit_failure()`);
 try{await expect(x.run(c)).rejects.toThrow("FC_TEST_AUDIT_FAILURE");expect((await x.view()).attempts).toEqual([]);expect(await counts()).toEqual(before);}
 finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER fc_test_audit_failure");}
 const a=await x.run(c);expect(await x.run(c)).toEqual({...a,replayed:true});
});

it("a receipt reversal while an unknown collection is reserved preserves its reservation and approval until reconciliation",async()=>{
 const x=await setup(),a=await x.run(x.reserve());await x.run(x.event(a.attemptId,"unknown"));
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional reversal during uncertainty"});
 expect(await x.view()).toMatchObject({collectionReserved:8000,settledPrincipal:0,unknownOutcome:true});
 const correction=await x.issue();await expect(x.run(x.reserve("refund",correction))).rejects.toThrow("SUCCESS_FEE_STALE");
 await x.run(x.event(a.attemptId));expect(await x.view()).toMatchObject({refundDue:8000,settledPrincipal:8000,collectionReserved:0});
 expect((await statements.download(x.context,x.jobId,x.auth.digest,x.saved.statementId))!.documentHash).toBe(x.saved.documentHash);
});

it("different concurrent command identities share one outstanding-principal reservation",async()=>{
 const x=await setup(),commands=[x.reserve(),x.reserve(),x.reserve()];
 const results=await Promise.allSettled(commands.map(c=>x.run(c)));
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect(await x.view()).toMatchObject({collectionReserved:8000,settledPrincipal:0});
 const winner=results.findIndex(r=>r.status==="fulfilled"),result=results[winner]!;
 if(result.status!=="fulfilled")throw new Error();
 expect(await x.run(commands[winner])).toEqual({...result.value,replayed:true});
});

it("a current approval and collection may share the caller UUID without sharing a receipt",async()=>{
 const x=await setup(),c=x.reserve();
 await statements.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-statement-command.v1",action:"approve",commandId:c.commandId,statementId:x.saved.statementId,statementHash:x.saved.documentHash});
 const a=await x.run(c);expect(await x.run(c)).toEqual({...a,replayed:true});
 expect(await x.view()).toMatchObject({collectionReserved:8000,settledPrincipal:0});
 expect((await f.admin.query("SELECT command_id FROM app.platform_fee_statement_command WHERE tenant_id=$1 AND job_id=$2 AND payload->>'action'='approve'",[x.context.tenantId,x.jobId])).rows).toHaveLength(2);
});

it.each(["command", "derived approval"] as const)("an earlier %s identity cannot replay approval after sources change",async collision=>{
 const x=await setup(),c=x.reserve();
 const hex=createHash("md5").update("simulation-fee-collection:statement-approval:"+c.commandId).digest("hex");
 const derivedId=`${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
 const approval={version:"simulation-fee-statement-command.v1",action:"approve",commandId:collision==="command"?c.commandId:derivedId,statementId:x.saved.statementId,statementHash:x.saved.documentHash};
 await statements.command(x.context,x.jobId,x.auth.digest,approval);
 // Same principal, different source binding: the amount check alone cannot catch this.
 await new RecoveryAttributionRepository(f.runtime).assess(x.context,x.jobId,x.auth.digest,{
  version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,
  lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:x.assessment.caseRevision,expectedAttributionRevision:x.assessment.revision,
 });
 expect(await x.view()).toMatchObject({outstandingPrincipal:8000,attempts:[]});
 await expect(x.run(c)).rejects.toThrow(collision==="command"?"SUCCESS_FEE_STALE":"SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
 expect(await x.view()).toMatchObject({collectionReserved:0,settledPrincipal:0,attempts:[]});
 expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_fee_collection_command WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,c.commandId])).rows).toEqual([{n:0}]);
});

it("collects GBP282, then a genuine GBP3000 receipt reversal refunds GBP250 and retains GBP32",async()=>{
 const x=await setup(true);
 expect((await statements.view(x.context,x.jobId,x.auth.digest)).statements[0]!.document).toMatchObject({
  cumulativeFeePrincipal:{pence:28200,currency:"GBP"},qualifyingPrincipal:{numerator:"282000",denominator:"1"},
 });
 const original=await statements.download(x.context,x.jobId,x.auth.digest,x.saved.statementId);
 const c=x.reserve("collect",x.saved,28200),a=await x.run(c);
 expect(await x.run(c)).toEqual({...a,replayed:true});
 expect(await x.view()).toMatchObject({collectionReserved:28200,settledPrincipal:0});
 await x.run(x.event(a.attemptId,"redirect"));expect((await x.view()).settledPrincipal).toBe(0);
 await x.run(x.event(a.attemptId));await x.run(x.event(a.attemptId));
 expect(await x.view()).toMatchObject({settledPrincipal:28200,outstandingPrincipal:0,collectionReserved:0});
 const reversal=await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional GBP3000 receipt reversal"});
 // Persist the linked source and case-allocation reversals before using the remaining GBP320.
 const snapshot=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 const review=await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"receipt-line-allocation-command.v1",action:"review_reverse",commandId:randomUUID(),allocationRevisionId:x.produced.allocationRevisionId,reversalSource:{kind:"payment_reversal",sourceId:reversal.reversalId},expectedSourceRevision:snapshot.revision});
 await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"receipt-line-allocation-command.v1",action:"reverse",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash,expectedSourceRevision:review.sourceRevision});
 const after=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 const allocator=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo");
 const reverseAllocation={version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),factLineId:after.rows.find(r=>r.direction==="reversal"&&r.lineId===x.line)!.lineAllocationId,caseId:x.caseId,workId:x.workId,expectedCaseRevision:x.assessment.caseRevision};
 const allocationReview=await allocator.command(x.context,x.jobId,x.auth.digest,reverseAllocation);
 await allocator.command(x.context,x.jobId,x.auth.digest,{...reverseAllocation,action:"approve",commandId:randomUUID(),reviewId:allocationReview.reviewId,approvalHash:allocationReview.approvalHash});
 expect(await x.view()).toMatchObject({refundDue:25000,retainedPrincipal:28200});
 const correction=await x.issue();
 expect((await statements.view(x.context,x.jobId,x.auth.digest)).statements.at(-1)!.document).toMatchObject({
  documentPrincipal:{pence:-25000},cumulativeFeePrincipal:{pence:3200},original:{statementId:x.saved.statementId,documentHash:x.saved.documentHash},
 });
 await expect(x.run(x.reserve("refund",correction,25001))).rejects.toThrow("SUCCESS_FEE_STALE");
 const refundCommand=x.reserve("refund",correction,25000),refund=await x.run(refundCommand);
 expect(await x.run(refundCommand)).toEqual({...refund,replayed:true});
 expect(await x.view()).toMatchObject({refundReserved:25000,refundedPrincipal:0,refundDue:25000});
 await x.run(x.event(refund.attemptId));await x.run(x.event(refund.attemptId));
 expect(await x.view()).toMatchObject({settledPrincipal:28200,refundedPrincipal:25000,retainedPrincipal:3200,refundDue:0,refundReserved:0,outstandingPrincipal:0});
 await expect(x.run(x.reserve("refund",correction,25000))).rejects.toThrow("SUCCESS_FEE_STALE");
 expect(await statements.download(x.context,x.jobId,x.auth.digest,x.saved.statementId)).toEqual(original);
});

it.each(["settle","fail"])("builder connections cannot submit or replay %s even by direct SQL",async action=>{
 const x=await setup(),a=await x.run(x.reserve()),c=x.event(a.attemptId,action);
 const direct=()=>finalCheckTenant(f.runtime,x.context.tenantId,async db=>{
  await db.query("SELECT set_config('app.practice_material_digest',$1,true)",[x.auth.digest]);
  return db.query("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,c]);
 });
 await expect(repo.command(x.context,x.jobId,x.auth.digest,c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(direct()).rejects.toMatchObject({code:"42501",message:"SUCCESS_FEE_FORBIDDEN"});
 expect(await x.view()).toMatchObject({settledPrincipal:0,collectionReserved:8000});
 await x.rail(c);
 await expect(direct()).rejects.toMatchObject({code:"42501",message:"SUCCESS_FEE_FORBIDDEN"});
 expect(await x.view()).toMatchObject({settledPrincipal:action==="settle"?8000:0,collectionReserved:0});
});
