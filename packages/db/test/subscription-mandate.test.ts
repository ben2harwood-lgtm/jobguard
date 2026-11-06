import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { subscriptionAgreementHash } from "@jobguard/core";
import { SubscriptionMandateError, SubscriptionMandateRepository } from "../src/subscription-mandate-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const tenantId = randomUUID(), recipientRef = randomUUID(), digest = "a".repeat(64);
const selection = { version: "subscription-agreement-selection.v1", termsVersion: "synthetic_subscription_success_terms.v1",
  catalogueVersion: "subscription_pricing_policy_v4", tenantId, agreementId: randomUUID(), revision: 1,
  plan: "Solo", cadence: "monthly", anchorDay: 1, recipientRef,
  validFrom: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" };
const termsHash = subscriptionAgreementHash(selection);
const record = { version: "subscription-agreement-record.v1", environment: "synthetic_demo", selection, termsHash,
  state: "active", approval: { resolution: "approved", actorMembershipId: randomUUID(), decisionId: randomUUID(),
    commandId: randomUUID(), approvedAt: "2025-12-31T00:00:00Z", termsHash } };
const request = { version: "subscription-mandate-collection.v1", environment: "synthetic_demo", action: "renewal",
  recipientRef, currentRevision: 1, currentTermsHash: termsHash, billingMode: "paid", providerDefaultsDisabled: true,
  amountPence: 2900, reservedAndCollectedPeriodPence: 0 };
const snapshot = { now: "2026-10-29T00:00:00Z", sequence: 1, authorityCurrent: true, providerCancellation: "not_requested", record };
function fake(value: unknown = snapshot, failure?: string | Error) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const client = { query: async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (sql.startsWith("SELECT app.m413")) {
      if (failure) throw typeof failure === "string" ? new Error(failure) : failure;
      return { rows: [{ result: value }] };
    }
    return { rows: [] };
  }, release() {} };
  return { calls, repository: new SubscriptionMandateRepository({ connect: async () => client } as unknown as Pool) };
}
const context = testTenantContext(tenantId);
describe("M4-13 persisted mandate consumer boundary (deterministic SQL fake)", () => {
  it("refuses live initiation even with a valid synthetic approval", async () => {
    const { repository, calls } = fake();
    expect(await repository.mayInitiate(context, digest, request)).toMatchObject({ mayInitiate: false, reason: "AGREEMENT_DARK", eligibleForSimulation: true });
    expect(calls.at(-1)?.sql).toBe("COMMIT");
    expect(await repository.mayInitiate(context, digest, { ...request, environment: "production" })).toMatchObject({ reason: "AGREEMENT_DARK", eligibleForSimulation: false });
  });
  it.each(["revoked", "cancelled", "paused", "renewal_failed", "superseded"])("refuses %s", async state => {
    expect(await fake({ ...snapshot, record: { ...record, state } }).repository.mayInitiate(context, digest, request))
      .toMatchObject({ reason: state.toUpperCase(), mayInitiate: false });
  });
  it("distinguishes missing approval, stale terms, authority and scope failures", async () => {
    expect(await fake({ record: null, reason: "NOT_APPROVED" }).repository.mayInitiate(context, digest, request)).toMatchObject({ reason: "NOT_APPROVED" });
    expect(await fake({ ...snapshot, authorityCurrent: false }).repository.mayInitiate(context, digest, request)).toMatchObject({ reason: "APPROVAL_NO_LONGER_VALID" });
    const { repository } = fake();
    for (const [patch, reason] of [
      [{ currentTermsHash: "b".repeat(64) }, "SUPERSEDED_TERMS"], [{ currentRevision: 2 }, "SUPERSEDED_TERMS"],
      [{ recipientRef: randomUUID() }, "RECIPIENT_OUTSIDE_AUTHORITY"], [{ billingMode: "pilot_no_charge" }, "PILOT_EXEMPT"],
      [{ providerDefaultsDisabled: false }, "PROVIDER_DEFAULTS_UNAPPROVED"], [{ action: "statement" }, "STATEMENT_REQUIRES_EXACT_LOCKED_APPROVAL"],
      [{ billingMode: "first_job_trial" }, "OUTSIDE_BOUNDED_AUTHORITY"], [{ amountPence: 0 }, "OUTSIDE_BOUNDED_AUTHORITY"],
      [{ amountPence: 2901 }, "OUTSIDE_BOUNDED_AUTHORITY"], [{ reservedAndCollectedPeriodPence: 2001 }, "OUTSIDE_BOUNDED_AUTHORITY"],
    ] as const) expect(await repository.mayInitiate(context, digest, { ...request, ...patch })).toMatchObject({ reason });
    expect(await repository.mayInitiate(context, digest, { ...request, reservedAndCollectedPeriodPence: 2000 })).toMatchObject({ eligibleForSimulation: true });
  });
  it("uses database time for validity and rejects injected jobs, hidden data and bill overrides", async () => {
    for (const [now, reason] of [["2025-12-31T00:00:00Z", "NOT_YET_VALID"], [selection.expiresAt, "EXPIRED"]])
      expect(await fake({ ...snapshot, now }).repository.mayInitiate(context, digest, request)).toMatchObject({ reason });
    for (const patch of [{ amountPence: -1 }, { amountPence: 0.5 }, { jobId: randomUUID() },
      { finalAccountRevision: randomUUID() }, { lockedBill: true }, { shadowSignals: [] },
      { action: "retry" }, { action: "refund" }, { monthlyPence: 1 }, { includedJobs: 100 },
      { currentStatement: { sourceHash: "c".repeat(64), principalPence: 0 } }, { now: "2026-10-29T00:00:00Z" }])
      await expect(fake().repository.mayInitiate(context, digest, { ...request, ...patch })).rejects.toThrow("MANDATE_INVALID");
  });
  it("constructs approval text on the server and sanitizes SQL errors with rollback", async () => {
    const { repository, calls } = fake({ version: "subscription-mandate-result.v1", sequence: 1, state: "active", productionEnabled: false });
    await repository.command(context, digest, randomUUID(), { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0, selection });
    const sent = JSON.parse(calls.find(call => call.sql.startsWith("SELECT app.m413"))!.args[3] as string);
    expect(sent.termsHash).toBe(termsHash); expect(sent.termsText).toContain("SYNTHETIC");
    await expect(repository.command(context, digest, randomUUID(), { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0, selection: { ...selection, tenantId: randomUUID() } })).rejects.toThrow("MANDATE_FORBIDDEN");
    const bad = fake(snapshot, "secret fake-person@example.invalid");
    await expect(bad.repository.read(context, digest)).rejects.toThrow(/^MANDATE_UNAVAILABLE$/u);
    expect(bad.calls.at(-1)?.sql).toBe("ROLLBACK");
    await expect(fake(snapshot, "MANDATE_STALE").repository.read(context, digest)).rejects.toThrow("MANDATE_STALE");
  });

  it.each(["bind", "authority lookup"] as const)("maps %s refusal after rollback and release without accessing mandate SQL", async stage => {
    const bindSql = "SELECT app.bind_request($1, $2, $3)";
    const authoritySql = "SELECT app.current_actor() actor, app.current_tenant() tenant";
    const calls: string[] = [], business = vi.fn(), release = vi.fn();
    const query = async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT app.m413")) business();
      if (sql === (stage === "bind" ? bindSql : authoritySql)) {
        throw Object.assign(new Error("fictional private database detail"), { code: "42501" });
      }
      return { rows: [] };
    };
    const membership = { tenantId, identityUserId: randomUUID(), membershipId: randomUUID() } as AuthenticatedMembership;
    const verified = verifiedTenantContextFromMembership(membership, { kind: "real", credential: digest });
    const repository = new SubscriptionMandateRepository({ connect: async () => ({ query, release }) } as unknown as Pool);
    const failure = await repository.read(verified, digest).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SubscriptionMandateError);
    expect(failure).toMatchObject({ code: "MANDATE_FORBIDDEN", message: "MANDATE_FORBIDDEN" });
    expect(calls).toEqual(stage === "bind" ? ["BEGIN", bindSql, "ROLLBACK"] : ["BEGIN", bindSql, authoritySql, "ROLLBACK"]);
    expect(business).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([
    Object.assign(new Error("FORBIDDEN"), { code: "42501" }),
    Object.assign(new Error("FORBIDDEN"), { name: "RequestBindingRefusedError" }),
  ])("does not misclassify unrelated business SQL or forged error names as binding refusals", async failure => {
    const f = fake(snapshot, failure);
    await expect(f.repository.read(context, digest)).rejects.toMatchObject({ code: "MANDATE_UNAVAILABLE" });
    expect(f.calls.some(call => call.sql.startsWith("SELECT app.m413"))).toBe(true);
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
});
