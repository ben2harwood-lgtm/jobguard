import { describe, expect, it } from "vitest";
import { createLockSnapshot } from "./lock.js";
import { sha256 } from "../evidence-pack.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const snap = () => ({ version: "shadow-lock.v1", tenantId: id(1), jobId: id(2), finalAccountRevisionId: id(3), baselineQuoteVersionId: id(4), captureRegister: [{ version: "shadow-capture.v1", tenantId: id(1), jobId: id(2), id: id(5), scopeItemId:id(16), revisionId:id(17), serverRecordedAt:"2026-10-01T00:00:00Z", valuePence:null, kind: "log_extra", state: "withdrawn", scopeArea: "garden", description: "tap", recordedPhase: "pre_lock", aiStructured: false, sourceRef: "fixture://capture" }, { version: "shadow-capture.v1", tenantId: id(1), jobId: id(2), id: id(6), scopeItemId:id(18), revisionId:id(19), serverRecordedAt:"2026-10-01T00:00:00Z", valuePence:40000, kind: "final_review", state: null, scopeArea: "garden", description: "gate", recordedPhase: "pre_lock", aiStructured: false, sourceRef: "fixture://review" }], lines: [{ id: id(7), scopeItemId: id(8), revisionId: id(9), netPence: 80000, sourceRef: "fixture://line" }, { id: id(14), scopeItemId: id(10), revisionId: id(15), netPence: 30000, sourceRef: "fixture://line2" }], scopeDispositions: [{ scopeItemId: id(8), disposition: "done", sourceRef: "fixture://scope" }, { scopeItemId: id(10), disposition: "deferred", sourceRef: "fixture://scope2" }], baselineScopeItemIds: [id(8), id(10)], declaration: "I've reviewed the work and extras on this job and this is my complete final account.", declarationVersion: "declaration.v1", onboardingTermsVersion: "terms.v1", lockingMembershipId: id(11), serverTimestamp: "2026-10-03T00:00:00Z", commandId: id(12), auditEventId: id(13) });
describe("SV-1 shadow domain", () => {
    it("lock digest binds every snapshot field and canonical order", () => {
        const s = snap(), out = createLockSnapshot(s), permuted = { ...s, captureRegister: [...s.captureRegister].reverse(), lines: [...s.lines].reverse(), scopeDispositions: [...s.scopeDispositions].reverse(), baselineScopeItemIds: [...s.baselineScopeItemIds].reverse() };
        expect(createLockSnapshot(Object.fromEntries(Object.entries(permuted).reverse()))).toEqual(out);
        expect(out.digest).toBe(sha256(out.canonicalBytes));
        const changes: Record<string, unknown>[] = [{ tenantId: id(20), captureRegister: s.captureRegister.map(c => ({ ...c, tenantId: id(20) })) }, { jobId: id(20), captureRegister: s.captureRegister.map(c => ({ ...c, jobId: id(20) })) }, { finalAccountRevisionId: id(20) }, { baselineQuoteVersionId: id(20) }, { captureRegister: s.captureRegister.map(c => ({ ...c, description: c.description + " changed" })) }, { captureRegister: [{ ...s.captureRegister[0], state: "rejected" }, s.captureRegister[1]] }, {captureRegister:s.captureRegister.map(c=>({...c,valuePence:80000}))}, {captureRegister:s.captureRegister.map(c=>({...c,revisionId:id(20)}))}, { lines: [{ ...s.lines[0], netPence: 80001 }] }, { scopeDispositions: s.scopeDispositions.map(d => ({ ...d, disposition: "removed" })) }, { declaration: s.declaration + " " }, { declarationVersion: "declaration.v2" }, { onboardingTermsVersion: "terms.v2" }, { lockingMembershipId: id(20) }, { serverTimestamp: "2026-10-03T00:00:01Z" }, { commandId: id(20) }, { auditEventId: id(20) }];
        for (const c of changes)
            expect(createLockSnapshot({ ...s, ...c }).digest, JSON.stringify(c)).not.toBe(out.digest);
        const before = JSON.stringify(s);
        expect(() => { Object.assign(out.snapshot.captureRegister[0]!, { state: "approved" }); }).toThrow();
        expect(JSON.stringify(s)).toBe(before);
    });
    it("duplicate, conflicting, missing and wrong-job identities refuse", () => {
        const s = snap();
        for (const c of [{ captureRegister: [...s.captureRegister, s.captureRegister[0]] }, { lines: [...s.lines, s.lines[0]] }, { scopeDispositions: [...s.scopeDispositions, s.scopeDispositions[0]] }, { scopeDispositions: [] }, { commandId: undefined }, { auditEventId: undefined }, { captureRegister: [{ ...s.captureRegister[0], jobId: id(20) }] }, { lines: [{ ...s.lines[0], unknown: true }] }])
            expect(() => createLockSnapshot({ ...s, ...c })).toThrow();
    });
});
