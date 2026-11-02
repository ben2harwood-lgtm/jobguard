import { z } from "zod";
import { freezeShadow } from "./shadow-domain/types.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.string().min(1).max(300);
/** Canonical server timestamps keep PostgreSQL microseconds without a Date conversion. */
const timestamp = z.string().datetime().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);
const binding = { tenantId: uuid, jobId: uuid, manifestId: uuid };
export const finalCheckManifestSourceV1 = z.object({
    id: uuid, ...binding, receivedAt: timestamp,
    inputState: z.enum(["pending", "verified", "rejected", "unsupported", "invalidated"]),
    inputHash: hash.nullable(), adapterVersion: revision,
}).strict();
export const finalCheckSourceAttemptV1 = z.object({
    id: uuid, sourceId: uuid, ...binding, executionId: uuid,
    sequence: z.number().int().nonnegative().safe(), stage: z.enum(["detection", "reconciliation"]),
    processingVersion: revision, adapterVersion: revision, inputHash: hash.nullable(),
    outcome: z.enum(["pending", "succeeded", "failed", "unsupported", "invalidated"]),
    resultHash: hash.nullable(), signalIds: z.array(uuid).nullable(), failureCode: revision.nullable(),
}).strict();
/**
 * Server-read consistency snapshot, never a command or an invoice authorization.
 * Inventory and detected/classified identities must come from independent persisted reads.
 * SQL owns source verification, hash recomputation, access checks and certificate publication.
 */
export const finalCheckCompletionV1 = z.object({
    version: z.literal("final-check-completion.v1"), ...binding, lockId: uuid, cutoffAt: timestamp,
    detectorVersion: revision, reconciliationVersion: revision,
    inventorySourceIds: z.array(uuid), sources: z.array(finalCheckManifestSourceV1),
    run: z.object({
        id: uuid, ...binding, lockId: uuid, cutoffAt: timestamp, executionId: uuid,
        status: z.enum(["pending", "failed", "completed"]),
    }).strict(),
    attempts: z.array(finalCheckSourceAttemptV1), detectedSignalIds: z.array(uuid), classifiedSignalIds: z.array(uuid),
    result: z.object({ runId: uuid, kind: z.enum(["empty", "signals"]), signalIds: z.array(uuid), resultHash: hash }).strict().nullable(),
}).strict();
export type FinalCheckCompletionSnapshot = z.infer<typeof finalCheckCompletionV1>;
export type FinalCheckCompletionErrorCode = "INVALID_FINAL_CHECK_INPUT" | "FINAL_CHECK_NOT_COMPLETE" |
    "FINAL_CHECK_BINDING_MISMATCH" | "FINAL_CHECK_SOURCE_INCOMPLETE" | "FINAL_CHECK_RESULT_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT";
export class FinalCheckCompletionError extends Error {
    constructor(public readonly code: FinalCheckCompletionErrorCode) {
        super(code);
        this.name = "FinalCheckCompletionError";
    }
}
export function parseFinalCheckCompletion(raw: unknown) {
    const parsed = finalCheckCompletionV1.safeParse(raw);
    if (!parsed.success) throw new FinalCheckCompletionError("INVALID_FINAL_CHECK_INPUT");
    return freezeShadow(parsed.data);
}
function sameIds(actual: readonly string[], expected: readonly string[]) {
    const actualSet = new Set(actual), expectedSet = new Set(expected);
    return actualSet.size === actual.length && expectedSet.size === expected.length &&
        actual.length === expected.length && actual.every(id => expectedSet.has(id));
}
function sameBinding(a: { tenantId: string; jobId: string; manifestId: string }, b: { tenantId: string; jobId: string; manifestId: string }) {
    return a.tenantId === b.tenantId && a.jobId === b.jobId && a.manifestId === b.manifestId;
}
/** Pure consistency checks over persisted facts; success cannot create authoritative completion. */
export function assertFinalCheckCompleteness(raw: unknown) {
    const proof = parseFinalCheckCompletion(raw);
    function fail(code: FinalCheckCompletionErrorCode): never { throw new FinalCheckCompletionError(code); }
    if (!sameBinding(proof, proof.run) || proof.run.lockId !== proof.lockId || proof.run.cutoffAt !== proof.cutoffAt ||
        !sameIds(proof.inventorySourceIds, proof.sources.map(source => source.id)))
        fail("FINAL_CHECK_BINDING_MISMATCH");
    for (const source of proof.sources)
        if (!sameBinding(proof, source) || source.receivedAt > proof.cutoffAt) fail("FINAL_CHECK_BINDING_MISMATCH");
    if (proof.run.status !== "completed") fail("FINAL_CHECK_NOT_COMPLETE");

    const attemptsById = new Map<string, (typeof proof.attempts)[number]>();
    const latest = new Map<string, (typeof proof.attempts)[number]>();
    const sequenceIds = new Map<string, string>();
    const sourceIds = new Set(proof.sources.map(source => source.id));
    for (const attempt of proof.attempts) {
        if (!sameBinding(proof, attempt) || attempt.executionId !== proof.run.executionId ||
            !sourceIds.has(attempt.sourceId)) fail("FINAL_CHECK_BINDING_MISMATCH");
        const prior = attemptsById.get(attempt.id);
        if (prior) {
            if (JSON.stringify(prior) !== JSON.stringify(attempt)) fail("IDEMPOTENCY_CONFLICT");
            continue;
        }
        attemptsById.set(attempt.id, attempt);
        const key = `${attempt.sourceId}/${attempt.stage}`, sequenceKey = `${key}/${attempt.sequence}`;
        if (sequenceIds.has(sequenceKey)) fail("IDEMPOTENCY_CONFLICT");
        sequenceIds.set(sequenceKey, attempt.id);
        const previous = latest.get(key);
        if (!previous || previous.sequence < attempt.sequence) latest.set(key, attempt);
    }
    const detected = new Set<string>();
    for (const source of proof.sources) {
        const detection = latest.get(`${source.id}/detection`), reconciliation = latest.get(`${source.id}/reconciliation`);
        if (source.inputState !== "verified" || source.inputHash === null || !detection || !reconciliation)
            fail("FINAL_CHECK_SOURCE_INCOMPLETE");
        // Explicit output (including []) and exact persisted input identities are required for both stages.
        if (detection.outcome !== "succeeded" || reconciliation.outcome !== "succeeded" ||
            detection.resultHash === null || reconciliation.resultHash === null ||
            detection.signalIds === null || reconciliation.signalIds === null ||
            detection.failureCode !== null || reconciliation.failureCode !== null ||
            detection.processingVersion !== proof.detectorVersion || reconciliation.processingVersion !== proof.reconciliationVersion ||
            detection.adapterVersion !== source.adapterVersion || reconciliation.adapterVersion !== source.adapterVersion ||
            detection.inputHash !== source.inputHash || reconciliation.inputHash !== detection.resultHash ||
            !sameIds(detection.signalIds, reconciliation.signalIds)) fail("FINAL_CHECK_SOURCE_INCOMPLETE");
        for (const signal of detection.signalIds) detected.add(signal);
    }
    const signals = [...detected], result = proof.result;
    if (!sameIds(proof.detectedSignalIds, signals) || !sameIds(proof.classifiedSignalIds, signals) || !result ||
        result.runId !== proof.run.id || !sameIds(result.signalIds, signals) ||
        result.kind !== (signals.length === 0 ? "empty" : "signals")) fail("FINAL_CHECK_RESULT_UNAVAILABLE");
    return proof;
}
