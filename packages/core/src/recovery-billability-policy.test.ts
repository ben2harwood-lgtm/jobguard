import { describe, expect, it } from "vitest";
import { attributionPredicates } from "./shadow-domain/attribution.js";
import { MAX_MONEY_PENCE } from "./money.js";
import {
  approveBillability, evaluateBillabilityPolicy, RECOVERY_BILLABILITY_POLICY, replayBillabilityApproval,
  requireCurrentBillabilityApproval, reviewBillability, validateBillabilityProposal,
} from "./recovery-billability-policy.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const b = { tenantId: id(1), jobId: id(2), caseId: id(3), caseRevision: 2, evidenceRevision: 1,
  evidenceHash: "a".repeat(64), policyVersion: RECOVERY_BILLABILITY_POLICY, policyRevision: 1 };
const source = { sourceId: id(9), sourceVersion: "object-version.1", sourceHash: "b".repeat(64) };
const scope = { tenantId: b.tenantId, jobId: b.jobId, workId: id(4), lineId: id(5) };
const authority = { environment: "synthetic_demo", tenantId: b.tenantId, jobId: b.jobId,
  membershipId: id(6), identityUserId: id(7), permission: "review_recovery_eligibility" };
const approver = { ...authority, membershipId: id(60), identityUserId: id(70) };
const facts = () => ({
  version: "shadow-eligibility.v1", policyVersion: RECOVERY_BILLABILITY_POLICY, environment: "synthetic_reference",
  ...scope, caseId: b.caseId, approvedCase: true, unresolvedDispute: false,
  proof: { version: "shadow-settlement-proof.v1", ...scope, status: "verified_settled", sourceRef: source.sourceId },
  origin: { version: "shadow-eligibility-origin.v1", ...scope, kind: "approved_supplier_case", sourceRef: source.sourceId },
  principalNet: { numerator: "30000", denominator: "1" }, category: "merchant_overcharge", mode: "cash_refund", credit: null,
});
const snapshot = () => ({
  version: "recovery-billability-snapshot.v1", environment: "synthetic_demo", binding: { ...b },
  caseType: "merchant_overcharge", claimedNetPence: 30000, availableAllocatedNetPence: 30000,
  allocationState: "available",
  evidenceComplete: true, causationCertain: true, amountCertain: true, taxBasisCertain: true,
  builderCaptured: false, disclosedBeforeLock: false, finalAccountLockId: null as string | null,
  sources: [{ ...source }], facts: facts() as unknown,
});
const reviewCommand = () => ({ version: "recovery-billability-review-command.v1", commandId: id(10), expected: { ...b },
  claimedEligiblePrincipalPence: 30000, reasons: "Synthetic evidenced supplier refund; tax basis checked; no exclusions." });
const approvalCommand = () => ({ version: "recovery-billability-approval-command.v1", commandId: id(11), reviewCommandId: id(10), expected: { ...b } });
const approved = () => {
  const current = snapshot(), review = reviewBillability(reviewCommand(), current, authority);
  return { current, review, approval: approveBillability(approvalCommand(), review, current, approver) };
};
function catchSnapshot() {
  const lockId = id(20), base = facts();
  const attribution = { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...scope,
    lockId, revisionId: id(21), disputeReview: null, exclusions: [],
    facts: Object.fromEntries(attributionPredicates.map(predicate => [predicate, {
      version: "shadow-fact.v1", ...scope, lockId, predicate, holds: true, sourceRef: source.sourceId,
    }])),
  };
  const { mode: _mode, credit: _credit, ...common } = base;
  return { ...snapshot(), caseType: "missed_variation_final_account", finalAccountLockId: lockId,
    facts: { ...common, category: "missed_variation_final_account", origin: { ...base.origin, kind: "shadow_confirmed_extra" }, attribution } };
}
function cannotApprove(current: unknown, command = reviewCommand()) {
  const r = reviewBillability(command, current, authority);
  expect(() => approveBillability(approvalCommand(), r, current, approver)).toThrow("BILLABILITY_NOT_APPROVABLE");
}
describe("M4-2 DARK D03 v3 billability review", () => {
  it("the same person with two owner memberships cannot approve their own review", () => {
    const s = snapshot(), r = reviewBillability(reviewCommand(), s, authority);
    const secondMembership = { ...authority, membershipId: id(61) };
    expect(() => approveBillability(approvalCommand(), r, s, secondMembership)).toThrow("BILLABILITY_FORBIDDEN");
  });
  it("approver = requester refused", () => {
    const s = snapshot(), r = reviewBillability(reviewCommand(), s, authority);
    expect(() => approveBillability(approvalCommand(), r, s, authority)).toThrow("BILLABILITY_FORBIDDEN");
  });
  it("records exact category, attribution, principal, exclusions, reasons and authorized reviewer in an immutable review", () => {
    const { review, approval, current } = approved();
    expect(review.snapshot.caseType).toBe("merchant_overcharge");
    expect(review.reviewer).toEqual(authority);
    expect(review.assessment).toMatchObject({ classification: "eligible_for_review", exclusions: [], productionEnabled: false });
    expect(Object.isFrozen(review.snapshot.facts)).toBe(true);
    expect(Object.isFrozen(review.command.expected)).toBe(true);
    expect(requireCurrentBillabilityApproval(approval, current, approver)).toEqual({ approvedPrincipal: { pence: 30000, currency: "GBP" }, productionEnabled: false });
    expect(Object.isFrozen(current)).toBe(false);
  });
  it.each(["evidenceComplete", "causationCertain", "amountCertain", "taxBasisCertain"] as const)("holds uncertain %s non-billable until a new review", key => {
    const current = { ...snapshot(), [key]: false };
    expect(evaluateBillabilityPolicy(current).classification).toBe("non_billable");
    cannotApprove(current);
  });
  it("defaults unknown classification and missing proof to non-billable", () => {
    for (const current of [{ ...snapshot(), caseType: "unclassified", facts: null }, { ...snapshot(), sources: [] }]) cannotApprove(current);
  });
  it.each(["pending", "unverified"])("%s and manual receipts do not land", status => {
    const f = facts(); cannotApprove({ ...snapshot(), facts: { ...f, proof: { ...f.proof, status } } });
  });
  it("rejects ordinary payments, unapplied credits, prevented spend and unresolved disputes", () => {
    const f = facts();
    cannotApprove({ ...snapshot(), facts: { ...f, unresolvedDispute: true } });
    cannotApprove({ ...snapshot(), facts: { ...f, approvedCase: false } });
    cannotApprove({ ...snapshot(), facts: { ...f, mode: "applied_credit", credit: { consumedNetPence: 30000, laterInvoiceId: id(30), laterInvoicePayment: "unpaid", sourceRef: source.sourceId } } });
    const { mode: _mode, credit: _credit, ...common } = f;
    cannotApprove({ ...snapshot(), caseType: "prevention", facts: { ...common, category: "prevention" } });
  });
  it.each(["already_consumed", "duplicate_claim", "unrelated_payment", "outcome_unknown"])("%s allocations remain non-billable", allocationState => {
    cannotApprove({ ...snapshot(), allocationState });
  });
  it("uses the existing builder-opened withheld-payment entry predicate", () => {
    const { mode: _mode, credit: _credit, ...common } = facts();
    const f = { ...common, category: "withheld_customer_payment", origin: { ...common.origin, kind: "builder_opened_case" },
      builderOpened: true, feeTermsApprovedBeforePursuit: true, overdue: { version: "D03-overdue.v1", basis: "synthetic_fixture", thresholdMet: true, sourceRef: source.sourceId },
      ownReminderResponse: "ignored", paymentTiming: "after_opening", proceeds: "customer_cash", component: "principal", debtor: "business" };
    const s = { ...snapshot(), caseType: f.category, facts: f };
    expect(evaluateBillabilityPolicy(s).classification).toBe("eligible_for_review");
    for (const change of [{ builderOpened: false }, { feeTermsApprovedBeforePursuit: false }, { ownReminderResponse: "ordinary_lateness" },
      { ownReminderResponse: "normal_reminder" }, { paymentTiming: "before_opening" }, { proceeds: "insurer" }]) cannotApprove({ ...s, facts: { ...f, ...change } });
  });
  it("requires a matching final-account lock and every D13 conjunct for a catch", () => {
    const s = catchSnapshot();
    expect(evaluateBillabilityPolicy(s).classification).toBe("eligible_for_review");
    for (const finalAccountLockId of [null, id(99)]) cannotApprove({ ...s, finalAccountLockId });
    for (const predicate of attributionPredicates) cannotApprove({ ...s, facts: { ...s.facts, attribution: { ...s.facts.attribution,
      facts: { ...s.facts.attribution.facts, [predicate]: { ...s.facts.attribution.facts[predicate], holds: false } } } } });
    for (const change of [{ builderCaptured: true }, { disclosedBeforeLock: true }]) cannotApprove({ ...s, ...change });
  });
  it("permanent D13 disclosure exclusions cannot be erased by a positive conjunct or human approval", () => {
    const s = catchSnapshot();
    cannotApprove({ ...s, facts: { ...s.facts, attribution: { ...s.facts.attribution, exclusions: [
      { version: "shadow-ineligibility.v1", reason: "disclosed_before_lock", sourceRef: source.sourceId, at: "2026-10-25T12:00:00Z", disclosureRoute: "support_conversation" },
    ] } } });
  });
  it("a cited classifier at confidence 1 proposes only and cannot approve failed rules", () => {
    const s = { ...snapshot(), causationCertain: false };
    const proposal = { version: "recovery-billability-proposal.v1", binding: { ...b }, proposedCategory: "merchant_overcharge",
      classifierVersion: "synthetic-classifier.1", confidence: 1, citations: [{ ...source }] };
    expect(validateBillabilityProposal(proposal, s).effect).toBe("proposal_only");
    cannotApprove(s);
    expect(() => approveBillability(approvalCommand(), proposal, s, authority)).toThrow("INVALID_BILLABILITY_INPUT");
    for (const citations of [[{ ...source, sourceHash: "c".repeat(64) }], [{ ...source, sourceVersion: "2" }], [source, source]])
      expect(() => validateBillabilityProposal({ ...proposal, citations }, s)).toThrow("INVALID_BILLABILITY_INPUT");
  });
  it("binds exact case, evidence, policy and reviewer versions and refuses stale/revoked authority", () => {
    const { approval, current, review } = approved();
    for (const key of ["caseRevision", "evidenceRevision"] as const)
      expect(() => requireCurrentBillabilityApproval(approval, { ...current, binding: { ...b, [key]: b[key] + 1 } }, approver)).toThrow("BILLABILITY_STALE");
    expect(() => requireCurrentBillabilityApproval(approval, { ...current, binding: { ...b, evidenceHash: "c".repeat(64) } }, approver)).toThrow("BILLABILITY_STALE");
    for (const change of [{ policyVersion: "future-more-generous-policy" }, { policyRevision: 2 }])
      expect(() => requireCurrentBillabilityApproval(approval, { ...current, binding: { ...b, ...change } }, authority)).toThrow("INVALID_BILLABILITY_INPUT");
    for (const change of [{ membershipId: id(98) }, { identityUserId: id(98) }])
      expect(() => requireCurrentBillabilityApproval(approval, current, { ...approver, ...change })).toThrow("BILLABILITY_STALE");
    for (const change of [{ permission: "read" }, { environment: "production" }])
      expect(() => requireCurrentBillabilityApproval(approval, current, { ...approver, ...change })).toThrow("BILLABILITY_FORBIDDEN");
  });
  it("refuses cross-tenant, cross-job, cross-case and cross-line sources", () => {
    for (const key of ["tenantId", "jobId", "caseId"] as const) {
      const f = facts();
      expect(() => evaluateBillabilityPolicy({ ...snapshot(), facts: { ...f, [key]: id(99) } })).toThrow();
    }
    const f = facts();
    expect(() => evaluateBillabilityPolicy({ ...snapshot(), facts: { ...f, proof: { ...f.proof, lineId: id(99) } } })).toThrow();
    for (const key of ["tenantId", "jobId"] as const)
      expect(() => reviewBillability(reviewCommand(), snapshot(), { ...authority, [key]: id(99) })).toThrow("BILLABILITY_FORBIDDEN");
  });
  it("replays only the same command for the same authenticated reviewer; replay grants no current entitlement", () => {
    const { approval, current } = approved();
    expect(replayBillabilityApproval(approval, approvalCommand(), current, approver)).toEqual(approval);
    expect(replayBillabilityApproval(approval, { ...approvalCommand(), expected: Object.fromEntries(Object.entries(b).reverse()) }, current, approver)).toEqual(approval);
    for (const change of [{ commandId: id(99) }, { reviewCommandId: id(99) }, { expected: { ...b, caseRevision: 3 } }])
      expect(() => replayBillabilityApproval(approval, { ...approvalCommand(), ...change }, current, approver)).toThrow("BILLABILITY_REPLAY_CONFLICT");
    const reversed = { ...current, availableAllocatedNetPence: 0 };
    expect(replayBillabilityApproval(approval, approvalCommand(), reversed, approver)).toEqual(approval);
    expect(() => requireCurrentBillabilityApproval(approval, reversed, approver)).toThrow("BILLABILITY_STALE");
  });
  it("invalidates historical approval on reversals, evidence invalidation, capture, disclosure or locked-bill change even without version bumps", () => {
    const { approval, current } = approved();
    for (const change of [{ availableAllocatedNetPence: 1 }, { evidenceComplete: false }, { builderCaptured: true },
      { disclosedBeforeLock: true }, { finalAccountLockId: id(99) }, { sources: [{ ...source, sourceVersion: "2" }] }])
      expect(() => requireCurrentBillabilityApproval(approval, { ...current, ...change }, approver)).toThrow("BILLABILITY_STALE");
    const s = catchSnapshot(), r = reviewBillability(reviewCommand(), s, authority), a = approveBillability(approvalCommand(), r, s, approver);
    expect(() => requireCurrentBillabilityApproval(a, { ...s, finalAccountLockId: id(99) }, approver)).toThrow("BILLABILITY_STALE");
  });
  it("enforces money and exact allocation limits without rounding up a fraction", () => {
    for (const change of [{ claimedNetPence: 29999 }, { availableAllocatedNetPence: 29999 }, { availableAllocatedNetPence: 0 }]) cannotApprove({ ...snapshot(), ...change });
    for (const pence of [0, 30001]) cannotApprove(snapshot(), { ...reviewCommand(), claimedEligiblePrincipalPence: pence });
    for (const pence of [-1, 0.1, MAX_MONEY_PENCE + 1, Number.MAX_SAFE_INTEGER])
      expect(() => reviewBillability({ ...reviewCommand(), claimedEligiblePrincipalPence: pence }, snapshot(), authority)).toThrow("INVALID_BILLABILITY_INPUT");
    const s = { ...snapshot(), facts: { ...facts(), principalNet: { numerator: "89999", denominator: "3" } } };
    cannotApprove(s);
    const r = reviewBillability({ ...reviewCommand(), claimedEligiblePrincipalPence: 29999 }, s, authority);
    expect(approveBillability(approvalCommand(), r, s, approver).productionEnabled).toBe(false);
  });
  it("rejects duplicate source identities and client-supplied classifier/approval authority", () => {
    expect(() => evaluateBillabilityPolicy({ ...snapshot(), sources: [source, source] })).toThrow("INVALID_BILLABILITY_INPUT");
    for (const extra of [{ productionEnabled: true }, { classifierConfidence: 1 }, { reviewer: authority }, { approved: true }])
      expect(() => reviewBillability({ ...reviewCommand(), ...extra }, snapshot(), authority)).toThrow("INVALID_BILLABILITY_INPUT");
  });
  it("recomputes the saved assessment and rejects tampered reviewer or exclusions", () => {
    const { approval, current, review } = approved();
    expect(() => approveBillability(approvalCommand(), { ...review, assessment: { ...review.assessment, exclusions: ["forged"] } }, current, approver)).toThrow("BILLABILITY_STALE");
    expect(() => requireCurrentBillabilityApproval({ ...approval, approvedBy: { ...authority, membershipId: id(99) } }, current, approver)).toThrow("BILLABILITY_STALE");
  });
  it("all production and pilot inputs fail closed; outward policy result carries no shadow data", () => {
    for (const environment of ["production", "pilot_no_charge", "unconfigured"])
      expect(() => evaluateBillabilityPolicy({ ...snapshot(), environment })).toThrow("INVALID_BILLABILITY_INPUT");
    expect(Object.keys(evaluateBillabilityPolicy(catchSnapshot())).sort()).toEqual(["classification", "exclusions", "policyVersion", "productionEnabled", "version"]);
    // This internal policy has no HTTP/worker adapter, read/list endpoint or pre-lock disclosure path.
    expect(evaluateBillabilityPolicy(snapshot()).productionEnabled).toBe(false);
  });
});
