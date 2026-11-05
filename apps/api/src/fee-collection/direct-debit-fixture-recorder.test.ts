import { describe, expect, it, vi } from "vitest";
import { DirectDebitFixtureError, verifiedTenantContextForQueuedJob, type DirectDebitFixtureRepository } from "@jobguard/db";
import { DirectDebitFixtureRecorder } from "./direct-debit-fixture-recorder.js";
import type { FakeDirectDebitEvent } from "./fake-gocardless.js";
const tenant = "10000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob(tenant);
const mandate = { version: "direct-debit-binding.v1" as const, environment: "synthetic_demo" as const,
  account: "fake_jobguard_dd" as const, mandateId: tenant };
const payment = { ...mandate, commandId: tenant, objectId: `fake_dd_${"a".repeat(64)}`, amountPence: 100 };
const event: FakeDirectDebitEvent = { version: "fake-dd-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd",
  tenantId: tenant, eventId: tenant, commandId: tenant, objectId: payment.objectId, amountPence: 100, kind: "collection", state: "submitted" };
function fixture() {
  const repository = { read: vi.fn().mockResolvedValue({ head: tenant }), recordMandate: vi.fn(),
    recordPaymentEvent: vi.fn().mockResolvedValue([{ event }]) };
  const recorder = new DirectDebitFixtureRecorder(repository as unknown as DirectDebitFixtureRepository, context, mandate, [payment]);
  return { repository, recorder };
}
describe("trusted DD fixture adapter", () => {
  it("binds the verified caller context and trusted references directly and returns stored event IDs", async () => {
    const f = fixture();
    expect(await f.recorder.record(event)).toEqual({ code: "processed", eventIds: [tenant] });
    expect(f.repository.read).toHaveBeenCalledWith(context, mandate);
    expect(f.repository.recordPaymentEvent).toHaveBeenCalledWith(context, payment, event, tenant);
  });
  it.each([{ tenantId: "20000000-0000-4000-8000-000000000001" }, { commandId: "20000000-0000-4000-8000-000000000001" },
    { objectId: `fake_dd_${"b".repeat(64)}` }, { amountPence: 101 }, { kind: "refund" }])("rejects swapped routing before any store call: %s", async patch => {
    const f = fixture();
    await expect(f.recorder.record({ ...event, ...patch } as FakeDirectDebitEvent)).rejects.toThrow("INVALID_WEBHOOK");
    expect(f.repository.read).not.toHaveBeenCalled();
    expect(f.repository.recordPaymentEvent).not.toHaveBeenCalled();
  });
  it("preserves a store conflict and never blindly retries or swallows an unavailable store", async () => {
    const f = fixture();
    f.repository.recordPaymentEvent.mockRejectedValue(new DirectDebitFixtureError("DD_CONFLICT"));
    await expect(f.recorder.record(event)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(f.repository.recordPaymentEvent).toHaveBeenCalledTimes(1);
    f.repository.read.mockRejectedValue(new DirectDebitFixtureError("DD_UNAVAILABLE"));
    await expect(f.recorder.record(event)).rejects.toThrow("DD_UNAVAILABLE");
    expect(f.repository.recordPaymentEvent).toHaveBeenCalledTimes(1);
  });
  it("starts only from a missing history, using the store's initial mandate contract", async () => {
    const f = fixture();
    f.repository.read.mockRejectedValue(new DirectDebitFixtureError("DD_NOT_FOUND"));
    const initial: FakeDirectDebitEvent = { version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: tenant, eventId: tenant, mandateId: tenant, state: "created" };
    f.repository.recordMandate.mockResolvedValue([{ event: initial }]);
    await f.recorder.record(initial);
    expect(f.repository.recordMandate).toHaveBeenCalledWith(context, mandate, initial, null);
  });
});
