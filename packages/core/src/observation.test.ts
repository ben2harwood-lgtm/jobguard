import { describe, expect, it } from "vitest";
import { parseObservation, observationKinds } from "./observation.js";
const id = "10000000-0000-4000-8000-000000000001";
export const observationFixture = (changes: Record<string, unknown> = {}) => ({
  version: "observation.v1", tenantId: id, jobId: id, kind: "note_or_voice",
  evidence: { id, objectVersionId: "synthetic-v1", sha256: "a".repeat(64), serverReceivedAt: "2026-10-01T00:00:00Z" },
  text: "Fitted outside tap.", citations: [{ start: 0, end: 19, quote: "Fitted outside tap." }],
  facts: { workReference: "outside-tap", scopeArea: "garden", description: "outside tap", status: "completed", estimatedValuePence: null,
    safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: null,
    activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false }, ...changes,
});
describe("observation.v1 track-neutral boundary", () => {
  it.each(observationKinds)("accepts %s with immutable evidence and resolving offsets", kind => {
    const input = observationFixture({ kind }), parsed = parseObservation(input);
    expect(parsed.kind).toBe(kind); expect(Object.isFrozen(parsed.facts)).toBe(true); expect(Object.isFrozen(input.facts)).toBe(false);
  });
  it("refuses track, signal, attribution, origin and fee authority", () => {
    for (const field of ["track", "signalId", "eligibility", "origin", "fee", "attribution"])
      expect(() => parseObservation(observationFixture({ [field]: "forged" }))).toThrow("INVALID_OBSERVATION");
  });
  it("refuses forged citations, evidence versions and money", () => {
    for (const citations of [[{ start: 0, end: 19, quote: "Invented statement" }], [{ start: 0, end: 20, quote: "Fitted outside tap." }], []])
      expect(() => parseObservation(observationFixture({ citations }))).toThrow("INVALID_OBSERVATION");
    const raw = observationFixture();
    for (const estimatedValuePence of [-1, 0.5, 1_000_000_000_001, Number.MAX_SAFE_INTEGER])
      expect(() => parseObservation({ ...raw, facts: { ...raw.facts, estimatedValuePence } })).toThrow();
    expect(() => parseObservation({ ...raw, evidence: { ...raw.evidence, objectVersionId: "" } })).toThrow();
  });
});
