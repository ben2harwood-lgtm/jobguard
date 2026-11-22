import { createHash } from "node:crypto";
import type { OutboundAction } from "@jobguard/db";
import { afterEach, expect, it, vi } from "vitest";
import { dispatchCommercialEmail, type CommercialEmailOutbox, type EmailDeliveryOutcome } from "./commercial-email.js";
import { FakeEmail } from "./fake-email.js";

const id = "10000000-0000-4000-8000-000000000001";
const approvalId = "10000000-0000-4000-8000-000000000002";
const attemptId = "10000000-0000-4000-8000-000000000003";
const content = "Fictional approved quote artifact";
const action: OutboundAction = {
  version: "outbound-action.v1", id, authorizationId: approvalId, adapter: "fake_email",
  providerEffectKey: `quote-email:${id}`, actionType: "quote.send", recipient: '["builder@practice.invalid"]',
  immutableContent: content, contentHash: createHash("sha256").update(content).digest("hex"),
  aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "free-quote-send.v1",
  authorizationExpiresAt: new Date("2099-01-01"),
};

function fixture(approved: OutboundAction | undefined = action, ...outcomes: EmailDeliveryOutcome["kind"][]) {
  let state = "pending";
  const outbox = {
    claimApprovedEmail: vi.fn(async (requestedId: string) => {
      if (approved?.id !== requestedId || (state !== "pending" && state !== "retryable")) return undefined;
      state = "executing";
      return { action: approved, attemptId };
    }),
    completeEmailAttempt: vi.fn(async (_actionId, _attemptId, outcome) => { state = outcome.kind; }),
  } satisfies CommercialEmailOutbox;
  const fake = new FakeEmail(outcomes);
  const adapter = fake.commercial();
  const send = () => dispatchCommercialEmail("synthetic_demo", id, outbox, adapter);
  return { send, outbox, fake, adapter };
}

afterEach(() => vi.unstubAllEnvs());

it.each(["delivered", "rejected", "retryable", "outcome_unknown"] as const)(
  "records the exact email request identity and %s result", async kind => {
    const { send, outbox, fake } = fixture(action, kind);
    const outcome = kind === "delivered" ? { kind, receipt: `fixture:${id}` } : { kind };
    await expect(send()).resolves.toEqual(outcome);
    expect(outbox.claimApprovedEmail).toHaveBeenCalledExactlyOnceWith(id);
    expect(outbox.completeEmailAttempt).toHaveBeenCalledExactlyOnceWith(id, attemptId, outcome);
    expect(fake.records).toEqual([{ request: { category: "commercial", id }, outcome }]);
  },
);

it("passes the exact approved recipient, immutable artifact and stable effect key to the delivery port", async () => {
  const { outbox, adapter } = fixture();
  const deliver = vi.spyOn(adapter, "deliver");
  await dispatchCommercialEmail("synthetic_demo", id, outbox, adapter);
  expect(deliver).toHaveBeenCalledExactlyOnceWith({
    id, providerEffectKey: action.providerEffectKey, recipient: action.recipient, immutableContent: content,
  });
});

it.each(["delivered", "rejected", "outcome_unknown"] as const)("makes no second delivery after %s", async kind => {
  const { send, fake } = fixture(action, kind);
  await send();
  await expect(send()).rejects.toMatchObject({ code: "EMAIL_APPROVAL_UNAVAILABLE" });
  expect(fake.records).toHaveLength(1);
});

it("reuses the stable action ID after a known retryable outcome", async () => {
  const { send, fake } = fixture(action, "retryable", "delivered");
  await send();
  await send();
  expect(fake.records.map(({ request, outcome }) => [request.id, outcome.kind])).toEqual([
    [id, "retryable"], [id, "delivered"],
  ]);
});

it("records a thrown provider result as unknown without returning provider details", async () => {
  const { send, outbox, adapter } = fixture();
  const deliver = vi.spyOn(adapter, "deliver").mockRejectedValue(new Error("fictional confidential provider response"));
  await expect(send()).resolves.toEqual({ kind: "outcome_unknown" });
  expect(outbox.completeEmailAttempt).toHaveBeenCalledExactlyOnceWith(id, attemptId, { kind: "outcome_unknown" });
  await expect(send()).rejects.toMatchObject({ code: "EMAIL_APPROVAL_UNAVAILABLE" });
  expect(deliver).toHaveBeenCalledOnce();
});

it("refuses absent approval or a changed approved artifact before contacting the adapter", async () => {
  const { send, fake, outbox } = fixture();
  outbox.claimApprovedEmail.mockResolvedValueOnce(undefined);
  await expect(send()).rejects.toMatchObject({ code: "EMAIL_APPROVAL_UNAVAILABLE" });
  outbox.claimApprovedEmail.mockResolvedValueOnce({ action: { ...action, immutableContent: "Changed content" }, attemptId });
  await expect(send()).rejects.toMatchObject({ code: "EMAIL_ACTION_MISMATCH" });
  expect(fake.records).toEqual([]);
  expect(outbox.completeEmailAttempt).not.toHaveBeenCalled();
});

it("blocks unavailable adapters and pilot selection before claiming work", async () => {
  const { outbox, fake, adapter } = fixture();
  await expect(dispatchCommercialEmail("synthetic_demo", id, outbox)).rejects.toMatchObject({ code: "EMAIL_ADAPTER_UNAVAILABLE" });
  await expect(dispatchCommercialEmail("pilot_no_charge", id, outbox, adapter)).rejects.toMatchObject({ code: "EMAIL_ADAPTER_UNAVAILABLE" });
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  await expect(dispatchCommercialEmail("synthetic_demo", id, outbox, adapter)).rejects.toMatchObject({ code: "EMAIL_ADAPTER_UNAVAILABLE" });
  expect(outbox.claimApprovedEmail).not.toHaveBeenCalled();
  expect(fake.records).toEqual([]);
});
