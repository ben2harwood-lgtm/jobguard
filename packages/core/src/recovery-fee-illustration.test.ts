import { describe, expect, it } from "vitest";
import { attributionPredicates } from "./shadow-domain/attribution.js";
import { recoveryFeeIllustrationInputV1, recoveryFeeIllustrationOutputV1, deriveRecoveryFeeIllustration, RecoveryFeeIllustrationError } from "./recovery-fee-illustration.js";
import { MAX_MONEY_PENCE } from "./money.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4), lockId: id(5) };
const kinds = ["evidence", "disclosure", "baseline_manifest", "capture_manifest", "locked_bill_manifest", "reveal", "disposition", "invoice_line", "line_allocation", "line_reversal"] as const;
const fixture = () => ({
  version: "recovery-attribution-revision.v1", ...binding, caseId: id(6), environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
  assessmentId: id(7), revision: 1, previousAssessmentId: null, caseRevision: 1, sourceRevision: "sources.1", sourceHash: "a".repeat(64),
  sourceManifest: kinds.map((kind, i) => ({ kind, sourceId: id(20 + i), sourceVersion: "1", sourceHash: "b".repeat(64), tenantId: binding.tenantId, jobId: binding.jobId })),
  completeManifests: ["baseline_manifest", "capture_manifest", "locked_bill_manifest"].map((kind, i) => ({ kind, sourceId: id(22 + i), lockId: binding.lockId, status: "completed", itemIds: [], itemCount: 0 })),
  facts: { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, revisionId: id(7), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map((predicate, i) => [predicate, { version: "shadow-fact.v1", ...binding, predicate, holds: true, sourceRef: id(20 + i) }])) },
  remainingPrincipal: { numerator: "80000", denominator: "1" }, assessmentOutcome: "eligible_for_review", reasonCodes: [] as string[],
  attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", policyBundleRef: "recovery-fee-illustration.synthetic-policy.v1",
  assessedBy: { kind: "membership", actorRef: id(8) }, serverRecordedAt: "2026-10-23T12:00:00Z",
});

const wire = (numerator: string, denominator = "1") => ({ numerator, denominator });
const rawInput = (numerator = "80000", denominator = "1") => {
  const assessment = { ...fixture(), remainingPrincipal: wire(numerator, denominator) };
  const source = { version: "qualifying-recovery-source.v1", ...binding, caseId: id(6), category: "missed_variation_final_account",
    environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0, assessmentId: id(7), assessmentRevision: 1,
    reviewId: id(10), reviewAuthorizationId: id(11), sourceRevision: "sources.1", sourceHash: "a".repeat(64),
    lineAllocationIds: [id(28)], exactRemainingPrincipal: wire(numerator, denominator),
    attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3",
    policyBundleRef: "recovery-fee-illustration.synthetic-policy.v1" };
  return { version: "recovery-fee-illustration-input.v1", environment: "synthetic_demo", ...{ tenantId: binding.tenantId, jobId: binding.jobId, lockId: binding.lockId },
    policyBundleRef: source.policyBundleRef,
    sources: [{ caseId: id(6), workId: binding.workId, lineId: binding.lineId, assessment,
      qualification: { version: "current-attribution-qualification.v1", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
        latestAssessmentId: id(7), currentSourceRevision: "sources.1", state: "qualified", source, reasonCodes: [] } }],
    captures: [{ captureId: id(60), tenantId: binding.tenantId, jobId: binding.jobId, lockId: binding.lockId, sourceRevision: "capture.1", sourceHash: "c".repeat(64), exactNet: wire("360000") }] };
};
// Generate a second independent current work/assessment without borrowing another leaf's fixtures.
const independentEntry = (q = "10") => {
  let text = JSON.stringify(rawInput(q).sources[0]!);
  for (const n of [3, 4, 6, 7, 10, 11, ...Array.from({ length: 10 }, (_, i) => 20 + i)])
    text = text.replaceAll(id(n), id(n + 100));
  return JSON.parse(text) as ReturnType<typeof rawInput>["sources"][number];
};
const derive = (raw: unknown) => deriveRecoveryFeeIllustration(recoveryFeeIllustrationInputV1.parse(raw));
describe("SV6-05 pure illustration", () => {
  it("S6-05-A F1-F8 exact authoritative remaining Q and cumulative F", () => {
    for (const [fixtureId, q, d, f] of [
      ["F1", "80000", "1", 8000], ["F2-first", "40000", "1", 4000], ["F2-final", "80000", "1", 8000],
      ["F3", "60000", "1", 6000], ["F4", "2000000", "43", 4651], ["F4b", "80000", "1", 8000],
      ["F5", "40000", "1", 4000], ["F7", "80000", "1", 8000],
    ] as const) {
      const result = derive(rawInput(q, d));
      expect(result.exactQualifyingPrincipal, fixtureId).toEqual(wire(q, d));
      expect(result.cumulativeFee, fixtureId).toEqual({ pence: f, currency: "GBP" });
    }
    for (const fixtureId of ["F6", "F8"]) {
      const raw = rawInput(); raw.sources = [];
      expect(derive(raw).exactQualifyingPrincipal, fixtureId).toEqual(wire("0"));
      expect(derive(raw).cumulativeFee.pence, fixtureId).toBe(0);
    }
    const original = rawInput(); const bytes = JSON.stringify(original);
    const previous = derive(original); const current = derive(rawInput("60000"));
    expect(JSON.stringify(original)).toBe(bytes);
    expect(Object.isFrozen(previous)).toBe(true); expect(Object.isFrozen(previous.display)).toBe(true);
    expect(previous.cumulativeFee.pence).toBe(8000); expect(current.cumulativeFee.pence).toBe(6000);
    expect(current).not.toHaveProperty("postingDelta");
  });
  it("S6-05-B split and combined histories have equal final facts; F9 half-even and bounded rationals", () => {
    const combined = rawInput(); combined.sources[0]!.qualification.source.lineAllocationIds.push(id(80));
    combined.sources[0]!.assessment.sourceManifest.push({ ...combined.sources[0]!.assessment.sourceManifest[8]!, sourceId: id(80) });
    expect(derive(combined).cumulativeFee).toEqual(derive(rawInput()).cumulativeFee);
    const twoWorks = rawInput("5"); twoWorks.sources.push(independentEntry());
    expect(derive(twoWorks).exactQualifyingPrincipal).toEqual(wire("15"));
    expect(derive(twoWorks).cumulativeFee.pence).toBe(2); // Round the sum once: 0 + 1 would be wrong.
    expect(derive({ ...twoWorks, sources: [...twoWorks.sources].reverse() }).cumulativeFee.pence).toBe(2);
    for (const [q, fee] of [["5", 0], ["15", 2], ["25", 2], ["35", 4]] as const)
      expect(derive(rawInput(q)).cumulativeFee.pence).toBe(fee);
    for (const [q, d] of [["-1", "1"], ["01", "1"], ["1", "0"], ["1", "-1"], ["1.5", "1"], [String(MAX_MONEY_PENCE + 1), "1"]])
      expect(() => derive(rawInput(q, d))).toThrow();
    const negativeCapture = rawInput(); negativeCapture.captures[0]!.exactNet = wire("-1");
    expect(() => derive(negativeCapture)).toThrow(RecoveryFeeIllustrationError);
    const overflow = rawInput(); overflow.captures[0]!.exactNet = wire(String(MAX_MONEY_PENCE));
    overflow.captures.push({ ...overflow.captures[0]!, captureId: id(61), exactNet: wire("1") });
    expect(() => derive(overflow)).toThrow(RecoveryFeeIllustrationError);
  });
  it("S6-05-C F12/F13 captured is fee-free, remainder is separate, F23 never offsets", () => {
    const result = derive(rawInput());
    expect(result.exactCapturedFeeFreeNet).toEqual(wire("360000"));
    expect(result.capturedFee.pence).toBe(0); expect(result.cumulativeFee.pence).toBe(8000);
    expect(result.exactYoursBeforeVatAndTax).toEqual(wire("72000"));
    expect(result.display.yoursBeforeVatAndTax).toEqual({ pence: 72000, currency: "GBP" });
    expect(() => derive({ ...rawInput(), subscriptionOffset: 6900 })).toThrow();
    const capturedOnly = rawInput(); capturedOnly.sources = [];
    expect(derive(capturedOnly).cumulativeFee.pence).toBe(0);
  });
  it("S6-05-D rejects duplicate source aliases, reviews, allocation lineage and captures", () => {
    const raw = rawInput(); raw.sources.push(structuredClone(raw.sources[0]!));
    expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    const captures = rawInput(); captures.captures.push(structuredClone(captures.captures[0]!));
    expect(() => derive(captures)).toThrow(RecoveryFeeIllustrationError);
    for (const aliasKind of ["allocation", "work", "assessment", "review"]) {
      const alias = rawInput(); const second = independentEntry();
      if (aliasKind === "allocation") {
        second.qualification.source.lineAllocationIds = [id(28)];
        second.assessment.sourceManifest.push({ ...second.assessment.sourceManifest[8]!, sourceId: id(28) });
      }
      if (aliasKind === "work") {
        const changed = JSON.stringify(second).replaceAll(id(103), id(3));
        Object.assign(second, JSON.parse(changed));
      }
      if (aliasKind === "assessment") {
        const changed = JSON.stringify(second).replaceAll(id(107), id(7));
        Object.assign(second, JSON.parse(changed));
      }
      if (aliasKind === "review") second.qualification.source.reviewId = id(10);
      alias.sources.push(second);
      expect(() => derive(alias), aliasKind).toThrow(RecoveryFeeIllustrationError);
    }
    const duplicateAllocation = rawInput(); duplicateAllocation.sources[0]!.qualification.source.lineAllocationIds.push(id(28));
    expect(() => derive(duplicateAllocation)).toThrow();
  });
  it("S6-05-D checks every envelope binding and source watermark", () => {
    for (const field of ["tenantId", "jobId", "lockId"] as const) {
      expect(() => derive({ ...rawInput(), [field]: id(99) })).toThrow(RecoveryFeeIllustrationError);
      const raw = rawInput(); raw.captures[0]![field] = id(99);
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    for (const field of ["caseId", "workId", "lineId"] as const) {
      const raw = rawInput(); raw.sources[0]![field] = id(99);
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    for (const patch of [{ sourceHash: "d".repeat(64) }, { assessmentRevision: 2 }, { exactRemainingPrincipal: wire("1") }, { policyBundleRef: "other" }]) {
      const raw = rawInput(); Object.assign(raw.sources[0]!.qualification.source, patch);
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    const missingLine = rawInput(); missingLine.sources[0]!.qualification.source.lineAllocationIds = [id(88)];
    expect(() => derive(missingLine)).toThrow(RecoveryFeeIllustrationError);
    for (const patch of [{ currentSourceRevision: "sources.2" }, { latestAssessmentId: id(99) }]) {
      const raw = rawInput(); Object.assign(raw.sources[0]!.qualification, patch); expect(() => derive(raw)).toThrow();
    }
  });
  it("S6-05-E every false predicate, disputed or invalidated proof refuses a positive illustration", () => {
    for (const predicate of attributionPredicates) {
      const raw = rawInput(); raw.sources[0]!.assessment.facts.facts[predicate]!.holds = false;
      raw.sources[0]!.assessment.assessmentOutcome = "excluded"; raw.sources[0]!.assessment.reasonCodes = [predicate];
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    const invalidated = rawInput();
    invalidated.sources[0]!.assessment.facts.facts.evidence_received_before_lock!.holds = false;
    invalidated.sources[0]!.assessment.assessmentOutcome = "excluded";
    invalidated.sources[0]!.assessment.reasonCodes = ["evidence_invalidated"];
    expect(() => derive(invalidated)).toThrow(RecoveryFeeIllustrationError);
    for (const reason of ["attribution_disputed", "disclosed_before_lock", "evidence_after_lock", "pre_adoption_evidence"]) {
      const raw = rawInput();
      Object.assign(raw.sources[0]!.assessment.facts, { exclusions: [{ version: "shadow-ineligibility.v1", reason, sourceRef: id(20), at: "2026-10-23T12:00:00Z", disclosureRoute: null }] });
      raw.sources[0]!.assessment.assessmentOutcome = "excluded"; raw.sources[0]!.assessment.reasonCodes = [reason];
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    for (const state of ["held", "excluded", "unreviewed", "not_assessed"]) {
      const raw = rawInput(); Object.assign(raw.sources[0]!.qualification, { state, source: null, reasonCodes: ["held"] });
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    const raw = rawInput(); raw.sources = [];
    expect(derive(raw).productionEnabled).toBe(false); expect(derive(raw).realExternalActions).toBe(0);
    expect(() => derive({ ...rawInput(), environment: "production" })).toThrow();
    expect(() => deriveRecoveryFeeIllustration({} as never)).toThrow(RecoveryFeeIllustrationError);
  });
  it("S6-05-F safest Q4/Q5/Q9: hide fractional display and comparison, bind exact policy, no tax or posting", () => {
    const fractional = derive(rawInput("2000000", "43"));
    expect(fractional.display.qualifyingPrincipal).toBeNull(); expect(fractional.display.yoursBeforeVatAndTax).toBeNull();
    expect(fractional.exactYoursBeforeVatAndTax).toEqual(wire("1800007", "43"));
    expect(fractional.label).toBe("Illustration — proposed policy; principal only");
    expect(fractional.notice).toBe("Practice sandbox — synthetic data; nothing is sent or charged");
    expect(fractional.taxStatus).toBe("VAT not calculated");
    expect(recoveryFeeIllustrationOutputV1.safeParse({ ...fractional, productionEnabled: true }).success).toBe(false);
    for (const key of ["base", "cap", "creditUsed", "subscriptionOffset", "tax", "postedJ", "priorIllustration", "postingDelta"]) {
      expect(fractional).not.toHaveProperty(key);
      expect(() => derive({ ...rawInput(), [key]: 1 })).toThrow();
    }
    expect(() => derive({ ...rawInput(), policyBundleRef: "unapproved" })).toThrow();
    expect(recoveryFeeIllustrationOutputV1.safeParse({ ...fractional, tax: 1 }).success).toBe(false);
  });
});
