import { describe, expect, it } from "vitest";
import { attributionPredicates, createAttributionFacts, qualifiesAttribution } from "./attribution.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4), lockId: id(5) };
const raw = (mask = 1023) => ({ version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, revisionId: id(6), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map((key, i) => [key, { version: "shadow-fact.v1", ...binding, predicate: key, holds: Boolean(mask & (1 << i)), sourceRef: `fixture://${key}` }])) });
describe("SV-1 shadow domain", () => {
    it("all 1024 assignments qualify only when all ten predicates hold", () => { let count = 0; for (let mask = 0; mask < 1024; mask++) {
        const qualifies = qualifiesAttribution(createAttributionFacts(raw(mask)));
        expect(qualifies, `assignment ${mask}`).toBe(mask === 1023);
        if (qualifies)
            count++;
    } expect(count).toBe(1); });
    it("malformed, extra, missing, version-mismatched and wrong source bindings refuse", () => {
        const r = raw(), key = attributionPredicates[0], fact = r.facts[key]!;
        for (const changes of [{ jobId: id(9) }, { lineId: id(9) }, { tenantId: id(9) }, { lockId: id(9) }, { workId: id(9) }, { predicate: attributionPredicates[1] }, { sourceRef: "" }, { version: "v0" }, { confidence: 1 }])
            expect(() => createAttributionFacts({ ...r, facts: { ...r.facts, [key]: { ...fact, ...changes } } })).toThrow();
        for (const facts of [{ ...r.facts, [key]: undefined }, { ...r.facts, extra: fact }])
            expect(() => createAttributionFacts({ ...r, facts })).toThrow();
        expect(() => createAttributionFacts({ ...r, policyVersion: "v1" })).toThrow();
    });
    it("immutable exclusions survive later signal decisions", () => {
        for (const reason of ["evidence_after_lock", "pre_adoption_evidence", "disclosed_before_lock", "surfaced_early", "attribution_disputed"]) {
            const r = { ...raw(), exclusions: [{ version: "shadow-ineligibility.v1", reason, sourceRef: "fixture://immutable", at: "2026-10-01T00:00:00Z" }] };
            const a = createAttributionFacts(r);
            expect(qualifiesAttribution(a)).toBe(false);
            expect(() => Object.assign(a.exclusions[0]!, { reason: "none" })).toThrow();
            expect(Object.isFrozen(a.facts[attributionPredicates[0]])).toBe(true);
        }
    });
    it("a sourced human review resolves a dispute while retaining its immutable history", () => {
        const exclusion = { version: "shadow-ineligibility.v1", reason: "attribution_disputed", sourceRef: "fixture://dispute", at: "2026-10-01T00:00:00Z" };
        const review = { version: "shadow-dispute-review.v1", ...binding, resolution: "confirmed_extra", sourceRef: "fixture://human-review" };
        const a = createAttributionFacts({ ...raw(), exclusions: [exclusion], disputeReview: review });
        expect(qualifiesAttribution(a)).toBe(true);
        expect(a.exclusions).toHaveLength(1);
        expect(qualifiesAttribution(createAttributionFacts({ ...raw(), exclusions: [exclusion], disputeReview: { ...review, resolution: "dismissed" } }))).toBe(false);
        expect(() => createAttributionFacts({ ...raw(), exclusions: [exclusion], disputeReview: { ...review, lineId: id(99) } })).toThrow();
        for (const reason of ["evidence_after_lock", "pre_adoption_evidence", "disclosed_before_lock", "surfaced_early"])
            expect(qualifiesAttribution(createAttributionFacts({ ...raw(), exclusions: [{ ...exclusion, reason }], disputeReview: review }))).toBe(false);
    });
});
