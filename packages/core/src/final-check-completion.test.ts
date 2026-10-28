import { describe, expect, it } from "vitest";
import {
    assertFinalCheckCompleteness, FinalCheckCompletionError, finalCheckCompletionV1,
    parseFinalCheckCompletion,
} from "./final-check-completion.js";

const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (letter: string) => letter.repeat(64);
function proof() {
    return {
        version: "final-check-completion.v1", tenantId: id(1), jobId: id(2), lockId: id(3),
        manifestId: id(4), cutoffAt: "2026-10-13T10:00:00.000001Z", detectorVersion: "detector.v1", reconciliationVersion: "reconciliation.v1",
        inventorySourceIds: [id(5)],
        sources: [{ id: id(5), tenantId: id(1), jobId: id(2), manifestId: id(4),
            receivedAt: "2026-10-13T10:00:00.000000Z", inputState: "verified", inputHash: hash("a"), adapterVersion: "evidence.v1" }],
        run: { id: id(6), tenantId: id(1), jobId: id(2), lockId: id(3), manifestId: id(4),
            cutoffAt: "2026-10-13T10:00:00.000001Z", executionId: id(7), status: "completed" },
        attempts: [
            { id: id(8), sourceId: id(5), tenantId: id(1), jobId: id(2), manifestId: id(4), executionId: id(7), sequence: 1,
                stage: "detection", processingVersion: "detector.v1", adapterVersion: "evidence.v1", inputHash: hash("a"),
                outcome: "succeeded", resultHash: hash("b"), signalIds: [], failureCode: null },
            { id: id(9), sourceId: id(5), tenantId: id(1), jobId: id(2), manifestId: id(4), executionId: id(7), sequence: 1,
                stage: "reconciliation", processingVersion: "reconciliation.v1", adapterVersion: "evidence.v1", inputHash: hash("b"),
                outcome: "succeeded", resultHash: hash("c"), signalIds: [], failureCode: null },
        ],
        detectedSignalIds: [], classifiedSignalIds: [],
        result: { runId: id(6), kind: "empty", signalIds: [], resultHash: hash("d") },
    };
}
function refusal(raw: unknown, expected: string) {
    expect(() => assertFinalCheckCompleteness(raw)).toThrow(FinalCheckCompletionError);
    try { assertFinalCheckCompleteness(raw); } catch (error) {
        expect((error as FinalCheckCompletionError).code).toBe(expected);
    }
}
describe("SV5PRE pure completeness snapshot", () => {
    it("PRE-Q5-01 strict versioned snapshots refuse supplied completion shortcuts", () => {
        expect(finalCheckCompletionV1.safeParse(proof()).success).toBe(true);
        for (const patch of [{ version: "final-check-completion.v2" }, { complete: true }, { certificateId: id(99) }])
            refusal({ ...proof(), ...patch }, "INVALID_FINAL_CHECK_INPUT");
        refusal({ ...proof(), run: null }, "INVALID_FINAL_CHECK_INPUT");
        refusal({ ...proof(), cutoffAt: "2026-02-30T10:00:00.000001Z" }, "INVALID_FINAL_CHECK_INPUT");
    });
    it("PRE-Q5-02 a default completed run without processing and results is insufficient", () => {
        refusal({ ...proof(), attempts: [], result: null }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        refusal({ ...proof(), run: { ...proof().run, status: "pending" } }, "FINAL_CHECK_NOT_COMPLETE");
        refusal({ ...proof(), run: { ...proof().run, status: "failed" } }, "FINAL_CHECK_NOT_COMPLETE");
    });
    it("PRE-Q5-03 inventory sources remain required when no signals exist", () => {
        refusal({ ...proof(), sources: [] }, "FINAL_CHECK_BINDING_MISMATCH");
        refusal({ ...proof(), inventorySourceIds: [] }, "FINAL_CHECK_BINDING_MISMATCH");
        refusal({ ...proof(), inventorySourceIds: [id(5), id(5)] }, "FINAL_CHECK_BINDING_MISMATCH");
        refusal({ ...proof(), sources: [...proof().sources, ...proof().sources] }, "FINAL_CHECK_BINDING_MISMATCH");
    });
    it("PRE-Q5-04 a pre-cutoff source received one microsecond earlier still needs processing", () => {
        refusal({ ...proof(), attempts: proof().attempts.slice(0, 1) }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        expect(assertFinalCheckCompleteness(proof()).result?.kind).toBe("empty");
    });
    it("PRE-Q5-05 unfinished unsupported invalidated and failed inputs are not zero results", () => {
        for (const inputState of ["pending", "rejected", "unsupported", "invalidated"])
            refusal({ ...proof(), sources: [{ ...proof().sources[0], inputState }] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        refusal({ ...proof(), sources: [{ ...proof().sources[0], inputHash: null }] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        for (const outcome of ["pending", "failed", "unsupported", "invalidated"])
            refusal({ ...proof(), attempts: [{ ...proof().attempts[0], outcome, resultHash: null, signalIds: null, failureCode: "SOURCE_NOT_READY" }, proof().attempts[1]] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        refusal({ ...proof(), attempts: [{ ...proof().attempts[0], signalIds: null }, proof().attempts[1]] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
    });
    it("PRE-Q5-06 both stages bind exact input output processing and adapter versions", () => {
        refusal({ ...proof(), attempts: proof().attempts.slice(1) }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        for (const patch of [{ inputHash: hash("f") }, { processingVersion: "detector.v2" }, { adapterVersion: "evidence.v2" }])
            refusal({ ...proof(), attempts: [{ ...proof().attempts[0], ...patch }, proof().attempts[1]] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        for (const patch of [{ inputHash: hash("a") }, { processingVersion: "reconciliation.v2" }, { signalIds: [id(90)] }])
            refusal({ ...proof(), attempts: [proof().attempts[0], { ...proof().attempts[1], ...patch }] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
    });
    it("PRE-Q5-07 an empty inventory and a zero-result source each require explicit persisted output", () => {
        expect(assertFinalCheckCompleteness(proof()).result?.kind).toBe("empty");
        const empty = { ...proof(), inventorySourceIds: [], sources: [], attempts: [] };
        expect(assertFinalCheckCompleteness(empty).result?.kind).toBe("empty");
        refusal({ ...empty, result: null }, "FINAL_CHECK_RESULT_UNAVAILABLE");
        refusal({ ...empty, result: { ...proof().result, kind: "signals" } }, "FINAL_CHECK_RESULT_UNAVAILABLE");
        refusal({ ...empty, attempts: proof().attempts }, "FINAL_CHECK_BINDING_MISMATCH");
    });
    it("PRE-Q5-08 identities and canonical microsecond cutoff must match exactly", () => {
        for (const patch of [{ tenantId: id(90) }, { jobId: id(90) }, { lockId: id(90) }, { manifestId: id(90) }, { cutoffAt: "2026-10-13T10:00:00.000002Z" }])
            refusal({ ...proof(), run: { ...proof().run, ...patch } }, "FINAL_CHECK_BINDING_MISMATCH");
        for (const patch of [{ tenantId: id(90) }, { jobId: id(90) }, { manifestId: id(90) }, { receivedAt: "2026-10-13T10:00:00.000002Z" }])
            refusal({ ...proof(), sources: [{ ...proof().sources[0], ...patch }] }, "FINAL_CHECK_BINDING_MISMATCH");
        refusal({ ...proof(), cutoffAt: "2026-10-13T10:00:00.001Z" }, "INVALID_FINAL_CHECK_INPUT");
        for (const patch of [{ tenantId: id(90) }, { jobId: id(90) }, { manifestId: id(90) }, { executionId: id(90) }, { sourceId: id(90) }])
            refusal({ ...proof(), attempts: [{ ...proof().attempts[0], ...patch }, proof().attempts[1]] }, "FINAL_CHECK_BINDING_MISMATCH");
    });
    it("PRE-Q5-09 all detected signals need classification and an exact available result", () => {
        const signals = { ...proof(), attempts: proof().attempts.map(a => ({ ...a, signalIds: [id(90)] })),
            detectedSignalIds: [id(90)], classifiedSignalIds: [id(90)], result: { ...proof().result, kind: "signals", signalIds: [id(90)] } };
        expect(assertFinalCheckCompleteness(signals).result?.signalIds).toEqual([id(90)]);
        for (const patch of [{ detectedSignalIds: [] }, { classifiedSignalIds: [] }, { classifiedSignalIds: [id(91)] }, { classifiedSignalIds: [id(90), id(90)] }, { result: null }, { result: { ...signals.result, signalIds: [] } }, { result: { ...signals.result, runId: id(91) } }, { result: { ...signals.result, kind: "empty" } }])
            refusal({ ...signals, ...patch }, "FINAL_CHECK_RESULT_UNAVAILABLE");
    });
    it("PRE-Q5-12 attempts retain failure history and refuse changed identity or ambiguous ordering", () => {
        const failed = { ...proof().attempts[0], id: id(80), sequence: 0, outcome: "failed", resultHash: null, signalIds: null, failureCode: "DETECTOR_FAILED" };
        expect(assertFinalCheckCompleteness({ ...proof(), attempts: [failed, ...proof().attempts] }).attempts).toHaveLength(3);
        const laterFailure = { ...failed, sequence: 2 };
        refusal({ ...proof(), attempts: [...proof().attempts, laterFailure] }, "FINAL_CHECK_SOURCE_INCOMPLETE");
        refusal({ ...proof(), attempts: [...proof().attempts, { ...proof().attempts[0], inputHash: hash("f") }] }, "IDEMPOTENCY_CONFLICT");
        refusal({ ...proof(), attempts: [...proof().attempts, { ...proof().attempts[0], id: id(81) }] }, "IDEMPOTENCY_CONFLICT");
        expect(assertFinalCheckCompleteness({ ...proof(), attempts: [...proof().attempts, proof().attempts[0]] }).attempts).toHaveLength(3);
    });
    it("PRE-Q5-10 parsed snapshots are immutable without freezing caller data", () => {
        const raw = proof(), parsed = parseFinalCheckCompletion(raw);
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed.sources)).toBe(true);
        expect(Object.isFrozen(parsed.sources[0])).toBe(true);
        expect(Object.isFrozen(raw)).toBe(false);
        expect(Object.isFrozen(raw.sources[0])).toBe(false);
    });
});
