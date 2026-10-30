// M4-23-SB, RED. Real PostgreSQL; synthetic data and existing writers only.
// Coverage limits are executable TODOs below. A withheld-payment recovery is
// deliberately not described as the plan's merchant-overcharge Chain A.
import { randomUUID } from "node:crypto";
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
  it("£320 withheld-payment substitute: approved eligibility and settled allocation → £32 posts/collects once → balanced reconciliation", async () => {
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
      expect((await collection(x).view()).attempts).toEqual([]);
    }
  });

  it("prevented loss and a builder-captured item cannot supply a catch fee source", async () => {
    const x = await realReceiptFixture(f, "F5", "receipt-line-allocation-command.v1");
    const prevented = await new RecoveryCaseRepository(x.scoped).command(x.context, x.jobId, {
      version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
      caseType: "prevention", claimedNetPence: 32000, counterparty: "Fictional payer", book: "builder_customer",
      sourceType: "customer_invoice", sourceRefs: [x.invoiceId],
    }, x.actor);
    expect(prevented.state).toBe("prevented");
    await expect(new SuccessFeeRepository(f.runtime).command(x.context, x.jobId, x.auth.digest, feeCommand())).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
    await expect(issue(x)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
    expect(await feeTotal(x)).toBe("0");
    expect((await collection(x).view()).attempts).toEqual([]);
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
it.todo("NOT COVERED — Chain A merchant £320 overcharge detection → billability → verifiable evidence pack → approved pursuit → merchant landing: this base's fee/statement adapter accepts withheld_customer_payment only (0489/0497)");
it.todo("NOT COVERED — competing payment rails: M4-15 is absent from this base; only the simulation collection command is exercised");
it.todo("NOT COVERED — duplicate/out-of-order incoming provider notifications: no live webhook/rail path is exercised; command replays and simulated terminal events are covered above");
it.todo("NOT COVERED — actual part receipt ingestion: the partial test bounds allocation from an existing settled receipt, not a newly ingested partial bank movement");
