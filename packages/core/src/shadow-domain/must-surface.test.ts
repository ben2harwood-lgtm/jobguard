import { describe, expect, it } from "vitest";
import { evaluateMustSurface } from "./must-surface.js";
import { createShadowSignal } from "./signal.js";
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
    it("round2 P-G safety and other independent rules do not require significance", () => {
        for (const [facts, rule] of [[{ safetyImplication: true }, "safety"], [{ activeDispute: true, silenceMateriallyWorsensDispute: true }, "worsening_dispute"], [{ disclosureDuty: true }, "disclosure_duty"]] as const) {
            const result = evaluateMustSurface({ ...base, significantWork: undefined, ...facts });
            expect(result.firedRules.map(r => r.rule)).toEqual([rule]);
            expect(result.ineligibility.map(r => r.reason)).toEqual(["surfaced_early", "disclosed_before_lock"]);
        }
        expect(evaluateMustSurface({ ...base, significantWork: undefined }).firedRules).toEqual([]);
        expect(evaluateMustSurface({ ...base, significantWork: undefined, safetyImplication: true, customerClearlyRequested: true }).firedRules[0]?.rule).toBe("safety");
    });
    it("round2 safety firing survives low confidence and zero or unknown estimated value", () => {
        const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
        const binding = { tenantId: id(1), jobId: id(2), workId: id(3) };
        const evidence = { version: "shadow-evidence.v1", ...binding, signalId: id(4), evidenceId: id(5), objectVersionId: "synthetic-v1", sha256: "a".repeat(64), sourceReceivedAt: "2026-10-01T00:00:00Z", lockTiming: "before_lock", adoptionTiming: "after_adoption" } as const;
        for (const confidenceBand of ["low", "medium", "high"] as const)
            for (const estimatedValuePence of [null, 0, 80000]) {
                const rule = evaluateMustSurface({ ...base, significantWork: undefined, safetyImplication: true });
                expect(rule.firedRules[0]?.rule).toBe("safety");
                const signal = createShadowSignal({ version: "shadow-proposal.v1", ...binding, signalId: id(4), signalType: "possible_extra", detectorKind: "ai_proposal", detectorVersion: "fixture.v1", createdAt: "2026-10-02T00:00:00Z", evidenceCutoffAt: evidence.sourceReceivedAt, description: "fictional safety concern", confidenceBand, estimatedValuePence, mustSurfaceNow: rule.firedRules.length > 0, evidence: [evidence] }, { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, [evidence]);
                expect(signal.state).toBe("surfaced_early");
                expect(signal.disclosedBeforeLock).toBe(true);
                expect(signal.ineligibility.map(e => e.reason)).toEqual(["surfaced_early", "disclosed_before_lock"]);
            }
    });
    it("supplier/order evidence alone fires nothing and absent policy predicates refuse", () => { expect(evaluateMustSurface(base).firedRules).toEqual([]); for (const significantWork of [undefined, null, { ...base.significantWork, basis: "production_threshold" }, { ...base.significantWork, version: "v0" }])
        expect(() => evaluateMustSurface({ ...base, significantWork, customerClearlyRequested: true, needsPriorWrittenAgreement: true })).toThrow(); });
});
