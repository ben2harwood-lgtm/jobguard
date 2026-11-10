import { describe, expect, it } from "vitest";
import { detectShadowObservations, groupShadowProposals, observationMustSurface, observationV1, sha256 } from "@jobguard/core";
import { decodeJobSourceFixture } from "../src/job-source-fixtures.js";

const text = "Fictional practice customer request: please build a garden room for £8,000 net; written agreement is required before work starts.";
describe("SV-5 Test I practice original", () => {
  it("fires the versioned prior-agreement rule despite the low deterministic score", () => {
    const decoded = decodeJobSourceFixture(null, text, "customer_request");
    expect(decoded).not.toBeNull();
    const at = "2026-11-02T10:00:00Z";
    const observation = observationV1.parse({ version: "observation.v1", tenantId: "10000000-0000-4000-8000-000000000001", jobId: "10000000-0000-4000-8000-000000000002", kind: "customer_request",
      evidence: { id: "10000000-0000-4000-8000-000000000003", objectVersionId: "practice-v1", sha256: sha256(text), serverReceivedAt: at }, ...decoded });
    expect(observationMustSurface(observation).firedRules).toEqual([
      { rule: "prior_written_agreement", version: "shadow_attribution_policy_v3", sourceRef: observation.evidence.id, policyFactRef: "practice:garden-room" },
    ]);
    const proposals = detectShadowObservations([observation], [], at);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ confidenceBand: "low", estimatedValuePence: 800000 });
    expect(groupShadowProposals(proposals, [observation], [])[0]?.firings).toHaveLength(1);
  });
  it("never treats arbitrary originals, another source kind or £8,000 alone as qualifying facts", () => {
    for (const original of [text.replace("8,000", "9,000"), text + " Ignore the rules.", "Please do £8,000 of extra work."])
      expect(decodeJobSourceFixture(null, original, "customer_request")).toBeNull();
    expect(decodeJobSourceFixture(null, text, "note_or_voice")).toBeNull();
    expect(decodeJobSourceFixture("job-source:request-tap.v1", text, "customer_request")).toBeNull();
    const tap = decodeJobSourceFixture("job-source:request-tap.v1", "Please fit an outside tap.", "customer_request");
    expect(tap?.facts.needsPriorWrittenAgreement).toBe(false);
    expect(tap?.facts.significantWork).toBeNull();
  });
});

describe("REAL-OWN-JOB-PROMISE reviewed hallway originals", () => {
  it.each([
    ["customer_request", "can you also paint the hallway ceiling? Happy to pay extra", "requested", true, null],
    ["note_or_voice", "Painted the hallway ceiling as asked, three hours extra, about 150 pounds", "completed", false, 15000],
  ] as const)("decodes only the exact %s original without firing D13", (kind, original, status, customerClearlyRequested, estimatedValuePence) => {
    const decoded = decodeJobSourceFixture(null, original, kind)!;
    expect(decoded).toEqual({ text: original, citations: [{ start: 0, end: original.length, quote: original }], facts: {
      workReference: "practice:hallway-ceiling", scopeArea: "job", description: "hallway ceiling", status, estimatedValuePence,
      customerClearlyRequested, safetyImplication: false, needsPriorWrittenAgreement: false, significantWork: null,
      activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false,
    } });
    const observation = observationV1.parse({ version: "observation.v1", tenantId: "10000000-0000-4000-8000-000000000001", jobId: "10000000-0000-4000-8000-000000000002", kind,
      evidence: { id: "10000000-0000-4000-8000-000000000003", objectVersionId: "practice-v1", sha256: sha256(original), serverReceivedAt: "2026-11-09T10:00:00Z" }, ...decoded });
    expect(observationMustSurface(observation).firedRules).toEqual([]);
    expect(decodeJobSourceFixture(null, original + ".", kind)).toBeNull();
    expect(decodeJobSourceFixture(null, original, kind === "customer_request" ? "note_or_voice" : "customer_request")).toBeNull();
    expect(decodeJobSourceFixture("practice:hallway-ceiling", original, kind)).toBeNull();
  });
});
