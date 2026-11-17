import { describe, expect, it } from "vitest";
import { checkSyntheticSubscriptionAgreement, refuseLiveSubscriptionAgreement, subscriptionAgreementHash,
  subscriptionAgreementRecordV1, subscriptionAgreementText } from "./subscription-agreement.js";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const selection = { version: "subscription-agreement-selection.v1", termsVersion: "synthetic_subscription_success_terms.v1",
  catalogueVersion: "subscription_pricing_policy_v4", tenantId: a, agreementId: b, revision: 1,
  plan: "Solo", cadence: "monthly", anchorDay: 31, recipientRef: b,
  validFrom: "2026-10-01T00:00:00Z", expiresAt: "2027-10-01T00:00:00Z" };
function fixture() {
  const termsHash = subscriptionAgreementHash(selection);
  return { version: "subscription-agreement-check.v1", environment: "synthetic_demo", tenantId: a,
    now: "2026-10-29T00:00:00Z", currentRevision: 1, currentTermsHash: termsHash,
    currentMembershipVerified: true, providerDefaultsDisabled: true,
    record: { version: "subscription-agreement-record.v1", environment: "synthetic_demo", selection: { ...selection }, termsHash,
      approval: { resolution: "approved", actorMembershipId: a, decisionId: b, commandId: b,
        approvedAt: "2026-09-30T00:00:00Z", termsHash }, state: "active" },
    action: "renewal", billingMode: "paid", amountPence: 2900, reservedAndCollectedPeriodPence: 0 };
}
const currentStatement = { statementId: b, revision: 1, contentHash: "a".repeat(64), sourceHash: "b".repeat(64), principalPence: 500, taxPence: 100 };
function statementFixture() {
  return { ...fixture(), action: "statement", amountPence: 600, currentStatement,
    statementApproval: { ...currentStatement, resolution: "approved", tenantId: a, recipientRef: b,
      agreementId: selection.agreementId, termsRevision: selection.revision, termsHash: subscriptionAgreementHash(selection),
      expiresAt: "2026-11-01T00:00:00Z", decisionId: b } };
}

describe("M4-13 dark subscription and success-fee agreement", () => {
  it("reuses exact versioned prices and binds terms to company, recipient, period and plan", () => {
    const text = subscriptionAgreementText(selection);
    const content = JSON.parse(text);
    expect(content.catalogue.map((p: { monthlyPence: number; maximumPence: number }) => [p.monthlyPence, p.maximumPence]))
      .toEqual([[2900, 4900], [6900, 16900]]);
    expect(content.label).toContain("SYNTHETIC");
    expect(text).toContain("Seven jobs");
    expect(text).toContain("Ten percent");
    expect(text).toContain("Europe/London");
    expect(text).toContain("Each exact statement requires its own human approval");
    expect(subscriptionAgreementHash(Object.fromEntries(Object.entries(selection).reverse()))).toBe(subscriptionAgreementHash(selection));
    for (const change of [{ tenantId: b }, { plan: "Builder" }, { anchorDay: 1 }, { recipientRef: a }, { revision: 2 }, { expiresAt: "2027-09-01T00:00:00Z" }]) {
      expect(subscriptionAgreementHash({ ...selection, ...change })).not.toBe(subscriptionAgreementHash(selection));
      expect(subscriptionAgreementRecordV1.safeParse({ ...fixture().record, selection: { ...selection, ...change } }).success).toBe(false);
    }
  });
  it("permits deterministic preflight only and unconditionally refuses live execution", () => {
    expect(checkSyntheticSubscriptionAgreement(fixture())).toEqual({ version: "subscription-agreement-preflight.v1", eligibleForSimulation: true, productionEnabled: false, realExternalActions: 0 });
    expect(() => refuseLiveSubscriptionAgreement()).toThrow("AGREEMENT_DARK");
    for (const change of [{ environment: "production" }, { providerDefaultsDisabled: false }, { currentMembershipVerified: false }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...fixture(), ...change })).toThrow("INVALID_AGREEMENT");
    }
  });
  it("rejects missing, dismissed, forged or stale approval and cross-tenant use", () => {
    const f = fixture();
    for (const approval of [undefined, { ...f.record.approval, resolution: "dismissed" }, { ...f.record.approval, termsHash: "c".repeat(64) }, { ...f.record.approval, approvedAt: "2026-10-02T00:00:00Z" }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, record: { ...f.record, approval } })).toThrow("INVALID_AGREEMENT");
    }
    for (const change of [{ tenantId: b }, { currentRevision: 2 }, { currentTermsHash: "c".repeat(64) },
      { now: selection.expiresAt }, { now: "2026-09-30T00:00:00Z" }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, ...change })).toThrow("AGREEMENT_INELIGIBLE");
    }
  });
  it("blocks future initiation after revocation, cancellation, pause, failure or supersession including replayed requests", () => {
    const f = fixture();
    checkSyntheticSubscriptionAgreement(f);
    for (const state of ["revoked", "cancelled", "paused", "renewal_failed", "superseded"]) {
      for (const request of [f, statementFixture()]) {
        expect(() => checkSyntheticSubscriptionAgreement({ ...request, record: { ...f.record, state } })).toThrow("AGREEMENT_INELIGIBLE");
      }
    }
  });
  it("enforces aggregate monthly maximum including previous reservations and refuses retry/refund/plan-change scope", () => {
    const f = { ...fixture(), action: "extra_places", amountPence: 2000, reservedAndCollectedPeriodPence: 2900 };
    expect(checkSyntheticSubscriptionAgreement(f).eligibleForSimulation).toBe(true);
    expect(() => checkSyntheticSubscriptionAgreement({ ...f, reservedAndCollectedPeriodPence: 2901 })).toThrow("AGREEMENT_INELIGIBLE");
    expect(() => checkSyntheticSubscriptionAgreement({ ...fixture(), amountPence: 2901 })).toThrow("AGREEMENT_INELIGIBLE");
    for (const amountPence of [-1, 0.5, Number.MAX_SAFE_INTEGER, Infinity]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, amountPence })).toThrow("INVALID_AGREEMENT");
    }
    for (const action of ["retry", "refund", "change_plan", "reverse", "collect_all"]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...fixture(), action })).toThrow("INVALID_AGREEMENT");
    }
  });
  it("requires exact statement reapproval after reversals, credits, tax, invoice or allocation-source changes", () => {
    const f = statementFixture();
    expect(checkSyntheticSubscriptionAgreement(f).eligibleForSimulation).toBe(true);
    expect(() => checkSyntheticSubscriptionAgreement({ ...f, statementApproval: undefined })).toThrow("AGREEMENT_INELIGIBLE");
    for (const change of [{ principalPence: 0 }, { taxPence: 0 }, { revision: 2 }, { sourceHash: "c".repeat(64) }, { contentHash: "c".repeat(64) }, { statementId: a }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, currentStatement: { ...currentStatement, ...change } })).toThrow("AGREEMENT_INELIGIBLE");
    }
    for (const change of [{ tenantId: b }, { recipientRef: a }, { expiresAt: f.now }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, statementApproval: { ...f.statementApproval, ...change } })).toThrow("AGREEMENT_INELIGIBLE");
    }
    expect(() => checkSyntheticSubscriptionAgreement({ ...f, amountPence: 601 })).toThrow("AGREEMENT_INELIGIBLE");
  });
  it("requires statement approval bound to the exact agreement and approved terms revision/hash", () => {
    const f = statementFixture();
    for (const change of [{ agreementId: a }, { termsRevision: 2 }, { termsHash: "c".repeat(64) }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, statementApproval: { ...f.statementApproval, ...change } }))
        .toThrow("AGREEMENT_INELIGIBLE");
    }
    for (const field of ["agreementId", "termsRevision", "termsHash"] as const) {
      const approval: Partial<typeof f.statementApproval> = { ...f.statementApproval };
      delete approval[field];
      expect(() => checkSyntheticSubscriptionAgreement({ ...f, statementApproval: approval })).toThrow("INVALID_AGREEMENT");
    }
    // Keep the exact statement and recipient while approving different agreement terms.
    for (const change of [{ agreementId: a }, { revision: 2 }, { anchorDay: 1 }]) {
      const updatedSelection = { ...selection, ...change };
      const termsHash = subscriptionAgreementHash(updatedSelection);
      const request = { ...f, currentRevision: updatedSelection.revision, currentTermsHash: termsHash,
        record: { ...f.record, selection: updatedSelection, termsHash,
          approval: { ...f.record.approval, termsHash } } };
      expect(() => checkSyntheticSubscriptionAgreement(request)).toThrow("AGREEMENT_INELIGIBLE");
      expect(checkSyntheticSubscriptionAgreement({ ...request, statementApproval: { ...f.statementApproval,
        agreementId: updatedSelection.agreementId, termsRevision: updatedSelection.revision, termsHash } })
        .eligibleForSimulation).toBe(true);
    }
  });
  it("keeps pilot fee-free and trial subscription-free without exempting trial success fees", () => {
    for (const billingMode of ["first_job_trial", "pilot_no_charge"]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...fixture(), billingMode })).toThrow("AGREEMENT_INELIGIBLE");
    }
    expect(checkSyntheticSubscriptionAgreement({ ...statementFixture(), billingMode: "first_job_trial" }).eligibleForSimulation).toBe(true);
    expect(() => checkSyntheticSubscriptionAgreement({ ...statementFixture(), billingMode: "pilot_no_charge" })).toThrow("AGREEMENT_INELIGIBLE");
  });
  it("rejects shadow, lock, settlement and credit overrides; exposes no hidden-data projection", () => {
    for (const extra of [{ shadowCount: 1 }, { lockedBillId: b }, { settled: true }, { subscriptionCreditAgainstFee: 100 }, { noticeDays: 0 }]) {
      expect(() => checkSyntheticSubscriptionAgreement({ ...fixture(), ...extra })).toThrow("INVALID_AGREEMENT");
    }
    expect(() => subscriptionAgreementText({ ...selection, cadence: "annual" })).toThrow("INVALID_AGREEMENT");
    expect(() => subscriptionAgreementText({ ...selection, monthlyPence: 1 })).toThrow("INVALID_AGREEMENT");
    expect(checkSyntheticSubscriptionAgreement({ ...fixture(), action: "notice", amountPence: 0 }).realExternalActions).toBe(0);
    expect(() => checkSyntheticSubscriptionAgreement({ ...fixture(), action: "notice" })).toThrow("AGREEMENT_INELIGIBLE");
  });
});
