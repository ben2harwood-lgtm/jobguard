// M4-23-SB RED: executable M4-15 seam evidence, not a PostgreSQL
// acceptance-pack bridge or proof of fee entitlement/durable settlement.
import { describe, expect, it } from "vitest";
import { DarkFeeCollectionExecutor } from "./executor.js";
import { FakeGoCardlessRail } from "./fake-gocardless.js";
import { ctx, fixture, id } from "./test-fixture.js";

function railsFixture() {
  const f = fixture();
  const now = () => new Date("2026-10-29T00:00:00Z");
  const debit = new FakeGoCardlessRail("fictional-m4-23-secret", now);
  const executor = new DarkFeeCollectionExecutor(f.store, [f.rail, debit], now, f.sessions);
  debit.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: ctx.tenantId,
    commandId: id(80), mandateId: id(81), approvedDecisionId: id(82),
    noticeApproved: true, providerDefaultsDisabled: true });
  const body = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
    account: "fake_jobguard_dd", tenantId: ctx.tenantId, mandateId: id(81), eventId: id(83), state: "active" }] });
  debit.ingestMandates(body, debit.sign(body));
  const event = (state: string, eventId: string, commandId = id(10)) => ({
    version: "fake-dd-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd",
    tenantId: ctx.tenantId, eventId, commandId, objectId: debit.objectId(ctx.tenantId, commandId),
    amountPence: f.intent.amountPence, kind: "collection", state,
  });
  const batch = (events: unknown[]) => {
    const raw = JSON.stringify({ events });
    return executor.directDebitWebhook({ tenantId: ctx.tenantId, environment: "synthetic_demo" }, raw, debit.sign(raw));
  };
  return { ...f, cardEvent: f.event, executor, event, batch };
}

describe("M4-23-SB fake payment rail seam (in-memory only)", () => {
  it.each(["stripe_card", "direct_debit"] as const)(
    "%s racing the other rail reserves and collects the approved balance only once", async first => {
      const f = railsFixture();
      const second = first === "stripe_card" ? "direct_debit" : "stripe_card";
      const intents = [{ ...f.intent, rail: first }, { ...f.intent, commandId: id(11), rail: second }];
      const results = await Promise.allSettled(intents.map(intent => f.executor.reserve(ctx, intent)));
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(r => r.status === "rejected")).toMatchObject([
        { reason: { code: "COLLECTION_REFUSED" } },
      ]);
      const winner = f.book().attempts[0]!;
      expect(f.book().attempts).toHaveLength(1);
      expect(winner.rail).toBe(first);
      await f.executor.execute(ctx, winner.commandId);
      if (first === "direct_debit") {
        await f.batch([f.event("paid_out", id(90), winner.commandId)]);
      } else {
        const e = f.cardEvent();
        await f.executor.webhook(ctx, "stripe_card", e.body, e.signature);
      }
      await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(12), rail: second }))
        .rejects.toThrow("COLLECTION_REFUSED");
      expect(f.book().attempts).toHaveLength(1);
      expect(f.book().attempts[0]).toMatchObject({ state: "settled", amountPence: 600, principalPence: 500 });
      expect(f.book().audit.filter(a => a.state === "settled")).toHaveLength(1);
    });

  it("signed duplicate, out-of-order and batch notifications give one effect and isolate invalid events", async () => {
    const f = railsFixture();
    await f.executor.reserve(ctx, { ...f.intent, rail: "direct_debit" });
    await f.executor.execute(ctx, id(10));
    const payout = f.event("paid_out", id(90));
    expect(await f.batch([payout, payout, f.event("submitted", id(91)), f.event("confirmed", id(92)),
      { ...payout, eventId: id(93), tenantId: id(99) }, { ...payout, amountPence: 599 },
      f.event("paid_out", id(94))])).toEqual([
      { code: "processed" }, { code: "processed" }, { code: "processed" }, { code: "processed" },
      { code: "INVALID_WEBHOOK" }, { code: "IDEMPOTENCY_CONFLICT" }, { code: "processed" },
    ]);
    const settled = f.book();
    await f.batch([payout]);
    expect(f.book()).toEqual(settled);
    expect(settled.attempts).toHaveLength(1);
    expect(settled.attempts[0]).toMatchObject({ state: "settled", paymentState: "paid_out", principalPence: 500 });
    expect(settled.audit.filter(a => a.state === "settled")).toHaveLength(1);
    await f.batch([f.event("charged_back", id(95)), payout, f.event("paid_out", id(96))]);
    expect(f.book().attempts[0]?.state).toBe("reconciliation_required");
    expect(f.book().audit.filter(a => a.state === "settled")).toHaveLength(1);
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(12) }))
      .rejects.toThrow("RECONCILIATION_REQUIRED");
  });
});
