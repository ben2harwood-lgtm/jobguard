import { z } from "zod";
import { MAX_MONEY_PENCE, exactPenceInputV1 } from "@jobguard/core";
export { recoveryAllocationCommandV1 } from "@jobguard/core";
const id = z.guid({ error: "Invalid uuid" });
const pence = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
// A credit issued after payment leaves a customer credit (negative balance).
const signedPence = z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const recoveryAllocationViewV1 = z.object({
  version: z.literal("recovery-allocation-view.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), jobId: id,
  grossMovementsPence: pence, eligibleNetPence: pence, allocatedTaxPence: pence, invoiceBalancePence: signedPence, paused: z.boolean(),
  availableEvidence: z.array(z.object({ evidenceId: id, objectVersionId: z.string().min(1), evidenceHash: hash, label: z.string().min(1) }).strict()),
  reversalSources: z.array(z.object({ allocationId: id, sourceId: id, kind: z.enum(["payment_reversal", "credit_note"]), availableGrossPence: pence }).strict()),
  receipts: z.array(z.object({ paymentId: id, invoiceId: id, grossPence: pence, availablePence: pence, movementId: id, movementHash: hash, reversed: z.boolean() }).strict()),
  cases: z.array(z.object({ caseId: id, caseType: z.string(), state: z.string(), revision: z.number().int().positive(), claimedNetPence: pence, outstandingNetPence: pence }).strict()),
  allocations: z.array(z.object({ id, caseId: id, paymentId: id, invoiceId: id, grossPence: pence, eligibleNetPence: pence, taxPence: pence,
    evidenceId: id, objectVersionId: z.string().min(1), evidenceHash: hash, policyVersion: z.string().min(1), reviewerRef: z.string().min(1), authorizationId: id,
    movementId: id, movementHash: hash, held: z.boolean(), reversedPence: pence }).strict()),
  lines: z.array(z.object({ id, paymentId: id, invoiceId: id, lineId: id, rule: z.enum(["explicit", "separate_invoice", "pro_rata"]), sourceRef: z.string().min(1),
    gross: exactPenceInputV1, net: exactPenceInputV1, reversesId: id.nullable() }).strict()),
  review: z.object({ action: z.enum(["allocate", "reverse"]), caseId: id, paymentId: id, allocationId: id.nullable(), expectedCaseRevision: z.number().int().positive(),
    grossPence: pence, eligibleNetPence: pence, taxPence: pence, approvalHash: hash, policyVersion: z.string().min(1), movementHash: hash, evidenceHash: hash }).strict().nullable(),
}).strict();
export type RecoveryAllocationView = z.infer<typeof recoveryAllocationViewV1>;
export const recoveryAllocationErrorV1 = z.object({ version: z.literal("recovery-allocation-error.v1"), code: z.string() }).strict();
const statuses: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401, SYNTHETIC_ONLY: 403, SYNTHETIC_MODE_REQUIRED: 403, TENANT_FORBIDDEN: 403, MEMBERSHIP_FORBIDDEN: 403,
  NOT_FOUND: 404, INVALID_COMMAND: 400, INVALID_QUERY: 400, INVALID_ALLOCATION_FACTS: 400, INVALID_CASE_SPLIT: 400, FRACTIONAL_CASE_SPLIT: 409,
  ALLOCATION_EXCEEDS_AVAILABLE: 409, ALLOCATION_EXCEEDS_CLAIM: 409, ALLOCATION_EXCEEDS_EVIDENCE: 409, ALLOCATION_SOURCE_REQUIRED: 409,
  ALLOCATION_APPROVAL_CHANGED: 409, ALLOCATION_REVISION_CONFLICT: 409, ALLOCATION_IDEMPOTENCY_CONFLICT: 409, IDEMPOTENCY_PAYLOAD_CONFLICT: 409,
  ALLOCATION_NOT_FOUND: 404, ALLOCATION_FORBIDDEN: 403, ALLOCATION_SYNTHETIC_ONLY: 403, ALLOCATION_EVIDENCE_HELD: 409,
  ALLOCATION_REVERSAL_SOURCE_REQUIRED: 409, RECOVERY_STALE_REVISION: 409, RECOVERY_TRANSITION_FORBIDDEN: 409, RECOVERY_REVIEWER_FORBIDDEN: 403,
};
/** A transport failure is a refusal only when its known domain code agrees with the HTTP status. */
export const recoveryAllocationRefusalV1 = z.object({ status: z.number().int(), body: recoveryAllocationErrorV1 }).strict()
  .refine(answer => Object.hasOwn(statuses, answer.body.code) && statuses[answer.body.code] === answer.status && answer.status < 500,
    { message: "Unknown allocation outcome" });
export function recoveryAllocationHttpError(error: unknown) {
  const supplied = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code = typeof supplied === "string" && Object.hasOwn(statuses, supplied) ? supplied : "DATABASE_UNAVAILABLE";
  return { status: statuses[code] ?? 503, body: { version: "recovery-allocation-error.v1" as const, code } };
}
