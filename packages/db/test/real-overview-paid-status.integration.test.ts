import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startBlankPracticeCompany, authenticatePracticeSession, prepareActivationFixtureV3, PracticeActivationRepository, FinalAccountLockRepository, FinalCheckRepository, JobSourceRepository, FinalCheckCompletionRepository, practiceFinalCheckPorts, practiceMaterialPool } from "../src/index.js";
import { ValueApplication } from "../../../apps/api/src/value/value.application.js";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { FinalAccountLockApplication } from "../../../apps/api/src/final-account-lock.application.js";
import { FinalAccountApplication } from "../../../apps/api/src/final-account.application.js";
import { CustomerInvoiceApplication } from "../../../apps/api/src/customer-invoice.application.js";
import { JobPartiesApplication } from "../../../apps/api/src/job-parties.application.js";
import { ProofApplication, generatePracticePng } from "../../../apps/api/src/proof/proof.application.js";
import { JobWorkStateApplication } from "../../../apps/api/src/job-work-state.application.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); await seedFinalCheckJob(f); }, 240_000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

async function setup(extraNote?: string) {
 const session = await startBlankPracticeCompany(f.runtime, { version: "blank-practice-company.v1", action: "start" });
 const auth = await authenticatePracticeSession(f.runtime, session);
 // Existing fixture prepares only the accepted baseline; seed its missing progress below.
 // All proof, lock, catch,
 // variation, descendant assembly, invoice and receipt effects use application commands.
 const jobId = await prepareActivationFixtureV3(f.admin, auth.context, "Fictional decorating", 20000, f.runtime, 20000, auth.digest);
 await new PracticeActivationRepository(f.runtime).start(auth.context, jobId, { commandId: randomUUID(), scenario: "no_charge" });
 const value = new ValueApplication(f.runtime, session), variations = new VariationApplication(f.runtime, session);
 const accounts = new FinalAccountApplication(f.runtime, session), invoices = new CustomerInvoiceApplication(f.runtime, session);
 const proof = new ProofApplication(f.runtime, session), scope = (await proof.get(jobId)).scopeItemId;
 // Match the proof integration harness: completion transitions existing progress.
 await finalCheckTenant(f.admin, auth.context.tenantId, db => db.query(
  "INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage)VALUES($1,$2,$3,'in_progress')",
  [auth.context.tenantId, jobId, scope]));
 const selected = await proof.command(jobId, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", scopeItemId: scope, fixture: "completion-photo" });
 if(!("upload" in selected)||!selected.upload)throw new Error("Expected generated practice upload");
 const upload = selected.upload;
 const verified = await proof.command(jobId, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: upload.id, objectVersionId: upload.objectVersionId });
 if(!("upload" in verified)||!verified.upload)throw new Error("Expected verified practice upload");
 await proof.command(jobId, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", scopeItemId: scope, evidenceId: verified.upload.evidenceId });
 await new JobSourceRepository(f.runtime).intake(auth.context, jobId, auth.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150" });
 if (extraNote) await new JobSourceRepository(f.runtime).intake(auth.context, jobId, auth.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: extraNote });
 const work = new JobWorkStateApplication(f.runtime, session), before = await work.get(jobId);
 await work.command(jobId, { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: Math.max(0, ...before.events.map(event => event.sequence)), action: "finish" });
 const account = (await accounts.build(jobId, { version: "final-account.assemble.v1", commandId: randomUUID() })).account!;
 const locks = new FinalAccountLockRepository(practiceMaterialPool(f.runtime, auth.digest));
 await locks.acceptTerms(auth.context, { actorMembershipId: auth.membershipId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
 await locks.disposition(auth.context, { jobId, actorMembershipId: auth.membershipId, commandId: randomUUID(), scopeItemId: scope, disposition: "done" });
 const preLock = await value.read(jobId);
 expect(preLock.catchAttention).toEqual([]); expect(preLock.foundAfterLock).toEqual([]);
 await locks.lock(auth.context, { jobId, actorMembershipId: auth.membershipId, commandId: randomUUID(), finalAccountRevisionId: account.id, expectedRevision: account.revision, declarationVersion: "final_account_declaration.v1" });
 const shadow = testTenantContext(auth.context.tenantId, { bound: false });
 const detector = new FinalCheckRepository(f.shadow), manifest = await detector.begin(shadow, jobId);
 const result = await new FinalCheckWorker(practiceFinalCheckPorts(f.shadow, f.runtime, createHash("sha256").update(generatePracticePng("completion-photo")).digest("hex")), "synthetic_demo").execute(shadow, { version: "final-check.task.v1", jobId, manifestId: manifest.id }) as { runId: string };
 await new FinalCheckCompletionRepository(f.shadow).publish(shadow, { version: "final-check-publication.v1", jobId, runId: result.runId, checkId: randomUUID() });
 const catches = new FinalCheckRepository(f.runtime), revealed = await catches.read(auth.context, jobId, auth.digest);
 const ceiling = revealed.items.filter(row => typeof row.description === "string" && row.description.includes("kitchen ceiling"));
 expect(ceiling).toHaveLength(1); // Certificate findings are not this catch.
 const item = ceiling[0]!;
 const confirmed = await catches.confirmCatch(auth.context, jobId, auth.digest, { version: "final-check.catch.v1", commandId: randomUUID(), lockId: revealed.lockId, runId: revealed.runId, signalId: item.signalId, expectedSignalRevision: item.signalRevision }) as { variationId: string };
 const variationIds = [confirmed.variationId];
 if (extraNote) {
  const other = revealed.items.find(row => row.signalId !== item.signalId && typeof row.description === "string" && row.description.includes("hallway ceiling"));
  expect(other).toBeDefined();
  const saved = await catches.confirmCatch(auth.context, jobId, auth.digest, { version: "final-check.catch.v1", commandId: randomUUID(), lockId: revealed.lockId, runId: revealed.runId, signalId: other!.signalId, expectedSignalRevision: other!.signalRevision }) as { variationId: string };
  variationIds.push(saved.variationId);
 }
 const issue = async (invoiceKind: "final" | "supplementary" = "final") => {
  const current = (await accounts.get(jobId)).account!;
  await new FinalAccountLockApplication(f.runtime, session).issueInvoice(jobId, { version: "lock-bound-invoice.issue.v1", invoiceKind, commandId: randomUUID(), finalAccountRevisionId: current.id, expectedSourceHash: current.sourceHash, recipient: "fictional@example.invalid", issuedOn: "2026-11-11" });
  return (await invoices.get(jobId)).invoices;
 };
 return { session, auth, jobId, value, variations, accounts, invoices, issue, variationIds, variationId: confirmed.variationId };
}

it("own-job overview payments agree with saved invoice views", async () => {
 const a=await setup();
 const compare=async()=>{
  const groups=await a.invoices.listForJobs([a.jobId]);
  const saved=await a.invoices.get(a.jobId);
  expect(groups).toEqual([saved]);
  for(const invoice of saved.invoices){
   const receipt=await a.invoices.receiptView(a.jobId,invoice.id);
   expect(receipt.invoice).toEqual(invoice);
  }
  return saved.invoices;
 };
 expect(await compare()).toEqual([]);
 const main=(await a.issue())[0]!;
 expect((await compare())[0]!.balancePence).toBe(main.totalPence);
 const record=async(amountPence:number,invoiceId=main.id)=>a.invoices.recordReceipt(a.jobId,{
  version:"practice-customer-receipt.record.v1",commandId:randomUUID(),invoiceId,amountPence,
  paidOn:"2026-11-13",method:"bank_transfer",reference:"Fictional overview receipt",
 });
 await record(1000);
 expect((await compare())[0]).toMatchObject({paidPence:1000,balancePence:main.totalPence-1000});
 await record(main.totalPence-1000);
 expect((await compare())[0]).toMatchObject({paidPence:main.totalPence,balancePence:0});
 const revisionId=randomUUID();
 await a.variations.command(a.jobId,{version:"variation-command.v1",action:"revise",variationId:a.variationId,revisionId,expectedRevisionId:null,description:"Fictional ceiling extra",price:{quantity:"1",unit:"item",unitRatePence:15000,direction:"addition"}});
 await a.variations.command(a.jobId,{version:"variation-command.v1",action:"approve",variationId:a.variationId,revisionId,approvalId:randomUUID(),attestation:"Builder-recorded practice acceptance — not an authenticated customer signature"});
 await a.accounts.build(a.jobId,{version:"final-account.assemble.v1",commandId:randomUUID()});
 const supplementary=(await a.issue("supplementary")).find(i=>i.id!==main.id)!;
 expect((await compare()).find(i=>i.id===supplementary.id)!.balancePence).toBe(supplementary.totalPence);
 await record(supplementary.totalPence); // overpayment on main cannot clear supplementary debt
 const overpaid=await compare();
 expect(overpaid.find(i=>i.id===main.id)!.customerCreditPence).toBe(supplementary.totalPence);
 expect(overpaid.find(i=>i.id===supplementary.id)!.balancePence).toBe(supplementary.totalPence);
 const credit={version:"practice-credit-note.preview.v1",invoiceId:supplementary.id,netPence:15000,reason:"Fictional correction"};
 const preview=await a.invoices.previewCredit(a.jobId,credit);
 await a.invoices.issueCredit(a.jobId,{...credit,version:"practice-credit-note.issue.v1",commandId:randomUUID(),previewHash:preview.previewHash});
 expect((await compare()).find(i=>i.id===supplementary.id)).toMatchObject({creditedPence:supplementary.totalPence,balancePence:0});
 const receipts=(await a.invoices.receiptView(a.jobId,main.id)).receipts;
 for(const receipt of receipts){
  await a.invoices.reverseReceipt(a.jobId,{version:"practice-customer-receipt.reverse.v1",commandId:randomUUID(),invoiceId:main.id,paymentId:receipt.id,reason:"Fictional reversed receipt"});
  await compare();
 }
 expect((await compare()).find(i=>i.id===main.id)).toMatchObject({paidPence:0,balancePence:main.totalPence});
 // A second firm uses the same tenant and receives its own independently issued bill.
 const b=await setup();
 expect(b.auth.context.tenantId).toBe(a.auth.context.tenantId);
 const before=await compare();
 const parties=new JobPartiesApplication(f.runtime), principal={sessionId:a.session};
 const view=await parties.view(principal,a.jobId);
 const imported=await parties.adopt(principal,a.jobId,{version:"job-parties-import.v1",commandId:randomUUID(),expectedBindingId:view.current!.bindingId});
 expect((await parties.list(principal)).jobs.map(j=>j.id)).toContain(imported.jobId);
 expect(await a.invoices.listForJobs([imported.jobId])).toEqual([{version:1,environment:"synthetic_demo",jobId:imported.jobId,invoices:[]}]);
 expect((await parties.list(principal)).jobs.map(j=>j.id)).not.toContain(b.jobId);
 const other=(await b.issue())[0]!;
 await b.invoices.recordReceipt(b.jobId,{version:"practice-customer-receipt.record.v1",commandId:randomUUID(),invoiceId:other.id,amountPence:other.totalPence,paidOn:"2026-11-13",method:"bank_transfer",reference:"Other fictional firm"});
 expect(await compare()).toEqual(before);
 await expect(a.invoices.listForJobs([b.jobId])).rejects.toThrow();
 await expect(a.invoices.listForJobs([a.jobId,b.jobId])).rejects.toThrow();
 await expect(b.invoices.listForJobs([a.jobId])).rejects.toThrow();
 const foreignTenant=randomUUID(),foreignJob=randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[foreignTenant]);
 await finalCheckTenant(f.admin,foreignTenant,db=>db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Other tenant fictional job')",[foreignJob,foreignTenant]));
 await expect(a.invoices.listForJobs([foreignJob])).rejects.toThrow();
 expect(await compare()).toEqual(before);
 // A genuinely separate tenant shares this database, not the practice firm's tenant.
 const ownJobIds=[a.jobId,imported.jobId];
 const ownGroupsBefore=await a.invoices.listForJobs(ownJobIds);
 const foreign=await meterCompany({admin:f.admin,runtime:f.runtime} as unknown as WorkFixture);
 expect(foreign.tenantId).not.toBe(a.auth.context.tenantId);
 const quoteId=randomUUID(),draftId=randomUUID(),foreignRevisionId=randomUUID(),hash="a".repeat(64);
 const net=10000,tax=2000,total=12000;
 await f.admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')",[quoteId,foreign.tenantId,foreign.jobId,hash,net]);
 await f.admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[draftId,foreign.tenantId,foreign.jobId]);
 await f.admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
  VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`,[foreignRevisionId,foreign.tenantId,foreign.jobId,draftId,hash,quoteId,net,tax,total]);
 await f.admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2",[foreign.tenantId,draftId,foreignRevisionId]);
 await f.admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
  VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Other tenant fictional baseline',$7,1)`,[randomUUID(),foreign.tenantId,foreign.jobId,foreignRevisionId,quoteId,foreign.scopeId,net]);
 // Synthetic lock/completion prerequisites, then real runtime issue and receipt commands.
 // This completion is fixture-generated, not another Final Check worker journey.
 await prepareInvoicePrerequisites(f.admin,f.runtime,foreign.tenantId,foreign.jobId,foreign.actorId,foreignRevisionId);
 const foreignInvoices=new PracticeInvoiceRepository(f.runtime);
 const foreignInvoice=await foreignInvoices.issue(foreign.context,{jobId:foreign.jobId,finalAccountRevisionId:foreignRevisionId,actorMembershipId:foreign.actorId,commandId:randomUUID(),recipient:"other-tenant@example.invalid",issuedOn:"2026-11-13"});
 expect(foreignInvoice.id).toBeTruthy();
 await foreignInvoices.recordReceipt(foreign.context,{jobId:foreign.jobId,invoiceId:foreignInvoice.id,actorMembershipId:foreign.actorId,commandId:randomUUID(),amountPence:total,paidOn:"2026-11-13",method:"bank_transfer",reference:"Other tenant fictional full payment"});
 const foreignSaved=await foreignInvoices.list(foreign.context,foreign.jobId);
 expect(foreignSaved).toHaveLength(1);
 expect(foreignSaved[0]).toMatchObject({id:foreignInvoice.id,netPence:net,taxPence:tax,totalPence:total,paidPence:total,balancePence:0});
 expect(foreignSaved[0]!.paidPence).toBe(foreignSaved[0]!.totalPence);
 expect(await a.invoices.listForJobs(ownJobIds)).toEqual(ownGroupsBefore);
 expect((await parties.list(principal)).jobs.map(j=>j.id)).not.toContain(foreign.jobId);
 await expect(a.invoices.listForJobs([foreign.jobId])).rejects.toThrow("NOT_FOUND");
 await expect(a.invoices.listForJobs([a.jobId,foreign.jobId])).rejects.toThrow("NOT_FOUND");
 const ownGroupsAfter=await a.invoices.listForJobs(ownJobIds);
 expect(ownGroupsAfter).toEqual(ownGroupsBefore);
 expect(ownGroupsAfter.find(group=>group.jobId===a.jobId)!.invoices.find(invoice=>invoice.id===main.id)).toMatchObject({paidPence:0,balancePence:main.totalPence});
 expect(ownGroupsAfter.find(group=>group.jobId===imported.jobId)).toEqual({version:1,environment:"synthetic_demo",jobId:imported.jobId,invoices:[]});
 // Reverse direction proves repository tenant isolation, not a practice-session journey.
 expect(await foreignInvoices.list(foreign.context,a.jobId)).toEqual([]);
 expect(await a.invoices.listForJobs([])).toEqual([]);
},240_000);
