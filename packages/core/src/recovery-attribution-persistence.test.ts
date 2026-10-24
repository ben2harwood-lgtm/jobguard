import { describe, expect, it } from "vitest";
import { attributionPredicates, qualifiesAttribution } from "./shadow-domain/attribution.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { recoveryAttributionRevisionV1, recoveryAttributionCommandV1, qualifyingRecoverySourceV1, parseRecoveryAttributionCommand, RecoveryAttributionError, currentAttributionQualificationV1, attributionReviewResultV1 } from "./recovery-attribution-persistence.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4), lockId: id(5) };
const kinds = ["evidence", "disclosure", "baseline_manifest", "capture_manifest", "locked_bill_manifest", "reveal", "disposition", "invoice_line", "line_allocation", "line_reversal"] as const;
export const fixture = () => ({
  version: "recovery-attribution-revision.v1", ...binding, caseId: id(6), environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
  assessmentId: id(7), revision: 1, previousAssessmentId: null, caseRevision: 1, sourceRevision: "sources.1", sourceHash: "a".repeat(64),
  sourceManifest: kinds.map((kind, i) => ({ kind, sourceId: id(20 + i), sourceVersion: "1", sourceHash: "b".repeat(64), tenantId: binding.tenantId, jobId: binding.jobId })),
  completeManifests: ["baseline_manifest", "capture_manifest", "locked_bill_manifest"].map((kind, i) => ({ kind, sourceId: id(22 + i), lockId: binding.lockId, status: "completed", itemIds: [], itemCount: 0 })),
  facts: { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, revisionId: id(7), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map((predicate, i) => [predicate, { version: "shadow-fact.v1", ...binding, predicate, holds: true, sourceRef: id(20 + i) }])) },
  remainingPrincipal: { numerator: "80000", denominator: "1" }, assessmentOutcome: "eligible_for_review", reasonCodes: [] as string[],
  attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", policyBundleRef: "fixture-policy-bundle.v1",
  assessedBy: { kind: "membership", actorRef: id(8) }, serverRecordedAt: "2026-10-23T12:00:00Z",
});
const command = { version: "recovery-attribution-command.v1", action: "assess", commandId: id(9), caseId: id(6), workId: id(3), lineId: id(4), lockId: id(5), expectedCaseRevision: 1, expectedAttributionRevision: 0 };
const current = () => ({ version: "qualifying-recovery-source.v1", ...binding, caseId: id(6), category: "missed_variation_final_account", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0, assessmentId: id(7), assessmentRevision: 1, reviewId: id(10), reviewAuthorizationId: id(11), sourceRevision: "sources.1", sourceHash: "a".repeat(64), lineAllocationIds: [id(28)], exactRemainingPrincipal: { numerator: "80000", denominator: "1" }, attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", policyBundleRef: "fixture-policy-bundle.v1" });
describe("SV6-01 persistence boundary", () => {
  it("S6-01-A records ten facts and independently excludes each false fact", () => {
    expect(qualifiesAttribution(recoveryAttributionRevisionV1.parse(fixture()).facts)).toBe(true);
    for (const key of attributionPredicates) {
      const raw = fixture(); raw.facts.facts[key]!.holds = false;
      expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
      raw.assessmentOutcome = "excluded"; raw.reasonCodes = [key];
      expect(qualifiesAttribution(recoveryAttributionRevisionV1.parse(raw).facts)).toBe(false);
    }
  });
  it("S6-01-B refuses missing, duplicate, incomplete, misbound and malformed sources", () => {
    const bad: unknown[] = [{ ...fixture(), unexpected: true }, { ...fixture(), sourceManifest: [] }, { ...fixture(), completeManifests: [] }];
    for (const field of ["tenantId", "jobId", "workId", "lineId", "lockId"] as const) bad.push({ ...fixture(), [field]: id(99) });
    for (const key of attributionPredicates) { const raw = fixture(); delete raw.facts.facts[key]; bad.push(raw); }
    const duplicate = fixture(); duplicate.sourceManifest.push(duplicate.sourceManifest[0]!); bad.push(duplicate);
    const wrongKind = fixture(); wrongKind.sourceManifest[0]!.kind = "disclosure"; bad.push(wrongKind);
    bad.push({ ...fixture(), previousAssessmentId: id(9) }, { ...fixture(), revision: 2 }, { ...fixture(), serverRecordedAt: "yesterday" }, { ...fixture(), sourceHash: "bad" });
    const unknownFact = fixture(); bad.push({ ...unknownFact, facts: { ...unknownFact.facts, injectedAuthority: true } });
    const malformedFact = fixture(); bad.push({ ...malformedFact, facts: { ...malformedFact.facts, facts: { ...malformedFact.facts.facts, evidence_received_before_lock: { ...malformedFact.facts.facts.evidence_received_before_lock, injectedAuthority: true } } } });
    const nestedExtra = fixture(); bad.push({ ...nestedExtra, sourceManifest: nestedExtra.sourceManifest.map(s => ({ ...s, eligible: true })) });
    const foreign = fixture(); foreign.sourceManifest[0]!.jobId = id(99); bad.push(foreign);
    const missingRef = fixture(); missingRef.facts.facts[attributionPredicates[0]]!.sourceRef = id(99); bad.push(missingRef);
    const incomplete = fixture(); incomplete.completeManifests[0]!.itemCount = 1; bad.push(incomplete);
    bad.push({ ...fixture(), completeManifests: fixture().completeManifests.map(m => ({ ...m, status: "pending" })) });
    for (const numerator of ["-1", "01", "NaN", String(MAX_MONEY_PENCE + 1)]) bad.push({ ...fixture(), remainingPrincipal: { numerator, denominator: "1" } });
    for (const denominator of ["0", "-1", "1.5", "01"]) bad.push({ ...fixture(), remainingPrincipal: { numerator: "1", denominator } });
    for (const raw of bad) expect(recoveryAttributionRevisionV1.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
    expect(recoveryAttributionRevisionV1.parse({ ...fixture(), remainingPrincipal: { numerator: "1", denominator: "3" } }).remainingPrincipal).toEqual({ numerator: "1", denominator: "3" });
  });
  it("S6-01-B r1 refuses case-variant source identities under different kinds", () => {
    const raw = fixture();
    const source = raw.sourceManifest[0]!;
    source.sourceId = "abcdef00-0000-4000-8000-000000000001";
    raw.facts.facts.evidence_received_before_lock!.sourceRef = source.sourceId;
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.sourceManifest.push({ ...source, kind: "disclosure", sourceId: source.sourceId.toUpperCase() });
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
  });
  it("S6-01-B r1 refuses an allocation relisted as a case-variant invoice line", () => {
    const raw = fixture();
    const allocation = raw.sourceManifest[8]!;
    allocation.sourceId = "abcdef00-0000-4000-8000-000000000002";
    raw.facts.facts.customer_payment_settled_and_allocated_to_that_line!.sourceRef = allocation.sourceId;
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.sourceManifest[7]!.sourceId = allocation.sourceId.toUpperCase();
    raw.facts.facts.billed_through_a_final_account_revision_and_invoice!.sourceRef = allocation.sourceId.toUpperCase();
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
  });
  it("S6-01-B r1 refuses a case-variant self predecessor", () => {
    const raw = { ...fixture(), revision: 2, previousAssessmentId: id(99) };
    raw.assessmentId = "abcdef00-0000-4000-8000-000000000003";
    raw.facts.revisionId = raw.assessmentId;
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.previousAssessmentId = raw.assessmentId.toUpperCase();
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
  });
  it("S6-01-B r1 refuses case-variant duplicates in frozen inventories", () => {
    const raw = fixture();
    const item = "abcdef00-0000-4000-8000-000000000004";
    const manifest = { ...raw.completeManifests[0]!, itemIds: [item], itemCount: 1 };
    const assessment = { ...raw, completeManifests: [manifest, ...raw.completeManifests.slice(1)] };
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(true);
    manifest.itemIds.push(item.toUpperCase()); manifest.itemCount = 2;
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(false);
  });
  it("S6-01-B r1 refuses case-variant duplicate qualifying allocations", () => {
    const allocation = "abcdef00-0000-4000-8000-000000000005";
    const raw = { ...current(), lineAllocationIds: [allocation] };
    expect(qualifyingRecoverySourceV1.safeParse(raw).success).toBe(true);
    raw.lineAllocationIds.push(allocation.toUpperCase());
    expect(qualifyingRecoverySourceV1.safeParse(raw).success).toBe(false);
  });
  it("S6-01-B r1b refuses one identity cited as both evidence and disclosure", () => {
    const raw = fixture();
    const evidenceId = "10000000-0000-4000-8000-0000000000aa";
    raw.sourceManifest[0]!.sourceId = evidenceId;
    raw.sourceManifest[1]!.sourceId = id(21);
    raw.facts.facts.evidence_received_before_lock!.sourceRef = evidenceId;
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    for (const disclosureId of [evidenceId, evidenceId.toUpperCase()]) {
      raw.sourceManifest[1]!.sourceId = disclosureId;
      raw.facts.facts.not_disclosed_before_lock!.sourceRef = disclosureId;
      expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
    }
  });
  it("S6-01-B r1b refuses allocation identities ending in 2a and 2A", () => {
    const allocation = "10000000-0000-4000-8000-00000000002a";
    expect(qualifyingRecoverySourceV1.safeParse({ ...current(), lineAllocationIds: [allocation] }).success).toBe(true);
    expect(qualifyingRecoverySourceV1.safeParse({ ...current(), lineAllocationIds: [allocation, allocation.toUpperCase()] }).success).toBe(false);
  });
  it("S6-01-B r1b requires one frozen inventory per kind even with length three", () => {
    const raw = fixture();
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.completeManifests[1] = { ...raw.completeManifests[0]! };
    expect(raw.completeManifests).toHaveLength(3);
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
  });
  it.each([0, 1, 2])("S6-01-B r1b binds frozen inventory %s to its lock", index => {
    const raw = fixture();
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.completeManifests[index]!.lockId = id(99);
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
  });
  it.each([0, 1, 2])("S6-01-B r1b checks frozen inventory %s source kind", index => {
    const raw = fixture();
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.completeManifests[index]!.sourceId = raw.sourceManifest[0]!.sourceId;
    const result = recoveryAttributionRevisionV1.safeParse(raw);
    expect(result.success).toBe(false);
    // Citation validation also rejects this input; independently require the kind-binding guard.
    if (!result.success) expect(result.error.issues.map(issue => issue.message)).toContain("Wrong complete manifest binding");
  });
  it("S6-01-B r1b requires absence to cite the frozen inventory rather than a second source", () => {
    const raw = fixture();
    const secondSource = { ...raw.sourceManifest[2]!, sourceId: id(99) };
    raw.sourceManifest.push(secondSource);
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(true);
    raw.facts.facts.absent_from_accepted_scope!.sourceRef = secondSource.sourceId;
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
  });
  it.each([0, 1, 2])("S6-01-B r1b requires unique itemIds in frozen inventory %s with matching count", index => {
    const raw = fixture();
    const item = "10000000-0000-4000-8000-0000000000aa";
    const manifest = { ...raw.completeManifests[index]!, itemIds: [item], itemCount: 1 };
    const assessment = { ...raw, completeManifests: raw.completeManifests.map((m, i) => i === index ? manifest : m) };
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(true);
    manifest.itemIds.push(item); manifest.itemCount = 2;
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(false);
    manifest.itemIds[1] = item.toUpperCase();
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(false);
  });
  it.each(["unresolved", "dismissed"])("S6-01-D r1b refuses eligible outcome with reasons and %s dispute", resolution => {
    const raw = fixture();
    const exclusion = { version: "shadow-ineligibility.v1", reason: "attribution_disputed", sourceRef: id(26), at: raw.serverRecordedAt, disclosureRoute: null };
    const disputeReview = resolution === "unresolved" ? null : { version: "shadow-dispute-review.v1", ...binding, resolution, sourceRef: id(26) };
    const assessment = { ...raw, facts: { ...raw.facts, exclusions: [exclusion], disputeReview }, reasonCodes: ["disputed"] };
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(false);
    expect(recoveryAttributionRevisionV1.safeParse({ ...assessment, assessmentOutcome: "excluded" }).success).toBe(true);
  });
  it.each(attributionPredicates)("S6-01-A r1 refuses eligible outcome with reasons and false %s", predicate => {
    const raw = fixture();
    raw.facts.facts[predicate]!.holds = false;
    raw.reasonCodes = [predicate];
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
    expect(recoveryAttributionRevisionV1.safeParse({ ...raw, assessmentOutcome: "excluded" }).success).toBe(true);
  });
  it.each(["disclosed_before_lock", "surfaced_early", "evidence_after_lock", "pre_adoption_evidence"])("S6-01-D r1 refuses eligible outcome with reasons and permanent %s", reason => {
    const raw = fixture();
    const excludedFacts = { ...raw.facts, exclusions: [{ version: "shadow-ineligibility.v1", reason, sourceRef: id(26), at: raw.serverRecordedAt, disclosureRoute: null }] };
    const assessment = { ...raw, facts: excludedFacts, reasonCodes: [reason] };
    expect(recoveryAttributionRevisionV1.safeParse(assessment).success).toBe(false);
    expect(recoveryAttributionRevisionV1.safeParse({ ...assessment, assessmentOutcome: "excluded" }).success).toBe(true);
  });
  it("S6-01-A r1 refuses eligible outcome with zero principal and all facts true", () => {
    const raw = { ...fixture(), remainingPrincipal: { numerator: "0", denominator: "1" } };
    expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
    expect(recoveryAttributionRevisionV1.safeParse({ ...raw, assessmentOutcome: "excluded", reasonCodes: ["zero_principal"] }).success).toBe(true);
  });
  it("S6-01-C public commands admit identity only and return typed errors", () => {
    expect(parseRecoveryAttributionCommand(command).action).toBe("assess");
    const approve = { ...command, action: "approve_review", assessmentId: id(7), expectedSourceHash: "a".repeat(64), reviewArtifactHash: "b".repeat(64) };
    expect(parseRecoveryAttributionCommand(approve).action).toBe("approve_review");
    for (const field of ["facts", "money", "remainingPrincipal", "actor", "tenantId", "sessionId", "policyVersion", "expiresAt", "decisionId", "resolutionId", "authorizationId", "reviewAuthorizationId", "eligible", "qualification", "environment", "recipient", "amountPence"]) {
      for (const raw of [command, approve]) expect(recoveryAttributionCommandV1.safeParse({ ...raw, [field]: true }).success, field).toBe(false);
    }
    expect(() => parseRecoveryAttributionCommand({ ...command, eligible: true })).toThrow(RecoveryAttributionError);
    expect(recoveryAttributionCommandV1.safeParse({ ...approve, reviewArtifactHash: "bad" }).success).toBe(false);
    expect(recoveryAttributionCommandV1.safeParse({ ...command, assessmentId: id(7) }).success).toBe(false);
  });
  it("S6-01-D confirmed dispute resolution never clears permanent exclusions", () => {
    const base = fixture();
    const exclusion = { version: "shadow-ineligibility.v1", reason: "attribution_disputed", sourceRef: id(26), at: base.serverRecordedAt, disclosureRoute: null };
    const review = { version: "shadow-dispute-review.v1", ...binding, resolution: "confirmed_extra", sourceRef: id(26) };
    const unresolved = { ...base, facts: { ...base.facts, exclusions: [exclusion] }, assessmentOutcome: "excluded", reasonCodes: ["disputed"] };
    expect(qualifiesAttribution(recoveryAttributionRevisionV1.parse(unresolved).facts)).toBe(false);
    expect(qualifiesAttribution(recoveryAttributionRevisionV1.parse({ ...base, facts: { ...base.facts, exclusions: [exclusion], disputeReview: review } }).facts)).toBe(true);
    for (const reason of ["disclosed_before_lock", "surfaced_early", "evidence_after_lock", "pre_adoption_evidence"]) {
      const raw = { ...base, facts: { ...base.facts, exclusions: [exclusion, { ...exclusion, reason }], disputeReview: review } };
      expect(recoveryAttributionRevisionV1.safeParse(raw).success).toBe(false);
      expect(qualifiesAttribution(recoveryAttributionRevisionV1.parse({ ...raw, assessmentOutcome: "excluded", reasonCodes: [reason] }).facts)).toBe(false);
    }
  });
  it("S6-01-E exact saved source has no fee or default policy and requires review/watermark", () => {
    expect(qualifyingRecoverySourceV1.parse(current()).exactRemainingPrincipal.numerator).toBe("80000");
    for (const field of ["reviewAuthorizationId", "reviewId", "sourceRevision", "sourceHash", "policyBundleRef", "attributionPolicyVersion", "eligibilityPolicyVersion"]) {
      const raw: Record<string, unknown> = { ...current() }; delete raw[field];
      expect(qualifyingRecoverySourceV1.safeParse(raw).success, field).toBe(false);
    }
    for (const lineAllocationIds of [[], [id(28), id(28)]]) expect(qualifyingRecoverySourceV1.safeParse({ ...current(), lineAllocationIds }).success).toBe(false);
    for (const field of ["feePence", "rate", "rounding", "cap", "credit", "eligible"]) expect(qualifyingRecoverySourceV1.safeParse({ ...current(), [field]: 1 }).success).toBe(false);
    const qualified = { version: "current-attribution-qualification.v1", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0, latestAssessmentId: id(7), currentSourceRevision: "sources.1", state: "qualified", source: qualifyingRecoverySourceV1.parse(current()), reasonCodes: [] };
    expect(currentAttributionQualificationV1.safeParse(qualified).success).toBe(true);
    for (const changes of [{ latestAssessmentId: id(99) }, { currentSourceRevision: "sources.2" }, { extra: true }, { source: null }]) expect(currentAttributionQualificationV1.safeParse({ ...qualified, ...changes }).success).toBe(false);
    const result = { version: "recovery-attribution-review-result.v1", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0, reviewId: id(10), assessmentId: id(7), assessmentRevision: 1, sourceRevision: "sources.1", sourceHash: "a".repeat(64), reviewAuthorizationId: id(11), reviewArtifactHash: "b".repeat(64), commandId: id(9), effect: "review_recorded" };
    expect(attributionReviewResultV1.safeParse(result).success).toBe(true);
    expect(attributionReviewResultV1.safeParse({ ...result, productionEnabled: true }).success).toBe(false);
    expect(qualifyingRecoverySourceV1.safeParse({ ...current(), exactRemainingPrincipal: { numerator: "0", denominator: "1" } }).success).toBe(false);
  });
});
