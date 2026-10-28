import { describe, expect, it } from "vitest";
import { attributionPredicates } from "./shadow-domain/attribution.js";
import { reassessRecoveryAttribution, qualifyingAttributionPrincipal, requireCurrentAttributionQualification, RecoveryAttributionReassessmentError, currentAttributionQualificationV1, recoveryAttributionRevisionV1 } from "./recovery-attribution-persistence.js";
import { calculateCumulativeFee, parseExactPence, serializeExactPence, sumExactPence } from "./cumulative-fee.js";

// Pure synthetic contract composition, not a PostgreSQL integration or a command store.
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixture = (item = 0) => {
  const binding = { tenantId: id(1), jobId: id(2), lockId: id(5), workId: id(30 + item), lineId: id(40 + item) };
  const kinds = ["evidence", "disclosure", "baseline_manifest", "capture_manifest", "locked_bill_manifest", "reveal", "disposition", "invoice_line", "line_allocation", "line_reversal"];
  const refs = kinds.map((kind, i) => ({ kind, sourceId: id(100 + item * 20 + i), sourceVersion: "1", sourceHash: "b".repeat(64), tenantId: binding.tenantId, jobId: binding.jobId }));
  return {
    version: "recovery-attribution-revision.v1", ...binding, caseId: id(50 + item), environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
    assessmentId: id(60 + item), revision: 1, previousAssessmentId: null as string | null, caseRevision: 1, sourceRevision: "sources.1", sourceHash: "a".repeat(64),
    sourceManifest: refs, completeManifests: refs.slice(2, 5).map(r => ({ kind: r.kind, sourceId: r.sourceId, lockId: binding.lockId, status: "completed", itemIds: [], itemCount: 0 })),
    facts: { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, revisionId: id(60 + item), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map((predicate, i) => [predicate, { version: "shadow-fact.v1", ...binding, predicate, holds: true, sourceRef: refs[i]!.sourceId }])) },
    remainingPrincipal: { numerator: "80000", denominator: "1" }, assessmentOutcome: "eligible_for_review", reasonCodes: [] as string[],
    attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", policyBundleRef: "recovery-fee-illustration.synthetic-policy.v1",
    assessedBy: { kind: "membership", actorRef: id(8) }, serverRecordedAt: "2026-10-24T12:00:00Z",
  };
};
const successor = (previous: ReturnType<typeof fixture>, kind: string, numerator = "60000") => {
  const next = structuredClone(previous);
  next.assessmentId = id(200 + previous.revision); next.facts.revisionId = next.assessmentId;
  next.revision++; next.previousAssessmentId = previous.assessmentId;
  next.sourceRevision = `sources.${next.revision}`; next.sourceHash = String(next.revision).repeat(64);
  next.serverRecordedAt = "2026-10-24T12:01:00Z"; next.assessedBy = { kind: "source_change", actorRef: id(90) };
  next.remainingPrincipal = { numerator, denominator: "1" };
  next.sourceManifest.push({ kind, sourceId: id(300 + previous.revision), sourceVersion: "1", sourceHash: "c".repeat(64), tenantId: next.tenantId, jobId: next.jobId });
  if (kind !== "evidence_invalidation") next.facts.facts.qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits!.sourceRef = id(300 + previous.revision);
  if (numerator === "0") {
    next.facts.facts.qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits!.holds = false;
    next.assessmentOutcome = "excluded"; next.reasonCodes = ["no_remaining_qualifying_principal"];
  }
  return next;
};
const total = (...assessments: unknown[]) => serializeExactPence(sumExactPence(assessments.map(a => parseExactPence(qualifyingAttributionPrincipal(a)))));
const fee = (...assessments: unknown[]) => calculateCumulativeFee({
  version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: "reference_fee_policy_v3", numerator: "10", denominator: "100" },
  cumulativeQualifyingPrincipal: total(...assessments), priorNetPostedPence: 0,
  priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: null,
}).cumulativeFee.pence; // Kernel target only; no previous illustration is treated as a posting.
const qualified = (a: ReturnType<typeof fixture>) => ({
  version: "current-attribution-qualification.v1", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
  latestAssessmentId: a.assessmentId, currentSourceRevision: a.sourceRevision, state: "qualified", reasonCodes: [],
  source: { version: "qualifying-recovery-source.v1", category: "missed_variation_final_account", tenantId: a.tenantId, jobId: a.jobId, caseId: a.caseId, workId: a.workId, lineId: a.lineId, lockId: a.lockId,
    environment: a.environment, productionEnabled: false, realExternalActions: 0, assessmentId: a.assessmentId, assessmentRevision: a.revision, reviewId: id(70), reviewAuthorizationId: id(71),
    sourceRevision: a.sourceRevision, sourceHash: a.sourceHash, lineAllocationIds: [a.sourceManifest[8]!.sourceId], exactRemainingPrincipal: a.remainingPrincipal,
    attributionPolicyVersion: a.attributionPolicyVersion, eligibilityPolicyVersion: a.eligibilityPolicyVersion, policyBundleRef: a.policyBundleRef },
});
const watermark = (a: ReturnType<typeof fixture>) => ({
  version: "attribution-current-source.v1", environment: a.environment, productionEnabled: false, realExternalActions: 0,
  tenantId: a.tenantId, jobId: a.jobId, caseId: a.caseId, workId: a.workId, lineId: a.lineId, lockId: a.lockId,
  assessmentId: a.assessmentId, assessmentRevision: a.revision, sourceRevision: a.sourceRevision, sourceHash: a.sourceHash, remainingPrincipal: a.remainingPrincipal,
  attributionPolicyVersion: a.attributionPolicyVersion, eligibilityPolicyVersion: a.eligibilityPolicyVersion, policyBundleRef: a.policyBundleRef,
});

describe("SV6-13-15 pure reassessment contracts (persistence dependency-bound)", () => {
  it("SV6-13 money changes append revisions and preserve original facts", () => {
    for (const kind of ["line_reversal", "refund", "credit"]) {
      const original = recoveryAttributionRevisionV1.parse(fixture()), other = recoveryAttributionRevisionV1.parse(fixture(1));
      const bytes = JSON.stringify([original, other]);
      const input = successor(fixture(), kind);
      const inputBytes = JSON.stringify(input);
      const partial = reassessRecoveryAttribution(original, input);
      expect(JSON.stringify(input)).toBe(inputBytes);
      expect(total(original, other)).toEqual({ numerator: "160000", denominator: "1" });
      expect(total(partial, other)).toEqual({ numerator: "140000", denominator: "1" });
      expect(fee(original, other)).toBe(16000);
      expect(fee(partial, other)).toBe(14000);
      expect(partial.previousAssessmentId).toBe(original.assessmentId);
      expect(partial.remainingPrincipal).toEqual(input.remainingPrincipal);
      expect(partial.sourceManifest.filter(s => s.kind === "line_allocation")).toEqual(original.sourceManifest.filter(s => s.kind === "line_allocation"));
      const full = reassessRecoveryAttribution(partial, successor(input, kind, "0"));
      expect(total(full, other)).toEqual({ numerator: "80000", denominator: "1" });
      expect(fee(full, other)).toBe(8000);
      expect(JSON.stringify([original, other])).toBe(bytes);
      expect(() => { (partial.remainingPrincipal as { numerator: string }).numerator = "1"; }).toThrow();
      for (const key of ["tenantId", "jobId", "caseId", "workId", "lineId", "lockId", "policyBundleRef", "attributionPolicyVersion", "eligibilityPolicyVersion"] as const)
        {
          const changed = structuredClone(input);
          const value = key.endsWith("Id") ? id(999) : "foreign-policy";
          Object.assign(changed, { [key]: value });
          if (["tenantId", "jobId", "workId", "lineId", "lockId"].includes(key)) {
            Object.assign(changed.facts, { [key]: value });
            for (const f of Object.values(changed.facts.facts)) Object.assign(f, { [key]: value });
          }
          if (["tenantId", "jobId"].includes(key)) for (const ref of changed.sourceManifest) Object.assign(ref, { [key]: value });
          if (key === "lockId") for (const m of changed.completeManifests) m.lockId = value;
          if (["attributionPolicyVersion", "eligibilityPolicyVersion"].includes(key)) continue; // Fixed by parent schema.
          expect(recoveryAttributionRevisionV1.safeParse(changed).success, key).toBe(true);
          expect(() => reassessRecoveryAttribution(original, changed), key).toThrow(RecoveryAttributionReassessmentError);
        }
      for (const changes of [{ previousAssessmentId: id(999) }, { revision: 3 }, { assessmentId: original.assessmentId, facts: { ...input.facts, revisionId: original.assessmentId } }, { caseRevision: 0 }, { sourceRevision: original.sourceRevision }, { sourceHash: original.sourceHash }])
        expect(() => reassessRecoveryAttribution(original, { ...input, ...changes })).toThrow(RecoveryAttributionReassessmentError);
      expect(() => reassessRecoveryAttribution({ ...original, caseRevision: 2 }, input)).toThrow(RecoveryAttributionReassessmentError);
      expect(() => reassessRecoveryAttribution({}, input)).toThrow(RecoveryAttributionReassessmentError);
      const fractional = { ...input, remainingPrincipal: { numerator: "2000000", denominator: "43" } };
      expect(reassessRecoveryAttribution(original, fractional).remainingPrincipal).toEqual(fractional.remainingPrincipal);
      expect(qualifyingAttributionPrincipal(fractional)).toEqual(fractional.remainingPrincipal);
    }
  });

  it("SV6-14 evidence invalidation changes qualification without rewriting customer money", () => {
    const original = recoveryAttributionRevisionV1.parse(fixture()), other = recoveryAttributionRevisionV1.parse(fixture(1));
    const originalBytes = JSON.stringify(original);
    const next = successor(fixture(), "evidence_invalidation", "80000");
    // The source owner supplies invalidation facts; no fabricated automatic hook is claimed here.
    next.facts.facts.evidence_received_before_lock!.holds = false;
    next.assessmentOutcome = "excluded"; next.reasonCodes = ["evidence_invalidated"];
    const changed = reassessRecoveryAttribution(original, next);
    expect(changed.remainingPrincipal).toEqual(original.remainingPrincipal);
    expect(changed.sourceManifest.filter(s => ["line_allocation", "invoice_line"].includes(s.kind))).toEqual(original.sourceManifest.filter(s => ["line_allocation", "invoice_line"].includes(s.kind)));
    expect(qualifyingAttributionPrincipal(changed)).toEqual({ numerator: "0", denominator: "1" });
    expect(total(changed, other)).toEqual({ numerator: "80000", denominator: "1" });
    expect(fee(changed, other)).toBe(8000);
    expect(JSON.stringify(original)).toBe(originalBytes);
    expect(() => qualifyingAttributionPrincipal({ ...next, assessmentOutcome: "eligible_for_review", reasonCodes: [] })).toThrow(RecoveryAttributionReassessmentError);
    const missing = structuredClone(next); delete missing.facts.facts.evidence_received_before_lock;
    expect(() => reassessRecoveryAttribution(original, missing)).toThrow(RecoveryAttributionReassessmentError);
  });

  it("SV6-15 source changes invalidate current entitlement without altering replay history", () => {
    const a = fixture(), first = currentAttributionQualificationV1.parse(qualified(a)), firstBytes = JSON.stringify(first);
    const current = requireCurrentAttributionQualification(first, watermark(a));
    expect(JSON.stringify(current)).toBe(firstBytes);
    const next = successor(a, "refund");
    expect(() => requireCurrentAttributionQualification(current, watermark(next))).toThrow(RecoveryAttributionReassessmentError);
    // Each field independently makes an otherwise valid historical result unusable as current.
    for (const key of ["tenantId", "jobId", "caseId", "workId", "lineId", "lockId", "assessmentId", "assessmentRevision", "sourceRevision", "sourceHash", "policyBundleRef", "attributionPolicyVersion", "eligibilityPolicyVersion", "remainingPrincipal"] as const) {
      const value = key.endsWith("Id") ? id(999) : key === "assessmentRevision" ? 2 : key === "sourceHash" ? "c".repeat(64) : key === "remainingPrincipal" ? { numerator: "60000", denominator: "1" } : "changed";
      expect(() => requireCurrentAttributionQualification(first, { ...watermark(a), [key]: value }), key).toThrow(RecoveryAttributionReassessmentError);
    }
    expect(() => requireCurrentAttributionQualification({}, watermark(a))).toThrow(RecoveryAttributionReassessmentError);
    for (const malformed of [null, {}, { ...watermark(a), remainingPrincipal: undefined }])
      expect(() => requireCurrentAttributionQualification(first, malformed)).toThrow(RecoveryAttributionReassessmentError);
    expect(() => requireCurrentAttributionQualification({ ...first, state: "held", source: null, reasonCodes: ["stale"] }, watermark(a))).toThrow(RecoveryAttributionReassessmentError);
    expect(() => requireCurrentAttributionQualification({ ...first, latestAssessmentId: id(999) }, watermark(a))).toThrow(RecoveryAttributionReassessmentError);
    expect(() => { (current.source!.exactRemainingPrincipal as { numerator: string }).numerator = "1"; }).toThrow();
    expect(JSON.stringify(first)).toBe(firstBytes);
    expect(JSON.stringify(current)).toBe(firstBytes);
    expect(requireCurrentAttributionQualification(qualified(next), watermark(next)).state).toBe("qualified");
  });
});
