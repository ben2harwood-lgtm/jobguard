import { describe, expect, it } from "vitest";
import { shadowProposalV1, parseShadowOrigin, type ShadowProposal, type ShadowOriginFact } from "./types.js";
import { createAttributionFacts, type ShadowAttributionFacts } from "./attribution.js";
import { createEligibilityFacts, type ShadowEligibilityFacts } from "./eligibility.js";
import { createSuccessFeeInput, deriveShadowSuccessFee, type ShadowSuccessFeeInput } from "./success-fee.js";
const id = "10000000-0000-4000-8000-000000000001";
const binding = { tenantId: id, jobId: id, workId: id };
const proposalRaw = { version: "shadow-proposal.v1", ...binding, signalId: id, signalType: "possible_extra", detectorKind: "ai_proposal", detectorVersion: "fixture.v1", createdAt: "2026-10-02T00:00:00Z", evidenceCutoffAt: "2026-10-01T00:00:00Z", description: "outside tap", estimatedValuePence: null, confidenceBand: "high", mustSurfaceNow: false, evidence: [{ version: "shadow-evidence.v1", ...binding, signalId: id, evidenceId: id, objectVersionId: "fixture-version", sha256: "a".repeat(64), sourceReceivedAt: "2026-10-01T00:00:00Z", lockTiming: "before_lock", adoptionTiming: "after_adoption" }] };
// Typecheck executes these negative assertions; this function is never run, and uses no casts.
function detectorCannotConstructFacts(ai: ShadowProposal) {
    // @ts-expect-error A detector proposal is not immutable attribution facts.
    const attribution: ShadowAttributionFacts = ai;
    // @ts-expect-error A detector proposal is not category/settlement facts.
    const eligibility: ShadowEligibilityFacts = ai;
    // @ts-expect-error A detector proposal is not immutable command-backed origin.
    const origin: ShadowOriginFact = ai;
    // @ts-expect-error A detector proposal is not a validated success-fee input.
    const fee: ShadowSuccessFeeInput = ai;
    // @ts-expect-error Confidence and forged fields do not supply the fact brand or schema.
    const forged: ShadowSuccessFeeInput = { ...ai, confidence: 1, authority: "approved", settled: true };
    // @ts-expect-error The arithmetic adapter accepts a validated human/server fact envelope, not AI output.
    deriveShadowSuccessFee(ai);
    // @ts-expect-error Inputs and nested evidence links are readonly.
    ai.evidence[0]!.sha256 = "b".repeat(64);
    // @ts-expect-error A constructed complete schema value still lacks the validated fee brand.
    const unbranded: ShadowSuccessFeeInput = { version: "shadow-success-fee.v1", environment: "synthetic_reference", tenantId: id, jobId: id, policyVersion: "reference_fee_policy_v3", derivationId: id, allocationEvents: [], principalEntries: [], priorNetPostedPence: 0, priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: null };
    // @ts-expect-error Immutable origin facts include nested provenance.
    origin.origin.kind = "builder_logged";
    return [attribution, eligibility, origin, fee, forged, unbranded];
}
void detectorCannotConstructFacts;
describe("SV-1 shadow domain", () => {
    it("AI proposals cannot construct authority inputs", () => {
        const ai = shadowProposalV1.parse(proposalRaw);
        for (const parse of [createAttributionFacts, createEligibilityFacts, createSuccessFeeInput, parseShadowOrigin])
            expect(() => parse(ai)).toThrow();
        for (const field of ["authority", "settlement", "fee", "origin", "attribution", "invoiceLine", "approvedCase", "principalNet", "customerPaymentSettled"])
            expect(shadowProposalV1.safeParse({ ...proposalRaw, [field]: true }).success, field).toBe(false);
        for (const changes of [{ version: "v0" }, { evidence: [{ ...proposalRaw.evidence[0], authority: true }] }, { confidenceScore: 1 }, { tenantId: "invalid" }])
            expect(shadowProposalV1.safeParse({ ...proposalRaw, ...changes }).success).toBe(false);
    });
    it("schema-valid server origins have a separate immutable type and confer no authentication", () => {
        const origin = parseShadowOrigin({ version: "extra-origin.v1", tenantId: id, jobId: id, variationId: id, origin: { version: "variation-origin.v1", jobTrack: "small_builder", kind: "jobguard_catch" }, commandId: id, raisingMembershipId: id, raisingRole: "builder", serverRecordedAt: "2026-10-03T00:00:00Z", deviceId: null, deviceCapturedAt: null, evidenceHash: null });
        expect(Object.isFrozen(origin.origin)).toBe(true);
        expect(origin).not.toHaveProperty("feeBearing");
    });
});
