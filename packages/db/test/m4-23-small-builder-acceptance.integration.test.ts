// M4-23-SB, RED. Real PostgreSQL; synthetic data and existing writers only.
// Coverage limits are executable TODOs below. A withheld-payment recovery is
// deliberately not described as the plan's merchant-overcharge Chain A.
import { randomUUID } from "node:crypto";
import { verifyStandalonePack } from "@jobguard/core";
import { MaterialRepository } from "../src/material-repository.js";
import { PurchaseOrderRepository } from "../src/purchase-order-repository.js";
import { SupplierDocumentRepository } from "../src/supplier-document-repository.js";
import { SupplierMatchRepository } from "../src/supplier-match-repository.js";
import { DiscrepancyRepository } from "../src/discrepancy-repository.js";
import { EvidencePackRepository } from "../src/evidence-pack-repository.js";
import { RecoveryMessageRepository } from "../src/recovery-message-repository.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { VariationRepository } from "../src/variation-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID } from "../src/demo-seed.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SuccessFeeRepository } from "../src/success-fee-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { SimulationMoneyRunRepository } from "../src/simulation-money-run-repository.js";
import { ShadowRepository } from "../src/shadow-repository.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { recoveryFeeFixture } from "./success-fee-recovery-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";

let f: FinalCheckFixture;
const environment = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120_000);
afterAll(async () => {
  if (f) await closeFinalCheckFixture(f);
  if (environment === undefined) delete process.env.JOBGUARD_ENV;
  else process.env.JOBGUARD_ENV = environment;
});
type Subject = { context: ReturnType<typeof testTenantContext>; jobId: string; auth: { digest: string } };
const feeCommand = (expectedPostingRevision = 0) => ({
  version: "success-fee-command.v1", action: "review", commandId: randomUUID(), expectedPostingRevision,
});
async function post(x: Subject, principal: number, fee: number) {
  const repo = new SuccessFeeRepository(f.runtime);
  const review = await repo.command(x.context, x.jobId, x.auth.digest, feeCommand());
  expect(review.statement).toMatchObject({
    qualifyingPrincipal: { numerator: String(principal), denominator: "1" }, feePence: fee, deltaPence: fee,
    productionEnabled: false, realExternalActions: 0,
  });
  const approval = { version: "success-fee-command.v1", action: "approve", commandId: randomUUID(),
    expectedPostingRevision: review.postingRevision, reviewId: review.reviewId, statementHash: review.statementHash };
  const saved = await repo.command(x.context, x.jobId, x.auth.digest, approval);
  expect(await repo.command(x.context, x.jobId, x.auth.digest, approval)).toEqual({ ...saved, replayed: true });
  return saved;
}
function moneyRun(x: Subject) {
  return new SimulationMoneyRunRepository(f.runtime).command(x.context, x.jobId, x.auth.digest,
    { version: "simulation-money-command.v1", action: "run", commandId: randomUUID() });
}
async function feeTotal(x: Subject) {
  return (await f.admin.query("SELECT coalesce(sum(amount_pence),0)::text total FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2",
    [x.context.tenantId, x.jobId])).rows[0].total as string;
}
async function issue(x: Subject) {
  const repo = new SimulationFeeStatementRepository(f.runtime);
  const command = { version: "simulation-fee-statement-command.v1", action: "issue", commandId: randomUUID() };
  const saved = await repo.command(x.context, x.jobId, x.auth.digest, command);
  expect(await repo.command(x.context, x.jobId, x.auth.digest, command)).toEqual({ ...saved, replayed: true });
  const download = await repo.download(x.context, x.jobId, x.auth.digest, saved.statementId);
  expect(download?.documentHash).toBe(saved.documentHash);
  // The hash is verified by the repository against the persisted document.
  expect(download?.document.environment).toBe("synthetic_demo");
  return saved;
}
function collection(x: Subject) {
  const repo = new SimulationFeeCollectionRepository(f.runtime);
  return {
    run: (raw: unknown) => repo.command(x.context, x.jobId, x.auth.digest, raw),
    view: () => repo.view(x.context, x.jobId, x.auth.digest),
  };
}
const event = (attemptId: string, action = "settle") => ({
  version: "simulation-fee-collection-command.v1", action, commandId: randomUUID(), attemptId,
});
const reserve = (statement: Awaited<ReturnType<typeof issue>>, amountPence: number, action = "collect") => ({
  version: "simulation-fee-collection-command.v1", action, commandId: randomUUID(),
  statementId: statement.statementId, statementHash: statement.documentHash, amountPence,
});
async function collectOnce(x: Subject, saved: Awaited<ReturnType<typeof issue>>, fee: number) {
  const c = collection(x), command = reserve(saved, fee), attempt = await c.run(command);
  expect(await c.run(command)).toEqual({ ...attempt, replayed: true });
  await c.run(event(attempt.attemptId, "redirect"));
  expect((await c.view()).settledPrincipal).toBe(0);
  const settled = event(attempt.attemptId);
  await c.run(settled); await c.run(settled); await c.run(event(attempt.attemptId));
  await expect(c.run(reserve(saved, fee))).rejects.toThrow("SUCCESS_FEE_STALE");
  expect(await c.view()).toMatchObject({ settledPrincipal: fee, outstandingPrincipal: 0, collectionReserved: 0 });
  return c;
}

// Each fixture uses owner-connected practice sessions (LP R4); no fee,
// derivation, qualifying allocation or settlement rows are inserted by this pack.
describe("M4-23-SB integrated sandbox outcomes", () => {
  it("Chain A available stages: source-bound £320 supplier discrepancy → owner-confirmed claim → verifiable pack → exact approved pursuit", async () => {
    let merchantCaseId: string | undefined;
    const x = await realReceiptFixture(f, "F5", "receipt-line-allocation-command.v1", false, false, async source => {
      const { context, jobId, digest } = source, scoped = practiceMaterialPool(f.runtime, digest);
      const scopeId = (await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY created_at,id LIMIT 1",
        [context.tenantId, jobId])).rows[0].id as string;
      const materials = new MaterialRepository(scoped);
      const rate = await materials.addRate(context, { merchantName: `Fictional merchant ${jobId}`, sku: "MAT-B",
        description: "Synthetic supplier material", pricePence: 2000, priceUnit: "each", taxBasis: "net",
        effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
      const requirement = await materials.addRequirement(context, { jobId, scopeItemId: scopeId, skuId: rate.skuId,
        quantity: "10", unit: "each", expectedRevision: 0 });
      await new PurchaseOrderRepository(scoped).revise(context, jobId, { version: "purchase-order-draft.v1",
        requirementId: requirement.id, quantity: "10", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid",
        requiredDate: "2026-10-01", expectedRevision: 0 });
      const docs = new SupplierDocumentRepository(scoped);
      await docs.intake(context, jobId, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
      await docs.intake(context, jobId, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
      const view = await docs.view(context, jobId);
      const invoice = view.documents.find((d: { document_type: string }) => d.document_type === "invoice")!;
      const delivery = view.documents.find((d: { document_type: string }) => d.document_type === "delivery")!;
      // The existing correction command records a human-confirmed figure,
      // separately from the original adapter proposal; never rewrite its bytes.
      await docs.confirm(context, jobId, { version: "supplier-fact-correction.v1", documentId: invoice.id,
        commandId: randomUUID(), documentType: "invoice", quantity: "10", unitPricePence: 4800, netPence: 48000, expectedRevision: 0 });
      const match = await new SupplierMatchRepository(scoped).create(context, jobId, { commandId: randomUUID(), expectedRevision: 0 });
      expect(match.proposal).toMatchObject({ ordered: "10 each", received: "8 each", billed: "10 each", state: "matched" });
      const detection = await new DiscrepancyRepository(scoped).evaluate(context, jobId, { commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" });
      expect(detection.finding).toMatchObject({ pricePence: 28000, quantityPence: 4000, totalPence: 32000 });
      const actor = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
      const cases = new RecoveryCaseRepository(scoped);
      let claim = await cases.command(context, jobId, { version: "recovery-case-command.v1", action: "open",
        commandId: randomUUID(), expectedRevision: 0, caseType: "merchant_overcharge", claimedNetPence: detection.finding.totalPence,
        counterparty: "Fictional supplier", book: "supplier_cost", sourceType: "supplier_documents",
        sourceRefs: [rate.id, invoice.id, delivery.id] }, actor);
      merchantCaseId = claim.id;
      expect(claim).toMatchObject({ caseType: "merchant_overcharge", claimedNetPence: 32000 });
      claim = await cases.command(context, jobId, { version: "recovery-case-command.v1", action: "transition",
        commandId: randomUUID(), caseId: claim.id, expectedRevision: claim.revision, eventType: "assemble_evidence" }, actor);
      const actorRef = `membership:${actor.membershipId}`, packs = new EvidencePackRepository(scoped);
      const pack = await packs.generate(context, claim.id, { commandId: randomUUID() }, actorRef);
      expect(pack.omissions).toEqual([]);
      const bytes = await packs.download(context, claim.id, pack.id);
      expect(verifyStandalonePack(bytes).contentMatches).toBe(true);
      expect(pack.sources.map(s => s.sourceId)).toContain(`material_rate_revision:${rate.id}`);
      await packs.approveAttachment(context, claim.id, pack.id, { commandId: randomUUID(),
        expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actorRef);
      const messages = new RecoveryMessageRepository(scoped), ready = await messages.read(context, claim.id);
      expect(ready.readiness).toMatchObject({ eligible: true, outstandingPence: 32000 });
      const preview = await messages.preview(context, claim.id, { version: "recovery-message-preview.v1", commandId: randomUUID(),
        expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id }, { membershipId: actor.membershipId, actorRef });
      const message = preview.latest!;
      expect(message.message).toMatchObject({ caseType: "merchant_overcharge", amountPence: 32000, packId: pack.id,
        recipient: "practice-supplier@example.invalid" });
      const approved = await messages.command(context, claim.id, { version: "recovery-message-command.v1", action: "approve",
        commandId: randomUUID(), messageId: message.id, expectedRevision: message.revision, recipient: message.message.recipient,
        body: message.message.body, amountPence: message.message.amountPence, packId: pack.id, contentHash: message.message.contentHash },
      { membershipId: actor.membershipId, actorRef });
      expect(approved.latest!.status).toBe("queued");
      // Pursuit permission is not cash billability or positive fee entitlement.
      // No merchant cash allocation adapter exists here: see the precise TODO.
    });
    expect(merchantCaseId).toBeDefined();
    await expect(new SuccessFeeRepository(f.runtime).command(x.context, x.jobId, x.auth.digest, feeCommand()))
      .rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
    await expect(issue(x)).rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
    expect(await feeTotal(x)).toBe("0");
  });


  it("Additional £320 withheld-payment regression: approved eligibility and settled allocation → £32 posts/collects once → balanced reconciliation", async () => {
    const x = await recoveryFeeFixture(f);
    await x.allocate(0);
    await post(x, 32000, 3200);
    const saved = await issue(x);
    const document = await new SimulationFeeStatementRepository(f.runtime).download(x.context, x.jobId, x.auth.digest, saved.statementId);
    expect(document!.document).toMatchObject({ qualifyingPrincipal: { numerator: "32000", denominator: "1" }, documentPrincipal: { pence: 3200 } });
    await collectOnce(x, saved, 3200);
    const result = await moneyRun(x);
    expect(result.report).toMatchObject({ unresolvedDifferenceCount: 0, realExternalActions: 0, label: "Records match within this simulation" });
    expect(result.report.successFee.postedPence).toBe(3200);
    expect(result.snapshot.recovery_case_allocation).toHaveLength(1);
    expect(await feeTotal(x)).toBe("3200");
  });

  it("Chain B: confirmed Final Check catch → supplementary invoice → £800 settled/allocated → exact £80 approval and collection → balanced reconciliation", async () => {
    const x = await catchFeeFixture(f);
    expect(x.assessment.assessmentOutcome).toBe("eligible_for_review");
    expect(x.assessment.remainingPrincipal).toEqual({ numerator: "80000", denominator: "1" });
    await post(x, 80000, 8000);
    const saved = await issue(x);
    await collectOnce(x, saved, 8000);
    const result = await moneyRun(x);
    expect(result.report).toMatchObject({ unresolvedDifferenceCount: 0, realExternalActions: 0, label: "Records match within this simulation" });
    expect(result.report.successFee).toMatchObject({ postedPence: 8000, yoursBeforeTax: { numerator: "72000", denominator: "1" } });
    expect(result.snapshot.success_fee_journal).toHaveLength(1);
    expect((await moneyRun(x)).sourceHash).toBe(result.sourceHash);
  });

  it("no valid proof and revoked recovery consent reject a previously reviewed positive fee", async () => {
    for (const attack of ["proof", "consent"] as const) {
      const x = await recoveryFeeFixture(f);
      await x.allocate(0);
      const review = await x.review();
      if (attack === "proof") await finalCheckTenant(f.admin, x.context.tenantId, db => db.query(
        "INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",
        [randomUUID(), x.context.tenantId, x.evidence, x.actor.membershipId]));
      else await f.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=(SELECT authorization_id FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND case_id=$2)",
        [x.context.tenantId, x.opened[0]!.id]);
      await expect(x.approve(review)).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
      await expect(issue(x)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
      expect(await feeTotal(x)).toBe("0");
      await expect(collection(x).view()).rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
    }
  });

  it("a genuine settled catch changed to prevented loss fails the confirmed-work attribution guard", async () => {
    const x = await catchFeeFixture(f), reviewed = await x.execute();
    expect(reviewed.statement.sources).toHaveLength(1);
    const cases = new RecoveryCaseRepository(x.scoped);
    const prevented = await cases.command(x.context, x.jobId, {
      version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(),
      caseId: x.caseId, expectedRevision: x.assessment.caseRevision, eventType: "prevent",
    }, x.actor);
    expect(prevented.state).toBe("prevented");
    // The original complete, approved catch source exists. Its current prevented
    // state changes attribution, so the fee writer must reject this exact review.
    await expect(x.execute({ version: "success-fee-command.v1", action: "approve", commandId: randomUUID(),
      expectedPostingRevision: reviewed.postingRevision, reviewId: reviewed.reviewId, statementHash: reviewed.statementHash,
    })).rejects.toMatchObject({ code: "SUCCESS_FEE_SOURCE_CHANGED" });
    const excluded = await new RecoveryAttributionRepository(f.runtime).assess(x.context, x.jobId, x.auth.digest, {
      version: "recovery-attribution-command.v1", action: "assess", commandId: randomUUID(),
      caseId: x.caseId, workId: x.workId, lineId: x.line, lockId: x.lock.id,
      expectedCaseRevision: prevented.revision, expectedAttributionRevision: x.assessment.revision,
    });
    expect(excluded.assessmentOutcome).toBe("excluded");
    expect(excluded.reasonCodes).toContain("builder_confirmed_genuine_extra_and_completed");
    const attribution = new RecoveryAttributionRepository(f.runtime);
    await expect(attribution.approveReview(x.context, x.jobId, x.auth.digest, {
      version: "recovery-attribution-command.v1", action: "approve_review", commandId: randomUUID(),
      caseId: x.caseId, workId: x.workId, lineId: x.line, lockId: x.lock.id,
      expectedCaseRevision: prevented.revision, expectedAttributionRevision: excluded.revision,
      assessmentId: excluded.assessmentId, expectedSourceHash: excluded.sourceHash,
      reviewArtifactHash: (await f.admin.query("SELECT app.final_lock_hash($1::jsonb) hash", [excluded])).rows[0].hash,
    })).rejects.toThrow("RECOVERY_ATTRIBUTION_REVIEW_EXCLUDED");
    await expect(issue(x)).rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
    expect(await feeTotal(x)).toBe("0");
    await expect(collection(x).view()).rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
  });

  it("an evidenced signal classified against a genuine pre-lock builder capture cannot be confirmed as a catch", async () => {
    let source: (Subject & { signalId: string }) | undefined;
    const captureId = randomUUID();
    // The shared fixture proposes reveal with an empty capture comparison. Stop
    // at that refusal, then reconcile against the actual frozen capture below.
    await expect(realReceiptFixture(f, "F7", "receipt-line-allocation-command.v1", false, false, async x => {
      source = { context: x.context, jobId: x.jobId, auth: { digest: x.digest }, signalId: x.signalId };
      await new VariationRepository(practiceMaterialPool(f.runtime, x.digest)).addFinalReviewExtra(x.context, {
        version: "final-review-extra.v1", actorMembershipId: DEMO_MEMBERSHIP_ID,
        proposal: { version: "variation-proposal.v1", id: captureId, jobId: x.jobId, scopeItemId: randomUUID(),
          existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text",
          captureText: "Fictional catch", description: "Fictional catch", suggestion: null },
        price: null, deviceId: null, deviceCapturedAt: null,
      });
      // Detector input only: bind the existing evidenced signal to the real
      // capture through the shadow role's normal update grants, guards enabled.
      await finalCheckTenant(f.shadow, x.context.tenantId, db => db.query(
        "UPDATE app.shadow_commercial_signal SET matched_variation_id=$1,outcome='builder_captured',revision=revision+1 WHERE tenant_id=$2 AND job_id=$3 AND id=$4",
        [captureId, x.context.tenantId, x.jobId, x.signalId]));
    })).rejects.toThrow("FINAL_CHECK_SOURCE_CHANGED");
    expect(source).toBeDefined();
    const x = source!, worker = new FinalCheckRepository(f.shadow);
    const manifestId = (await f.admin.query("SELECT id FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2",
      [x.context.tenantId, x.jobId])).rows[0].id as string;
    const manifest = await worker.manifest(x.context, x.jobId, manifestId);
    expect(manifest.signals.map(signal => signal.signalId)).toContain(x.signalId);
    expect(manifest.sources.some(s => s.evidenceId !== null && s.status === "detected")).toBe(true);
    const captureIds = manifest.comparisons.captures.map(c => (c as { id: string }).id);
    expect(captureIds).toContain(captureId);
    const comparisons = { baselineItemIds: manifest.comparisons.baselineItemIds, captureIds,
      lockedLineIds: manifest.comparisons.lines.map(line => line.id) };
    const expectedRevision = manifest.signals.find(s => s.signalId === x.signalId)!.revision;
    // Valid comparisons remove the setup refusal: this now reaches the actual
    // matched-variation-in-capture-register guard against a forged reveal.
    await expect(worker.reconcile(x.context, x.jobId, manifest.id, [{ signalId: x.signalId, expectedRevision,
      outcome: "reveal", references: [], comparisons }])).rejects.toThrow("FINAL_CHECK_SOURCE_CHANGED");
    const result = await worker.reconcile(x.context, x.jobId, manifest.id, [{ signalId: x.signalId, expectedRevision,
      outcome: "builder_captured", references: [captureId], comparisons }]) as { runId: string; lockId: string };
    await expect(new FinalCheckRepository(practiceMaterialPool(f.runtime, x.auth.digest)).confirmCatch(x.context, x.jobId, x.auth.digest, {
      version: "final-check.catch.v1", commandId: randomUUID(), lockId: result.lockId, runId: result.runId,
      signalId: x.signalId, expectedSignalRevision: expectedRevision + 1,
    })).rejects.toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });
    expect((await f.admin.query("SELECT outcome FROM app.shadow_signal_classification WHERE tenant_id=$1 AND job_id=$2 AND signal_id=$3",
      [x.context.tenantId, x.jobId, x.signalId])).rows).toEqual([{ outcome: "builder_captured" }]);
    await expect(issue(x)).rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
    expect(await feeTotal(x)).toBe("0");
    await expect(collection(x).view()).rejects.toMatchObject({ code: "SUCCESS_FEE_DEPENDENCY_BOUND" });
  });

  it("a catch disclosed before lock cannot be revealed as a fee-bearing catch", async () => {
    let source: Subject | undefined;
    await expect(realReceiptFixture(f, "F7", "receipt-line-allocation-command.v1", false, false, async x => {
      source = { context: x.context, jobId: x.jobId, auth: { digest: x.digest } };
      await new ShadowRepository(f.admin).supportDisclosure(x.context, {
        version: "shadow-support-disclosure.v1", jobId: x.jobId, signalId: x.signalId, eventId: randomUUID(),
      });
    })).rejects.toThrow("FINAL_CHECK_SOURCE_CHANGED");
    expect(source).toBeDefined();
    expect(await feeTotal(source!)).toBe("0");
    expect((await f.admin.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2",
      [source!.context.tenantId, source!.jobId])).rows).toEqual([{ disclosed_before_lock: true }]);
    await expect(issue(source!)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
  });

  it("a part allocation charges only £16 on £160 net; unallocated/unsettled money supplies no fee", async () => {
    const unsettled = await recoveryFeeFixture(f, false);
    await expect(unsettled.allocate(0)).rejects.toThrow("ALLOCATION_SOURCE_REQUIRED");
    await expect(unsettled.review()).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
    expect(await feeTotal(unsettled)).toBe("0");
    const x = await recoveryFeeFixture(f), current = x.opened[0]!;
    const command = { version: "recovery-allocation-command.v1", action: "review", commandId: randomUUID(),
      caseId: current.id, paymentId: x.payments[0]!, evidenceId: x.evidence, expectedCaseRevision: current.revision, grossPence: 19200 };
    const review = await x.allocator.command(x.context, x.actor, x.auth.digest, x.jobId, command);
    await x.allocator.command(x.context, x.actor, x.auth.digest, x.jobId,
      { ...command, action: "allocate", commandId: randomUUID(), approvalHash: review.review!.approvalHash });
    await post(x, 16000, 1600);
    await collectOnce(x, await issue(x), 1600);
    expect(await feeTotal(x)).toBe("1600");
  });

  it("unknown outcomes and out-of-order terminal events cannot collect twice or manufacture settlement", async () => {
    const x = await catchFeeFixture(f); await post(x, 80000, 8000);
    const saved = await issue(x), c = collection(x), command = reserve(saved, 8000), attempt = await c.run(command);
    await c.run(event(attempt.attemptId, "unknown"));
    await c.run(event(attempt.attemptId, "redirect"));
    expect(await c.view()).toMatchObject({ unknownOutcome: true, settledPrincipal: 0, collectionReserved: 8000 });
    await expect(c.run(reserve(saved, 8000))).rejects.toThrow("SUCCESS_FEE_STALE");
    expect((await moneyRun(x)).report.differences.map(d => d.code)).toContain("OUTCOME_UNKNOWN");
    await c.run(event(attempt.attemptId));
    await expect(c.run(event(attempt.attemptId, "fail"))).rejects.toThrow("SUCCESS_FEE_STALE");
    await c.run(event(attempt.attemptId));
    expect(await feeTotal(x)).toBe("8000");
    expect(await c.view()).toMatchObject({ settledPrincipal: 8000, outstandingPrincipal: 0, collectionReserved: 0 });
  });

  it("refunded landing compensates the £32 posting, refunds exactly once and reconciles at zero retained fee", async () => {
    const x = await recoveryFeeFixture(f); await x.allocate(0); await post(x, 32000, 3200);
    const original = await issue(x), c = await collectOnce(x, original, 3200);
    await x.reverse(0);
    const compensation = await x.approve(await x.review(1));
    expect(compensation.statement).toMatchObject({ feePence: 0, deltaPence: -3200 });
    const correction = await issue(x), refundCommand = reserve(correction, 3200, "refund"), refund = await c.run(refundCommand);
    expect(await c.run(refundCommand)).toEqual({ ...refund, replayed: true });
    const settled = event(refund.attemptId); await c.run(settled); await c.run(settled);
    await expect(c.run(reserve(correction, 3200, "refund"))).rejects.toThrow("SUCCESS_FEE_STALE");
    expect(await c.view()).toMatchObject({ retainedPrincipal: 0, refundedPrincipal: 3200, refundDue: 0 });
    expect(await feeTotal(x)).toBe("0");
    const result = await moneyRun(x);
    expect(result.report).toMatchObject({ unresolvedDifferenceCount: 0, realExternalActions: 0 });
    expect(result.report.successFee).toMatchObject({ postedPence: 0, refundedPence: 3200 });
  });

  it("another owner-connected session or tenant cannot reuse a valid statement approval", async () => {
    const x = await catchFeeFixture(f), y = await catchFeeFixture(f); await post(x, 80000, 8000);
    const saved = await issue(x), command = reserve(saved, 8000), repo = new SimulationFeeCollectionRepository(f.runtime);
    await expect(repo.command(x.context, x.jobId, y.auth.digest, command)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
    await expect(repo.command(testTenantContext(randomUUID()), x.jobId, x.auth.digest, command)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
    expect((await collection(x).view()).attempts).toEqual([]);
  });
});

// Explicitly unshipped, not mocked success. These TODOs must remain visible in CI.
// Chain A's detection, claim, pack and pursuit run above. Approved merchant
// cash billability is not claimed: v1 only offers evidence_backed_withheld_payment;
// v3 merchant F14 is a supplier-credit path, not a merchant cash landing.
// M4-2/M4-7/M4-8/M4-9-S still need a
// merchant-cash qualification/allocation source (0489 accepts withheld only).
// Neither a supplier credit nor a customer receipt may stand in for that source.
it.todo("NOT COVERED — Chain A merchant cash qualification/allocation into the v3 £32 fee source (M4-2, M4-7, M4-8, M4-9-S); the fee statement/collection/reconciliation depend on this missing merchant adapter");
it.todo("NOT COVERED — competing payment rails: M4-15 is absent from this base; only the simulation collection command is exercised");
it.todo("NOT COVERED — duplicate/out-of-order incoming provider notifications: M4-15 / live provider webhook adapter is absent; command replays and simulated terminal events are covered above");
it.todo("NOT COVERED — actual part receipt ingestion: M4-7 / live provider ingestion is absent; the partial test bounds allocation from an existing settled receipt");
