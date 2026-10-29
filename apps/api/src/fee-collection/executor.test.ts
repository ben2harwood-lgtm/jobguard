import { describe, expect, it } from "vitest";
import { DarkFeeCollectionExecutor } from "./executor.js";
import type { VerifiedCollectionContext } from "./contracts.js";
import { fixture, ctx, id, hash } from "./test-fixture.js";
describe("M4-12 dark card collection and shared balance reservation", () => {
  it("serializes double-clicks, changed-input replays and alternate rails against one balance", async () => {
    const f = fixture();
    const results = await Promise.all([f.executor.reserve(ctx, f.intent), f.executor.reserve(ctx, f.intent)]);
    expect(results[0]).toEqual(results[1]); expect(f.book().attempts).toHaveLength(1);
    await expect(f.executor.reserve(ctx, { ...f.intent, amountPence: 599 })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11), rail: "direct_debit" })).rejects.toThrow("COLLECTION_REFUSED");
    expect(f.book().audit).toHaveLength(1);
  });
  it("keeps rails disabled by default and refuses production even with an injected fake", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent);
    await expect(new DarkFeeCollectionExecutor(f.store).execute(ctx, id(10))).rejects.toThrow("COLLECTION_DARK");
    await expect(f.executor.reserve({ ...ctx, environment: "production" } as unknown as VerifiedCollectionContext, f.intent)).rejects.toThrow("COLLECTION_DARK");
    expect(f.book().attempts[0]?.state).toBe("reserved");
  });
  it("settles only signed exact objects; replay and duplicate event objects allocate once to the immutable invoice", async () => {
    const f = fixture(); await f.settle();
    const first = f.event(); await f.executor.webhook(ctx, "stripe_card", first.body, first.signature);
    const second = f.event(id(10), "collection", id(31)); await f.executor.webhook(ctx, "stripe_card", second.body, second.signature);
    expect(f.book().attempts[0]).toMatchObject({ state: "settled", invoiceId: id(6), invoiceHash: hash, amountPence: 600 });
    expect(f.book().audit.filter(a => a.state === "settled")).toHaveLength(1);
    await expect(f.executor.webhook(ctx, "stripe_card", first.body, "0".repeat(64))).rejects.toThrow("INVALID_WEBHOOK");
    const altered = first.body.replace('"amountPence":600', '"amountPence":601');
    await expect(f.executor.webhook(ctx, "stripe_card", altered, f.rail.sign(altered))).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("retains unknown acceptance through an executor restart and blocks retries/rail switching until signed reconciliation", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent); f.rail.crashAfterAcceptance = true;
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    expect(f.book().attempts[0]?.state).toBe("outcome_unknown");
    const restarted = new DarkFeeCollectionExecutor(f.store, [f.rail]);
    await expect(restarted.execute(ctx, id(10))).rejects.toThrow("RECONCILIATION_REQUIRED");
    await expect(restarted.reserve(ctx, { ...f.intent, commandId: id(11), rail: "direct_debit" })).rejects.toThrow();
    const e = f.event(); await restarted.webhook(ctx, "stripe_card", e.body, e.signature);
    expect(f.book().attempts[0]?.state).toBe("settled");
  });
  it("releases a reservation only after definite failure", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent); f.rail.definiteFailure = true;
    await f.executor.execute(ctx, id(10)); expect(f.book().attempts[0]?.state).toBe("released");
    await f.executor.reserve(ctx, { ...f.intent, commandId: id(11) });
    expect(f.book().attempts).toHaveLength(2);
  });
  it.each(["zero", "obsolete", "invoice", "source", "revoked", "refund", "final-account", "attribution", "credit", "receipt"])("rechecks %s before every provider submission", async change => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent);
    if (change === "zero") f.source.principalPence = f.source.taxPence = 0;
    if (change === "obsolete") f.source.statementHash = "b".repeat(64);
    if (change === "invoice") f.source.invoiceHash = "b".repeat(64);
    if (change === "source") f.source.sourceHash = "b".repeat(64);
    if (change === "revoked") f.source.agreement.record.state = "revoked";
    if (change === "refund") Object.assign(f.source, { refundPending: true });
    if (change === "final-account") Object.assign(f.source, { finalAccountCurrent: false });
    if (change === "attribution") f.source.attributionReviews = [];
    if (change === "credit") f.source.creditsPence = 1;
    if (change === "receipt") f.source.priorReceiptsPence = 1;
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow();
    expect(f.book().attempts[0]?.state).toBe("reserved");
    expect(() => f.rail.objectId(id(1), id(10))).toThrow();
  });
  it.each([0, -1, 601, 1.5, Number.MAX_SAFE_INTEGER])("refuses unsafe amount %s without creating an attempt", async amountPence => {
    const f = fixture(); await expect(f.executor.reserve(ctx, { ...f.intent, amountPence })).rejects.toThrow("COLLECTION_REFUSED");
    expect(f.book().attempts).toEqual([]);
  });
  it.each(["tenant", "job", "invoice", "review", "terms", "approval"])("refuses wrong %s bindings with no source data in errors", async change => {
    const f = fixture();
    if (change === "tenant") f.source.tenantId = id(99);
    if (change === "job") f.source.jobId = id(99);
    if (change === "invoice") f.source.invoiceId = id(99);
    if (change === "review") f.source.attributionReviews[0]!.currentSourceHash = "b".repeat(64);
    if (change === "terms") f.source.agreement.record.state = "cancelled";
    if (change === "approval") f.source.agreement.statementApproval!.resolution = "rejected" as "approved";
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toThrow(/COLLECTION_REFUSED|INVALID_AGREEMENT|AGREEMENT_INELIGIBLE/u);
    expect(f.book()).toEqual({ attempts: [], events: {}, audit: [] });
  });
  it("requires original settled value and exact credit approval; caps concurrent refunds and never retries unknown payouts", async () => {
    const f = fixture(); await expect(f.executor.reserveRefund(ctx, f.refund)).rejects.toThrow();
    await f.settle();
    await expect(f.executor.reserveRefund(ctx, { ...f.refund, amountPence: 601 })).rejects.toThrow();
    await expect(f.executor.reserveRefund(ctx, { ...f.refund, jobId: id(99) })).rejects.toThrow();
    await f.executor.reserveRefund(ctx, f.refund); await f.executor.reserveRefund(ctx, f.refund);
    await expect(f.executor.reserveRefund(ctx, { ...f.refund, commandId: id(22) })).rejects.toThrow();
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor.execute(ctx, id(20))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    await expect(f.executor.execute(ctx, id(20))).rejects.toThrow("RECONCILIATION_REQUIRED");
    const e = f.event(id(20), "refund", id(33)); await f.executor.webhook(ctx, "stripe_card", e.body, e.signature);
    expect(f.book().attempts[1]?.state).toBe("settled");
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(23) })).rejects.toThrow();
  });
  it("refuses stale/revoked refund authority at execution", async () => {
    const f = fixture(); await f.settle(); await f.executor.reserveRefund(ctx, f.refund);
    Object.assign(f.credit, { approved: false });
    await expect(f.executor.execute(ctx, id(20))).rejects.toThrow();
    expect(f.book().attempts[1]?.state).toBe("reserved");
  });
  it("holds contradictory out-of-order failures after settlement", async () => {
    const f = fixture(); await f.settle(); const e = f.event(id(10), "collection", id(32), "definite_failure");
    await expect(f.executor.webhook(ctx, "stripe_card", e.body, e.signature)).rejects.toThrow("RECONCILIATION_REQUIRED");
    expect(f.book().attempts[0]?.state).toBe("settled");
  });
  it("uses the executor clock rather than cached agreement time for statement and terms expiry", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent);
    f.setNow("2027-01-01T00:00:00Z");
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("AGREEMENT_INELIGIBLE");
    expect(f.book().attempts[0]?.state).toBe("reserved");
  });
  it.each(["missing", "unrelated", "duplicate", "decision", "action", "invoice"])("requires complete current SV-6 reviews and exact collection authority: %s", async change => {
    const f = fixture();
    if (change === "missing") f.source.requiredAttributionIds.push(id(70));
    if (change === "unrelated") f.source.attributionReviews[0]!.attributionId = id(70);
    if (change === "duplicate") f.source.attributionReviews.push(f.source.attributionReviews[0]!);
    if (change === "decision") f.source.collectionDecision.decisionId = id(70);
    if (change === "action") Object.assign(f.source.collectionDecision, { action: "invoice.issue" });
    if (change === "invoice") f.source.collectionDecision.invoiceHash = "b".repeat(64);
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toThrow("COLLECTION_REFUSED");
    expect(f.book().attempts).toHaveLength(0);
  });
  it("does not collect the same statement through a second invoice identity", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent);
    f.source.invoiceId = f.source.collectionDecision.invoiceId = id(66);
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11), invoiceId: id(66) })).rejects.toThrow("COLLECTION_REFUSED");
  });
  it("binds pending collection and refund attempts to their original decisions", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent);
    f.source.collectionDecision.decisionId = f.source.agreement.statementApproval!.decisionId = id(90);
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("COLLECTION_REFUSED");
    const g = fixture(); await g.settle(); await g.executor.reserveRefund(ctx, g.refund);
    g.credit.decisionId = id(90);
    await expect(g.executor.execute(ctx, id(20))).rejects.toThrow("COLLECTION_REFUSED");
  });
  it("accepts duplicate failure objects once but holds a later contradictory settlement", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent); await f.executor.execute(ctx, id(10));
    for (const eventId of [id(51), id(52)]) {
      const e = f.event(id(10), "collection", eventId, "definite_failure");
      await f.executor.webhook(ctx, "stripe_card", e.body, e.signature);
    }
    expect(f.book().audit.filter(a => a.state === "released")).toHaveLength(1);
    const late = f.event();
    await expect(f.executor.webhook(ctx, "stripe_card", late.body, late.signature)).rejects.toThrow("RECONCILIATION_REQUIRED");
  });
  it("records in-flight settlement after reversal honestly, without reopening collection", async () => {
    const f = fixture(); await f.executor.reserve(ctx, f.intent); await f.executor.execute(ctx, id(10));
    f.source.principalPence = f.source.taxPence = 0;
    const e = f.event(); await f.executor.webhook(ctx, "stripe_card", e.body, e.signature);
    expect(f.book().attempts[0]?.state).toBe("settled");
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11) })).rejects.toThrow();
  });
  it.each(["tenant", "job", "invoice", "invoiceHash", "creditHash", "expired", "currency"])("refuses refund %s mismatches and replays with changed input", async change => {
    const f = fixture(); await f.settle();
    if (change === "tenant") f.credit.tenantId = id(99);
    if (change === "job") f.credit.jobId = id(99);
    if (change === "invoice") f.credit.invoiceId = id(99);
    if (change === "invoiceHash") f.credit.invoiceHash = "b".repeat(64);
    if (change === "creditHash") f.credit.creditHash = "b".repeat(64);
    if (change === "expired") f.credit.expiresAt = "2026-10-29T00:00:00Z";
    if (change === "currency") Object.assign(f.credit, { currency: "EUR" });
    await expect(f.executor.reserveRefund(ctx, f.refund)).rejects.toThrow("COLLECTION_REFUSED");
    expect(f.book().attempts).toHaveLength(1);
  });
  it("links refunds to the provider settlement and rejects a changed-input refund replay", async () => {
    const f = fixture(); await f.settle(); const result = await f.executor.reserveRefund(ctx, f.refund);
    expect(result.settlementObjectId).toBe(f.rail.objectId(id(1), id(10)));
    await expect(f.executor.reserveRefund(ctx, { ...f.refund, amountPence: 599 })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("round trips penny amounts with exact integer allocation", async () => {
    const f = fixture(); f.source.principalPence = 1; f.source.taxPence = 0;
    f.source.agreement.currentStatement!.principalPence = f.source.agreement.statementApproval!.principalPence = 1;
    f.source.agreement.currentStatement!.taxPence = f.source.agreement.statementApproval!.taxPence = 0;
    f.source.agreement.amountPence = 1;
    await f.executor.reserve(ctx, { ...f.intent, amountPence: 1 }); await f.executor.execute(ctx, id(10));
    const body = f.event().body.replace('"amountPence":600', '"amountPence":1');
    await f.executor.webhook(ctx, "stripe_card", body, f.rail.sign(body));
    expect(f.book().attempts[0]?.amountPence).toBe(1);
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11), amountPence: 1 })).rejects.toThrow();
  });
  it("rejects hidden fields, forged account routing and cross-tenant events with redacted errors", async () => {
    const f = fixture();
    await expect(f.executor.reserve(ctx, { ...f.intent, shadowSignals: ["private-test-text"] })).rejects.toThrow(/^COLLECTION_REFUSED$/u);
    await f.settle(); const e = f.event();
    for (const body of [e.body.replace("fake_jobguard_card", "other_account"), e.body.replace(id(1), id(99))]) {
      await expect(f.executor.webhook(ctx, "stripe_card", body, f.rail.sign(body))).rejects.toThrow(/^INVALID_WEBHOOK$/u);
    }
    expect(JSON.stringify(f.book().audit)).not.toContain("private-test-text");
  });

  it("commits the reservation before provider I/O and preserves a webhook arriving before the submit response", async () => {
    const f = fixture();
    const executor = new DarkFeeCollectionExecutor(f.store, [{
      name: "stripe_card", environment: "synthetic_demo",
      verifyWebhook: (body, signature) => f.rail.verifyWebhook(body, signature),
      submit: async (tenantId, attempt) => {
        expect(f.book().attempts[0]?.state).toBe("outcome_unknown");
        const accepted = await f.rail.submit(tenantId, attempt);
        const event = f.event(); await executor.webhook(ctx, "stripe_card", event.body, event.signature);
        return accepted;
      },
    }], () => new Date("2026-10-29T00:00:00Z"));
    await executor.reserve(ctx, f.intent); await executor.execute(ctx, id(10));
    expect(f.book().attempts[0]?.state).toBe("settled");
    expect(f.book().audit.filter(a => a.state === "settled")).toHaveLength(1);
  });
  it("refuses provider idempotency reuse with another immutable invoice binding", async () => {
    const f = fixture(); const attempt = await f.executor.reserve(ctx, f.intent);
    await f.rail.submit(ctx.tenantId, attempt);
    await expect(f.rail.submit(ctx.tenantId, { ...attempt, invoiceId: id(99) })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

});
