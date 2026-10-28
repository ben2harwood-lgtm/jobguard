// CI ONLY: real PostgreSQL. Parent/source facts are explicitly synthetic fixture
// setup, not evidence that the held 0258 producer has been enabled.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { mapRecoveryReceiptToLines, calculateCumulativeFee } from "@jobguard/core";
import { createLockFixture, closeLockFixture, type LockFixture } from "./recovery-attribution-fixture.js";
import { seedWorkPractice, workTenant } from "./job-work-state-fixtures.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
let f: LockFixture;
const oldEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createLockFixture(); }, 120000);
afterAll(async () => { if (f) await closeLockFixture(f); if (oldEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV=oldEnvironment; });
const hash = "a".repeat(64);
async function fixture(kind: "F5" | "F7" = "F7", options: { wrongJob?: boolean; wrongRevision?: boolean; net?: string } = {}) {
 const p = await seedWorkPractice(f), tenant=p.auth.context.tenantId, job=p.jobId;
 const line=randomUUID(), base=randomUUID(), revision=randomUUID(), lock=randomUUID(), invoice=randomUUID(), payment=randomUUID(), movement=randomUUID();
 const check=randomUUID(), mainInvoice=randomUUID(), source=randomUUID(), fact=randomUUID(), allocationRevision=randomUUID(), scope=randomUUID(), commercial=randomUUID(), caseId=randomUUID(), workId=randomUUID(), account=randomUUID();
 const receiptGross = kind === "F5" ? 1464000 : 96000;
 const lines=[{id:line,invoiceId:invoice,netPence:80000,grossPence:96000,outstandingGross:{numerator:"96000",denominator:"1"},existedAt:"2026-10-02T00:00:00Z"}];
 if(kind === "F5") lines.push({id:base,invoiceId:invoice,netPence:3360000,grossPence:4032000,outstandingGross:{numerator:"2832000",denominator:"1"},existedAt:"2026-10-01T00:00:00Z"});
 const mapped=mapRecoveryReceiptToLines({version:"recovery-receipt-facts.v1",environment:"synthetic_demo",direction:"receipt",compositionComplete:true,
  receipt:{id:payment,invoiceId:invoice,gross:{numerator:String(receiptGross),denominator:"1"},effectiveAt:"2026-10-03T00:00:00Z",sourceRef:movement},lines,
  explicit:null,separateInvoice:kind === "F7" ? {invoiceId:invoice,sourceRef:invoice} : null});
 const catchShare=mapped.find(x=>x.lineId===line)!;
 await workTenant(f.admin,tenant,async db=>{
  // All tested commands below restore origin mode and use the runtime login.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
   VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional catch line',80000,1)`,[line,tenant,job,options.wrongRevision?randomUUID():revision,commercial,scope]);
  await db.query(`INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
   VALUES($1,$2,$3,$4,$5,$6,$6,$6,$6,'{}','I''ve reviewed the work and extras on this job and this is my complete final account.','final_account_declaration.v1','synthetic_final_check_terms.v1',$7,'2026-10-02', $8,$8)`,[tenant,job,lock,revision,randomUUID(),hash,p.auth.membershipId,randomUUID()]);
  await db.query(`INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status)
   VALUES($1,$2,$3,$4,'2026-10-02','completed')`,[tenant,job,check,lock]);
  await db.query(`INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[tenant,job,invoice,kind === "F5"?"final":"supplementary",lock,revision,check]);
  const insertInvoice=async (id:string,rev:string,net:number)=>db.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
   VALUES($1,$2,$3,$4,$5,$6,'2026-10-02','{}','candidate_m1_standard_v1','GBP',$7,$8,$9,$10,$10,$11,true,'SYNTHETIC - NOT A REAL INVOICE')`,[id,tenant,job,rev,randomUUID(),`SYN-${id.slice(0,18)}`,net,Number(BigInt(net)/5n),Number(BigInt(net)*6n/5n),hash,Buffer.from("synthetic fixture PDF placeholder")]);
  await insertInvoice(invoice,revision,kind === "F5"?3440000:80000);
  if(kind === "F7") await insertInvoice(mainInvoice,randomUUID(),3360000);
  await db.query(`INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
   VALUES($1,$2,$3,$4,$5,$6,$7,'baseline',$7,80000,16000,96000)`,[tenant,job,invoice,line,revision,scope,commercial]);
  await db.query(`INSERT INTO app.customer_payment(tenant_id,job_id,id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
   VALUES($1,$2,$3,$4,$5,'2026-10-03',$6,'GBP','bank_transfer','Fictional receipt',true,'manual_builder_attestation')`,[tenant,job,payment,invoice,randomUUID(),receiptGross]);
  await db.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
   VALUES($1,$2,$3,$4,$5,'settled',$6,'settled-'||$6,'identified','feed',$7,'GBP','settled','synthetic_demo','practice-feed-event.v1',$8)`,[movement,tenant,options.wrongJob?randomUUID():job,account,randomUUID(),kind === "F5" ? "receipt-14640":"receipt-960",receiptGross,hash]);
  await db.query(`INSERT INTO app.practice_feed_receipt_match(id,tenant_id,job_id,account_id,command_id,payment_id,movement_key,settled_event_id,matched_pence,currency,environment)
   VALUES($1,$2,$3,$4,$5,$6,$7,'settled-'||$7,$8,'GBP','synthetic_demo')`,[randomUUID(),tenant,job,account,randomUUID(),payment,kind === "F5"?"receipt-14640":"receipt-960",receiptGross]);
  await db.query(`INSERT INTO app.receipt_allocation_fact_revision(tenant_id,job_id,id,command_id,review_id,payment_id,source_hash,source_revision,direction)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,'receipt')`,[tenant,job,allocationRevision,randomUUID(),randomUUID(),payment,hash]);
  await db.query(`INSERT INTO app.receipt_allocation_fact_source(tenant_id,job_id,id,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,source_manifest,receipt_effective_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'{}','2026-10-03')`,[tenant,job,source,allocationRevision,payment,movement,hash,invoice,revision,lock,check,kind === "F5"?"final":"supplementary"]);
  await db.query(`INSERT INTO app.receipt_allocation_fact_line(tenant_id,job_id,id,source_id,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator,original_line_net_pence,original_line_gross_pence,line_existed_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,80000,96000,'2026-10-02')`,[tenant,job,fact,source,invoice,line,scope,commercial,catchShare.rule,catchShare.sourceRef,options.net?"108000":catchShare.gross.numerator,catchShare.gross.denominator,options.net??catchShare.net.numerator,catchShare.net.denominator]);
  if(kind === "F5") {
   const deposit=randomUUID(),depositRevision=randomUUID(),depositSource=randomUUID(),depositMovement=randomUUID();
   const baseline=lines.find(l=>l.id===base)!;
   const depositShares=mapRecoveryReceiptToLines({version:"recovery-receipt-facts.v1",environment:"synthetic_demo",direction:"receipt",compositionComplete:true,
    receipt:{id:deposit,invoiceId:invoice,gross:{numerator:"1200000",denominator:"1"},effectiveAt:"2026-10-01T12:00:00Z",sourceRef:depositMovement},
    lines:[{...baseline,outstandingGross:{numerator:"4032000",denominator:"1"}},lines[0]!],explicit:null,separateInvoice:null});
   expect(depositShares.some(row=>row.lineId===line)).toBe(false);
   await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
    VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional main work',3360000,2)`,[base,tenant,job,revision,randomUUID(),scope]);
   await db.query(`INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
    SELECT tenant_id,job_id,$1,id,final_account_revision_id,scope_item_id,commercial_revision_id,'baseline',source_id,3360000,672000,4032000 FROM app.final_account_line WHERE tenant_id=$2 AND id=$3`,[invoice,tenant,base]);
   await db.query(`INSERT INTO app.customer_payment(tenant_id,job_id,id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
    VALUES($1,$2,$3,$4,$5,'2026-10-01',1200000,'GBP','bank_transfer','Fictional pre-lock deposit',true,'manual_builder_attestation')`,[tenant,job,deposit,invoice,randomUUID()]);
   await db.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash,created_at)
    VALUES($1,$2,$3,$4,$5,'settled','receipt-12000','settled-receipt-12000','identified','feed',1200000,'GBP','settled','synthetic_demo','practice-feed-event.v1',$6,'2026-10-01T12:00:00Z')`,[depositMovement,tenant,job,account,randomUUID(),hash]);
   await db.query(`INSERT INTO app.practice_feed_receipt_match(id,tenant_id,job_id,account_id,command_id,payment_id,movement_key,settled_event_id,matched_pence,currency,environment)
    VALUES($1,$2,$3,$4,$5,$6,'receipt-12000','settled-receipt-12000',1200000,'GBP','synthetic_demo')`,[randomUUID(),tenant,job,account,randomUUID(),deposit]);
   await db.query(`INSERT INTO app.receipt_allocation_fact_revision(tenant_id,job_id,id,command_id,review_id,payment_id,source_hash,source_revision,direction)
    VALUES($1,$2,$3,$4,$5,$6,$7,1,'receipt')`,[tenant,job,depositRevision,randomUUID(),randomUUID(),deposit,hash]);
   await db.query(`INSERT INTO app.receipt_allocation_fact_source(tenant_id,job_id,id,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,source_manifest,receipt_effective_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'final','{}','2026-10-01T12:00:00Z')`,[tenant,job,depositSource,depositRevision,deposit,depositMovement,hash,invoice,revision,lock,check]);
   for(const [src,share] of [[depositSource,depositShares[0]!],[source,mapped.find(row=>row.lineId===base)!]] as const) {
    await db.query(`INSERT INTO app.receipt_allocation_fact_line(tenant_id,job_id,id,source_id,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator,original_line_net_pence,original_line_gross_pence,line_existed_at)
     SELECT tenant_id,job_id,$1,$2,$3,id,scope_item_id,commercial_revision_id,$4,$5,$6,$7,$8,$9,3360000,4032000,'2026-10-01' FROM app.final_account_line WHERE tenant_id=$10 AND id=$11`,[randomUUID(),src,invoice,share.rule,share.sourceRef,share.gross.numerator,share.gross.denominator,share.net.numerator,share.net.denominator,tenant,base]);
   }
  }
  await db.query(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,synthetic,source_refs) VALUES($1,$2,$3,200000,'GBP','identified',true,$4::jsonb)`,[caseId,tenant,job,JSON.stringify([invoice])]);
  await db.query(`INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,200000,'GBP','fixture',$5)`,[randomUUID(),tenant,job,caseId,hash]);
  await db.query(`INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened','identified','fixture',$5,$6)`,[randomUUID(),tenant,job,caseId,randomUUID(),hash]);
  await db.query("SET LOCAL session_replication_role='origin'");
 });
 const command={version:"stored-receipt-case-command.v1" as const,action:"review" as const,commandId:randomUUID(),caseId,workId,factLineId:fact,expectedCaseRevision:2};
 const repo=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo");
 return {...p,tenant,line,base,revision,lock,invoice,mainInvoice,payment,movement,source,fact,scope,commercial,caseId,workId,repo,command,receiptGross,catchShare};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const execute=(x:Fixture,command:unknown)=>x.repo.command(x.auth.context,x.jobId,x.auth.digest,command);
async function save(x:Fixture) {
 const review=await execute(x,x.command);
 const command={...x.command,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash};
 return {result:await execute(x,command),command};
}
it.each(["F5","F7"] as const)("saves %s exactly from stored lines; fee rounding stays in the shared kernel",async kind=>{
 const x=await fixture(kind),{result,command}=await save(x);
 expect(result.facts.net).toEqual({numerator:kind==="F5"?"40000":"80000",denominator:"1"});
 expect(result.facts.rule).toBe(kind==="F5"?"pro_rata":"separate_invoice");
 const stored=(await f.admin.query("SELECT net_numerator,net_denominator,gross_numerator,gross_denominator FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND id=$2",[x.tenant,result.allocationId])).rows[0];
 expect(stored).toEqual({net_numerator:result.facts.net.numerator,net_denominator:"1",gross_numerator:result.facts.gross.numerator,gross_denominator:"1"});
 expect(calculateCumulativeFee({version:"cumulative-fee.v1",cumulativeQualifyingPrincipal:result.facts.net,rate:{version:"fee-rate.v1",policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},priorNetPostedPence:0,priorPolicyVersion:"reference_fee_policy_v3",compensatesDerivationId:null}).cumulativeFee.pence).toBe(kind==="F5"?4000:8000);
 if(kind === "F5") {
  const deposit=(await f.admin.query("SELECT id FROM app.customer_payment WHERE tenant_id=$1 AND job_id=$2 AND amount_pence=1200000 AND paid_on='2026-10-01'",[x.tenant,x.jobId])).rows[0];
  expect(deposit).toBeDefined();
  expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id) WHERE l.tenant_id=$1 AND s.payment_id=$2 AND l.line_id=$3",[x.tenant,deposit.id,x.line])).rows).toEqual([{n:0}]);
 }
 if(kind === "F7") {
  expect((await f.admin.query("SELECT total_pence::text gross FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2",[x.tenant,x.mainInvoice])).rows).toEqual([{gross:"4032000"}]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND invoice_id=$2",[x.tenant,x.mainInvoice])).rows).toEqual([{n:0}]);
 }
 expect(await execute(x,command)).toEqual({...result,replayed:true});
});
it("#346: rejects a movement in another job of the same tenant",async()=>{
 const x=await fixture("F7",{wrongJob:true});await expect(execute(x,x.command)).rejects.toThrow("STORED_RECEIPT_SETTLEMENT_REQUIRED");
});
it("#368: rejects a line outside the revision bound by lock_id",async()=>{
 const x=await fixture("F7",{wrongRevision:true});await expect(execute(x,x.command)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
});
it("#356: rejects net above the immutable line net",async()=>{
 const x=await fixture("F7",{net:"90000"});await expect(execute(x,x.command)).rejects.toThrow("RECEIPT_LINE_CAPACITY_EXCEEDED");
});
it("#356: two work items cannot cite the same line; a second spend cannot reuse the fact",async()=>{
 const x=await fixture();await save(x);
 await expect(execute(x,{...x.command,commandId:randomUUID(),workId:randomUUID()})).rejects.toThrow("STORED_RECEIPT_LINE_ALREADY_BOUND");
 await expect(save(x)).rejects.toThrow();
 expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.tenant,x.jobId])).rows).toEqual([{n:1}]);
});
it("concurrent alternate work assignments conserve the line and append one allocation",async()=>{
 const x=await fixture(),other={...x.command,commandId:randomUUID(),workId:randomUUID()};
 const a=await execute(x,x.command),b=await execute(x,other);
 const results=await Promise.allSettled([execute(x,{...x.command,action:"approve",commandId:randomUUID(),reviewId:a.reviewId,approvalHash:a.approvalHash}),execute(x,{...other,action:"approve",commandId:randomUUID(),reviewId:b.reviewId,approvalHash:b.approvalHash})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
});
it.each(["refund","credit"] as const)("appends a stored %s reversal, preserving original money and exact net",async kind=>{
 const x=await fixture(),{result:original}=await save(x),negative=randomUUID(),source=randomUUID(),revision=randomUUID(),credit=randomUUID();
 const originalRows=(await f.admin.query("SELECT row_to_json(a)::text bytes FROM app.stored_receipt_case_allocation a WHERE tenant_id=$1 AND job_id=$2",[x.tenant,x.jobId])).rows;
 await workTenant(f.admin,x.tenant,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  if(kind==="refund") await db.query("INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason) VALUES($1,$2,$3,$4,$5,'Fictional refund')",[randomUUID(),x.tenant,x.jobId,x.payment,randomUUID()]);
  else await db.query(`INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,net_pence,tax_pence,total_pence,amount_pence,currency,reason,credit_number)
   VALUES($1,$2,$3,$4,$5,-80000,-16000,-96000,96000,'GBP','Fictional credit','SYN-'||$1::text)`,[credit,x.tenant,x.jobId,x.invoice,randomUUID()]);
  await db.query(`INSERT INTO app.receipt_allocation_fact_revision(tenant_id,job_id,id,command_id,review_id,payment_id,source_hash,source_revision,direction)
   VALUES($1,$2,$3,$4,$5,$6,$7,2,'reversal')`,[x.tenant,x.jobId,revision,randomUUID(),randomUUID(),x.payment,hash]);
  await db.query(`INSERT INTO app.receipt_allocation_fact_source(tenant_id,job_id,id,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,source_manifest,receipt_effective_at)
   SELECT tenant_id,job_id,$1,$2,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,$3::jsonb,receipt_effective_at FROM app.receipt_allocation_fact_source WHERE tenant_id=$4 AND id=$5`,[source,revision,JSON.stringify(kind==="credit"?{creditNoteId:credit}:{}),x.tenant,x.source]);
  await db.query(`INSERT INTO app.receipt_allocation_fact_line(tenant_id,job_id,id,source_id,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator,original_line_net_pence,original_line_gross_pence,line_existed_at,reverses_line_allocation_id)
   SELECT tenant_id,job_id,$1,$2,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,'-96000','1','-80000','1',original_line_net_pence,original_line_gross_pence,line_existed_at,id FROM app.receipt_allocation_fact_line WHERE tenant_id=$3 AND id=$4`,[negative,source,x.tenant,x.fact]);
  await db.query("SET LOCAL session_replication_role='origin'");
 });
 const reversed=await save({...x,command:{...x.command,commandId:randomUUID(),factLineId:negative}});
 expect(reversed.result.facts).toMatchObject({net:{numerator:"-80000",denominator:"1"},reversesId:original.allocationId});
 const after=(await f.admin.query("SELECT row_to_json(a)::text bytes FROM app.stored_receipt_case_allocation a WHERE tenant_id=$1 AND job_id=$2",[x.tenant,x.jobId])).rows;
 expect(after).toHaveLength(2);expect(after).toContainEqual(originalRows[0]);
 expect((await f.admin.query("SELECT sum(net_numerator::numeric) n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.tenant,x.jobId])).rows).toEqual([{n:"0"}]);
});
it("strict SQL boundary refuses injected amounts and runtime cannot read private bridge or allocation tables",async()=>{
 const x=await fixture();
 await expect(workTenant(f.runtime,x.tenant,db=>db.query("SELECT * FROM app.stored_receipt_case_allocation"))).rejects.toMatchObject({code:"42501"});
 await expect(workTenant(f.runtime,x.tenant,async db=>{
  await db.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
  await db.query("SELECT app.allocate_stored_receipt_line($1,$2,$3,$4::jsonb)",[x.tenant,x.jobId,x.auth.digest,JSON.stringify({...x.command,netPence:1})]);
 })).rejects.toThrow("INVALID_STORED_RECEIPT_COMMAND");
});
it("a deposit before the catch existed cannot be allocated to it",async()=>{
 const x=await fixture("F5");
 await workTenant(f.admin,x.tenant,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.receipt_allocation_fact_source SET receipt_effective_at='2026-10-01' WHERE tenant_id=$1 AND id=$2",[x.tenant,x.source]);
  await db.query("SET LOCAL session_replication_role='origin'");
 });
 await expect(execute(x,x.command)).rejects.toThrow("STORED_RECEIPT_NOT_AVAILABLE");
});
it("approval tampering and revoked sessions leave allocations absent",async()=>{
 const x=await fixture(),review=await execute(x,x.command);
 await expect(execute(x,{...x.command,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:"b".repeat(64)})).rejects.toThrow("STORED_RECEIPT_APPROVAL_CHANGED");
 await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[x.auth.digest]);
 await expect(execute(x,x.command)).rejects.toThrow();
 expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.tenant,x.jobId])).rows).toEqual([{n:0}]);
});
it("an audit failure rolls back allocation, authorization, resolution and command together",async()=>{
 const x=await fixture(),review=await execute(x,x.command),command={...x.command,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash};
 const decision=(await f.admin.query("SELECT decision_id FROM app.stored_receipt_case_command WHERE tenant_id=$1 AND command_id=$2",[x.tenant,review.reviewId])).rows[0].decision_id;
 await f.admin.query(`CREATE FUNCTION app.stored_receipt_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.stored_receipt_allocated' THEN RAISE EXCEPTION 'STORED_RECEIPT_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER stored_receipt_test_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.stored_receipt_test_audit_failure()`);
 try {
  await expect(execute(x,command)).rejects.toThrow("STORED_RECEIPT_TEST_AUDIT_FAILURE");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_command WHERE tenant_id=$1 AND command_id=$2",[x.tenant,command.commandId])).rows).toEqual([{n:0}]);
  for(const table of ["action_authorization","decision_resolution"]) expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND decision_id=$2`,[x.tenant,decision])).rows).toEqual([{n:0}]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2",[x.tenant,x.jobId])).rows).toEqual([{n:0}]);
 } finally { await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER stored_receipt_test_failure"); }
 await expect(execute(x,command)).resolves.toMatchObject({replayed:false});
});
