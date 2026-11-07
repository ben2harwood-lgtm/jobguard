import { expect, it, vi } from "vitest";
import { DirectDebitFixtureError, verifiedTenantContextForQueuedJob, type DirectDebitFixtureRepository } from "@jobguard/db";
import { DirectDebitPracticeApplication } from "./direct-debit-practice.application.js";
const id = "10000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob(id), actor = { membershipId: id, identityUserId: id };
it("refuses production, unreadable jobs and forged input before reading fixture facts", async () => {
  const repository = { read: vi.fn() } as unknown as DirectDebitFixtureRepository;
  const authorize = vi.fn().mockRejectedValue(new DirectDebitFixtureError("DD_NOT_FOUND"));
  await expect(new DirectDebitPracticeApplication(repository, authorize, "production").execute(context, actor, id)).rejects.toThrow("DD_DARK");
  expect(authorize).not.toHaveBeenCalled();
  const app = new DirectDebitPracticeApplication(repository, authorize, "synthetic_demo");
  await expect(app.execute(context, actor, id)).rejects.toThrow("DD_NOT_FOUND");
  authorize.mockResolvedValue(undefined);
  await expect(app.execute(context, actor, id, { version: "debit-practice-action.v1", step: 0, tenantId: id })).rejects.toThrow("DD_INVALID_INPUT");
  expect(repository.read).not.toHaveBeenCalled();
});
it("empty reads do not create a mandate; the signed recorder writes only the server-selected initial event", async () => {
  const repository = { read: vi.fn().mockRejectedValue(new DirectDebitFixtureError("DD_NOT_FOUND")),
    recordMandate: vi.fn().mockResolvedValue([]), recordPaymentEvent: vi.fn() };
  const app = new DirectDebitPracticeApplication(repository as unknown as DirectDebitFixtureRepository, async () => {}, "synthetic_demo");
  const view = await app.execute(context, actor, id);
  expect(view.mandate).toBe("No practice mandate created"); expect(view.blocksNewCollection).toBe(true);
  expect(repository.recordMandate).not.toHaveBeenCalled();
  await app.execute(context, actor, id, view.nextAction);
  expect(repository.recordMandate).toHaveBeenCalledWith(context, expect.objectContaining({ environment: "synthetic_demo" }),
    expect.objectContaining({ state: "created", tenantId: id }), null);
  expect(repository.recordPaymentEvent).not.toHaveBeenCalled();
  expect(JSON.stringify(view)).not.toMatch(/account|secret|bank|objectId|tenantId|signature/i);
  await expect(app.execute(context, actor, id, { version: "debit-practice-action.v1", step: 20 })).rejects.toThrow("DD_CONFLICT");
});
it.each(["pending_submission", "submitted", "confirmed"] as const)("projects stored %s separately from payout and strips all private binding material", async state => {
  const event = { version: "fake-dd-event.v1", state, eventId: id };
  const repository = { read: vi.fn().mockResolvedValue({ mandateState: "active", blocksNewSubmission: false,
    history: [{ event, sequence: 1, binding: { account: "private" }, hash: "private" }],
    payments: [{ state }], head: id }) };
  const app = new DirectDebitPracticeApplication(repository as unknown as DirectDebitFixtureRepository, async () => {}, "synthetic_demo");
  const view = await app.execute(context, actor, id);
  expect(view.payments).toHaveLength(1);
  expect(view.payments[0]?.state).not.toBe("Payment paid out");
  expect(view.history[0]?.label).toBe(view.payments[0]?.state);
  expect(view.history[0]?.current).toBe(true);
  expect(JSON.stringify(view)).not.toMatch(/private|binding|eventId|hash|account/);
});
