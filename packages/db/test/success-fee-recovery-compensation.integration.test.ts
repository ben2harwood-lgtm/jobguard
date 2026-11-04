// CI ONLY: real PostgreSQL, synthetic producer/allocator writers, all guards enabled.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {recoveryFeeFixture} from "./success-fee-recovery-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
async function journals(x:Awaited<ReturnType<typeof recoveryFeeFixture>>){
 return (await f.admin.query("SELECT id,amount_pence,reverses_journal_id FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2 ORDER BY amount_pence",[x.context.tenantId,x.jobId])).rows;
}
it("F10/F11: GBP320 -> GBP2820, zero retains derivation, reversal posts linked -GBP250",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);
 const a=await x.review();expect(a.statement).toMatchObject({feePence:3200,deltaPence:3200});await x.approve(a);
 await x.allocate(1);
 const b=await x.review(1);expect(b.statement).toMatchObject({feePence:28200,deltaPence:25000});const original=await x.approve(b);
 const zero=await x.approve(await x.review(2));expect(zero).toMatchObject({derivationId:expect.any(String),journalId:null,statement:{deltaPence:0}});
 expect(await journals(x)).toHaveLength(2);
 await x.reverse(1);
 const review=await x.review(3);expect(review.statement).toMatchObject({feePence:3200,deltaPence:-25000,compensationLinks:[{journalId:original.journalId,amountPence:25000}]});
 const command={version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:review.postingRevision,reviewId:review.reviewId,statementHash:review.statementHash};
 const compensation=await x.fees.command(x.context,x.jobId,x.auth.digest,command);
 expect(await x.fees.command(x.context,x.jobId,x.auth.digest,command)).toEqual({...compensation,replayed:true});
 expect(await journals(x)).toContainEqual({id:compensation.journalId,amount_pence:"-25000",reverses_journal_id:original.journalId});
 expect((await f.admin.query("SELECT account,side,amount_pence FROM app.success_fee_journal_line WHERE tenant_id=$1 AND journal_id=$2 ORDER BY account",[x.context.tenantId,compensation.journalId])).rows).toEqual([
  {account:"fee_income",side:"debit",amount_pence:"25000"},{account:"fee_receivable",side:"credit",amount_pence:"25000"}]);
 expect((await x.approve(await x.review(4))).journalId).toBeNull();
});
it("two cases on one job race for one serial derivation, then fully compensate the combined posting",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.allocate(1);
 const [a,b]=await Promise.all([x.review(),x.review()]);
 const results=await Promise.allSettled([x.approve(a),x.approve(b)]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.message).toBe("SUCCESS_FEE_STALE");
 expect(await journals(x)).toHaveLength(1);
 expect((results.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof x.approve>>>).value.statement).toMatchObject({feePence:28200,deltaPence:28200});
 await x.reverse(0);await x.reverse(1);
 expect((await x.approve(await x.review(1))).statement).toMatchObject({feePence:0,deltaPence:-28200});
 expect(await journals(x)).toHaveLength(2);
});
it("full reversal of two separately posted receipts links both original journals",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.approve(await x.review());
 await x.allocate(1);await x.approve(await x.review(1));
 await x.reverse(0);await x.reverse(1);
 const r=await x.review(2);expect(r.statement.compensationLinks).toHaveLength(2);
 await x.approve(r);expect(await journals(x)).toHaveLength(4);
 expect((await journals(x)).reduce((n,r)=>n+BigInt(r.amount_pence),0n)).toBe(0n);
});
it.each(["proof","terms","approval","stale_eligibility","unallocated_refund","wrong_mode","cross_tenant","cross_job"] as const)("refuses %s without fee effects",async attack=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);const r=await x.review();
 if(attack==="proof")await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
 if(attack==="terms")await f.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=(SELECT authorization_id FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND case_id=$2)",[x.context.tenantId,x.opened[0]!.id]);
 if(attack==="approval")await f.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,r.statement.sources[0]!.reviewAuthorizationId]);
 if(attack==="stale_eligibility")await x.cases.eligibilityCommand(x.context,x.jobId,{version:"recovery-eligibility-command.v1",action:"supersede",commandId:randomUUID(),caseId:x.opened[0]!.id,expectedCaseRevision:(await x.allocator.view(x.context,x.actor,x.auth.digest,x.jobId)).cases.find(c=>c.caseId===x.opened[0]!.id)!.revision,subject:"evidence"},x.actor);
 if(attack==="unallocated_refund")await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.payments[0]!,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 if(attack==="wrong_mode"){
  await finalCheckTenant(f.admin,x.context.tenantId,async db=>{
   await db.query("ALTER TABLE app.job_commercial_track DISABLE TRIGGER USER");
   await db.query("UPDATE app.job_commercial_track SET environment='pilot_no_charge' WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   await db.query("ALTER TABLE app.job_commercial_track ENABLE TRIGGER USER");
  });
 }
 if(attack==="cross_tenant"||attack==="cross_job"){
  await expect(finalCheckTenant(f.runtime,attack==="cross_tenant"?randomUUID():x.context.tenantId,db=>db.query("SELECT app.write_success_fee_v3($1,$2,$3::jsonb,NULL)",[attack==="cross_job"?randomUUID():x.jobId,x.auth.digest,{version:"success-fee-command.v1",commandId:randomUUID(),action:"review",expectedPostingRevision:0}]))).rejects.toThrow();
 }else await expect(x.approve(r)).rejects.toThrow(attack==="wrong_mode"?"SUCCESS_FEE_FORBIDDEN":attack==="approval"?"SUCCESS_FEE_REVIEW_REQUIRED":"SUCCESS_FEE_SOURCE_CHANGED");
 expect(await journals(x)).toHaveLength(0);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.success_fee_derivation WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:0}]);
});
it("a saved statement is stale after another case allocation and direct inserts stay closed",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);const r=await x.review();await x.allocate(1);
 await expect(x.approve(r)).rejects.toThrow("SUCCESS_FEE_STALE");
 for(const name of ["source","derivation","journal","journal_line"])
  await expect(f.runtime.query(`INSERT INTO app.success_fee_${name} DEFAULT VALUES`)).rejects.toMatchObject({code:"42501"});
 expect(await journals(x)).toHaveLength(0);
});
