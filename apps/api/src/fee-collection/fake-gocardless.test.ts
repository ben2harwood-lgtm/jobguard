import { describe, expect, it, vi } from "vitest";
import { FakeGoCardlessRail } from "./fake-gocardless.js";
import { DarkFeeCollectionExecutor } from "./executor.js";
import { fixture, ctx, id } from "./test-fixture.js";
function ddFixture(now = () => new Date("2026-10-29T00:00:00Z")) {
  const f = fixture();
  const rail = new FakeGoCardlessRail("made-up-test-secret", now);
  const executor = new DarkFeeCollectionExecutor(f.store, [rail, f.rail], () => new Date("2026-10-29T00:00:00Z"));
  const setup = { version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: ctx.tenantId,
    commandId: id(80), mandateId: id(81), approvedDecisionId: id(82), noticeApproved: true, providerDefaultsDisabled: true };
  rail.setup(setup);
  const mandate = (state: string, eventId = id(83)) => {
    const body = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: ctx.tenantId, mandateId: id(81), eventId, state }] });
    return rail.ingestMandates(body, rail.sign(body));
  };
  mandate("active");
  const intent = { ...f.intent, rail: "direct_debit" };
  const event = (state: string, eventId = id(90), commandId = id(10), kind = "collection") => ({
    version: "fake-dd-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd", tenantId: ctx.tenantId,
    eventId, commandId, objectId: rail.objectId(ctx.tenantId, commandId), amountPence: 600, kind, state });
  const batch = (events: unknown[]) => {
    const body = JSON.stringify({ events }); return executor.webhook(ctx, "direct_debit", body, rail.sign(body));
  };
  const start = async () => { await executor.reserve(ctx, intent); await executor.execute(ctx, id(10)); };
  return { ...f, stripe: f.rail, rail, executor, setup, mandate, intent, event, batch, start };
}
describe("M4-15 dark Direct Debit", () => {
  it.each([-300, 0, 60])("accepts a signed event at the replay-window boundary %s seconds", async offset => {
    const f = ddFixture(); await f.start();
    const body = JSON.stringify({ events: [f.event("confirmed")] });
    const timestamp = Date.parse("2026-10-29T00:00:00Z") / 1000 + offset;
    expect(await f.executor.webhook(ctx, "direct_debit", body, f.rail.sign(body, timestamp))).toEqual([{ code: "processed" }]);
    expect(f.book().attempts[0]?.paymentState).toBe("confirmed");
  });
  it.each([-301, 61])("refuses an event outside the replay window (%s seconds) without mutation", async offset => {
    const f = ddFixture(); await f.start(); const before = structuredClone(f.book());
    const body = JSON.stringify({ events: [f.event("paid_out")] });
    const timestamp = Date.parse("2026-10-29T00:00:00Z") / 1000 + offset;
    await expect(f.executor.webhook(ctx, "direct_debit", body, f.rail.sign(body, timestamp))).rejects.toThrow("INVALID_WEBHOOK");
    expect(f.book()).toEqual(before);
  });
  it("binds the timestamp to the signature and checks it before parsing", async () => {
    const f = ddFixture(); await f.start(); const before = structuredClone(f.book());
    const body = JSON.stringify({ events: [f.event("paid_out")] });
    const timestamp = Date.parse("2026-10-29T00:00:00Z") / 1000;
    const signed = f.rail.sign(body, timestamp);
    await expect(f.executor.webhook(ctx, "direct_debit", body, signed.replace(`t=${timestamp}`, `t=${timestamp + 1}`))).rejects.toThrow("INVALID_WEBHOOK");
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(() => f.rail.verifyWebhookBatch("not json", f.rail.sign("not json", timestamp - 301))).toThrow("INVALID_WEBHOOK");
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
    expect(f.book()).toEqual(before);
  });
  it("dedupes a fresh replay and rejects the same signed event after the server clock advances", async () => {
    let time = Date.parse("2026-10-29T00:00:00Z");
    const f = ddFixture(() => new Date(time)); await f.start();
    const body = JSON.stringify({ events: [f.event("paid_out")] }); const signed = f.rail.sign(body);
    await f.executor.webhook(ctx, "direct_debit", body, signed);
    const settled = structuredClone(f.book());
    time += 300_000;
    expect(await f.executor.webhook(ctx, "direct_debit", body, signed)).toEqual([{ code: "processed" }]);
    expect(f.book()).toEqual(settled);
    time += 1;
    await expect(f.executor.webhook(ctx, "direct_debit", body, signed)).rejects.toThrow("INVALID_WEBHOOK");
    expect(f.book()).toEqual(settled);
  });
  it("applies the same replay window to mandate events", () => {
    let time = Date.parse("2026-10-29T00:00:00Z");
    const f = ddFixture(() => new Date(time));
    const body = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd", tenantId: ctx.tenantId, mandateId: id(81), eventId: id(84), state: "cancelled" }] });
    const signed = f.rail.sign(body); time += 300_001;
    expect(() => f.rail.ingestMandates(body, signed)).toThrow("INVALID_WEBHOOK");
    expect(f.rail.mandateStatus(ctx.tenantId, id(81))).toBe("active");
  });
  it("keeps request, submission, confirmation and payout distinct; ignores stale progress and duplicate objects", async () => {
    const f = ddFixture(); await f.start();
    expect(f.book().attempts[0]?.state).toBe("provider_accepted");
    for (const [i, state] of ["pending_submission", "submitted", "confirmed", "paid_out"].entries()) {
      await f.batch([f.event(state, id(90 + i))]);
      expect(f.book().attempts[0]?.paymentState).toBe(state);
      expect(f.book().attempts[0]?.state).toBe(state === "paid_out" ? "settled" : "provider_accepted");
    }
    await f.batch([f.event("confirmed", id(95)), f.event("paid_out", id(96)), f.event("paid_out", id(96))]);
    expect(f.book().audit.filter(a => a.state === "settled")).toHaveLength(1);
  });
  it.each([["paid_out", "charged_back"], ["confirmed", "late_failure"], ["confirmed", "cancelled"], ["failed", "paid_out"]])(
    "retains reservation for %s then %s, including reverse-before-original", async (first, second) => {
      const f = ddFixture(); await f.start(); await f.batch([f.event(first!, id(91)), f.event(second!, id(92))]);
      expect(f.book().attempts[0]?.state).toBe("reconciliation_required");
      await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11), rail: "stripe_card" })).rejects.toThrow();
      await expect(f.executor.reserveRefund(ctx, f.refund)).rejects.toThrow();
    });
  it("reconciles a reversal arriving before confirmation and never resurrects it", async () => {
    const f = ddFixture(); await f.start(); await f.batch([f.event("charged_back"), f.event("paid_out", id(91))]);
    expect(f.book().attempts[0]?.state).toBe("reconciliation_required");
  });
  it("authenticates before parsing and processes invalid routing separately from valid batch events", async () => {
    const f = ddFixture(); await f.start(); const e = f.event("confirmed");
    await expect(f.executor.webhook(ctx, "direct_debit", "not json", "0".repeat(64))).rejects.toThrow("INVALID_WEBHOOK");
    const result = await f.batch([{ ...e, account: "other" }, { ...e, environment: "production" },
      { ...e, tenantId: id(99) }, { ...e, shadowSignals: ["secret-text"] }, e]);
    expect(result).toEqual([...Array.from({ length: 4 }, () => ({ code: "INVALID_WEBHOOK" })), { code: "processed" }]);
    expect(JSON.stringify(f.book())).not.toContain("secret-text");
    expect(await f.batch([{ ...e, amountPence: 599 }])).toEqual([{ code: "IDEMPOTENCY_CONFLICT" }]);
  });
  it("blocks Stripe success while DD is pending and switches only after definite cancellation", async () => {
    const f = ddFixture(); await f.start();
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11), rail: "stripe_card" })).rejects.toThrow();
    const accepted = await f.stripe.submit(ctx.tenantId, { ...f.book().attempts[0]!, rail: "stripe_card" });
    if (accepted.state !== "provider_accepted") throw new Error("fixture");
    const body = JSON.stringify({ version: "fake-stripe-event.v1", environment: "synthetic_demo", account: "fake_jobguard_card",
      eventId: id(98), tenantId: ctx.tenantId, commandId: id(10), objectId: accepted.objectId,
      amountPence: 600, kind: "collection", state: "settled" });
    await expect(f.executor.webhook(ctx, "stripe_card", body, f.stripe.sign(body))).rejects.toThrow("COLLECTION_REFUSED");
    await f.batch([f.event("cancelled")]);
    await f.executor.reserve(ctx, { ...f.intent, commandId: id(11), rail: "stripe_card" });
    await f.executor.execute(ctx, id(11));
    expect(f.book().attempts[1]?.state).toBe("provider_accepted");
  });
  it.each(["cancelled", "failed", "expired"])("blocks new debit after mandate %s, including reordered active events", async state => {
    const f = ddFixture(); f.mandate(state, id(84)); f.mandate("active", id(85));
    await f.start(); expect(f.book().attempts[0]?.state).toBe("released");
    expect(f.rail.mandateStatus(ctx.tenantId, id(81))).toBe(state);
  });
  it("requires exact setup approval/notice and does not reset a cancelled mandate on replay", () => {
    const f = ddFixture(); f.mandate("cancelled", id(84));
    expect(f.rail.setup(f.setup).productionEnabled).toBe(false);
    expect(f.rail.mandateStatus(ctx.tenantId, id(81))).toBe("cancelled");
    expect(() => f.rail.setup({ ...f.setup, noticeApproved: false })).toThrow("COLLECTION_REFUSED");
    expect(() => f.rail.setup({ ...f.setup, approvedDecisionId: id(99) })).toThrow("IDEMPOTENCY_CONFLICT");
    expect(() => f.rail.setup({ ...f.setup, environment: "production" })).toThrow();
    expect(() => f.rail.mandateStatus(id(99), id(81))).toThrow("COLLECTION_REFUSED");
  });
  it("blocks revoked standing authority before provider submission", async () => {
    const f = ddFixture(); await f.executor.reserve(ctx, f.intent); f.source.agreement.record.state = "revoked";
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("AGREEMENT_INELIGIBLE");
  });
  it("keeps unknown outcomes reserved across restart and provider retries idempotent", async () => {
    const f = ddFixture(); const a = await f.executor.reserve(ctx, f.intent);
    expect(await f.rail.submit(ctx.tenantId, a)).toEqual(await f.rail.submit(ctx.tenantId, a));
    await expect(f.rail.submit(ctx.tenantId, { ...a, amountPence: 599 })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    await expect(new DarkFeeCollectionExecutor(f.store, [f.rail]).execute(ctx, id(10))).rejects.toThrow("RECONCILIATION_REQUIRED");
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11), rail: "stripe_card" })).rejects.toThrow();
  });
  it("refunds original settled DD once, blocks over-refunds, and stops an unsent refund after chargeback", async () => {
    const f = ddFixture(); await f.start(); await f.batch([f.event("paid_out")]);
    await expect(f.executor.reserveRefund(ctx, { ...f.refund, amountPence: 601 })).rejects.toThrow();
    await f.executor.reserveRefund(ctx, f.refund); await f.executor.reserveRefund(ctx, f.refund);
    await f.executor.execute(ctx, id(20));
    await f.batch([f.event("paid_out", id(91), id(20), "refund")]);
    expect(f.book().attempts[1]?.state).toBe("settled");
    const g = ddFixture(); await g.start(); await g.batch([g.event("paid_out")]); await g.executor.reserveRefund(ctx, g.refund);
    await g.batch([g.event("charged_back", id(91))]);
    await expect(g.executor.execute(ctx, id(20))).rejects.toThrow("RECONCILIATION_REQUIRED");
  });
  it("records created and pending mandates separately and authenticates mandate events before mutation", () => {
    const rail = new FakeGoCardlessRail("made-up-test-secret");
    rail.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: ctx.tenantId,
      commandId: id(80), mandateId: id(81), approvedDecisionId: id(82), noticeApproved: true, providerDefaultsDisabled: true });
    expect(rail.mandateStatus(ctx.tenantId, id(81))).toBe("created");
    const body = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: ctx.tenantId, mandateId: id(81), eventId: id(83), state: "pending_submission" }] });
    expect(() => rail.ingestMandates(body, "0".repeat(64))).toThrow("INVALID_WEBHOOK");
    expect(rail.mandateStatus(ctx.tenantId, id(81))).toBe("created");
    expect(rail.ingestMandates(body, rail.sign(body))).toEqual([{ code: "processed" }]);
    expect(rail.mandateStatus(ctx.tenantId, id(81))).toBe("pending_submission");
  });
  it("settles a penny exactly and refuses a changed-input command replay", async () => {
    const f = ddFixture(); f.source.principalPence = 1; f.source.taxPence = 0;
    f.source.agreement.currentStatement!.principalPence = f.source.agreement.statementApproval!.principalPence = 1;
    f.source.agreement.currentStatement!.taxPence = f.source.agreement.statementApproval!.taxPence = 0;
    f.source.agreement.amountPence = 1;
    await f.executor.reserve(ctx, { ...f.intent, amountPence: 1 }); await f.executor.execute(ctx, id(10));
    await f.batch([{ ...f.event("paid_out"), amountPence: 1 }]);
    expect(f.book().attempts[0]).toMatchObject({ amountPence: 1, state: "settled" });
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it.each([0, -1, 0.5, 601, Number.MAX_SAFE_INTEGER])("rejects invalid/over-source pence %s", async amountPence => {
    const f = ddFixture(); await expect(f.executor.reserve(ctx, { ...f.intent, amountPence })).rejects.toThrow();
  });
  it.each(["tenant", "job", "revision"])("rejects mismatched %s and superseded final accounts", async field => {
    const f = ddFixture();
    if (field === "tenant") f.source.tenantId = id(99);
    if (field === "job") f.source.jobId = id(99);
    if (field === "revision") Object.assign(f.source, { finalAccountCurrent: false });
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toThrow("COLLECTION_REFUSED");
  });
});
