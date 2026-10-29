import { describe, expect, it } from "vitest";
import {
  buildDunningReminder, DunningFixtureWorkbench, dunningApprovalMatches, DUNNING_POLICY,
  DUNNING_PROVIDER_AUTOMATION, dunningServiceAccess, evaluateDunningRetry, executeDunning, unpaidInvoiceWorkbench,
} from "./dunning.js";
import { MAX_MONEY_PENCE } from "./money.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const scope = { version: "dunning-scope.v1", environment: "synthetic_demo", tenantId: uuid(1), jobId: uuid(2), permission: "manage_dunning" };
const invoice = {
  version: "dunning-invoice.v1", environment: "synthetic_demo", tenantId: uuid(1), jobId: uuid(2), invoiceId: uuid(3), revision: 1,
  sourceRevision: 2, sourceHash: "a".repeat(64), sourceState: "issued_invoice", finalAccountLockId: null,
  currency: "GBP", originalPence: 10001, outstandingPence: 10001, dueTick: 2, category: "platform_to_builder",
  recipient: "builder@example.invalid", pilotNoCharge: false, disputed: false, refundPending: false, reversed: false,
  cancelled: false, attemptState: "definite_failure",
};
const command = { version: "dunning-command.v1", commandId: uuid(4), idempotencyKey: uuid(5), invoiceId: uuid(3), expectedRevision: 1, action: "request_reminder" };
const retry = {
  version: "dunning-retry.v1", owner: "existing_payment_owner", attempts: 0, failedAtTick: 2,
  authority: "approved", authorityId: uuid(8), tenantId: uuid(1), jobId: uuid(2), invoiceId: uuid(3), invoiceRevision: 1,
  expiresTick: 20, remainingAuthorityPence: 10001, providerAllowsRetry: true,
  d05Approved: true, authorityPolicy: DUNNING_POLICY.authorityPolicy,
};
function approval() {
  return { version: "dunning-approval.v1", decisionId: uuid(9), tenantId: uuid(1), jobId: uuid(2), invoiceId: uuid(3),
    action: "dunning.reminder.preview", status: "approved", contentHash: buildDunningReminder(scope, invoice, 3).contentHash,
    policyVersion: DUNNING_POLICY.version, expiresTick: 20 };
}

describe("M4-16 dark unpaid workbench and reminder Decisions", () => {
  it("creates only one pending Decision for duplicates and semantic replays", () => {
    const fake = new DunningFixtureWorkbench([invoice]);
    const first = fake.command(scope, command, 3);
    expect(fake.command(scope, { ...command }, 4)).toBe(first);
    expect(fake.command(scope, { ...command, commandId: uuid(10), idempotencyKey: uuid(11) }, 4)).toBe(first);
    expect(first?.status).toBe("pending");
    expect(first?.reminder.amount).toEqual({ pence: 10001, currency: "GBP" });
    expect(first?.reminder.body).toContain("£100.01");
    expect(Object.isFrozen(first?.reminder)).toBe(true);
    expect(Object.isFrozen(first?.reminder.amount)).toBe(true);
  });
  it.each([
    { action: "cancel_collection" }, { expectedRevision: 2 }, { commandId: uuid(12) }, { idempotencyKey: uuid(13) },
  ])("conflicts on command or idempotency key reused with changed input: %j", changed => {
    const fake = new DunningFixtureWorkbench([invoice]);
    fake.command(scope, command, 3);
    expect(() => fake.command(scope, { ...command, ...changed }, 3)).toThrow("DUNNING_CONFLICT");
  });
  it.each(["pilotNoCharge", "disputed", "refundPending", "reversed", "cancelled"])("suppresses %s before and after drafting", flag => {
    const blocked = { ...invoice, [flag]: true };
    expect(() => buildDunningReminder(scope, blocked, 3)).toThrow("DUNNING_UNAVAILABLE");
    const fake = new DunningFixtureWorkbench([invoice]);
    fake.command(scope, command, 3);
    fake.replace({ ...blocked, revision: 2 });
    expect(() => fake.command(scope, command, 3)).toThrow("DUNNING_UNAVAILABLE");
    expect(() => fake.command(scope, { ...command, commandId: uuid(14), idempotencyKey: uuid(15), expectedRevision: 2 }, 3)).toThrow("DUNNING_UNAVAILABLE");
  });
  it.each(["pending", "outcome_unknown", "settled"])("does not chase attempt state %s", attemptState => {
    expect(() => buildDunningReminder(scope, { ...invoice, attemptState }, 3)).toThrow("DUNNING_UNAVAILABLE");
  });
  it("regenerates a changed balance and rejects stale approvals and stale command replays", () => {
    const fake = new DunningFixtureWorkbench([invoice]);
    const first = fake.command(scope, command, 3)!;
    const next = { ...invoice, revision: 2, outstandingPence: 1 };
    fake.replace(next);
    expect(dunningApprovalMatches(scope, invoice, approval(), 3)).toBe(true);
    expect(dunningApprovalMatches(scope, next, approval(), 3)).toBe(false);
    expect(() => fake.command(scope, command, 3)).toThrow("DUNNING_UNAVAILABLE");
    const second = fake.command(scope, { ...command, commandId: uuid(16), idempotencyKey: uuid(17), expectedRevision: 2 }, 3)!;
    expect(second.reminder.contentHash).not.toBe(first.reminder.contentHash);
    expect(second.reminder.body).toContain("£0.01");
  });
  it.each([true, false])("cancellation before reminder=%s remains stopped through late facts", before => {
    const fake = new DunningFixtureWorkbench([invoice]);
    if (!before) fake.command(scope, command, 3);
    const cancel = { ...command, action: "cancel_collection", commandId: uuid(18), idempotencyKey: uuid(19) };
    expect(fake.command(scope, cancel, 3)).toBeNull();
    expect(fake.command(scope, cancel, 3)).toBeNull();
    fake.replace({ ...invoice, revision: 2, outstandingPence: 1 });
    expect(fake.list(scope, 3)[0]?.suppression).toBe("cancelled");
    expect(() => fake.command(scope, { ...command, commandId: uuid(20), idempotencyKey: uuid(21), expectedRevision: 2 }, 3)).toThrow("DUNNING_UNAVAILABLE");
  });
  it("does not reuse command keys across invoice subjects, and permits independent tenant keys", () => {
    const otherInvoice = { ...invoice, invoiceId: uuid(31) };
    const otherTenant = { ...invoice, tenantId: uuid(32) };
    const fake = new DunningFixtureWorkbench([invoice, otherInvoice, otherTenant]);
    fake.command(scope, command, 3);
    expect(() => fake.command(scope, { ...command, invoiceId: uuid(31) }, 3)).toThrow("DUNNING_CONFLICT");
    expect(fake.command({ ...scope, tenantId: uuid(32) }, command, 3)?.reminder.tenantId).toBe(uuid(32));
  });
  it("invalidates approvals when a reversal or refund arrives after drafting", () => {
    for (const changed of [{ reversed: true }, { refundPending: true }, { outstandingPence: 0 }]) {
      expect(() => dunningApprovalMatches(scope, { ...invoice, ...changed, revision: 2 }, approval(), 3)).toThrow("DUNNING_UNAVAILABLE");
    }
  });
  it("refuses duplicate fixture identities, reordered facts and moving an invoice between jobs", () => {
    expect(() => new DunningFixtureWorkbench([invoice, invoice])).toThrow("DUNNING_CONFLICT");
    const fake = new DunningFixtureWorkbench([invoice]);
    expect(() => fake.replace(invoice)).toThrow("DUNNING_CONFLICT");
    fake.replace({ ...invoice, reversed: true, revision: 3 });
    expect(() => fake.replace({ ...invoice, revision: 2 })).toThrow("DUNNING_CONFLICT");
    expect(() => fake.replace({ ...invoice, revision: 4, jobId: uuid(30) })).toThrow("DUNNING_CONFLICT");
  });
  it.each([{ tenantId: uuid(30) }, { jobId: uuid(30) }])("refuses foreign scope %j without revealing identity", changed => {
    const fake = new DunningFixtureWorkbench([invoice]);
    expect(() => fake.command({ ...scope, ...changed }, command, 3)).toThrow(/^DUNNING_UNAVAILABLE$/u);
    expect(() => buildDunningReminder({ ...scope, ...changed }, invoice, 3)).toThrow(/^DUNNING_UNAVAILABLE$/u);
    expect(fake.list({ ...scope, ...changed }, 3)).toEqual([]);
    expect(unpaidInvoiceWorkbench(scope, [{ ...invoice, ...changed }], 3)).toEqual([]);
  });
  it("has allowlisted outputs; rejects hidden facts and real recipients with redacted errors", () => {
    const result = unpaidInvoiceWorkbench(scope, [invoice], 3);
    expect(Object.keys(result[0]!).sort()).toEqual(["action", "amount", "category", "invoiceId", "revision", "suppression"].sort());
    for (const changed of [{ shadowSignal: "secret" }, { recipient: "private@example.com" }, { apiKey: "secret" }]) {
      expect(() => buildDunningReminder(scope, { ...invoice, ...changed }, 3)).toThrow(/^INVALID_DUNNING_INPUT$/u);
    }
    expect(() => buildDunningReminder({ ...scope, permission: "read" }, invoice, 3)).toThrow("INVALID_DUNNING_INPUT");
  });
  it.each([-1, 0.01, MAX_MONEY_PENCE + 1, Number.MAX_SAFE_INTEGER, NaN])("rejects invalid amount %s", outstandingPence => {
    expect(() => buildDunningReminder(scope, { ...invoice, outstandingPence }, 3)).toThrow("INVALID_DUNNING_INPUT");
  });
  it("suppresses zero, bounds source amounts, and formats cap and pennies exactly", () => {
    expect(() => buildDunningReminder(scope, { ...invoice, outstandingPence: 0 }, 3)).toThrow("DUNNING_UNAVAILABLE");
    expect(() => buildDunningReminder(scope, { ...invoice, outstandingPence: 10002 }, 3)).toThrow("INVALID_DUNNING_INPUT");
    expect(buildDunningReminder(scope, { ...invoice, originalPence: MAX_MONEY_PENCE, outstandingPence: MAX_MONEY_PENCE }, 3).body).toContain("£10,000,000,000.00");
    expect(() => buildDunningReminder(scope, invoice, 1)).toThrow("DUNNING_UNAVAILABLE");
  });
  it("references locked final accounts without mutation; refuses draft/superseded sources", () => {
    for (const sourceState of ["draft_final_account", "superseded_final_account"]) {
      expect(() => buildDunningReminder(scope, { ...invoice, sourceState }, 3)).toThrow("DUNNING_UNAVAILABLE");
    }
    const locked = { ...invoice, sourceState: "locked_final_account", finalAccountLockId: uuid(22) };
    const before = JSON.stringify(locked);
    expect(buildDunningReminder(scope, locked, 3).finalAccountLockId).toBe(uuid(22));
    expect(JSON.stringify(locked)).toBe(before);
    expect(() => buildDunningReminder(scope, { ...locked, finalAccountLockId: null }, 3)).toThrow("INVALID_DUNNING_INPUT");
    expect(dunningApprovalMatches(scope, { ...locked, sourceRevision: 3 }, approval(), 3)).toBe(false);
  });
  it.each(["customer", "supplier", "platform_to_builder"])("binds category %s and exact recipient/content", category => {
    const reminder = buildDunningReminder(scope, { ...invoice, category }, 3);
    expect(reminder.category).toBe(category);
    expect(reminder.recipient).toBe(invoice.recipient);
    if (category !== invoice.category) expect(reminder.contentHash).not.toBe(approval().contentHash);
    expect(dunningApprovalMatches(scope, { ...invoice, recipient: "another@example.invalid" }, approval(), 3)).toBe(false);
  });
  it.each(["pending", "dismissed", "revoked", "expired", "superseded"])("requires approved Decision rather than %s", status => {
    expect(dunningApprovalMatches(scope, invoice, { ...approval(), status }, 3)).toBe(false);
  });
  it("checks approval expiry and tenant/job/invoice/action bindings", () => {
    expect(dunningApprovalMatches(scope, invoice, approval(), 20)).toBe(false);
    for (const key of ["tenantId", "jobId", "invoiceId"]) {
      expect(dunningApprovalMatches(scope, invoice, { ...approval(), [key]: uuid(30) }, 3)).toBe(false);
    }
    expect(() => dunningApprovalMatches(scope, invoice, { ...approval(), action: "send" }, 3)).toThrow("INVALID_DUNNING_INPUT");
  });
});

describe("M4-16 retry advice, provider controls and service access", () => {
  it("advises only the existing owner within fixture policy; never executes", () => {
    expect(evaluateDunningRetry(scope, invoice, retry, 2).reason).toBe("not_due");
    expect(evaluateDunningRetry(scope, invoice, retry, 3)).toMatchObject({ reason: "review_existing_owner", executable: false, owner: "existing_payment_owner" });
    expect(evaluateDunningRetry(scope, invoice, { ...retry, attempts: 1 }, 4).reason).toBe("not_due");
    expect(evaluateDunningRetry(scope, invoice, { ...retry, attempts: 1 }, 5).reason).toBe("review_existing_owner");
    expect(evaluateDunningRetry(scope, invoice, { ...retry, attempts: 2 }, 8).reason).toBe("not_due");
    expect(evaluateDunningRetry(scope, invoice, { ...retry, attempts: 2 }, 9).reason).toBe("review_existing_owner");
    expect(evaluateDunningRetry(scope, invoice, { ...retry, attempts: 3 }, 10).reason).toBe("attempt_limit");
    expect(evaluateDunningRetry(scope, invoice, { ...retry, failedAtTick: Number.MAX_SAFE_INTEGER }, 3).reason).toBe("not_due");
  });
  it.each(["expired", "revoked", "failed_consent", "missing"])("requires renewed %s authority", authority => {
    expect(evaluateDunningRetry(scope, invoice, { ...retry, authority }, 3).reason).toBe("renew_authority");
  });
  it("checks D05, expiry, owner, provider, source balance and exact authority scope", () => {
    for (const changed of [{ d05Approved: false }, { expiresTick: 3 }]) {
      expect(evaluateDunningRetry(scope, invoice, { ...retry, ...changed }, 3).reason).toBe("renew_authority");
    }
    for (const owner of ["provider", "other"]) expect(evaluateDunningRetry(scope, invoice, { ...retry, owner }, 3).reason).toBe("owner_conflict");
    expect(evaluateDunningRetry(scope, invoice, { ...retry, providerAllowsRetry: false }, 3).reason).toBe("provider_refused");
    for (const remainingAuthorityPence of [0, 10000]) expect(evaluateDunningRetry(scope, invoice, { ...retry, remainingAuthorityPence }, 3).reason).toBe("authority_limit");
    for (const key of ["tenantId", "jobId", "invoiceId"]) {
      expect(() => evaluateDunningRetry(scope, invoice, { ...retry, [key]: uuid(30) }, 3)).toThrow("DUNNING_UNAVAILABLE");
    }
    expect(() => evaluateDunningRetry(scope, invoice, { ...retry, invoiceRevision: 2 }, 3)).toThrow("DUNNING_UNAVAILABLE");
    expect(evaluateDunningRetry(scope, { ...invoice, attemptState: "none" }, retry, 3).reason).toBe("no_failed_attempt");
  });
  it.each(["pilotNoCharge", "disputed", "refundPending", "reversed", "cancelled"])("blocks retry for %s", flag => {
    expect(evaluateDunningRetry(scope, { ...invoice, [flag]: true }, retry, 3).reason).not.toBe("review_existing_owner");
  });
  it.each(["pending", "outcome_unknown", "settled"])("never retries %s or an already paid balance", attemptState => {
    expect(evaluateDunningRetry(scope, { ...invoice, attemptState }, retry, 3).reason).not.toBe("review_existing_owner");
    expect(evaluateDunningRetry(scope, { ...invoice, outstandingPence: 0 }, retry, 3).reason).toBe("paid");
  });
  it("inventories disabled provider emails and retries without claiming live verification", () => {
    expect(DUNNING_PROVIDER_AUTOMATION.length).toBe(13);
    expect(new Set(DUNNING_PROVIDER_AUTOMATION.map(row => `${row.provider}:${row.automation}`)).size).toBe(13);
    expect(DUNNING_PROVIDER_AUTOMATION.every(row => row.state === "disabled" && !row.liveVerified)).toBe(true);
    expect(Object.isFrozen(DUNNING_PROVIDER_AUTOMATION[0])).toBe(true);
    expect(DUNNING_POLICY.executionEnabled).toBe(false);
    expect(() => executeDunning()).toThrow("DUNNING_DARK");
    expect(() => buildDunningReminder({ ...scope, environment: "production" }, invoice, 3)).toThrow("INVALID_DUNNING_INPUT");
  });
  it.each(["active", "suspended", "cancelled"])("preserves ledger/evidence/export access for %s", status => {
    const access = dunningServiceAccess({ version: "dunning-service.v1", environment: "synthetic_demo", policyVersion: "dunning-access-reference.v1", status });
    expect(access).toMatchObject({ ledger: true, evidence: true, export: true, deleteData: false, policyStatus: "proposed", newWork: status === "active", collection: status === "active" });
    expect(() => dunningServiceAccess({ ...access, environment: "production" })).toThrow("INVALID_DUNNING_INPUT");
  });
});
