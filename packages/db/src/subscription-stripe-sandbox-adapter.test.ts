import { describe, expect, it, vi } from "vitest";
import { computeSubscriptionPeriod, syntheticMeterPolicyV1 } from "@jobguard/core";
import { SubscriptionExecutor } from "./subscription-executor.js";
import { SubscriptionStripeSandboxAdapter, signSubscriptionSandboxEvent } from "./subscription-stripe-sandbox-adapter.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const work = {
  version: "subscription-simulated-work.v1", environment: "synthetic_demo",
  workId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", statementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  amountPence: 8900, contentHash: "a".repeat(64), currency: "GBP",
};
const binding = { version: "subscription-stripe-sandbox-binding.v1", tenantId, work, collectionBoundPence: 16900 };
function event(type = "payment_intent.succeeded", changes = {}) {
  return { version: "subscription-stripe-sandbox-event.v1", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", livemode: false, tenantId, type, data: work, ...changes };
}
const signed = (type?: string, changes?: object) => signSubscriptionSandboxEvent(event(type, changes));

describe("MON-2B dark Stripe-shaped provider sandbox", () => {
  it("defaults to no proration, retries or emails and never settles a redirect", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    expect(adapter.settings).toEqual({ proration: false, retries: false, emails: false, livemode: false });
    expect(await adapter.execute(work)).toMatchObject({ outcome: "outcome_unknown", synthetic: true });
    adapter.ingest(signed("checkout.session.completed"));
    expect(await adapter.reconcile(work)).toMatchObject({ outcome: "outcome_unknown" });
  });
  it("signed settlement and different event IDs for the same payment have one stable effect identity", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    await adapter.execute(work);
    adapter.ingest(signed());
    const first = await adapter.reconcile(work);
    adapter.ingest(signed());
    adapter.ingest(signed(undefined, { id: tenantId }));
    expect(await adapter.reconcile(work)).toEqual(first);
    expect(await adapter.execute(work)).toEqual(first);
    expect(first).toMatchObject({ outcome: "settled", synthetic: true, workId: work.workId });
    expect(() => adapter.ingest(signed("payment_intent.payment_failed"))).toThrow("SANDBOX_EVENT_CONFLICT");
    expect(await adapter.reconcile(work)).toEqual(first);
  });
  it("rejects unsigned/tampered events before changing state", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    await adapter.execute(work);
    const envelope = signed();
    expect(() => adapter.ingest({ ...envelope, payload: envelope.payload.replace("8900", "8800") })).toThrow("SANDBOX_SIGNATURE_INVALID");
    expect(() => adapter.ingest({ ...envelope, signature: "0".repeat(64) })).toThrow("SANDBOX_SIGNATURE_INVALID");
    expect(() => adapter.ingest({ payload: envelope.payload })).toThrow("INVALID_SANDBOX_INPUT");
    expect(await adapter.reconcile(work)).toMatchObject({ outcome: "outcome_unknown" });
  });
  it("checks exact statement/hash/amount/currency and cross-tenant bindings", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    await adapter.execute(work);
    for (const change of [{ amountPence: 8899 }, { amountPence: 8901 }, { statementId: tenantId }, { workId: tenantId }, { contentHash: "b".repeat(64) }]) {
      await expect(adapter.execute({ ...work, ...change })).rejects.toThrow("SANDBOX_BINDING_MISMATCH");
      expect(() => adapter.ingest(signed(undefined, { data: { ...work, ...change } }))).toThrow("SANDBOX_BINDING_MISMATCH");
    }
    expect(() => adapter.ingest(signed(undefined, { tenantId: work.statementId }))).toThrow("SANDBOX_BINDING_MISMATCH");
    await expect(adapter.execute({ ...work, currency: "EUR" })).rejects.toThrow("INVALID_SANDBOX_INPUT");
    expect(await adapter.reconcile(work)).toMatchObject({ outcome: "outcome_unknown" });
  });
  it("refuses live, fee, locked-bill, shadow and provider override fields", async () => {
    for (const fields of [{ environment: "production" }, { amountPence: 16901 }, { hiddenSignals: [] }, { finalAccountLockId: tenantId }, { feeStatementId: tenantId }, { proration: true }]) {
      expect(() => new SubscriptionStripeSandboxAdapter({ ...binding, work: { ...work, ...fields } })).toThrow("INVALID_SANDBOX_INPUT");
    }
    expect(() => new SubscriptionStripeSandboxAdapter({ ...binding, livemode: true })).toThrow("INVALID_SANDBOX_INPUT");
    expect(() => signSubscriptionSandboxEvent(event(undefined, { livemode: true }))).toThrow("INVALID_SANDBOX_INPUT");
    expect(() => signSubscriptionSandboxEvent(event(undefined, { shadowCount: 1 }))).toThrow("INVALID_SANDBOX_INPUT");
  });
  it("enforces the supplied sandbox D05 bound including zero and never allocates more", async () => {
    expect(() => new SubscriptionStripeSandboxAdapter({ ...binding, collectionBoundPence: 8899 })).toThrow("SANDBOX_BINDING_MISMATCH");
    expect(() => new SubscriptionStripeSandboxAdapter({ ...binding, collectionBoundPence: -1 })).toThrow("INVALID_SANDBOX_INPUT");
    const zero = new SubscriptionStripeSandboxAdapter({ ...binding, work: { ...work, amountPence: 0 }, collectionBoundPence: 0 });
    expect(await zero.execute({ ...work, amountPence: 0 })).toMatchObject({ outcome: "outcome_unknown" });
  });
  it.each([false, true])("reversal is a permanent review hold regardless of arrival order (reverse first %s)", async reverseFirst => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    await adapter.execute(work);
    const reversal = signed("charge.refunded", { id: tenantId });
    for (const envelope of reverseFirst ? [reversal, signed()] : [signed(), reversal]) adapter.ingest(envelope);
    adapter.ingest(signed());
    await expect(adapter.reconcile(work)).rejects.toThrow("SANDBOX_REVERSAL_REQUIRES_REVIEW");
    await expect(adapter.execute(work)).rejects.toThrow("SANDBOX_REVERSAL_REQUIRES_REVIEW");
  });
  it("failure never settles; contradictory terminal events need review", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    await adapter.execute(work);
    adapter.ingest(signed("payment_intent.payment_failed"));
    expect(await adapter.reconcile(work)).toMatchObject({ outcome: "failed" });
    adapter.ingest(signed(undefined, { id: tenantId }));
    await expect(adapter.reconcile(work)).rejects.toThrow("SANDBOX_REVERSAL_REQUIRES_REVIEW");
  });
  it("events and reconciliation cannot create an unsubmitted collection", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    expect(() => adapter.ingest(signed())).toThrow("SANDBOX_BINDING_MISMATCH");
    await expect(adapter.reconcile(work)).rejects.toThrow("SANDBOX_BINDING_MISMATCH");
  });
  it("uses the existing durable executor claim and reconciliation without a second execution", async () => {
    const adapter = new SubscriptionStripeSandboxAdapter(binding);
    const repository = {
      read: vi.fn().mockResolvedValue({ attempts: [] }),
      command: vi.fn().mockResolvedValueOnce(work).mockResolvedValue({ outcome: "outcome_unknown" }),
    };
    const execute = vi.spyOn(adapter, "execute");
    const executor = new SubscriptionExecutor(repository as never, adapter);
    await executor.execute({} as never, "a".repeat(64), tenantId, work.workId, 1);
    expect(repository.command.mock.calls[1]?.[3]).toMatchObject({ kind: "record_simulation", outcome: "outcome_unknown" });
    repository.read.mockResolvedValue({ attempts: [{ work_id: work.workId }], results: [{ work_id: work.workId, outcome: "outcome_unknown" }],
      work: [{ id: work.workId, statement_id: work.statementId, amount_pence: work.amountPence, content_hash: work.contentHash }] } as never);
    adapter.ingest(signed());
    await executor.reconcile({} as never, "a".repeat(64), work.workId, 1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repository.command.mock.calls[2]?.[3]).toMatchObject({ kind: "reconcile_simulation", outcome: "settled" });
  });
});

function period(places: number, plan = "Builder", length = 30) {
  const date = (n: number) => new Date(Date.UTC(2026, 2, n + 1)).toISOString().slice(0, 10);
  return { version: "subscription-period-preview.v1", meter: { version: "meter-supplied-period.v1", environment: "synthetic_demo", policy: syntheticMeterPolicyV1,
    startDate: date(0), endDateExclusive: date(length), days: Array.from({ length }, (_, i) => ({ date: date(i), plan, countedPlaces: places, trial: false, annualPrepaid: false })) } };
}
async function collect(input: unknown, expected: number) {
  const computed = computeSubscriptionPeriod(input);
  expect(computed.principal.pence).toBe(expected);
  const computedWork = { ...work, amountPence: computed.principal.pence };
  const adapter = new SubscriptionStripeSandboxAdapter({ ...binding, work: computedWork, collectionBoundPence: computed.maximum.pence });
  await adapter.execute(computedWork);
  adapter.ingest(signSubscriptionSandboxEvent(event(undefined, { data: computedWork })));
  expect(await adapter.reconcile(computedWork)).toMatchObject({ outcome: "settled", synthetic: true });
  return computedWork.amountPence;
}
it("MON-2 figures pass through signed fake sandbox events only", async () => {
  const solo = await Promise.all([1,1,1,2,2,2,2,2,2,3,3,4].map(n => collect(period(n, "Solo"), 2900)));
  const builder = await Promise.all([3,4,4,4,4,5,5,5,5,6,6,7].map(n => collect(period(n), 6900)));
  expect(solo.reduce((a,b) => a+b,0)).toBe(34800); expect(builder.reduce((a,b) => a+b,0)).toBe(82800);
  for (const [places, plan, pence] of [[8,"Builder",8900],[12,"Builder",16900],[5,"Solo",4900],[6,"Solo",4900]] as const) await collect(period(places, plan), pence);
  const half = period(8); half.meter.days.forEach((d,i) => { if (i < 15) d.countedPlaces = 7; }); await collect(half, 7900);
  const upgrade = period(6,"Solo"); upgrade.meter.days.forEach((d,i) => { if (i >= 10) d.plan = "Builder"; }); await collect(upgrade, 6233);
  const oneDay = period(7,"Builder",31); oneDay.meter.days[0]!.countedPlaces = 8; await collect(oneDay, 6965);
  for (const n of [13,14,15,16,17]) await collect(period(n), 16900);
});
