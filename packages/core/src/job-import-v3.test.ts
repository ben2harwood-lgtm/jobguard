import { describe, expect, it } from "vitest";
import { activationFeePolicyV3, isSmallJobV3 } from "./activation-v3.js";
import { IMPORT_LINEAGE_LABEL, importedLineage } from "./job-import.js";
import { MAX_MONEY_PENCE } from "./money.js";
import {
  jobImportV3Request, jobImportV3RequestIdentity, parseJobImportV3Request,
  classifyKnownJobImportV3Values, JOB_IMPORT_V3_LINEAGE_LABEL,
} from "./job-import-v3.js";
import { attributionPredicates, createAttributionFacts, qualifiesAttribution } from "./shadow-domain/attribution.js";
import { createEligibilityFacts, evaluateRecoveryEligibility } from "./shadow-domain/eligibility.js";
import { createSuccessFeeInput, deriveShadowSuccessFee } from "./shadow-domain/success-fee.js";
import { createShadowSignal, coalesceShadowSignals, transitionShadowSignal } from "./shadow-domain/signal.js";
import { shadowEvidenceV1 } from "./shadow-domain/types.js";

const id = (n: number) => `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = () => ({
  version: "adopt-job.v3", commandId: id(1), expectedSourcePartyBindingId: id(2),
  lifecyclePoint: "live", fictionalBaselineKey: "fictional-baseline-1",
});

describe("CH-5 independent core portion (complete server acceptance held)", () => {
  it("CH5-S01 core: Strict import boundary refuses authority fields", () => {
    for (const lifecyclePoint of ["live", "invoiced"]) {
      expect(jobImportV3Request.parse({ ...request(), lifecyclePoint })).toEqual({ ...request(), lifecyclePoint });
    }
    for (const field of ["tenantId", "actorId", "actorMembershipId", "role", "commercialTrack", "track", "cap", "recoveryCapPence", "policyVersion", "feePolicyVersion", "smallJob", "plan", "planCount", "mode", "environment", "jobId", "sourceJobId", "acceptedNetPence", "highestSentNetPence", "baselineHash", "unknown"]) {
      expect(() => parseJobImportV3Request({ ...request(), [field]: "override" }), field).toThrow("INVALID_JOB_IMPORT_V3_INPUT");
    }
    expect(() => parseJobImportV3Request({ ...request(), recoveryCapPence: 0, feePolicyVersion: "reference_fee_policy_v1" })).toThrow();
    expect(() => parseJobImportV3Request({ ...request(), version: "adopt-job.v1" })).toThrow();
  });

  it("CH5-S01 core: Strict import boundary rejects invalid IDs bounds and unknown fields", () => {
    for (const value of [null, [], {}, "text"]) expect(() => parseJobImportV3Request(value)).toThrow();
    for (const field of Object.keys(request())) {
      const missing: Record<string, unknown> = { ...request() };
      delete missing[field];
      expect(() => parseJobImportV3Request(missing)).toThrow();
    }
    for (const field of ["commandId", "expectedSourcePartyBindingId"]) {
      for (const value of [null, "", "not-a-uuid", 1]) expect(() => parseJobImportV3Request({ ...request(), [field]: value })).toThrow();
    }
    for (const value of ["", "a".repeat(81), "../baseline", "baseline with spaces", "baseline\n", "REAL", null, 1]) {
      expect(() => parseJobImportV3Request({ ...request(), fictionalBaselineKey: value })).toThrow();
    }
    expect(parseJobImportV3Request({ ...request(), fictionalBaselineKey: "a".repeat(80) }).fictionalBaselineKey).toHaveLength(80);
    for (const lifecyclePoint of ["draft", "closed", null]) expect(() => parseJobImportV3Request({ ...request(), lifecyclePoint })).toThrow();
    const raw = request(), parsed = parseJobImportV3Request(raw);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(raw)).toBe(false);
    raw.lifecyclePoint = "invoiced";
    expect(parsed.lifecyclePoint).toBe("live");
  });

  it("CH5-S04 core: Imported lineage never masquerades as quote acceptance", () => {
    expect(JOB_IMPORT_V3_LINEAGE_LABEL).toBe("Imported — builder-attested baseline; weaker than a JobGuard-generated and customer-accepted quote.");
    expect(JOB_IMPORT_V3_LINEAGE_LABEL).toBe(IMPORT_LINEAGE_LABEL);
    expect(importedLineage({ provenance: "imported" })).toEqual({
      provenance: "imported", lineageStrength: "builder_attested_weaker", lineageLabel: JOB_IMPORT_V3_LINEAGE_LABEL,
    });
  });

  it("CH5-S02 CH5-S08 CH5-S09 core: known numeric inputs delegate small-job classification without choosing imported provenance", () => {
    for (const [acceptedNetPence, highestSentNetPence, smallJob] of [
      [0, 0, true], [199_999, 0, true], [200_000, 0, false],
      [0, 199_999, true], [0, 200_000, false], [199_999, 200_000, false],
      [MAX_MONEY_PENCE, MAX_MONEY_PENCE, false],
    ] as const) {
      const input = { version: "job-import-known-values.v1", acceptedNetPence, highestSentNetPence };
      const result = classifyKnownJobImportV3Values(input);
      expect(result).toEqual({ ...input, smallJob });
      expect(result.smallJob).toBe(isSmallJobV3(acceptedNetPence, highestSentNetPence));
      expect(Object.isFrozen(result)).toBe(true);
    }
    for (const field of ["acceptedNetPence", "highestSentNetPence"]) {
      for (const value of [-1, 0.5, MAX_MONEY_PENCE + 1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "0", null, undefined]) {
        expect(() => classifyKnownJobImportV3Values({ version: "job-import-known-values.v1", acceptedNetPence: 0, highestSentNetPence: 0, [field]: value })).toThrow("INVALID_JOB_IMPORT_V3_INPUT");
      }
    }
    expect(() => classifyKnownJobImportV3Values({ version: "job-import-known-values.v1", acceptedNetPence: 0, highestSentNetPence: 0, smallJob: true })).toThrow();
    expect(activationFeePolicyV3.parse("reference_fee_policy_v3")).toBe("reference_fee_policy_v3");
    expect(() => activationFeePolicyV3.parse("reference_fee_policy_v1")).toThrow();
  });

  it("CH5-S11 core: Exact request identity normalizes IDs and object order without claiming durable replay", () => {
    const first = jobImportV3RequestIdentity(request(), id(3), id(4));
    const reordered = Object.fromEntries(Object.entries(request()).reverse());
    expect(jobImportV3RequestIdentity(reordered, id(3), id(4))).toBe(first);
    const upper = { ...request(), commandId: id(1).toUpperCase(), expectedSourcePartyBindingId: id(2).toUpperCase() };
    expect(jobImportV3RequestIdentity(upper, id(3).toUpperCase(), id(4).toUpperCase())).toBe(first);
    for (const change of [{ commandId: id(9) }, { expectedSourcePartyBindingId: id(9) }, { lifecyclePoint: "invoiced" }, { fictionalBaselineKey: "fictional-baseline-2" }]) {
      expect(jobImportV3RequestIdentity({ ...request(), ...change }, id(3), id(4))).not.toBe(first);
    }
    expect(jobImportV3RequestIdentity(request(), id(9), id(4))).not.toBe(first);
    expect(jobImportV3RequestIdentity(request(), id(3), id(9))).not.toBe(first);
    expect(() => jobImportV3RequestIdentity(request(), "invalid", id(4))).toThrow();
    expect(() => jobImportV3RequestIdentity(request(), id(3), "invalid")).toThrow();
    expect(() => jobImportV3RequestIdentity({ ...request(), tenantId: id(5) }, id(3), id(4))).toThrow();
  });

  it("CH5-S17 reference only: Pre-adoption catch is permanently fee-free with an explicitly supplied exclusion", () => {
    // These are supplied synthetic classifications, never a rule comparing dates.
    const binding = { tenantId: id(10), jobId: id(11), workId: id(12) };
    const at = "2026-10-03T00:00:00Z";
    const evidence = shadowEvidenceV1.parse({ version: "shadow-evidence.v1", ...binding, signalId: id(13), evidenceId: id(14), objectVersionId: "fictional-version-1", sha256: "a".repeat(64), sourceReceivedAt: at, lockTiming: "before_lock", adoptionTiming: "before_adoption" });
    const proposal = { version: "shadow-proposal.v1", ...binding, signalId: id(13), signalType: "possible_extra", detectorKind: "deterministic", detectorVersion: "fixture.v1", createdAt: at, evidenceCutoffAt: at, description: "Fictional extra", estimatedValuePence: 80_000, confidenceBand: "high", mustSurfaceNow: false, evidence: [evidence] };
    const signal = createShadowSignal(proposal, { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, [evidence]);
    expect(signal.ineligibility.map(e => e.reason)).toEqual(["pre_adoption_evidence"]);
    const newerEvidence = shadowEvidenceV1.parse({ ...evidence, signalId: id(15), evidenceId: id(16), objectVersionId: "fictional-version-2", adoptionTiming: "after_adoption" });
    const newer = createShadowSignal({ ...proposal, signalId: id(15), evidence: [newerEvidence] }, { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, [newerEvidence]);
    const coalesced = coalesceShadowSignals(signal, newer, { version: "shadow-coalescing.v1", ...binding, sameWork: true, sourceRef: "fixture:coalescing", expectedPrimaryRevision: 0, expectedDuplicateRevision: 0 });
    expect(coalesced.duplicate.ineligibility.map(e => e.reason)).toContain("pre_adoption_evidence");
    let confirmed = coalesced.primary;
    for (const type of ["hold", "reveal", "confirm"] as const) {
      confirmed = transitionShadowSignal(confirmed, { version: "shadow-event.v1", ...binding, signalId: id(13), expectedRevision: confirmed.revision, type, phase: type === "hold" ? "pre_lock" : "post_lock", lockId: type === "hold" ? null : id(17), at, sourceRef: `fixture:${type}`, ...(type === "confirm" ? { humanReviewRef: null } : {}) }, { lockedLineIds: [], baselineItemIds: [] });
    }
    const lineBinding = { ...binding, lineId: id(18), lockId: id(17) };
    const attribution = createAttributionFacts({ version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...lineBinding, revisionId: id(19), disputeReview: null, exclusions: confirmed.ineligibility, facts: Object.fromEntries(attributionPredicates.map(predicate => [predicate, { version: "shadow-fact.v1", ...lineBinding, predicate, holds: true, sourceRef: `fixture:${predicate}` }])) });
    expect(qualifiesAttribution(attribution)).toBe(false);
    expect(attribution.exclusions.map(e => e.reason)).toContain("pre_adoption_evidence");
    const facts = createEligibilityFacts({ version: "shadow-eligibility.v1", policyVersion: "reference_recovery_eligibility_policy_v3", environment: "synthetic_reference", ...binding, lineId: id(18), caseId: id(20), category: "missed_variation_final_account", approvedCase: true, unresolvedDispute: false, principalNet: { numerator: "80000", denominator: "1" }, proof: { version: "shadow-settlement-proof.v1", ...binding, lineId: id(18), status: "verified_settled", sourceRef: "fixture:proof" }, origin: { version: "shadow-eligibility-origin.v1", ...binding, lineId: id(18), kind: "shadow_confirmed_extra", sourceRef: "fixture:origin" }, attribution });
    expect(evaluateRecoveryEligibility(facts)).toMatchObject({ eligible: false, qualifyingPrincipal: { numerator: "0", denominator: "1" }, productionEnabled: false });
    const input = { version: "shadow-success-fee.v1", environment: "synthetic_reference", ...binding, derivationId: id(21), policyVersion: "reference_fee_policy_v3", priorPolicyVersion: "reference_fee_policy_v3", priorNetPostedPence: 0, compensatesDerivationId: null, principalEntries: [], allocationEvents: [{ receipt: { version: "receipt-allocation.v1", sourceRef: "fixture:receipt", receiptGross: { numerator: "96000", denominator: "1" }, effectiveAt: at, direction: "receipt", invoiceId: "fictional-invoice", separateInvoiceId: "fictional-invoice", explicit: null, lines: [{ id: id(18), invoiceId: "fictional-invoice", existedAt: at, outstandingGross: { numerator: "96000", denominator: "1" }, netPence: 80_000, grossPence: 96_000 }] }, qualifyingLines: [facts], reversesSourceRef: null }] };
    const { workId: _workId, ...feeInput } = input;
    const fee = deriveShadowSuccessFee(createSuccessFeeInput(feeInput));
    expect(fee).toMatchObject({ Q: { numerator: 0n, denominator: 1n }, F: { pence: 0, currency: "GBP" }, delta: { pence: 0, currency: "GBP" }, journalProposal: "none", productionEnabled: false });
    // Positive control: the same settled facts qualify without the supplied exclusion.
    const eligibleFacts = createEligibilityFacts({ ...facts, attribution: { ...attribution, exclusions: [] } });
    expect(evaluateRecoveryEligibility(eligibleFacts).eligible).toBe(true);
    const positive = deriveShadowSuccessFee(createSuccessFeeInput({ ...feeInput, allocationEvents: [{ ...feeInput.allocationEvents[0], qualifyingLines: [eligibleFacts] }] }));
    expect(positive.F.pence).toBe(8_000);
  });
});
