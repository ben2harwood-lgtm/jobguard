import { describe, expect, it } from "vitest";
import {
    FINAL_ACCOUNT_DECLARATION, FINAL_ACCOUNT_DECLARATION_VERSION, FINAL_ACCOUNT_REVIEW_PROMPT,
    FINAL_CHECK_TERMS_VERSION, FINAL_CHECK_TERMS_STATEMENTS, FINAL_CHECK_RUNNING_TEXT,
    finalAccountLockCommandV1, finalAccountDispositionCommandV1, finalCheckTermsAcceptanceCommandV1,
    FinalAccountLockError, parseFinalAccountLockCommand, createFinalAccountLockSnapshot,
    verifyFinalAccountLockSnapshot, captureRegisterNetPence, assertFinalAccountInvoiceGuard,
} from "./final-account-lock.js";
import { createLockSnapshot } from "./shadow-domain/lock.js";

const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function source() {
    return {
        version: "shadow-lock.v1", tenantId: id(1), jobId: id(2), finalAccountRevisionId: id(3), baselineQuoteVersionId: id(4),
        captureRegister: [
            { version: "shadow-capture.v1", tenantId: id(1), jobId: id(2), id: id(5), scopeItemId: id(15), revisionId: id(16), serverRecordedAt: "2026-10-01T00:00:00Z", valuePence: 320000, kind: "log_extra", state: "approved", scopeArea: "garden", description: "Logged extra", recordedPhase: "pre_lock", aiStructured: false, sourceRef: "capture:logged" },
            { version: "shadow-capture.v1", tenantId: id(1), jobId: id(2), id: id(6), scopeItemId: id(17), revisionId: id(18), serverRecordedAt: "2026-10-01T00:00:00Z", valuePence: 40000, kind: "final_review", state: null, scopeArea: "garden", description: "Review extra", recordedPhase: "pre_lock", aiStructured: false, sourceRef: "capture:review" },
        ],
        lines: [{ id: id(7), scopeItemId: id(8), revisionId: id(9), netPence: 80000, sourceRef: "line:baseline" }],
        scopeDispositions: [{ scopeItemId: id(8), disposition: "done", sourceRef: "disposition:done" }], baselineScopeItemIds: [id(8)],
        declaration: FINAL_ACCOUNT_DECLARATION, declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION,
        onboardingTermsVersion: FINAL_CHECK_TERMS_VERSION, lockingMembershipId: id(10), serverTimestamp: "2026-10-02T00:00:00.000001Z", commandId: id(11), auditEventId: id(12),
    };
}
const command = () => ({ version: "final-account.lock.v1", commandId: id(11), finalAccountRevisionId: id(3), expectedRevision: 1, declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION });
function code(run: () => void, expected: string) {
    try { run(); throw new Error("Expected a refusal"); }
    catch (error) { expect(error).toBeInstanceOf(FinalAccountLockError); expect((error as FinalAccountLockError).code).toBe(expected); }
}

describe("SV-4 final-account lock", () => {
    it("uses strict versioned commands and refuses supplied server facts", () => {
        expect(parseFinalAccountLockCommand(command())).toEqual(command());
        for (const extra of [{ tenantId: id(1) }, { serverTimestamp: source().serverTimestamp }, { digest: "a".repeat(64) }, { status: "completed" }, { invoiceKind: "interim" }, { actorMembershipId: id(10) }])
            code(() => parseFinalAccountLockCommand({ ...command(), ...extra }), "INVALID_FINAL_ACCOUNT_LOCK_INPUT");
        for (const patch of [{ version: "final-account.lock.v2" }, { declarationVersion: "other.v1" }, { expectedRevision: -1 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { commandId: "not-a-uuid" }])
            expect(finalAccountLockCommandV1.safeParse({ ...command(), ...patch }).success).toBe(false);
        expect(finalAccountDispositionCommandV1.safeParse({ version: "final-account.disposition.v1", commandId: id(11), scopeItemId: id(8), disposition: "removed" }).success).toBe(true);
        expect(finalAccountDispositionCommandV1.safeParse({ version: "final-account.disposition.v1", commandId: id(11), scopeItemId: id(8), disposition: "deleted" }).success).toBe(false);
        expect(finalCheckTermsAcceptanceCommandV1.safeParse({ version: "final-check-terms.accept.v1", commandId: id(11), termsVersion: FINAL_CHECK_TERMS_VERSION }).success).toBe(true);
        expect(finalCheckTermsAcceptanceCommandV1.safeParse({ version: "final-check-terms.accept.v1", commandId: id(11), termsVersion: "approved-production.v1" }).success).toBe(false);
    });
    it("preserves exact declaration, prompt, check text and only the four terms statements", () => {
        expect(FINAL_ACCOUNT_DECLARATION).toBe("I've reviewed the work and extras on this job and this is my complete final account.");
        expect(FINAL_ACCOUNT_REVIEW_PROMPT).toBe("Anything else to add before you finish this job?");
        expect(FINAL_CHECK_RUNNING_TEXT).toBe("Running JobGuard's final check");
        expect(FINAL_CHECK_TERMS_STATEMENTS).toEqual(["analyses job records;", "may identify possible unrecorded extras;", "compares them independently with the completed final account;", "may earn the success fee on paid recoveries that qualify."]);
    });
    it("delegates to the SV-1 snapshot and verifies all source bindings", () => {
        const s = source(), lock = createFinalAccountLockSnapshot(s);
        expect(lock.digest).toBe(createLockSnapshot(s).digest);
        expect(lock.canonicalBytes).toBe(createLockSnapshot(s).canonicalBytes);
        expect(verifyFinalAccountLockSnapshot(s, lock)).toEqual({ verified: true, mismatches: [] });
        const cases = [
            { source: { ...s, captureRegister: s.captureRegister.map(c => ({ ...c, description: `${c.description} corrected` })) }, hash: "captureRegisterHash" },
            { source: { ...s, lines: s.lines.map(l => ({ ...l, netPence: l.netPence + 1 })) }, hash: "lineSetHash" },
            { source: { ...s, scopeDispositions: s.scopeDispositions.map(d => ({ ...d, disposition: "removed" })) }, hash: "scopeDispositionHash" },
        ];
        for (const change of cases) expect(verifyFinalAccountLockSnapshot(change.source, lock)).toEqual({ verified: false, mismatches: [change.hash, "digest"] });
        expect(verifyFinalAccountLockSnapshot({ ...s, serverTimestamp: "2026-10-02T00:00:00.000002Z" }, lock)).toEqual({ verified: false, mismatches: ["digest"] });
        expect(() => createFinalAccountLockSnapshot({ ...s, scopeDispositions: [] })).toThrow();
        expect(() => createFinalAccountLockSnapshot({ ...s, declaration: "Different declaration" })).toThrow();
        expect(() => createFinalAccountLockSnapshot({ ...s, onboardingTermsVersion: "terms.v2" })).toThrow();
    });
    it("sums exact F12 captures and retains unknown values and all states in the digest", () => {
        const s = source();
        expect(captureRegisterNetPence(s)).toBe(360000);
        const allStates = ["draft", "priced", "approved", "rejected", "withdrawn"].map((state, index) => ({ ...s.captureRegister[0]!, id: id(20 + index), state, valuePence: null }));
        const withStates = { ...s, captureRegister: [...s.captureRegister, ...allStates] };
        expect(createFinalAccountLockSnapshot(withStates).snapshot.captureRegister).toHaveLength(7);
        expect(captureRegisterNetPence(withStates)).toBe(360000);
        for (const capture of allStates)
            expect(createFinalAccountLockSnapshot({ ...withStates, captureRegister: withStates.captureRegister.filter(c => c.id !== capture.id) }).captureRegisterHash).not.toBe(createFinalAccountLockSnapshot(withStates).captureRegisterHash);
        expect(() => captureRegisterNetPence({ ...s, captureRegister: s.captureRegister.map(c => ({ ...c, valuePence: 1_000_000_000_000 })) })).toThrow();
    });
    it("guards final and supplementary issue against absent, pending, failed and misbound checks", () => {
        const lock = { id: id(40), tenantId: id(1), jobId: id(2), serverTimestamp: source().serverTimestamp };
        const completed = { lockId: lock.id, tenantId: lock.tenantId, jobId: lock.jobId, evidenceCutoffAt: lock.serverTimestamp, status: "completed" as const };
        for (const kind of ["final", "supplementary"] as const) {
            code(() => assertFinalAccountInvoiceGuard(kind, null, completed), "FINAL_ACCOUNT_LOCK_REQUIRED");
            code(() => assertFinalAccountInvoiceGuard(kind, lock, null), "FINAL_CHECK_NOT_COMPLETE");
            code(() => assertFinalAccountInvoiceGuard(kind, lock, { ...completed, status: "pending" }), "FINAL_CHECK_NOT_COMPLETE");
            code(() => assertFinalAccountInvoiceGuard(kind, lock, { ...completed, status: "failed" }), "FINAL_CHECK_FAILED");
            for (const patch of [{ lockId: id(41) }, { tenantId: id(42) }, { jobId: id(43) }, { evidenceCutoffAt: "2026-10-02T00:00:00.000002Z" }])
                code(() => assertFinalAccountInvoiceGuard(kind, lock, { ...completed, ...patch }), "FINAL_CHECK_NOT_COMPLETE");
            expect(() => assertFinalAccountInvoiceGuard(kind, lock, completed)).not.toThrow();
        }
        expect(() => assertFinalAccountInvoiceGuard("interim", null, null)).not.toThrow();
    });
});
