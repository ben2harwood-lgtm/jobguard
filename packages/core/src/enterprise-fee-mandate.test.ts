import { describe, expect, it, vi } from "vitest";
import { checkSyntheticEnterpriseFeeMandate, enterpriseFeeMandateHash, enterpriseFeeMandateRecordV1,
  refuseLiveEnterpriseFeeMandate } from "./enterprise-fee-mandate.js";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const c = "00000000-0000-4000-8000-000000000003";
const selection = { version: "enterprise-fee-mandate-selection.v1", tenantId: a, agreementVersionId: b,
  agreementTermsHash: "a".repeat(64), rate: { version: "fee-rate.v1", policyVersion: "enterprise_site_capture_policy_v1", numerator: "1", denominator: "10" }, scopeHash: "b".repeat(64),
  recipientRef: b, policyVersion: "enterprise_site_capture_policy_v1", collectionScope: "exact_statement_only",
  validFrom: "2026-10-01T00:00:00Z", expiresAt: "2027-10-01T00:00:00Z" };
const statement = { statementId: b, revisionId: c, contentHash: "c".repeat(64), sourceHash: "d".repeat(64),
  principalPence: 1000, taxPence: 200 };
function fixture() {
  const termsHash = enterpriseFeeMandateHash(selection);
  return { version: "enterprise-fee-mandate-check.v1", environment: "synthetic_demo", tenantId: a,
    now: "2026-11-01T00:00:00Z", currentSelection: structuredClone(selection),
    record: { version: "enterprise-fee-mandate-record.v1", environment: "synthetic_demo", mandateId: c,
      selection: structuredClone(selection), termsHash, state: "active",
      approval: { resolution: "approved", actorMembershipId: a, decisionId: b, commandId: c,
        approvedAt: "2026-09-30T00:00:00Z", termsHash, noticeProcessEvidenceHash: "e".repeat(64) } },
    currentMembershipVerified: true, providerDefaultsDisabled: true, providerMandateState: "active",
    billingMode: "paid", action: "collect", attemptState: "not_started", currentStatement: { ...statement }, amountPence: 1200,
    statementApproval: { ...statement, resolution: "approved", tenantId: a, recipientRef: b, decisionId: c,
      expiresAt: "2026-12-01T00:00:00Z" } };
}
/** Local fake rail only. No SDK, transport, persistent state or production adapter. */
function fakeRail() {
  const collect = vi.fn(() => ({ outcome: "simulated" }));
  return { collect, start(raw: unknown) { checkSyntheticEnterpriseFeeMandate(raw); return collect(); } };
}
function blocked(raw: unknown, code = "MANDATE_INELIGIBLE") {
  const rail = fakeRail();
  expect(() => rail.start(raw)).toThrow(code);
  expect(rail.collect).not.toHaveBeenCalled();
}

describe("ENT-14 dark contractor fee mandate — fictional fixtures only", () => {
  it("binds human approval to exact tenant, agreement version, terms and statement", () => {
    const f = fixture();
    expect(fakeRail().start(f)).toEqual({ outcome: "simulated" });
    expect(checkSyntheticEnterpriseFeeMandate(f).productionEnabled).toBe(false);
    blocked({ ...f, tenantId: b });
    blocked({ ...f, currentSelection: { ...selection, agreementVersionId: c } });
    blocked({ ...f, record: { ...f.record, approval: undefined } }, "INVALID_MANDATE");
    blocked({ ...f, record: { ...f.record, approval: { ...f.record.approval, resolution: "dismissed" } } }, "INVALID_MANDATE");
    blocked({ ...f, currentMembershipVerified: false }, "INVALID_MANDATE");
    blocked({ ...f, now: selection.expiresAt });
    blocked({ ...f, now: "2026-09-29T00:00:00Z" });
    blocked({ ...f, statementApproval: { ...f.statementApproval, expiresAt: f.now } });
    blocked({ ...f, statementApproval: { ...f.statementApproval, recipientRef: a } });
    blocked({ ...f, amountPence: 1201 });
    for (const change of [{ contentHash: "f".repeat(64) }, { sourceHash: "f".repeat(64) }, { principalPence: 999 },
      { taxPence: 0 }, { statementId: a }, { revisionId: a }]) {
      blocked({ ...f, currentStatement: { ...statement, ...change } });
    }
  });
  it("changed rates require a new human-approved record and notice-process evidence", () => {
    const f = fixture(), changed = { ...selection, agreementVersionId: c, rate: { ...selection.rate, numerator: "2" } };
    blocked({ ...f, currentSelection: changed });
    blocked({ ...f, currentSelection: changed, record: { ...f.record, selection: changed } }, "INVALID_MANDATE");
    const termsHash = enterpriseFeeMandateHash(changed);
    const replacement = { ...f.record, mandateId: b, selection: changed, termsHash,
      approval: { ...f.record.approval, decisionId: c, commandId: b, termsHash } };
    // A fictional new approval, not an automated change or real notice-policy approval.
    expect(checkSyntheticEnterpriseFeeMandate({ ...f, currentSelection: changed, record: replacement }).eligibleForSimulation).toBe(true);
    blocked({ ...f, currentSelection: changed, record: { ...replacement,
      approval: { ...replacement.approval, noticeProcessEvidenceHash: undefined } } }, "INVALID_MANDATE");
  });
  it("changed scope invalidates the mandate until a new human-approved record exists", () => {
    const f = fixture(), changed = { ...selection, agreementVersionId: c, scopeHash: "f".repeat(64) };
    blocked({ ...f, currentSelection: changed });
    const termsHash = enterpriseFeeMandateHash(changed);
    blocked({ ...f, currentSelection: changed, record: { ...f.record, selection: changed, termsHash } }, "INVALID_MANDATE");
    expect(checkSyntheticEnterpriseFeeMandate({ ...f, currentSelection: changed, record: { ...f.record,
      mandateId: b, selection: changed, termsHash, approval: { ...f.record.approval, decisionId: c, commandId: b, termsHash } } })
      .eligibleForSimulation).toBe(true);
  });
  it("revocation and cancellation stop future initiation and replay", () => {
    for (const state of ["revoked", "cancelled", "superseded"]) {
      const f = fixture();
      for (let replay = 0; replay < 2; replay++) blocked({ ...f, record: { ...f.record, state } });
    }
  });
  it("provider-side cancellation stops initiation without asserting refund or settlement", () => {
    for (const providerMandateState of ["cancelled", "unknown"]) blocked({ ...fixture(), providerMandateState });
  });
  it("in-flight collections cannot be initiated again", () => {
    blocked({ ...fixture(), attemptState: "in_flight" });
  });
  it("unknown outcomes fence repeated collections and retries until reconciliation", () => {
    for (const action of ["collect", "retry"]) {
      for (let replay = 0; replay < 2; replay++) blocked({ ...fixture(), action, attemptState: "outcome_unknown" }, "OUTCOME_UNKNOWN");
    }
  });
  it("retries have no standing authority even after definite failure", () => {
    blocked({ ...fixture(), action: "retry", attemptState: "definite_failure" });
    blocked({ ...fixture(), attemptState: "definite_failure" });
    blocked({ ...fixture(), attemptState: "settled" });
    blocked({ ...fixture(), providerDefaultsDisabled: false }, "INVALID_MANDATE");
  });
  it("refunds need separate authority and cannot be inferred from cancellation", () => {
    blocked({ ...fixture(), action: "refund", attemptState: "settled" });
    const f = fixture();
    blocked({ ...f, action: "refund", record: { ...f.record, state: "cancelled" } });
  });
  it("pilot exemption means no fee at all even with an otherwise valid mandate", () => {
    for (const action of ["collect", "retry", "refund"]) blocked({ ...fixture(), action, billingMode: "pilot_no_charge" });
  });
  it("workers cannot create or alter mandates and no supplied approval enables real execution", () => {
    const f = fixture(), before = structuredClone(f);
    checkSyntheticEnterpriseFeeMandate(f);
    expect(f).toEqual(before);
    for (const action of ["create_mandate", "change_agreement", "approve_mandate"]) blocked({ ...f, action }, "INVALID_MANDATE");
    blocked({ ...f, record: { ...f.record, selection: { ...selection, recipientRef: a } } }, "INVALID_MANDATE");
    expect(enterpriseFeeMandateRecordV1.safeParse({ ...f.record, approvedByWorker: true }).success).toBe(false);
    blocked({ ...f, environment: "production_billing" }, "INVALID_MANDATE");
    expect(() => refuseLiveEnterpriseFeeMandate()).toThrow("MANDATE_DARK");
    expect(checkSyntheticEnterpriseFeeMandate(f).realExternalActions).toBe(0);
  });
});
