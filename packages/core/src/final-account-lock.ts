import { z } from "zod";
import { addMoney, money } from "./money.js";
import { instantV1 } from "./receipt-allocation.js";
import { createLockSnapshot, hashLockCaptureRegister, hashLockLineSet, hashLockScopeDispositions } from "./shadow-domain/lock.js";
import { freezeShadow } from "./shadow-domain/types.js";

export const FINAL_ACCOUNT_DECLARATION_VERSION = "final_account_declaration.v1" as const;
export const FINAL_CHECK_TERMS_VERSION = "synthetic_final_check_terms.v1" as const;
export const FINAL_ACCOUNT_DECLARATION = "I've reviewed the work and extras on this job and this is my complete final account." as const;
export const FINAL_ACCOUNT_REVIEW_PROMPT = "Anything else to add before you finish this job?" as const;
export const FINAL_CHECK_RUNNING_TEXT = "Running JobGuard's final check" as const;
/** BUILD_PLAN §10.2.10: closed synthetic wording, pending D12/D13 approval. */
export const FINAL_CHECK_TERMS_STATEMENTS = Object.freeze([
    "analyses job records;",
    "may identify possible unrecorded extras;",
    "compares them independently with the completed final account;",
    "may earn the success fee on paid recoveries that qualify.",
] as const);
export const scopeDispositionValues = ["done", "removed", "deferred"] as const;
export const scopeDispositionV1 = z.enum(scopeDispositionValues);
const uuid = z.string().uuid();
export const finalAccountLockCommandV1 = z.object({
    version: z.literal("final-account.lock.v1"), commandId: uuid,
    finalAccountRevisionId: uuid, expectedRevision: z.number().int().nonnegative().safe(),
    declarationVersion: z.literal(FINAL_ACCOUNT_DECLARATION_VERSION),
}).strict();
export const finalAccountDispositionCommandV1 = z.object({
    version: z.literal("final-account.disposition.v1"), commandId: uuid,
    scopeItemId: uuid, disposition: scopeDispositionV1,
}).strict();
export const finalCheckTermsAcceptanceCommandV1 = z.object({
    version: z.literal("final-check-terms.accept.v1"), commandId: uuid,
    termsVersion: z.literal(FINAL_CHECK_TERMS_VERSION),
}).strict();
export type FinalAccountLockCommand = z.infer<typeof finalAccountLockCommandV1>;
export type FinalAccountDispositionCommand = z.infer<typeof finalAccountDispositionCommandV1>;
export type FinalCheckTermsAcceptanceCommand = z.infer<typeof finalCheckTermsAcceptanceCommandV1>;
export type FinalAccountLockErrorCode = "INVALID_FINAL_ACCOUNT_LOCK_INPUT" | "FINAL_ACCOUNT_ALREADY_LOCKED" | "IDEMPOTENCY_CONFLICT" | "SCOPE_DISPOSITION_MISSING" | "DISCLOSURE_TERMS_NOT_ACCEPTED" | "FINAL_ACCOUNT_LOCK_REQUIRED" | "FINAL_CHECK_NOT_COMPLETE" | "FINAL_CHECK_FAILED" | "FINAL_REVIEW_CLOSED" | "STALE_REVISION" | "FINAL_ACCOUNT_SOURCE_CHANGED" | "SCOPE_ITEM_NOT_BASELINE" | "FINAL_INVOICE_REVISION_MISMATCH" | "FINAL_INVOICE_ALREADY_ISSUED" | "SUPPLEMENTARY_INVOICE_BASE_REQUIRED" | "INVOICE_AMOUNT_INVALID" | "INVOICE_SOURCE_CORRECTION_REQUIRED" | "FINAL_ACCOUNT_TOTAL_MISMATCH" | "JOB_NOT_FOUND" | "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS";
export class FinalAccountLockError extends Error {
    constructor(public readonly code: FinalAccountLockErrorCode, public readonly existingLockId?: string) {
        super(code);
        this.name = "FinalAccountLockError";
    }
}
export function parseFinalAccountLockCommand(raw: unknown): FinalAccountLockCommand {
    const result = finalAccountLockCommandV1.safeParse(raw);
    if (!result.success) throw new FinalAccountLockError("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
    return Object.freeze(result.data);
}

/** The caller supplies server-read sources; commands cannot supply hashes or timestamps. */
export function createFinalAccountLockSnapshot(raw: unknown) {
    const lock = createLockSnapshot(raw);
    if (lock.snapshot.declaration !== FINAL_ACCOUNT_DECLARATION || lock.snapshot.declarationVersion !== FINAL_ACCOUNT_DECLARATION_VERSION || lock.snapshot.onboardingTermsVersion !== FINAL_CHECK_TERMS_VERSION)
        throw new FinalAccountLockError("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
    return freezeShadow({ ...lock,
        captureRegisterHash: hashLockCaptureRegister(lock.snapshot.captureRegister),
        lineSetHash: hashLockLineSet(lock.snapshot.lines),
        scopeDispositionHash: hashLockScopeDispositions(lock.snapshot.scopeDispositions),
    });
}
export type FinalAccountLockHashes = Readonly<{ digest: string; captureRegisterHash: string; lineSetHash: string; scopeDispositionHash: string }>;
/** Re-read the same immutable source identities, then report exactly which binding changed. */
export function verifyFinalAccountLockSnapshot(raw: unknown, expected: FinalAccountLockHashes) {
    const rebuilt = createFinalAccountLockSnapshot(raw);
    const keys = ["captureRegisterHash", "lineSetHash", "scopeDispositionHash", "digest"] as const;
    const mismatches = keys.filter(key => rebuilt[key] !== expected[key]);
    return Object.freeze({ verified: mismatches.length === 0, mismatches: Object.freeze(mismatches) });
}
export function captureRegisterNetPence(raw: unknown): number {
    const captures = createLockSnapshot(raw).snapshot.captureRegister;
    let total = money(0);
    for (const capture of captures) if (capture.valuePence !== null) total = addMoney(total, money(capture.valuePence));
    return total.pence;
}

const lockGuardV1 = z.object({ id: uuid, tenantId: uuid, jobId: uuid, serverTimestamp: instantV1 }).strict();
const checkGuardV1 = z.object({ lockId: uuid, tenantId: uuid, jobId: uuid, evidenceCutoffAt: instantV1, status: z.enum(["pending", "failed", "completed"]) }).strict();
export type FinalAccountInvoiceLock = z.infer<typeof lockGuardV1>;
export type FinalAccountInvoiceCheck = z.infer<typeof checkGuardV1>;
/** Shared fail-closed presentation/command guard; SQL independently enforces the same facts. */
export function assertFinalAccountInvoiceGuard(kind: "final" | "supplementary" | "interim", lock: FinalAccountInvoiceLock | null, check: FinalAccountInvoiceCheck | null): void {
    if (kind === "interim") return;
    if (kind !== "final" && kind !== "supplementary") throw new FinalAccountLockError("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
    if (lock === null) throw new FinalAccountLockError("FINAL_ACCOUNT_LOCK_REQUIRED");
    const parsedLock = lockGuardV1.safeParse(lock), parsedCheck = checkGuardV1.safeParse(check);
    if (!parsedLock.success) throw new FinalAccountLockError("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
    if (!parsedCheck.success || parsedCheck.data.lockId !== parsedLock.data.id || parsedCheck.data.tenantId !== parsedLock.data.tenantId || parsedCheck.data.jobId !== parsedLock.data.jobId || parsedCheck.data.evidenceCutoffAt !== parsedLock.data.serverTimestamp)
        throw new FinalAccountLockError("FINAL_CHECK_NOT_COMPLETE");
    if (parsedCheck.data.status === "failed") throw new FinalAccountLockError("FINAL_CHECK_FAILED");
    if (parsedCheck.data.status !== "completed") throw new FinalAccountLockError("FINAL_CHECK_NOT_COMPLETE");
}
