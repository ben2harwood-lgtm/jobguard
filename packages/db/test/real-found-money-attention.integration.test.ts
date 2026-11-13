import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startBlankPracticeCompany, authenticatePracticeSession, prepareActivationFixtureV3, PracticeActivationRepository, FinalAccountLockRepository, FinalCheckRepository, JobSourceRepository, FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/index.js";
import { ValueApplication } from "../../../apps/api/src/value/value.application.js";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { FinalAccountLockApplication } from "../../../apps/api/src/final-account-lock.application.js";
import { FinalAccountApplication } from "../../../apps/api/src/final-account.application.js";
import { CustomerInvoiceApplication } from "../../../apps/api/src/customer-invoice.application.js";
import { ProofApplication, generatePracticePng } from "../../../apps/api/src/proof/proof.application.js";
import { JobWorkStateApplication } from "../../../apps/api/src/job-work-state.application.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, insertFinalCheckEvidence, finalCheckProposal, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";

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
 const upload = selected.upload!;
 const verified = await proof.command(jobId, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: upload.id, objectVersionId: upload.objectVersionId });
 await proof.command(jobId, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", scopeItemId: scope, evidenceId: verified.upload!.evidenceId });
 await new JobSourceRepository(f.runtime).intake(auth.context, jobId, auth.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150" });
 if (extraNote) await new JobSourceRepository(f.runtime).intake(auth.context, jobId, auth.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: extraNote });
 const work = new JobWorkStateApplication(f.runtime, session), before = await work.get(jobId);
 await work.command(jobId, { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: Math.max(0, ...before.events.map(event => event.sequence)), action: "finish" });
 const account = (await accounts.build(jobId, { version: "final-account.assemble.v1", commandId: randomUUID() })).account!;
 const locks = new FinalAccountLockRepository(f.runtime);
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

it("paid main bill still flags an approved unbilled catch; a supplementary invoice removes only that source even after a credit or reversal", async () => {
 const a = await setup();
 expect((await a.value.read(a.jobId)).catchAttention).toEqual([expect.objectContaining({ status: "needs_price", pence: null })]);
 const main = (await a.issue())[0]!;
 await a.invoices.recordReceipt(a.jobId, { version: "practice-customer-receipt.record.v1", commandId: randomUUID(), invoiceId: main.id, amountPence: main.totalPence, paidOn: "2026-11-11", method: "bank_transfer", reference: "Fictional main bill" });
 const revisionId = randomUUID();
 await a.variations.command(a.jobId, { version: "variation-command.v1", action: "revise", variationId: a.variationId, revisionId, expectedRevisionId: null, description: "Painted the kitchen ceiling", price: { quantity: "1", unit: "item", unitRatePence: 15000, direction: "addition" } });
 expect((await a.value.read(a.jobId)).catchAttention).toEqual([expect.objectContaining({ status: "needs_approval", pence: 15000 })]);
 await a.variations.command(a.jobId, { version: "variation-command.v1", action: "approve", variationId: a.variationId, revisionId, approvalId: randomUUID(), attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
 expect((await a.value.read(a.jobId)).catchAttention).toEqual([expect.objectContaining({ status: "ready_to_invoice", revisionId, pence: 15000 })]);
 await a.accounts.build(a.jobId, { version: "final-account.assemble.v1", commandId: randomUUID() });
 const issued = await a.issue("supplementary"), supplementary = issued.find(row => row.id !== main.id)!;
 expect(supplementary.netPence).toBe(15000);
 expect((await a.value.read(a.jobId)).catchAttention).toEqual([]);
 expect((await a.value.read(a.jobId)).foundAfterLock).toHaveLength(1);
 const credit = { version: "practice-credit-note.preview.v1", invoiceId: supplementary.id, netPence: 15000, reason: "Fictional correction" };
 const preview = await a.invoices.previewCredit(a.jobId, credit);
 await a.invoices.issueCredit(a.jobId, { ...credit, version: "practice-credit-note.issue.v1", commandId: randomUUID(), previewHash: preview.previewHash });
 const receipt = (await a.invoices.receiptView(a.jobId, main.id)).receipts[0]!;
 await a.invoices.reverseReceipt(a.jobId, { version: "practice-customer-receipt.reverse.v1", commandId: randomUUID(), invoiceId: main.id, paymentId: receipt.id, reason: "Fictional reversed receipt" });
 const after = await a.value.read(a.jobId);
 expect(after.catchAttention).toEqual([]); expect(after.outstandingGross.pence).toBe(main.totalPence);
 const foreign = await startBlankPracticeCompany(f.runtime, { version: "blank-practice-company.v1", action: "start" });
 await expect(new ValueApplication(f.runtime, foreign).read(a.jobId)).rejects.toThrow();
 await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [a.auth.digest]);
 await expect(a.value.read(a.jobId)).rejects.toThrow();
}, 120_000);

it("pre-lock hidden candidates do not change the builder value response or add a hidden lookup", async () => {
 const a = await seedFinalCheckJob(f), value = new ValueApplication(f.runtime, a.sessionId);
 const absent = await value.read(a.jobId), logStart = f.logs.length;
 const evidence = await insertFinalCheckEvidence(f, a);
 await finalCheckProposal(f, a, evidence);
 expect(await value.read(a.jobId)).toEqual(absent);
 expect(absent.catchAttention).toEqual([]); expect(absent.foundAfterLock).toEqual([]);
 const runtimeReads = f.logs.slice(logStart).filter(line => line.includes("sv5_runtime_") && /SELECT/iu.test(line));
 expect(runtimeReads.join("\n")).not.toMatch(/FROM app\.shadow_commercial_signal|FROM app\.shadow_signal_evidence/u);
});

async function approveCatch(a: Awaited<ReturnType<typeof setup>>, id: string) {
 const revisionId = randomUUID();
 await a.variations.command(a.jobId, { version: "variation-command.v1", action: "revise", variationId: id, revisionId, expectedRevisionId: null, description: "Fictional ceiling extra", price: { quantity: "1", unit: "item", unitRatePence: 15000, direction: "addition" } });
 await a.variations.command(a.jobId, { version: "variation-command.v1", action: "approve", variationId: id, revisionId, approvalId: randomUUID(), attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
 return revisionId;
}
it("two equal-priced persisted catches retain attention for only the source not billed", async () => {
 const a = await setup("Painted the hallway ceiling as an extra, customer asked for it. Estimated extra: £150");
 await a.issue();
 await approveCatch(a, a.variationId);
 await a.accounts.build(a.jobId, { version: "final-account.assemble.v1", commandId: randomUUID() });
 await a.issue("supplementary");
 const second = a.variationIds[1]!;
 await approveCatch(a, second);
 const value = await a.value.read(a.jobId);
 expect(value.catchAttention).toEqual([expect.objectContaining({ id: second, status: "ready_to_invoice", pence: 15000 })]);
 expect(value.foundAfterLock).toHaveLength(2);
}, 120_000);

it("legacy unbound invoices cover only immutable lines matching the exact commercial revision and scope", async () => {
 const a = await setup(), revisionId = await approveCatch(a, a.variationId);
 const current = (await a.accounts.build(a.jobId, { version: "final-account.assemble.v1", commandId: randomUUID() })).account!;
 expect((await a.value.read(a.jobId)).catchAttention).toEqual([expect.objectContaining({ revisionId, status: "ready_to_invoice" })]);
 // Simulate a stored historical invoice without a binding. Only this fixture
 // insertion bypasses current issue guards; the projection uses the runtime login.
 await finalCheckTenant(f.admin, a.auth.context.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
   VALUES($1,$2,$3,$4,$5,$6,'2026-11-11','{}','candidate_m1_standard_v1','GBP',$7,$8,$9,$10,$11,$12,true,'SYNTHETIC - NOT A REAL INVOICE')`,
   [randomUUID(), a.auth.context.tenantId, a.jobId, current.id, randomUUID(), `LEGACY-${randomUUID().slice(0,8)}`, current.totals.net.pence, current.totals.tax.pence, current.totals.total.pence, current.sourceHash, "a".repeat(64), Buffer.from("Fictional legacy invoice")]);
 });
 const value = await a.value.read(a.jobId);
 expect(value.catchAttention).toEqual([]); expect(value.foundAfterLock).toHaveLength(1);
}, 120_000);

it("a stored unapproved or rejected replacement does not erase the prior approved catch", async () => {
 const a = await setup(), prior = await approveCatch(a, a.variationId), replacement = randomUUID();
 // Current catch commands deliberately refuse repricing. Arrange a historical
 // replacement in the disposable fixture to exercise the reader independently.
 await finalCheckTenant(f.admin, a.auth.context.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
   SELECT $1,tenant_id,job_id,variation_id,scope_item_id,revision+1,id,description,quantity_decimal,unit,20000,20000,$4,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version FROM app.variation_revision WHERE tenant_id=$2 AND id=$3`, [replacement, a.auth.context.tenantId, prior, "b".repeat(64)]);
  await db.query("UPDATE app.variation SET current_revision_id=$1 WHERE tenant_id=$2 AND id=$3", [replacement, a.auth.context.tenantId, a.variationId]);
 });
 const pending = await a.value.read(a.jobId);
 expect(pending.catchAttention.map(row => [row.status, row.revisionId, row.pence])).toEqual([["ready_to_invoice", prior, 15000], ["needs_approval", replacement, 20000]]);
 await finalCheckTenant(f.admin, a.auth.context.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("INSERT INTO app.variation_rejection(id,tenant_id,job_id,variation_id,revision_id,actor_membership_id,reason_code,rejected_at) VALUES($1,$2,$3,$4,$5,$6,'customer_declined',clock_timestamp())", [randomUUID(), a.auth.context.tenantId, a.jobId, a.variationId, replacement, a.auth.membershipId]);
 });
 const rejected = await a.value.read(a.jobId);
 expect(rejected.catchAttention).toEqual([expect.objectContaining({ revisionId: prior, status: "ready_to_invoice", pence: 15000 })]);
 expect(rejected.approvedExtras.pence).toBe(15000);
}, 120_000);
