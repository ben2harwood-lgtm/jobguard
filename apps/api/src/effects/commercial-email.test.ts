import { createHash } from "node:crypto";
import { pilotApprovalFixture } from "@jobguard/config/test/pilot-approval";
import type { OutboundAction } from "@jobguard/db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pilotCommercialEmailTasks } from "../pilot-worker.js";
import { commercialEmailAdapter, dispatchCommercialEmail, type CommercialEmailOutbox, type EmailDeliveryOutcome } from "./commercial-email.js";
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

beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
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

it.each([undefined, "provider_sandbox", "production_billing", "unknown"])("fails closed directly in the fake and dispatcher in %s", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  const { adapter, outbox, fake } = fixture();
  await expect(adapter.deliver(action)).rejects.toThrow("EMAIL_ADAPTER_UNAVAILABLE");
  await expect(dispatchCommercialEmail(mode, id, outbox, adapter)).rejects.toMatchObject({ code: "EMAIL_ADAPTER_UNAVAILABLE" });
  expect(outbox.claimApprovedEmail).not.toHaveBeenCalled();
  expect(fake.records).toEqual([]);
});

it("accepts current pilot approval and rechecks the deployment before an adapter call", async () => {
  for (const [key, value] of Object.entries(pilotApprovalFixture().env)) vi.stubEnv(key, value);
  const { adapter, outbox } = fixture();
  await expect(dispatchCommercialEmail("pilot_no_charge", id, outbox, adapter)).resolves.toMatchObject({ kind: "delivered" });
  vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", undefined);
  await expect(adapter.deliver(action)).rejects.toThrow("EMAIL_ADAPTER_UNAVAILABLE");
});

it.each([
  ["fake_invoice_delivery", "customer_invoice.send"],
  ["fake_email", "extra.client_approval_request.send"],
  ["fake_email", "customer_portal.signin.send"],
  ["fake_recovery_message", "recovery.message.simulate"],
] as const)("passes the exact fictional artifact and destination for %s %s", async (name, actionType) => {
  const { adapter } = fixture();
  const deliver = vi.spyOn(adapter, "deliver");
  const recipient = "recipient@fixture.invalid";
  const workerAdapter = commercialEmailAdapter(name, "synthetic_demo", adapter);
  const email = { ...action, adapter: name, actionType, recipient };
  await expect(workerAdapter.deliver(email)).resolves.toMatchObject({ kind: "succeeded" });
  expect(deliver).toHaveBeenCalledExactlyOnceWith({ id, providerEffectKey: action.providerEffectKey, recipient, immutableContent: content });
  await expect(workerAdapter.deliver({ ...email, recipient: "unapproved@example.test" })).resolves.toMatchObject({ kind: "retryable" });
  expect(deliver).toHaveBeenCalledOnce();
});

it("stops pilot queue discovery and execution and replays the queued identifier after resume", async () => {
  const env: NodeJS.ProcessEnv = { ...pilotApprovalFixture().env, JOBGUARD_COMMERCIAL_OUTBOUND: "paused" };
  const job = { actionId: id, tenantId: approvalId };
  const outbox = { discover: vi.fn(async () => [job]), execute: vi.fn(async () => {}) };
  const tasks = pilotCommercialEmailTasks(env, outbox);
  const addJob = vi.fn();
  const helpers = { addJob } as unknown as Parameters<NonNullable<typeof tasks.execute_outbox>>[1];
  await tasks.discover_outbox!({}, helpers);
  await expect(tasks.execute_outbox!(job, helpers)).rejects.toThrow("PILOT_QUEUE_EXECUTION_REFUSED");
  expect(outbox.discover).not.toHaveBeenCalled();
  expect(outbox.execute).not.toHaveBeenCalled();
  expect(addJob).not.toHaveBeenCalled();
  env.JOBGUARD_COMMERCIAL_OUTBOUND = "enabled";
  await tasks.discover_outbox!({}, helpers);
  expect(addJob).toHaveBeenCalledExactlyOnceWith("execute_outbox", job, { jobKey: `outbox:${id}`, jobKeyMode: "preserve_run_at" });
  await tasks.execute_outbox!(job, helpers);
  expect(outbox.execute).toHaveBeenCalledExactlyOnceWith(job);
});
