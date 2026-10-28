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
// All financial parents use the real synthetic command writers with triggers and FKs enabled.
async function financialParents(x:Awaited<ReturnType<typeof published>>,withCredit=true){
 const {PracticeInvoiceRepository}=await import("../src/practice-invoice-repository.js");
 const {practiceMaterialPool}=await import("../src/practice-session.js");
 const ids=await invoicedCatch(x),repo=new PracticeInvoiceRepository(practiceMaterialPool(f.runtime,x.a.digest));
 const {paymentId:payment}=await repo.recordReceipt(x.a.context,{jobId:x.a.jobId,invoiceId:ids.invoice,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),paidOn:"2026-10-28",amountPence:132001,method:"cash",reference:"Fictional receipt"});
 let credit:string|null=null;
 if(withCredit){
  const input={jobId:x.a.jobId,invoiceId:ids.invoice,netPence:83,reason:"Fictional whole-invoice credit"};
  const preview=await repo.previewCredit(x.a.context,input);
  const issued=await repo.issueCredit(x.a.context,{...input,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),previewHash:preview.previewHash});
  expect(issued.totalPence).toBe(-100);credit=issued.creditNoteId;
 }
 return {...ids,payment,credit,repo};
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
 expect(finding.sourceSnapshot.compared).toMatchObject({receiptPence:"132001",accountPence:"132000",lockId:x.lockId,basis:"gross"});
 await ids.repo.reverseReceipt(x.a.context,{jobId:x.a.jobId,invoiceId:ids.invoice,paymentId:ids.payment,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),reason:"Fictional reversal"});
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

async function invoicedCatch(x:Awaited<ReturnType<typeof published>>){
 const {priceVariation,approveVariation}=await import("@jobguard/core");
 const {insertPricedVariation,approvePricedVariation}=await import("../src/variation-repository.js");
 const {withTenant}=await import("../src/tenant-context.js");
 const {FinalAccountLockRepository}=await import("../src/final-account-lock-repository.js");
 const {practiceMaterialPool}=await import("../src/practice-session.js");
 const a=x.a,invoices=new FinalAccountLockRepository(practiceMaterialPool(f.runtime,a.digest));
 const input={jobId:a.jobId,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:"a".repeat(64),invoiceKind:"final" as const,recipient:"fictional@example.invalid",issuedOn:"2026-10-28"};
 const main=await invoices.issueInvoice(a.context,input);
 const confirmed=await new FinalCheckRepository(f.runtime).confirmCatch(a.context,a.jobId,a.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:x.lockId,runId:x.runId,signalId:x.signal,expectedSignalRevision:1}) as {variationId:string};
 const v=(await f.admin.query("SELECT scope_item_id,description FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,confirmed.variationId])).rows[0];
 const proposal={version:"variation-proposal.v1" as const,id:confirmed.variationId,jobId:a.jobId,scopeItemId:v.scope_item_id,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text" as const,captureText:v.description,description:v.description,suggestion:null};
 const priced=priceVariation({id:randomUUID(),variationId:confirmed.variationId,previous:null,proposal,description:v.description,contentHash:"e".repeat(64),
  confirmed:{quantity:"1",unit:"item",unitRatePence:10000,direction:"addition",confirmedByMembershipId:FINAL_CHECK_ACTOR,rateProvenance:{kind:"human_entered",sourceRef:"synthetic://builder-entered",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}});
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,priced));
 const approval=approveVariation({...priced,state:"priced"} as never,{id:randomUUID(),revisionId:priced.id,revision:priced.revision,contentHash:priced.contentHash,signedDeltaPence:priced.signedDeltaPence,method:"builder_attestation",actorMembershipId:FINAL_CHECK_ACTOR,evidenceId:null,approvedAt:new Date("2026-10-28T19:00:00Z")});
 await withTenant(f.runtime,a.context,db=>approvePricedVariation(db,a.tenantId,confirmed.variationId,approval));
 const descendant=randomUUID(),line=randomUUID(),hash="b".repeat(64);
 // Ordinary immutable fixture assembly, with all triggers/FKs enabled. The issued
 // invoice/binding/line rows below are created only by the production issue path.
 await finalCheckTenant(f.admin,a.tenantId,async db=>{
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,110000,22000,132000,false,findings FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4`,[descendant,hash,a.tenantId,a.revisionId]);
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
   SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND job_id=$3 AND final_account_revision_id=$4`,[descendant,a.tenantId,a.jobId,a.revisionId]);
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
   VALUES($1,$2,$3,$4,'variation',$5,$6,$5,$7,$8,10000,2)`,[line,a.tenantId,a.jobId,descendant,priced.id,v.scope_item_id,approval.id,v.description]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND job_id=$3",[descendant,a.tenantId,a.jobId]);
 });
 const supplementary=await invoices.issueInvoice(a.context,{...input,commandId:randomUUID(),finalAccountRevisionId:descendant,expectedSourceHash:hash,invoiceKind:"supplementary"});
 expect(supplementary).toMatchObject({lockId:x.lockId,netPence:10000,taxPence:2000,totalPence:12000});
 expect((await f.admin.query("SELECT final_account_line_id,revision_id,source_id FROM app.final_account_invoiced_line WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,supplementary.invoiceId])).rows).toEqual([{final_account_line_id:line,revision_id:descendant,source_id:priced.id}]);
 expect((await f.admin.query("SELECT final_account_line_id FROM app.final_account_invoiced_line WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,main.invoiceId])).rows).toEqual([{final_account_line_id:a.lineId}]);
 return {invoice:supplementary.invoiceId,line,pricedRevision:priced.id,variation:confirmed.variationId};
}
it("CH-6 published catch on a real supplementary descendant cites its issued line and original lock",async()=>{
 const x=await published(),a=x.a,ids=await invoicedCatch(x);
 expect(ids.pricedRevision).not.toBe(ids.variation);
 const evidence=await insertFinalCheckEvidence(f,a,"writeoff_record","application/pdf",1);
 await finalCheckTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.ch6_line_correction_source(tenant_id,job_id,id,session_digest,correction_kind,invoice_id,line_id,lock_id,evidence_id,amount_pence,authority_ref)
  VALUES($1,$2,$3,$4,'writeoff',$5,$6,$7,$8,1,'synthetic_fixture:supplementary-writeoff')`,[a.tenantId,a.jobId,randomUUID(),a.digest,ids.invoice,ids.line,x.lockId,evidence]));
 const {finding}=await save(a,"catch_line_credit_or_writeoff");
 expect(finding.sourceSnapshot.compared).toMatchObject({lineId:ids.line,lockId:x.lockId,correctionKind:"writeoff"});
 expect(finding.sourceSnapshot.facts.find(f=>"catchId" in f)).toMatchObject({catchId:x.signal,invoiceLineId:ids.line,includedInLockedAccount:false,value:{pence:12000,basis:"gross"}});
});
