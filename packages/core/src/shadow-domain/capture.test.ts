import { describe, expect, it } from "vitest";
import { classifyShadowSource, matchBuilderCapture, shadowCaptureV1 } from "./capture.js";
const id = "10000000-0000-4000-8000-000000000001";
const capture = (kind = "log_extra", state = "draft") => ({ version: "shadow-capture.v1", tenantId: id, jobId: id, id, scopeItemId:id, revisionId:id, serverRecordedAt:"2026-10-01T00:00:00Z", valuePence:null, kind, state, scopeArea: "garden", description: "Outside tap fitted", recordedPhase: "pre_lock", aiStructured: true, sourceRef: "fixture://capture" });
const candidate = { version: "shadow-match.v1", tenantId: id, jobId: id, scopeArea: "Garden", description: "Fitted outside tap", dateCompatibility: "unknown", valueCompatibility: "unknown", ruleVersion: "builder-favourable-match.v1" };
describe("SV-1 shadow domain", () => {
    it("rejected and withdrawn extras reconcile as builder capture", () => { for (const state of ["draft", "priced", "approved", "rejected", "withdrawn"]) {
        const c = capture("log_extra", state);
        expect(classifyShadowSource({ version: "shadow-source.v1", kind: "log_extra", state, aiStructured: true, recordedPhase: "pre_lock" })).toBe("capture");
        expect(matchBuilderCapture(candidate, [c]).outcome).toBe("builder_captured");
    } });
    it("each capture state and evidence source class", () => {
        for (const kind of ["baseline", "final_review"])
            expect(classifyShadowSource({ version: "shadow-source.v1", kind, state: null, aiStructured: false, recordedPhase: "pre_lock" })).toBe("capture");
        expect(classifyShadowSource({ version: "shadow-source.v1", kind: "final_review", state: null, aiStructured: false, recordedPhase: "post_lock" })).toBe("evidence");
        for (const kind of ["diary", "voice_note", "photo", "supplier_document", "purchase_order", "message", "delivery_note", "imported_document"])
            expect(classifyShadowSource({ version: "shadow-source.v1", kind, state: null, aiStructured: false, recordedPhase: "pre_lock" })).toBe("evidence");
        expect(shadowCaptureV1.safeParse({ ...capture(), deleted: true }).success).toBe(false);
    });
    it("A B D P captures and baseline match with exact source references", () => {
        for (const [label, kind, state] of [["A", "log_extra", "approved"], ["B", "final_review", null], ["D", "baseline", null], ["P", "log_extra", "draft"]] as const) {
            const out = matchBuilderCapture(candidate, [capture(kind, state ?? "draft")].map(c => ({ ...c, state })));
            expect(out.outcome, label).toBe(kind === "baseline" ? "already_in_original_scope" : "builder_captured");
            expect(out.references).toEqual([{ id, sourceRef: "fixture://capture" }]);
        }
    });
    it("ambiguous compatibility favours capture while clearly incompatible facts refuse", () => {
        const c = capture(), before = JSON.stringify(c);
        for (const dateCompatibility of ["compatible", "unknown"])
            for (const valueCompatibility of ["compatible", "unknown"])
                expect(matchBuilderCapture({ ...candidate, dateCompatibility, valueCompatibility }, [c]).outcome).toBe("builder_captured");
        for (const change of [{ scopeArea: "roof" }, { description: "rewire kitchen" }, { dateCompatibility: "incompatible" }, { valueCompatibility: "incompatible" }, { jobId: "10000000-0000-4000-8000-000000000002" }])
            expect(matchBuilderCapture({ ...candidate, ...change }, [c]).outcome).toBe("unmatched");
        expect(matchBuilderCapture({...candidate,description:"!!!"},[{...c,description:"???"}]).outcome).toBe("unmatched");
        expect(JSON.stringify(c)).toBe(before);
        expect(() => matchBuilderCapture({ ...candidate, valueTolerance: 20 }, [c])).toThrow();
    });
    it("O remains evidence and L timing exclusions cannot be relabelled as capture", () => { expect(matchBuilderCapture(candidate, []).outcome).toBe("unmatched"); expect(matchBuilderCapture(candidate, [{ ...capture("final_review"), state: null, recordedPhase: "post_lock" }]).outcome).toBe("unmatched"); });
});
