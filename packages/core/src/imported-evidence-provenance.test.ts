import { describe, expect, it, vi } from "vitest";
import { classifyImportedEvidenceProvenance } from "./imported-evidence-provenance.js";
import { attributionPredicates, createAttributionFacts, qualifiesAttribution } from "./shadow-domain/attribution.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), evidenceId: id(3), objectVersionId: "original-1", sha256: "a".repeat(64) };
const input = () => ({ version: "imported-evidence-provenance.v1", binding, adoptedAt: "2026-10-01T12:00:00.000000Z", sourceOccurredAt: "2026-10-01T11:59:59.999999Z", receivedAt: "2026-10-02T00:00:00.000000Z", historyContradictory: false, prior: null });
describe("CH5-C historical provenance", () => {
  it("[CH5-C05] keeps one microsecond before, equivalent offsets and strictly after distinct without reading a clock", () => {
    const clock = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("ambient clock"); });
    try {
      const before = classifyImportedEvidenceProvenance(input());
      expect(before).toMatchObject({ classification: "pre_adoption_evidence", permanentExclusion: true });
      expect(classifyImportedEvidenceProvenance({ ...input(), sourceOccurredAt: "2026-10-01T12:59:59.999999+01:00" })).toMatchObject({ classification: before.classification });
      expect(classifyImportedEvidenceProvenance({ ...input(), adoptedAt: "2026-10-01T13:00:00.000000+01:00" })).toMatchObject({ classification: before.classification });
      expect(classifyImportedEvidenceProvenance({ ...input(), sourceOccurredAt: "2026-10-01T12:00:00.000001Z" })).toMatchObject({ classification: "not_pre_adoption_by_timing", permanentExclusion: false, positiveEligibility: "not_asserted" });
      expect(before.sourceOccurredAt).toBe(input().sourceOccurredAt);
    } finally { clock.mockRestore(); }
  });
  it("[CH5-C05] equal, missing, invalid, imprecise and contradictory history stays held", () => {
    for (const sourceOccurredAt of [input().adoptedAt, "2026-10-01T13:00:00.000000+01:00", null, "bad", "2026-02-30T00:00:00.000000Z", "2026-10-01T11:59:59Z", "2026-10-01T11:59:59.999Z", "2026-10-01T11:59:59.999999-00:00"]) {
      expect(classifyImportedEvidenceProvenance({ ...input(), sourceOccurredAt })).toMatchObject({ classification: "timing_unresolved", positiveEligibility: "held" });
    }
    for (const change of [{ adoptedAt: "bad" }, { receivedAt: null }, { historyContradictory: true }, { receivedAt: "2026-09-01T00:00:00.000000Z" }])
      expect(classifyImportedEvidenceProvenance({ ...input(), ...change })).toMatchObject({ classification: "timing_unresolved", positiveEligibility: "held" });
  });
  it("[CH5-C05] orders nanoseconds and equivalent offsets across leap-day/year boundaries", () => {
    for (const [adoptedAt, sourceOccurredAt, receivedAt] of [
      ["2024-03-01T00:00:00.000000000Z", "2024-02-29T23:59:59.999999999Z", "2024-03-02T00:00:00.000000000Z"],
      ["2027-01-01T00:00:00.000000Z", "2026-12-31T18:59:59.999999-05:00", "2027-01-02T00:00:00.000000Z"],
    ]) expect(classifyImportedEvidenceProvenance({ ...input(), adoptedAt, sourceOccurredAt, receivedAt })).toMatchObject({ classification: "pre_adoption_evidence" });
    expect(classifyImportedEvidenceProvenance({ ...input(), adoptedAt: "2024-03-01T00:00:00.000000Z", sourceOccurredAt: "2024-02-29T19:00:00.000000-05:00", receivedAt: "2024-03-02T00:00:00.000000Z" })).toMatchObject({ classification: "timing_unresolved" });
  });
  it("[CH5-C06] preserves prior exclusion through late upload, changed history and rediscovery, only for the exact binding", () => {
    const prior = classifyImportedEvidenceProvenance(input());
    for (const change of [{ receivedAt: "2026-12-01T00:00:00.000000Z" }, { sourceOccurredAt: "2026-10-01T12:00:00.000001Z" }, { sourceOccurredAt: null }, { historyContradictory: true }])
      expect(classifyImportedEvidenceProvenance({ ...input(), ...change, prior })).toMatchObject({ classification: "pre_adoption_evidence", permanentExclusion: true });
    for (const key of Object.keys(binding))
      expect(() => classifyImportedEvidenceProvenance({ ...input(), prior, binding: { ...binding, [key]: key === "sha256" ? "b".repeat(64) : key === "objectVersionId" ? "replacement" : id(99) } })).toThrow("IMPORT_PROVENANCE_BINDING_MISMATCH");
    expect(() => classifyImportedEvidenceProvenance({ ...input(), adoptedAt: "2026-11-01T00:00:00.000000Z", prior })).toThrow("IMPORT_PROVENANCE_BINDING_MISMATCH");
    expect(Object.isFrozen(prior.binding)).toBe(true);
    expect(Object.isFrozen(binding)).toBe(false);
  });
  it("[CH5-C02] fails typed on malformed binding or unknown authority fields", () => {
    expect(() => classifyImportedEvidenceProvenance({ ...input(), feeEligible: true })).toThrow("INVALID_IMPORT_PROVENANCE");
    expect(() => classifyImportedEvidenceProvenance({ ...input(), binding: { ...binding, evidenceId: "bad" } })).toThrow("INVALID_IMPORT_PROVENANCE");
  });
  it("[CH5-C08] existing shadow exclusion predicate refuses a before-adoption candidate even with all positive facts", () => {
    const candidate = classifyImportedEvidenceProvenance(input());
    const factsBinding = { tenantId: binding.tenantId, jobId: binding.jobId, workId: id(4), lineId: id(5), lockId: id(6) };
    const facts = { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...factsBinding, revisionId: id(7), disputeReview: null,
      facts: Object.fromEntries(attributionPredicates.map(predicate => [predicate, { version: "shadow-fact.v1", ...factsBinding, predicate, holds: true, sourceRef: "fixture://positive" }])),
      exclusions: [{ version: "shadow-ineligibility.v1", reason: candidate.classification, sourceRef: binding.evidenceId, at: input().receivedAt }] };
    expect(qualifiesAttribution(createAttributionFacts(facts))).toBe(false);
  });
});
