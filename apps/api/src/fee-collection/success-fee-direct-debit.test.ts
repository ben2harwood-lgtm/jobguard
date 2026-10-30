import { money } from "@jobguard/core";
import { describe, expect, it, vi } from "vitest";
import { DarkFeeCollectionExecutor } from "./executor.js";
import { FakeGoCardlessRail } from "./fake-gocardless.js";
import { ctx, fixture, hash, id } from "./test-fixture.js";
import type { CollectionSessionContext } from "./contracts.js";
import type { SuccessFeeCollectionSources } from "./success-fee-direct-debit.js";
function successFixture(standing = false) {
  const source: SuccessFeeCollectionSources = {
    version: "success-fee-collection-sources.v1", tenantId: ctx.tenantId, jobId: id(5), invoiceId: id(6),
    invoiceHash: hash, paymentId: id(70), currentSourceHash: hash, settlementVerified: true, current: true,
    receiptDisputed: false, caseDisputed: false, attributionDisputed: false,
    verifiedFeePence: 8000, creditsPence: 0, priorReceiptsPence: 0,
    binding: { version: "payment-fee-binding.v1", action: "collect_payment_fee", statementId: id(4),
      statementRevision: 1, statementHash: hash, sourceHash: hash, principal: money(8000),
      recipientRef: "platform:jobguard", policyVersion: "reference_fee_policy_v3" },
    authorization: { id: id(9), decisionId: id(19), tenantId: ctx.tenantId, actorMembershipId: id(2), action: "payment_fee.collect",
      recipientRef: "platform:jobguard", policyVersion: "reference_fee_policy_v3", currency: "GBP",
      state: "approved", expiresAt: "2026-10-30T00:00:00Z", kind: "statement", statementId: id(4),
      statementHash: hash, amountPence: 8000 },
  };
  if (standing) {
    const { kind: _kind, statementId: _id, statementHash: _hash, amountPence: _amount, ...common } = source.authorization as Extract<typeof source.authorization, { kind: "statement" }>;
    source.authorization = { ...common, kind: "standing", optedIn: true, jobId: id(5), capPerVerifiedFeePence: 8000 };
  }
  const read = vi.fn(async () => structuredClone(source));
  const f = fixture(read);
  const now = () => new Date("2026-10-29T00:00:00Z");
  const rail = new FakeGoCardlessRail("synthetic-test-only", now);
  rail.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: ctx.tenantId,
    commandId: id(80), mandateId: id(81), approvedDecisionId: id(82), noticeApproved: true, providerDefaultsDisabled: true });
  const mandate = (state: string, eventId = id(83)) => {
    const body = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: ctx.tenantId, mandateId: id(81), eventId, state }] });
    return rail.ingestMandates(body, rail.sign(body));
  };
  mandate("active");
  const executor = new DarkFeeCollectionExecutor(f.store, [rail, f.rail], now, f.sessions);
  const intent = { ...f.intent, purpose: "receipt_success_fee", amountPence: 8000, rail: "direct_debit" };
  const event = (state: string, eventId = id(90)) => {
    const body = JSON.stringify({ events: [{ version: "fake-dd-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd",
      tenantId: ctx.tenantId, eventId, commandId: id(10), objectId: rail.objectId(ctx.tenantId, id(10)),
      amountPence: 8000, kind: "collection", state }] });
    return executor.directDebitWebhook(ctx, body, rail.sign(body));
  };
  const start = async () => { await executor.reserve(ctx, intent); await executor.execute(ctx, id(10)); };
  return { ...f, source, read, executor, rail, intent, event, start, mandate };
}
describe("MON-4B synthetic receipt fee to dark Direct Debit", () => {
  it.each([false, true])("collects the exact approved fee once; standing=%s", async standing => {
    const f = successFixture(standing), submit = vi.spyOn(f.rail, "submit");
    const before = structuredClone(f.source);
    const reservations = await Promise.all([f.executor.reserve(ctx, f.intent), f.executor.reserve(ctx, f.intent)]);
    expect(reservations[0]).toEqual(reservations[1]);
    await Promise.allSettled([f.executor.execute(ctx, id(10)), f.executor.execute(ctx, id(10))]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(f.book().attempts).toHaveLength(1);
    expect(f.book().attempts[0]?.state).toBe("provider_accepted");
    await f.event("confirmed"); expect(f.book().attempts[0]?.state).toBe("provider_accepted");
    await f.event("paid_out", id(91)); const settled = f.book();
    await f.event("paid_out", id(91)); expect(f.book()).toEqual(settled);
    expect(f.book().attempts[0]?.state).toBe("settled");
    expect(f.book().attempts[0]?.principalPence).toBe(8000);
    expect(f.source).toEqual(before);
    expect(f.read).toHaveBeenCalledWith(id(5), id(6), hash);
    expect(f.rail.productionEnabled).toBe(false);
  });
  const pauses: [string, (s: SuccessFeeCollectionSources) => void][] = [
    ["SETTLEMENT_UNVERIFIED", s => { s.settlementVerified = false; }],
    ["RECEIPT_DISPUTED", s => { s.receiptDisputed = true; }],
    ["CASE_DISPUTED", s => { s.caseDisputed = true; }],
    ["ATTRIBUTION_DISPUTED", s => { s.attributionDisputed = true; }],
    ["AUTHORITY_STALE", s => { s.currentSourceHash = "b".repeat(64); }],
    ["AUTHORITY_STALE", s => { s.current = false; }],
    ["AUTHORITY_REVOKED", s => { s.authorization.state = "revoked"; }],
    ["AUTHORITY_DISPUTED", s => { s.authorization.state = "disputed"; }],
    ["AUTHORITY_EXPIRED", s => { s.authorization.expiresAt = "2026-10-29T00:00:00Z"; }],
    ["FEE_CAP_EXCEEDED", s => { s.verifiedFeePence = 7999; }],
  ];
  it.each(pauses)("refuses reservation and dispatch with %s", async (reason, change) => {
    for (const standing of [false, true]) {
      const f = successFixture(standing), submit = vi.spyOn(f.rail, "submit");
      await f.executor.reserve(ctx, f.intent); change(f.source);
      await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(11) })).rejects.toMatchObject({ reason });
      await expect(f.executor.execute(ctx, id(10))).rejects.toMatchObject({ reason });
      expect(f.book().attempts[0]?.state).toBe("reserved"); expect(submit).not.toHaveBeenCalled();
    }
  });
  it.each([7999, 8001])("refuses a standing cap differing from verified fee: %s", async cap => {
    const f = successFixture(true);
    if (f.source.authorization.kind === "standing") f.source.authorization.capPerVerifiedFeePence = cap;
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toMatchObject({ reason: "FEE_CAP_EXCEEDED" });
    expect(f.book().attempts).toEqual([]);
  });
  it.each(["tenant", "actor", "statement", "amount", "recipient", "policy", "job"])("refuses misbound %s authority", async field => {
    const f = successFixture(field === "job");
    const a = f.source.authorization;
    if (field === "tenant") a.tenantId = id(99);
    if (field === "actor") a.actorMembershipId = id(99);
    if (field === "statement" && a.kind === "statement") a.statementId = id(99);
    if (field === "amount" && a.kind === "statement") a.amountPence = 8001;
    if (field === "recipient") f.source.binding = { ...f.source.binding, recipientRef: "other" };
    if (field === "policy") f.source.binding = { ...f.source.binding, policyVersion: "other" };
    if (field === "job" && a.kind === "standing") a.jobId = id(99);
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  });
  it("binds dispatch to the exact Decision and authorization reserved", async () => {
    for (const key of ["id", "decisionId"] as const) {
      const f = successFixture(); await f.executor.reserve(ctx, f.intent);
      f.source.authorization[key] = id(99);
      await expect(f.executor.execute(ctx, id(10))).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
      expect(f.book().attempts[0]?.state).toBe("reserved");
    }
  });
  it("refuses a cross-tenant statement and changed payload replay without leaking money", async () => {
    const f = successFixture(); f.source.tenantId = id(99);
    await expect(f.executor.reserve(ctx, f.intent)).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
    f.source.tenantId = ctx.tenantId; await f.executor.reserve(ctx, f.intent);
    await expect(f.executor.reserve(ctx, { ...f.intent, amountPence: 8001 })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(f.book().attempts).toHaveLength(1);
  });
  it("retains its reservation after mandate revocation with a specific reason", async () => {
    const f = successFixture(); await f.executor.reserve(ctx, f.intent); f.mandate("cancelled", id(84));
    await expect(f.executor.execute(ctx, id(10))).rejects.toMatchObject({ reason: "MANDATE_REVOKED" });
    expect(f.book().attempts[0]?.state).toBe("reserved");
  });
  it("shares the reserved balance with card attempts including unknown outcomes", async () => {
    const f = successFixture();
    const results = await Promise.allSettled([f.executor.reserve(ctx, f.intent),
      f.executor.reserve(ctx, { ...f.intent, commandId: id(11), rail: "stripe_card" })]);
    expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(12), rail: "stripe_card" })).rejects.toThrow();
    expect(f.book().attempts[0]?.state).toBe("outcome_unknown");
  });
  it("holds payout reversals on both rails and never reopens the balance", async () => {
    const f = successFixture(); await f.start(); await f.event("paid_out");
    await f.event("charged_back", id(91));
    expect(f.book().attempts[0]?.state).toBe("reconciliation_required");
    for (const rail of ["direct_debit", "stripe_card"]) {
      await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(12), rail })).rejects.toThrow("RECONCILIATION_REQUIRED");
    }
  });
  it("refuses production, client authority and missing locked readers", async () => {
    const f = successFixture();
    await expect(f.executor.reserve({ ...ctx, environment: "production" } as unknown as CollectionSessionContext, f.intent)).rejects.toThrow("COLLECTION_DARK");
    expect(f.read).not.toHaveBeenCalled();
    await expect(f.executor.reserve(ctx, { ...f.intent, authorization: f.source.authorization })).rejects.toThrow("COLLECTION_REFUSED");
    await expect(fixture().executor.reserve(ctx, f.intent)).rejects.toMatchObject({ reason: "SUCCESS_FEE_DEPENDENCY_BOUND" });
    expect(f.book().attempts).toEqual([]);
  });
});
