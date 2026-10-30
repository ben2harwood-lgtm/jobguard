// CI ONLY: real PostgreSQL and real writer chains. No replica-mode fixtures.
import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,expect,it} from "vitest";
import {calculateCumulativeFee,parseExactPence,serializeExactPence,sumExactPence} from "@jobguard/core";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import {StoredReceiptCaseAllocationRepository} from "../src/stored-receipt-case-allocation-repository.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
let f:FinalCheckFixture;const environment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
type Fixture=Awaited<ReturnType<typeof realReceiptFixture>>;
const repo=()=>new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo");
async function command(x:Fixture,factLineId=x.fact.lineAllocationId,workId=x.workId){
 const caseRevision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[x.context.tenantId,x.jobId,x.caseId])).rows[0].revision as number;
 return {version:"stored-receipt-case-command.v1" as const,commandId:randomUUID(),action:"review" as const,factLineId,caseId:x.caseId,workId,expectedCaseRevision:caseRevision};
}
const execute=(x:Fixture,p:unknown)=>repo().command(x.context,x.jobId,x.auth.digest,p);
async function save(x:Fixture,factLineId=x.fact.lineAllocationId,workId=x.workId){
 const p=await command(x,factLineId,workId),review=await execute(x,p),approval={...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash};
 return {result:await execute(x,approval),approval};
}
it.each(["F5","F7"] as const)("saves %s from real invoice/feed/receipt/producer writers and preserves exact SH-1 money",async kind=>{
 const x=await realReceiptFixture(f,kind),{result,approval}=await save(x);
 expect(result.facts.gross).toEqual({numerator:kind==="F5"?"48000":"96000",denominator:"1"});
 expect(result.facts.net).toEqual({numerator:kind==="F5"?"40000":"80000",denominator:"1"});
 expect(result.facts.rule).toBe(kind==="F5"?"pro_rata":"separate_invoice");
 const saved=(await f.admin.query("SELECT net_numerator,net_denominator FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,result.allocationId])).rows;
 expect(saved).toEqual([{net_numerator:result.facts.net.numerator,net_denominator:"1"}]);
 // Fee arithmetic only; allocation never creates fee entitlement or a posting.
 expect(calculateCumulativeFee({version:"cumulative-fee.v1",cumulativeQualifyingPrincipal:result.facts.net,rate:{version:"fee-rate.v1",policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},priorNetPostedPence:0,priorPolicyVersion:"reference_fee_policy_v3",compensatesDerivationId:null}).cumulativeFee.pence).toBe(kind==="F5"?4000:8000);
 expect(await execute(x,approval)).toEqual({...result,replayed:true});
 if(kind==="F5"){
  const snapshot=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
  expect(snapshot.rows.filter(r=>r.paymentId===x.deposit).every(r=>r.lineId!==x.line)).toBe(true);
  expect(snapshot.rows.filter(r=>r.paymentId===x.deposit)).toHaveLength(1);
 }else{
  expect(x.fact.invoiceBinding.revisionId).not.toBe(x.lock.finalAccountRevisionId);
  expect((await f.admin.query("SELECT total_pence::text gross FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.main.invoiceId])).rows).toEqual([{gross:"4032000"}]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND invoice_id=$2",[x.context.tenantId,x.main.invoiceId])).rows).toEqual([{n:0}]);
 }
});
it("#346: another job and another customer's tenant cannot consume the receipt",async()=>{
 const x=await realReceiptFixture(f),other=await realReceiptFixture(f);
 await expect(repo().command(x.context,other.jobId,other.auth.digest,await command(x))).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
 await expect(repo().command(testTenantContext(randomUUID()),x.jobId,x.auth.digest,await command(x))).rejects.toThrow();
 // The neutral producer cannot repurpose another job's matched payment either.
 await expect(other.producer.command(other.context,other.actor,other.auth.digest,other.jobId,{version:"receipt-line-facts-command.v1",action:"review",commandId:randomUUID(),paymentId:x.paymentId,expectedSourceRevision:2})).rejects.toThrow("RECEIPT_LINE_FORBIDDEN");
});
it("#368: original-bill references cannot masquerade as supplementary descendants or cite a different lock",async()=>{
 const x=await realReceiptFixture(f),binding=x.fact.invoiceBinding;
 const attempt=(invoice:string,line:string,revision:string,lock:string)=>finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("SELECT app.receipt_fact_invoice_line($1,$2,$3,$4,$5,$6,$7)",[x.context.tenantId,x.jobId,invoice,line,revision,lock,binding.checkId]));
 await expect(attempt(x.invoiceId,x.line,x.lock.finalAccountRevisionId,binding.lockId)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
 await expect(attempt(x.main.invoiceId,x.line,binding.revisionId,binding.lockId)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
 await expect(attempt(x.invoiceId,x.line,binding.revisionId,randomUUID())).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
 // Even a preserved baseline copied into the descendant is excluded: it was on
 // the original bill and the real supplementary writer never issued it again.
 const baseline=(await f.admin.query("SELECT id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'",[x.context.tenantId,x.jobId,binding.revisionId])).rows[0].id;
 await expect(attempt(x.invoiceId,baseline,binding.revisionId,binding.lockId)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
it("#356: exact line cap, two work items, duplicate facts and conflicting replays fail",async()=>{
 const x=await realReceiptFixture(f),{approval}=await save(x);
 await expect(execute(x,await command(x,x.fact.lineAllocationId,randomUUID()))).rejects.toThrow("STORED_RECEIPT_LINE_ALREADY_BOUND");
 await expect(save(x)).rejects.toThrow("RECEIPT_LINE_CAPACITY_EXCEEDED");
 await expect(execute(x,{...approval,workId:randomUUID()})).rejects.toThrow("STORED_RECEIPT_IDEMPOTENCY_CONFLICT");
 const before=(await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_line WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows;
 await expect(x.produce(x.paymentId)).rejects.toThrow("RECEIPT_LINE_NOT_AVAILABLE");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_line WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual(before);
});
it("concurrent alternate assignments conserve the line",async()=>{
 const x=await realReceiptFixture(f),a=await command(x),b=await command(x,x.fact.lineAllocationId,randomUUID());
 const ar=await execute(x,a),br=await execute(x,b);
 const results=await Promise.allSettled([execute(x,{...a,action:"approve",commandId:randomUUID(),reviewId:ar.reviewId,approvalHash:ar.approvalHash}),execute(x,{...b,action:"approve",commandId:randomUUID(),reviewId:br.reviewId,approvalHash:br.approvalHash})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
});
it.each([
 ["F5","refund"],["F5","credit"],["F7","refund"],["F7","credit"],
] as const)("%s: a real %s writer drives a linked, immutable, replay-safe reversal",async(fixture,kind)=>{
 const x=await realReceiptFixture(f,fixture),{result:original}=await save(x),originalBytes=(await f.admin.query("SELECT row_to_json(a)::text bytes FROM app.stored_receipt_case_allocation a WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,original.allocationId])).rows[0];
 let sourceId:string;
 if(kind==="refund"){
  // Loss/revocation of the original proof cannot prevent a negative correction.
  await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
  await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id::text=$2",[x.context.tenantId,x.fact.approvalRef]));
  await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional full refund"});
  sourceId=(await f.admin.query("SELECT id FROM app.customer_payment_reversal WHERE tenant_id=$1 AND payment_id=$2",[x.context.tenantId,x.paymentId])).rows[0].id;
 }else{
  const preview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:fixture==="F5"?1220000:80000,reason:"Fictional item credit"});
  sourceId=(await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:fixture==="F5"?1220000:80000,reason:"Fictional item credit",previewHash:preview.previewHash})).creditNoteId;
 }
 const snapshot=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 const review=await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"receipt-line-facts-command.v1",action:"review_reverse",commandId:randomUUID(),allocationRevisionId:x.produced.allocationRevisionId,reversalSource:{kind:kind==="refund"?"payment_reversal":"credit_note",sourceId},expectedSourceRevision:snapshot.revision});
 const approval={version:"receipt-line-facts-command.v1",action:"reverse",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash,expectedSourceRevision:review.sourceRevision};
 if(kind==="refund"&&fixture==="F7"){
  await f.admin.query(`CREATE FUNCTION app.receipt_r1_source_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='receipt_facts.reverse' THEN RAISE EXCEPTION 'RECEIPT_R1_SOURCE_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER receipt_r1_source_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.receipt_r1_source_audit_failure()`);
  try{
   await expect(x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,approval)).rejects.toThrow("RECEIPT_R1_SOURCE_AUDIT_FAILURE");
   expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:1}]);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_command WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,approval.commandId])).rows).toEqual([{n:0}]);
  }finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER receipt_r1_source_audit_failure");}
 }
 const negative=await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,approval);
 expect(await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,approval)).toEqual({...negative,replayed:true});
 const after=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId}),line=after.rows.find(r=>r.direction==="reversal"&&r.lineId===x.line)!;
 expect(line.net).toEqual({numerator:fixture==="F5"?"-40000":"-80000",denominator:"1"});
 expect(line.gross).toEqual({numerator:fixture==="F5"?"-48000":"-96000",denominator:"1"});
 expect(line.rule).toBe(fixture==="F5"?"pro_rata":"separate_invoice");
 expect(line.reversesLineAllocationId).toBe(x.fact.lineAllocationId);
 if(kind==="refund"){expect(after.holds).toContain("INVALIDATED_EVIDENCE");expect(after.holds).toContain("APPROVAL_REVOKED");}
 const reversed=await save(x,line.lineAllocationId);
 expect(reversed.result.facts.net).toEqual(line.net);
 expect(await execute(x,reversed.approval)).toEqual({...reversed.result,replayed:true});
 const saved=(await f.admin.query("SELECT net_numerator,net_denominator,reverses_id FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,reversed.result.allocationId])).rows;
 expect(saved).toEqual([{net_numerator:line.net.numerator,net_denominator:"1",reverses_id:original.allocationId}]);
 // Exact cumulative fee arithmetic only; neither fixture authorizes a fee posting.
 const cumulative=serializeExactPence(sumExactPence([original.facts.net,reversed.result.facts.net].map(value=>parseExactPence(value))));
 expect(cumulative).toEqual({numerator:"0",denominator:"1"});
 expect(calculateCumulativeFee({version:"cumulative-fee.v1",cumulativeQualifyingPrincipal:cumulative,rate:{version:"fee-rate.v1",policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},priorNetPostedPence:fixture==="F5"?4000:8000,priorPolicyVersion:"reference_fee_policy_v3",compensatesDerivationId:randomUUID()}).postingDelta.pence).toBe(fixture==="F5"?-4000:-8000);
 expect(reversed.result.facts.reversesId).toBe(original.allocationId);
 expect((await f.admin.query("SELECT row_to_json(a)::text bytes FROM app.stored_receipt_case_allocation a WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,original.allocationId])).rows[0]).toEqual(originalBytes);
 await expect(save(x,line.lineAllocationId)).rejects.toThrow();
});
it("forged money and artifacts are refused at SQL, and private tables have no runtime grant",async()=>{
 const x=await realReceiptFixture(f);
 await expect(finalCheckTenant(f.runtime,x.context.tenantId,db=>db.query("SELECT * FROM app.receipt_allocation_fact_line"))).rejects.toMatchObject({code:"42501"});
 await expect(finalCheckTenant(f.runtime,x.context.tenantId,async db=>{await db.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");return db.query("SELECT app.write_receipt_allocation_facts($1,$2,$3,$4::jsonb,$5::jsonb)",[x.context.tenantId,x.jobId,x.auth.digest,{version:"receipt-line-facts-command.v1",action:"review",commandId:randomUUID(),paymentId:x.paymentId,expectedSourceRevision:2,grossPence:1},{grossPence:1}]);})).rejects.toThrow("INVALID_RECEIPT_LINE_COMMAND");
});
it("positive producer replay is exact; a changed payload and a stale watermark cannot authorize new work",async()=>{
 const x=await realReceiptFixture(f),p={version:"receipt-line-facts-command.v1",action:"approve",commandId:x.produced.commandId,reviewId:x.produced.reviewId,approvalHash:x.produced.approvalHash,expectedSourceRevision:x.produced.sourceRevision};
 expect(await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,p)).toEqual({...x.produced,replayed:true});
 await expect(x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{...p,approvalHash:"b".repeat(64)})).rejects.toThrow("RECEIPT_LINE_IDEMPOTENCY_CONFLICT");
 await expect(x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{version:p.version,action:"review",commandId:randomUUID(),paymentId:x.paymentId,expectedSourceRevision:1})).rejects.toThrow("RECEIPT_LINE_SOURCE_CHANGED");
});
it("unmatched and pending attestations never become neutral money",async()=>{
 const x=await realReceiptFixture(f,"F5"),payment=await x.invoices.recordReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),paidOn:"2026-10-28",amountPence:38400,method:"bank_transfer",reference:"Fictional unmatched receipt"});
 const review={version:"receipt-line-facts-command.v1",action:"review",commandId:randomUUID(),expectedSourceRevision:3,paymentId:payment.paymentId};
 await expect(x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,review)).rejects.toThrow("RECEIPT_LINE_SETTLEMENT_REQUIRED");
 const {PracticeFeedRepository}=await import("../src/practice-feed-repository.js"),feed=new PracticeFeedRepository(f.runtime,"synthetic_demo"),view=await feed.view(x.context,x.actor,x.auth.digest,x.jobId);
 await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:view.revision,movement:"receipt-384",step:"pending"});
 await expect(x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{...review,commandId:randomUUID()})).rejects.toThrow("RECEIPT_LINE_SETTLEMENT_REQUIRED");
 const creditPreview=await x.invoices.previewCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,netPence:32000,reason:"Fictional earlier credit"});
 await x.invoices.issueCredit(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),netPence:32000,reason:"Fictional earlier credit",previewHash:creditPreview.previewHash});
 const pending=await feed.view(x.context,x.actor,x.auth.digest,x.jobId);
 const settled=await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:pending.revision,movement:"receipt-384",step:"settled"});
 await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"match_receipt",commandId:randomUUID(),expectedRevision:settled.revision,movement:"receipt-384",paymentId:payment.paymentId});
 await expect(x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,{...review,commandId:randomUUID()})).rejects.toThrow("RECEIPT_LINE_CREDIT_COMPOSITION_REQUIRED");
});
it("approval tampering and a revoked session cannot allocate",async()=>{
 const x=await realReceiptFixture(f),p=await command(x),review=await execute(x,p);
 await expect(execute(x,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:"b".repeat(64)})).rejects.toThrow("STORED_RECEIPT_APPROVAL_CHANGED");
 await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[x.auth.digest]);
 await expect(execute(x,p)).rejects.toThrow();
 expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:0}]);
});
it("audit failure rolls back the consumer's money, authorization, resolution and command",async()=>{
 const x=await realReceiptFixture(f),p=await command(x),review=await execute(x,p),approval={...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash};
 const decision=(await f.admin.query("SELECT decision_id FROM app.stored_receipt_case_command WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,review.reviewId])).rows[0].decision_id;
 await f.admin.query(`CREATE FUNCTION app.receipt_r1_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.stored_receipt_allocated' THEN RAISE EXCEPTION 'RECEIPT_R1_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER receipt_r1_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.receipt_r1_audit_failure()`);
 try{
  await expect(execute(x,approval)).rejects.toThrow("RECEIPT_R1_AUDIT_FAILURE");
  for(const table of ["action_authorization","decision_resolution"])expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND decision_id=$2`,[x.context.tenantId,decision])).rows).toEqual([{n:0}]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_command WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,approval.commandId])).rows).toEqual([{n:0}]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:0}]);
 }finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER receipt_r1_audit_failure");}
 await expect(execute(x,approval)).resolves.toMatchObject({replayed:false});
});
it("RED catch requirement 1: supplementary binding needs this exact lock and completed check",async()=>{
 const x=await realReceiptFixture(f),other=await realReceiptFixture(f),b=x.fact.invoiceBinding;
 const bound=(await f.admin.query(`SELECT b.invoice_kind,b.lock_id,b.revision_id,b.check_id,ch.status
  FROM app.final_account_invoice_binding b JOIN app.final_account_lock_check ch
  ON(ch.tenant_id,ch.job_id,ch.lock_id,ch.id)=(b.tenant_id,b.job_id,b.lock_id,b.check_id)
  WHERE b.tenant_id=$1 AND b.job_id=$2 AND b.invoice_id=$3`,[x.context.tenantId,x.jobId,x.invoiceId])).rows;
 expect(bound).toEqual([{invoice_kind:"supplementary",lock_id:x.lock.id,revision_id:b.revisionId,check_id:b.checkId,status:"completed"}]);
 const attempt=(invoice:string,check:string)=>finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("SELECT app.receipt_fact_invoice_line($1,$2,$3,$4,$5,$6,$7)",[x.context.tenantId,x.jobId,invoice,x.line,b.revisionId,x.lock.id,check]));
 await expect(attempt(x.invoiceId,b.checkId)).resolves.toBeDefined();
 // Another genuinely completed check does not authorize this invoice/lock.
 await expect(attempt(x.invoiceId,other.fact.invoiceBinding.checkId)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
 // The real original invoice is final, never this catch's supplementary binding.
 await expect(attempt(x.main.invoiceId,b.checkId)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
it("RED catch requirement 2: the case's own variation/revision is mandatory; invoice refs cannot borrow its catch",async()=>{
 const x=await realReceiptFixture(f),{RecoveryCaseRepository}=await import("../src/recovery-case-repository.js");
 const identity=(await f.admin.query(`SELECT c.source_refs,vr.id revision_id,vr.variation_id
  FROM app.recovery_case c JOIN app.variation_revision vr ON vr.tenant_id=c.tenant_id AND vr.job_id=c.job_id AND vr.id=$3
  WHERE c.tenant_id=$1 AND c.id=$2`,[x.context.tenantId,x.caseId,x.fact.commercialRevisionId])).rows[0];
 expect(identity.source_refs).toContain(`variation:${identity.variation_id}`);
 expect(identity.source_refs).toContain(`revision:${identity.revision_id}`);
 const foreignCase=await new RecoveryCaseRepository(x.scoped).command(x.context,x.jobId,{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"withheld_customer_payment",expectedRevision:0,counterparty:"Fictional unrelated recovery",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:[x.invoiceId],claimedNetPence:80000},x.actor);
 const p={...await command(x),caseId:foreignCase.id};
 await expect(execute(x,p)).rejects.toThrow("STORED_RECEIPT_CASE_SOURCE_REQUIRED");
 // Produce a genuine settled original-bill fact, then try assigning it to the
 // catch case. Its correct locked revision must not make it a catch variation.
 const payment=await x.invoices.recordReceipt(x.context,{jobId:x.jobId,invoiceId:x.main.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),paidOn:"2026-10-28",amountPence:38400,method:"bank_transfer",reference:"Fictional original-bill receipt"});
 const {PracticeFeedRepository}=await import("../src/practice-feed-repository.js"),feed=new PracticeFeedRepository(f.runtime,"synthetic_demo"),view=await feed.view(x.context,x.actor,x.auth.digest,x.jobId);
 const settled=await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:view.revision,movement:"receipt-384",step:"settled"});
 await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"match_receipt",commandId:randomUUID(),expectedRevision:settled.revision,movement:"receipt-384",paymentId:payment.paymentId});
 await x.produce(payment.paymentId);
 const snapshot=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId}),original=snapshot.rows.find(row=>row.paymentId===payment.paymentId)!;
 expect(original.invoiceBinding).toMatchObject({invoiceKind:"final",revisionId:x.lock.finalAccountRevisionId});
 await expect(execute(x,await command(x,original.lineAllocationId))).rejects.toThrow("STORED_RECEIPT_CASE_SOURCE_REQUIRED");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:0}]);
 await expect(save(x)).resolves.toMatchObject({result:{facts:{caseId:x.caseId,lineId:x.line}}});
});
