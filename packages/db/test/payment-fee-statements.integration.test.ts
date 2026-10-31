// Real PostgreSQL CI only. No customer data or provider calls.
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,expect,it } from "vitest";
import { createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture } from "./final-check-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { PaymentFeeRepository } from "../src/payment-fee-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let f:FinalCheckFixture;const environment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
async function fixture(){
 const x=await realReceiptFixture(f);
 const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[x.context.tenantId,x.jobId,x.caseId])).rows[0].revision as number;
 const allocator=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo");
 const p={version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),factLineId:x.fact.lineAllocationId,caseId:x.caseId,workId:x.workId,expectedCaseRevision:revision};
 const review=await allocator.command(x.context,x.jobId,x.auth.digest,p);
 await allocator.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 await new RecoveryAttributionRepository(f.runtime).assess(x.context,x.jobId,x.auth.digest,{version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:revision,expectedAttributionRevision:0});
 const repo=new PaymentFeeRepository(f.runtime);
 return {...x,repo,run:(p:unknown)=>repo.command(x.context,x.jobId,x.auth.digest,p),view:()=>repo.read(x.context,x.jobId,x.auth.digest)};
}
const prepare=(paymentId:string)=>({version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId});
const approve=(s:{statementId:string;statementHash:string})=>({version:"payment-fee-command.v1",action:"approve",commandId:randomUUID(),statementId:s.statementId,statementHash:s.statementHash});
it("one verified real-writer receipt yields £800/£80/£720 and one exact approval, despite replays/races/double clicks",async()=>{
 const x=await fixture(),p=prepare(x.paymentId);
 const [a,b]=await Promise.all([x.run(p),x.run(p)]);expect(b).toEqual(a);
 expect(a).toMatchObject({qualifyingNet:{numerator:"80000",denominator:"1"},feePence:8000,priorFeePence:0,cumulativeFeePence:8000,productionEnabled:false,realExternalActions:0});
 expect(await x.run(prepare(x.paymentId))).toEqual(a);
 await expect(x.run({...p,paymentId:randomUUID()})).rejects.toThrow("PAYMENT_FEE_IDEMPOTENCY_CONFLICT");
 await expect(x.run({...approve(a),statementHash:"0".repeat(64)})).rejects.toThrow("PAYMENT_FEE_APPROVAL_CHANGED");
 const approval=approve(a);expect(await x.run(approval)).toEqual(a);expect(await x.run(approval)).toEqual(a);expect(await x.run(approve(a))).toEqual(a);
 expect((await x.view()).statements[0]!.state).toBe("approved");
 const rows=(await f.admin.query("SELECT count(*)::int n FROM app.payment_fee_command WHERE tenant_id=$1 AND job_id=$2 AND authorization_id IS NOT NULL",[x.context.tenantId,x.jobId])).rows;
 expect(rows).toEqual([{n:1}]);
 expect((await f.admin.query("SELECT amount_pence::text,currency,recipient FROM app.action_authorization a JOIN app.payment_fee_command c ON(c.tenant_id,c.authorization_id)=(a.tenant_id,a.id) WHERE c.tenant_id=$1 AND c.job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{amount_pence:"8000",currency:"GBP",recipient:"platform:jobguard"}]);
});
it("dispute pauses existing approval permanently and a historical replay cannot release it",async()=>{
 const x=await fixture(),s=await x.run(prepare(x.paymentId)),p=approve(s);await x.run(p);
 const dispute={version:"payment-fee-command.v1",action:"dispute",commandId:randomUUID(),statementId:s.statementId};
 await x.run(dispute);await x.run(dispute);await x.run(p);
 expect((await x.view()).statements[0]!.state).toBe("disputed");
 await expect(x.run(approve(s))).rejects.toThrow("PAYMENT_FEE_PAUSED");
});
it.each(["refund","credit","evidence"] as const)("%s invalidates the live fee approval; original statement and customer payment remain unchanged",async kind=>{
 const x=await fixture(),s=await x.run(prepare(x.paymentId));await x.run(approve(s));
 const before=(await f.admin.query("SELECT to_jsonb(p) value FROM app.customer_payment p WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.paymentId])).rows[0].value;
 if(kind==="refund")await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 else if(kind==="credit"){
  const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:40000,reason:"Fictional partial credit"});
  await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:40000,reason:"Fictional partial credit",previewHash:preview.previewHash});
 }else await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
 const view=await x.view();expect(view.statements[0]).toEqual({statement:s,state:"source_changed"});
 await expect(x.run(approve(s))).rejects.toThrow("PAYMENT_FEE_APPROVAL_CHANGED");
 expect((await f.admin.query("SELECT to_jsonb(p) value FROM app.customer_payment p WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.paymentId])).rows[0].value).toEqual(before);
});
it("tenant, other-job receipt and other-session references fail closed; runtime cannot insert or edit statements",async()=>{
 const x=await fixture(),other=await fixture(),s=await x.run(prepare(x.paymentId));
 await expect(x.run(prepare(other.paymentId))).rejects.toThrow("PAYMENT_FEE_SOURCE_REQUIRED");
 await expect(x.repo.read(testTenantContext(randomUUID()),x.jobId,x.auth.digest)).rejects.toThrow();
 await expect(x.repo.command(x.context,x.jobId,other.auth.digest,approve(s))).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
 await expect(x.repo.command(x.context,other.jobId,other.auth.digest,approve(s))).rejects.toThrow("PAYMENT_FEE_SOURCE_REQUIRED");
 await expect(finalCheckTenant(f.runtime,x.context.tenantId,db=>db.query("INSERT INTO app.payment_fee_statement(tenant_id) VALUES($1)",[x.context.tenantId]))).rejects.toThrow("permission denied");
 await expect(finalCheckTenant(f.runtime,x.context.tenantId,db=>db.query("UPDATE app.payment_fee_command SET result='{}'"))).rejects.toThrow("permission denied");
});
it("#356 duplicate consumed allocation and #368 locked original bill cannot create another fee",async()=>{
 const x=await fixture();await x.run(prepare(x.paymentId));
 await expect(x.run(prepare(randomUUID()))).rejects.toThrow("PAYMENT_FEE_SOURCE_REQUIRED");
 const original=(await f.admin.query("SELECT id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 LIMIT 1",[x.context.tenantId,x.jobId,x.lock.finalAccountRevisionId])).rows[0].id;
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  await db.query("ALTER TABLE app.stored_receipt_case_allocation DISABLE TRIGGER USER");
  await db.query("UPDATE app.stored_receipt_case_allocation SET line_id=$1 WHERE tenant_id=$2 AND job_id=$3",[original,x.context.tenantId,x.jobId]);
 })).rejects.toThrow(); // tenant/job/line/work composite binding itself refuses the mutation
 expect((await x.view()).statements).toHaveLength(1);
});
it("audit failure rolls back the statement, decision and command; retry succeeds once",async()=>{
 const x=await fixture(),p=prepare(x.paymentId);
 await f.admin.query(`CREATE FUNCTION app.mon4a_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='payment_fee.prepare' THEN RAISE EXCEPTION 'MON4A_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER mon4a_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.mon4a_audit_failure()`);
 try{await expect(x.run(p)).rejects.toThrow("MON4A_AUDIT_FAILURE");}finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER mon4a_audit_failure");}
 expect((await x.view()).statements).toEqual([]);await x.run(p);expect((await x.view()).statements).toHaveLength(1);
});
it("revocation and expiry each stop the current approval with a specific reason",async()=>{
 const x=await fixture(),s=await x.run(prepare(x.paymentId));await x.run(approve(s));
 const {rolledBack}=await import("./upgrade-proof-utils.js");
 for(const [set,expected] of [["revoked_at=clock_timestamp()","approval_revoked"],["expires_at=clock_timestamp()-interval '1 second'","approval_expired"]] as const){
  await rolledBack(f.admin,async db=>{
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
   // Negative control only: alter a protected authorization inside a rollback.
   // No positive fixture depends on disabled integrity controls.
   await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
   await db.query(`UPDATE app.action_authorization SET ${set} WHERE tenant_id=$1 AND id IN(SELECT authorization_id FROM app.payment_fee_command WHERE tenant_id=$1 AND statement_id=$2)`,[x.context.tenantId,s.statementId]);
   await db.query("ALTER TABLE app.action_authorization ENABLE TRIGGER USER");
   expect((await db.query("SELECT app.payment_fee_current($1,$2,$3,$4) state",[x.context.tenantId,x.jobId,s.statementId,x.actor.membershipId])).rows[0].state).toBe(expected);
  });
 }
 expect((await x.view()).statements[0]!.state).toBe("approved");
});
it("a disputed attribution pauses an already approved statement without concealing the dispute",async()=>{
 const x=await fixture(),s=await x.run(prepare(x.paymentId));await x.run(approve(s));
 await finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  const signal=(await db.query("SELECT source_signal_id FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND kind='jobguard_catch'",[x.context.tenantId,x.jobId])).rows[0].source_signal_id;
  await db.query("INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES($1,$2,$3,$4,'attribution_disputed',$5)",[x.context.tenantId,x.jobId,randomUUID(),signal,randomUUID()]);
 });
 expect((await x.view()).statements[0]!.state).toBe("disputed");
 await expect(x.run(approve(s))).rejects.toThrow("PAYMENT_FEE_PAUSED");
});
it("the statement's shared SQL kernel rounds cumulative 1/10 once and subtracts prior fees",async()=>{
 const fee=async(n:string,d:string,prior:number)=>Number((await f.admin.query("SELECT app.ef_round_half_even($1::numeric,$2::numeric*10)-$3::bigint delta",[n,d,prior])).rows[0].delta);
 expect(await fee("32000","1",0)).toBe(3200);
 expect(await fee("282000","1",3200)).toBe(25000);
 expect(await fee("282000","1",28200)).toBe(0);
 expect(await fee("32000","1",28200)).toBe(-25000);
 // Two half-penny fees telescope to one penny, not zero independently rounded fees.
 expect(await fee("5","1",0)).toBe(0);expect(await fee("10","1",0)).toBe(1);
 expect(await fee("1","3",0)).toBe(0);
});
