// CI ONLY: real published Final Check and read/review projections with fictional financial parents.
import { createHash,randomUUID } from "node:crypto";
import { beforeAll,afterAll,it,expect } from "vitest";
import { canonicalCommercialIntegritySnapshot } from "@jobguard/core";
import { CommercialIntegrityV3Repository } from "../src/commercial-integrity-v3-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,insertFinalCheckEvidence,finalCheckProposal,finalCheckTenant,FINAL_CHECK_ACTOR,FINAL_CHECK_USER,type FinalCheckFixture,type FinalCheckJob } from "./final-check-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();process.env.JOBGUARD_ENV="synthetic_demo";},120000);
const previous=process.env.JOBGUARD_ENV;
afterAll(async()=>{await closeFinalCheckFixture(f);if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;});
const actor={membershipId:FINAL_CHECK_ACTOR,identityUserId:FINAL_CHECK_USER};
async function published(){
 const a=await seedFinalCheckJob(f),evidence=await insertFinalCheckEvidence(f,a,"completion_photo","image/png",1),signal=await finalCheckProposal(f,a,evidence);
 await a.lock();const worker=new FinalCheckRepository(f.shadow),manifest=await worker.begin(a.context,a.jobId),source=manifest.sources.find(s=>s.evidenceId===evidence)!;
 await worker.record(a.context,a.jobId,manifest.id,source.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:source.inputHash,status:"detected",failureCode:null,signalIds:[signal]});
 const result=await worker.reconcile(a.context,a.jobId,manifest.id,[{signalId:signal,expectedRevision:0,outcome:"reveal",references:[],comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]}}]) as {runId:string;lockId:string};
 return {a,evidence,signal,...result};
}
async function save(a:FinalCheckJob,kind:string){
 const repo=new CommercialIntegrityV3Repository(f.runtime),view=await repo.read(a.context,actor,a.digest,a.jobId),finding=view.result.findings.find(f=>f.kind===kind);expect(finding,kind).toBeDefined();
 const raw={version:"commercial-integrity-review.v3",commandId:randomUUID(),findingKey:finding!.key,findingSnapshotHash:createHash("sha256").update(canonicalCommercialIntegritySnapshot(finding!.sourceSnapshot)).digest("hex"),outcome:"dismissed_false_positive",explanation:"Fictional published source review."};
 const first=await repo.review(a.context,actor,a.digest,a.jobId,raw);expect(await repo.review(a.context,actor,a.digest,a.jobId,raw)).toEqual(first);return {finding:finding!,raw};
}
it("CH-6 published not-completed advice cites the exact verified original evidence and immutable locked bill",async()=>{
 const x=await published();await new FinalCheckRepository(f.runtime).disposition(x.a.context,x.a.jobId,x.a.digest,{version:"final-check.disposition.v1",commandId:randomUUID(),lockId:x.lockId,runId:x.runId,signalId:x.signal,expectedSignalRevision:1,answer:"not_completed",referenceId:null});
 const {finding,raw}=await save(x.a,"dismissed_not_completed_with_completion_evidence");
 expect(finding.sourceSnapshot.compared.lockId).toBe(x.lockId);expect(finding.sourceReferences.some(s=>s.sourceId===x.lockId)).toBe(true);
 const forged={...finding.sourceSnapshot,facts:finding.sourceSnapshot.facts.map(f=>"lockId" in f?{...f,lockId:randomUUID()}:f)};
 await expect(finalCheckTenant(f.runtime,x.a.tenantId,db=>db.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4::jsonb,$5::jsonb)",[x.a.tenantId,x.a.jobId,x.a.digest,JSON.stringify({...raw,commandId:randomUUID()}),JSON.stringify(forged)]))).rejects.toThrow("INTEGRITY_SOURCE_CHANGED");
 const visible=await new CommercialIntegrityV3Repository(f.runtime).read(x.a.context,actor,x.a.digest,x.a.jobId);expect(visible.published).toBeNull();
});
// Projection fixture only: the financial parent INSERTs below are synthetic setup with predecessor checks disabled.
// The CH-6 line-source guard, FK boundaries, source reader, review writer and RLS run with all checks enabled.
async function financialParents(x:Awaited<ReturnType<typeof published>>,withCredit=true){
 const invoice=randomUUID(),payment=randomUUID(),line=randomUUID(),credit=randomUUID(),variation=randomUUID(),scope=randomUUID();
 await finalCheckTenant(f.admin,x.a.tenantId,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
  VALUES($1,$2,$3,$4,$5,$6,current_date,'{}','candidate_m1_standard_v1','GBP',200000,0,200000,repeat('a',64),repeat('a',64),$7,true,'SYNTHETIC')`,[invoice,x.a.tenantId,x.a.jobId,x.a.revisionId,randomUUID(),`CH6-${invoice.replaceAll('-','').slice(0,24)}`,Buffer.from('fictional')]);
  await db.query(`INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
  VALUES($1,$2,$3,$4,$5,current_date,130001,'GBP','cash','fictional',true,'manual_builder_attestation')`,[payment,x.a.tenantId,x.a.jobId,invoice,randomUUID()]);
  if(withCredit)await db.query(`INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason) VALUES($1,$2,$3,$4,$5,$6,100,'GBP','fictional')`,[credit,x.a.tenantId,x.a.jobId,invoice,randomUUID(),`CN-${credit.replaceAll('-','').slice(0,24)}`]);
  await db.query(`INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES($1,$2,$3,'final',$4,$5,$6)`,[x.a.tenantId,x.a.jobId,invoice,x.lockId,x.a.revisionId,randomUUID()]);
  await db.query(`INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence) VALUES($1,$2,$3,$4,$5,$6,$7,'variation',$8,10000,0,10000)`,[x.a.tenantId,x.a.jobId,invoice,line,x.a.revisionId,scope,randomUUID(),variation]);
  await db.query(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id) VALUES($1,$2,$3,'small_builder','jobguard_catch',$4,$5,'owner','command',$6)`,[x.a.tenantId,x.a.jobId,variation,randomUUID(),FINAL_CHECK_ACTOR,x.signal]);
  // A genuine published confirmation is represented by this ordinary binding, with an already-published proof.
  await db.query(`INSERT INTO app.final_check_disposition_binding(tenant_id,job_id,disposition_id,run_id,signal_id,lock_id,expected_signal_revision,command_id,actor_membership_id,identity_user_id,answer,request_hash,audit_event_id)
  VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'confirmed_extra',repeat('a',64),$10)`,[x.a.tenantId,x.a.jobId,randomUUID(),x.runId,x.signal,x.lockId,randomUUID(),FINAL_CHECK_ACTOR,FINAL_CHECK_USER,randomUUID()]);
  await db.query("SET LOCAL session_replication_role='origin'");
 });return {invoice,payment,line,credit};
}
it("CH-6 whole-invoice credits refuse attribution; exact synthetic line sources conserve credit/line limits and cite this bill",async()=>{
 const x=await published(),ids=await financialParents(x),repo=new CommercialIntegrityV3Repository(f.runtime);
 const before=await repo.read(x.a.context,actor,x.a.digest,x.a.jobId);expect(before.availability).toContain("credit_line_source_unavailable");expect(before.result.findings.some(f=>f.kind==="catch_line_credit_or_writeoff")).toBe(false);
 const sql=`INSERT INTO app.ch6_line_correction_source(tenant_id,job_id,id,session_digest,correction_kind,invoice_id,line_id,lock_id,credit_note_id,amount_pence,authority_ref) VALUES($1,$2,$3,$4,'credit',$5,$6,$7,$8,$9,$10)`;
 const values=[x.a.tenantId,x.a.jobId,randomUUID(),x.a.digest,ids.invoice,ids.line,x.lockId,ids.credit,60,'synthetic_fixture:credit-1'];
 await finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(sql,values));await save(x.a,"catch_line_credit_or_writeoff");
 await expect(finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(sql,[...values.slice(0,2),randomUUID(),...values.slice(3,8),41,'synthetic_fixture:credit-overflow']))).rejects.toThrow("INTEGRITY_ALLOCATION_LIMIT");
 await expect(finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(sql,values))).rejects.toMatchObject({code:"23505"});
 await expect(finalCheckTenant(f.runtime,x.a.tenantId,db=>db.query("SELECT * FROM app.ch6_line_correction_source"))).rejects.toMatchObject({code:"42501"});
 await expect(finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(sql,[...values.slice(0,2),randomUUID(),...values.slice(3,6),randomUUID(),ids.credit,1,'synthetic_fixture:wrong-lock']))).rejects.toThrow("INTEGRITY_SOURCE_CHANGED");
});
it("CH-6 receipts compare to the exact locked gross bill, deduplicate reads and remove reversed receipts",async()=>{
 const x=await published(),ids=await financialParents(x,false);
 const {finding}=await save(x.a,"receipts_exceed_locked_account_and_confirmed_catches");
 expect(finding.sourceSnapshot.compared).toMatchObject({receiptPence:"130001",accountPence:"130000",lockId:x.lockId,basis:"gross"});
 await finalCheckTenant(f.admin,x.a.tenantId,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason) VALUES($1,$2,$3,$4,$5,'fictional reversal')",[randomUUID(),x.a.tenantId,x.a.jobId,ids.payment,randomUUID()]);
  await db.query("SET LOCAL session_replication_role='origin'");
 });
 const view=await new CommercialIntegrityV3Repository(f.runtime).read(x.a.context,actor,x.a.digest,x.a.jobId);
 expect(view.result.findings.some(f=>f.kind==="receipts_exceed_locked_account_and_confirmed_catches")).toBe(false);expect(view.published).toBeNull();
});
it("CH-6 a line-specific synthetic writeoff requires verified same-job evidence and invalidation removes advice",async()=>{
 const x=await published(),ids=await financialParents(x,false),evidence=await insertFinalCheckEvidence(f,x.a,"writeoff_record","application/pdf",1);
 const sql=`INSERT INTO app.ch6_line_correction_source(tenant_id,job_id,id,session_digest,correction_kind,invoice_id,line_id,lock_id,evidence_id,amount_pence,authority_ref)
 VALUES($1,$2,$3,$4,'writeoff',$5,$6,$7,$8,1,$9)`;
 const values=[x.a.tenantId,x.a.jobId,randomUUID(),x.a.digest,ids.invoice,ids.line,x.lockId,evidence,'synthetic_fixture:writeoff'];
 await finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(sql,values));const {finding}=await save(x.a,"catch_line_credit_or_writeoff");expect(finding.sourceSnapshot.compared.correctionKind).toBe("writeoff");
 await finalCheckTenant(f.admin,x.a.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.a.tenantId,evidence,FINAL_CHECK_ACTOR]));
 const view=await new CommercialIntegrityV3Repository(f.runtime).read(x.a.context,actor,x.a.digest,x.a.jobId);
 expect(view.result.findings.some(f=>f.kind==="catch_line_credit_or_writeoff")).toBe(false);expect(view.availability).toContain("writeoff_line_source_unavailable");
 await expect(finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(sql,[...values.slice(0,2),randomUUID(),...values.slice(3,8),'synthetic_fixture:invalid-writeoff']))).rejects.toThrow("INTEGRITY_SOURCE_UNAVAILABLE");
});
it("CH-6 explicit allocation port refuses quarantine facts rather than inventing source authority",async()=>{
 const x=await published(),view=await new CommercialIntegrityV3Repository(f.runtime).read(x.a.context,actor,x.a.digest,x.a.jobId);
 expect(view.availability).toContain("receipt_line_source_handoff_unavailable");expect(view.result.unavailable).toContainEqual({kind:"explicit_allocations_avoid_catch_lines",reason:"source_absent"});
 expect(view.result.findings.some(f=>f.kind==="explicit_allocations_avoid_catch_lines")).toBe(false);
});
it("CH-6 competing line mappings cannot overrun one credit and unsupported isolation refuses",async()=>{
 const x=await published(),ids=await financialParents(x);
 const insert=(ref:string)=>finalCheckTenant(f.admin,x.a.tenantId,db=>db.query(`INSERT INTO app.ch6_line_correction_source(tenant_id,job_id,id,session_digest,correction_kind,invoice_id,line_id,lock_id,credit_note_id,amount_pence,authority_ref)
 VALUES($1,$2,$3,$4,'credit',$5,$6,$7,$8,60,$9)`,[x.a.tenantId,x.a.jobId,randomUUID(),x.a.digest,ids.invoice,ids.line,x.lockId,ids.credit,`synthetic_fixture:${ref}`]));
 const outcomes=await Promise.allSettled([insert("race-a"),insert("race-b")]);expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1);
 const total=(await f.admin.query("SELECT sum(amount_pence)::text total FROM app.ch6_line_correction_source WHERE tenant_id=$1 AND credit_note_id=$2",[x.a.tenantId,ids.credit])).rows[0].total;expect(total).toBe("60");
 const db=await f.admin.connect();try{
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.a.tenantId]);
  await expect(db.query(`INSERT INTO app.ch6_line_correction_source(tenant_id,job_id,id,session_digest,correction_kind,invoice_id,line_id,lock_id,credit_note_id,amount_pence,authority_ref) VALUES($1,$2,$3,$4,'credit',$5,$6,$7,$8,1,'synthetic_fixture:wrong-isolation')`,[x.a.tenantId,x.a.jobId,randomUUID(),x.a.digest,ids.invoice,ids.line,x.lockId,ids.credit])).rejects.toMatchObject({code:"40001"});
 }finally{await db.query("ROLLBACK");db.release();}
});
