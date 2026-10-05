import { describe, expect, it } from "vitest";
import { evaluateMustSurface } from "./must-surface.js";
const base = { version: "shadow-must-surface.v1", policyVersion: "shadow_attribution_policy_v3", safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: { version: "D13-significance.v1", basis: "synthetic_fixture", sourceRef: "fixture://D13", significant: false }, activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false, sourceRef: "fixture://facts" };
describe("SV-1 shadow domain", () => {
    it("D13 mandatory rules cannot be suppressed", () => {
        const cases = [{ safetyImplication: true }, { customerClearlyRequested: true, needsPriorWrittenAgreement: true, significantWork: { ...base.significantWork, significant: true } }, { activeDispute: true, silenceMateriallyWorsensDispute: true }, { disclosureDuty: true }];
        for (const [i, c] of cases.entries()) {
            const r = evaluateMustSurface({ ...base, ...c });
            expect(r.firedRules).toEqual([{ rule: ["safety", "prior_written_agreement", "worsening_dispute", "disclosure_duty"][i], version: "shadow_attribution_policy_v3", sourceRef: "fixture://facts", policyFactRef: i === 1 ? "fixture://D13" : null }]);
            expect(r.ineligibility.map(v => v.reason)).toEqual(["surfaced_early", "disclosed_before_lock"]);
            expect(r).not.toHaveProperty("decision");
        }
        const all = evaluateMustSurface({ ...base, safetyImplication: true, customerClearlyRequested: true, needsPriorWrittenAgreement: true, significantWork: { ...base.significantWork, significant: true }, activeDispute: true, silenceMateriallyWorsensDispute: true, disclosureDuty: true });
        expect(all.firedRules).toHaveLength(4);
        for (const metadata of [{ confidenceBand: "low" }, { estimatedValuePence: 0 }, { detectorKind: "ai_proposal" }])
            expect(() => evaluateMustSurface({ ...base, ...cases[0], ...metadata })).toThrow();
    });
    it("supplier/order evidence alone fires nothing and absent policy predicates refuse", () => { expect(evaluateMustSurface(base).firedRules).toEqual([]); for (const significantWork of [undefined, null, { ...base.significantWork, basis: "production_threshold" }, { ...base.significantWork, version: "v0" }])
        expect(() => evaluateMustSurface({ ...base, significantWork, customerClearlyRequested: true, needsPriorWrittenAgreement: true })).toThrow(); });
});
