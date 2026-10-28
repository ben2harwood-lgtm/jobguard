import { z } from "zod";
import { exactPenceV1, MAX_ALLOCATION_LINES, parseExactPence } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { instantV1 } from "./receipt-allocation.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const reference = z.string().min(1).max(300).refine(value => value.trim().length > 0);
const amount = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const positiveAmount = amount.refine(value => value > 0);
const revision = z.number().int().safe().positive();
const rule = z.enum(["explicit", "separate_invoice", "pro_rata"]);
// Saved allocator outputs may be wider than allocation inputs. Keep the shared output bound.
const exact = exactPenceV1.refine(value => {
  try { parseExactPence(value); return value.numerator !== "-0"; } catch { return false; }
}, "Invalid exact pence");
const shares = { gross: exact, net: exact, reversesLineAllocationId: uuid.nullable() };
function signedShares(value: z.infer<typeof proposedLine>, reversal: boolean): boolean {
  const gross = BigInt(value.gross.numerator), net = BigInt(value.net.numerator);
  return reversal
    ? gross < 0n && net <= 0n && value.reversesLineAllocationId !== null
    : gross > 0n && net >= 0n && value.reversesLineAllocationId === null;
}
const proposedLine = z.object({ lineId: uuid, rule, sourceRef: reference, ...shares }).strict();

/** Server-only factual projection. Parsing grants no authority or qualifying conclusion. */
export const receiptLineAllocationSourceV1 = z.object({
  version: z.literal("receipt-line-allocation-source.v1"), tenantId: uuid, jobId: uuid,
  allocationRevisionId: uuid, lineAllocationId: uuid, sourceHash: hash,
  direction: z.enum(["receipt", "reversal"]), paymentId: uuid, movementId: uuid, movementHash: hash,
  invoiceId: uuid,
  invoiceBinding: z.object({ invoiceId: uuid, revisionId: uuid, lockId: uuid, checkId: uuid,
    invoiceKind: z.enum(["final", "supplementary"]) }).strict(),
  lineId: uuid, scopeItemId: uuid, commercialRevisionId: uuid, rule, sourceRef: reference,
  receiptEffectiveAt: instantV1, lineExistedAt: instantV1, ...shares,
  originalLineNetPence: amount, originalLineGrossPence: positiveAmount, approvalRef: reference,
  evidence: z.array(z.object({ evidenceId: uuid, objectVersionId: reference, sha256: hash,
    serverReceivedAt: instantV1 }).strict()).min(1).max(MAX_ALLOCATION_LINES),
}).strict().superRefine((value, ctx) => {
  // Refinements can run after a primitive failed; never BigInt unvalidated strings.
  if (!exact.safeParse(value.gross).success || !exact.safeParse(value.net).success) return;
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.invoiceBinding.invoiceId !== value.invoiceId) fail("Invoice binding mismatch");
  if (!signedShares(value, value.direction === "reversal")) fail("Direction/sign/link mismatch");
  if (value.reversesLineAllocationId === value.lineAllocationId) fail("Cannot reverse self");
  if (!amount.safeParse(value.originalLineNetPence).success || !positiveAmount.safeParse(value.originalLineGrossPence).success) return;
  if (value.originalLineNetPence > value.originalLineGrossPence) fail("Net exceeds gross");
  const gross = parseExactPence(value.gross), net = parseExactPence(value.net);
  if (net.numerator * gross.denominator * BigInt(value.originalLineGrossPence) !==
      gross.numerator * net.denominator * BigInt(value.originalLineNetPence)) fail("Original line ratio mismatch");
  const magnitude = gross.numerator < 0n ? -gross.numerator : gross.numerator;
  if (magnitude > BigInt(value.originalLineGrossPence) * gross.denominator) fail("Allocation exceeds original line");
});
export type RecoveryLineAllocationSourceV1 = z.infer<typeof receiptLineAllocationSourceV1>;

const commandBase = { version: z.literal("receipt-line-allocation-command.v1"), commandId: uuid, expectedSourceRevision: revision };
export const receiptLineAllocationCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("review"), paymentId: uuid, remittanceEvidenceId: uuid.optional() }).strict(),
  z.object({ ...commandBase, action: z.literal("approve"), reviewId: uuid, approvalHash: hash }).strict(),
  z.object({ ...commandBase, action: z.literal("review_reverse"), allocationRevisionId: uuid,
    reversalSource: z.object({ kind: z.enum(["payment_reversal", "credit_note"]), sourceId: uuid }).strict(),
    grossPence: positiveAmount, remittanceEvidenceId: uuid.optional() }).strict(),
  z.object({ ...commandBase, action: z.literal("reverse"), reviewId: uuid, approvalHash: hash }).strict(),
]);
export type ReceiptLineAllocationCommandV1 = z.infer<typeof receiptLineAllocationCommandV1>;
export const receiptLineAllocationHoldCodeV1 = z.enum([
  "UNMATCHED_RECEIPT", "PENDING_MOVEMENT", "DUPLICATE_MOVEMENT", "REVERSED_MOVEMENT", "INVALIDATED_EVIDENCE",
  "MISSING_INVOICE_BINDING", "INCOMPLETE_COMPOSITION", "SOURCE_CHANGED", "UNSUPPORTED_SOURCE", "APPROVAL_EXPIRED", "APPROVAL_REVOKED",
]);
export const receiptLineAllocationQueryV1 = z.object({ version: z.literal("receipt-line-allocation-query.v1"), commandId: uuid.optional() }).strict();
const resultBase = { version: z.literal("receipt-line-allocation-command-result.v1"), environment: z.literal("synthetic_demo"),
  realExternalActions: z.literal(0), commandId: uuid, jobId: uuid, replayed: z.boolean(), sourceRevision: revision, sourceHash: hash, reviewId: uuid };
export const receiptLineAllocationCommandResultV1 = z.discriminatedUnion("action", [
  z.object({ ...resultBase, action: z.literal("review"), outcome: z.literal("review_saved"), allocationRevisionId: z.null() }).strict(),
  z.object({ ...resultBase, action: z.literal("approve"), outcome: z.literal("distribution_saved"), allocationRevisionId: uuid }).strict(),
  z.object({ ...resultBase, action: z.literal("review_reverse"), outcome: z.literal("reversal_review_saved"), allocationRevisionId: z.null() }).strict(),
  z.object({ ...resultBase, action: z.literal("reverse"), outcome: z.literal("reversal_saved"), allocationRevisionId: uuid }).strict(),
]);
export type ReceiptLineAllocationCommandResultV1 = z.infer<typeof receiptLineAllocationCommandResultV1>;
const reviewV1 = z.object({ version: z.literal("receipt-line-allocation-review.v1"), reviewId: uuid,
  operation: z.enum(["receipt", "reversal"]), paymentId: uuid, invoiceId: uuid,
  expectedSourceRevision: revision, sourceHash: hash, approvalHash: hash, createdAt: instantV1, expiresAt: instantV1,
  state: z.enum(["ready", "stale", "expired", "revoked", "consumed"]), proposedLines: z.array(proposedLine).min(1).max(MAX_ALLOCATION_LINES),
}).strict().superRefine((value, ctx) => {
  for (const line of value.proposedLines) {
    if (exact.safeParse(line.gross).success && exact.safeParse(line.net).success && !signedShares(line, value.operation === "reversal"))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Proposal sign/link mismatch" });
  }
});
const receiptV1 = z.object({ paymentId: uuid, invoiceId: uuid, grossPence: positiveAmount,
  movementId: uuid.nullable(), movementHash: hash.nullable(), receiptEffectiveAt: instantV1.nullable(),
  state: z.enum(["unmatched", "pending", "settled", "duplicate_held", "reversed"]),
}).strict().refine(value => {
  const missing = [value.movementId, value.movementHash, value.receiptEffectiveAt].filter(v => v === null).length;
  return (missing === 0 || missing === 3) && (value.state !== "settled" || missing === 0);
}, "Movement identity/hash/time must be present together; settlement requires a source");
/** Deterministic projection only. Expiry/revocation facts must be provided by the server. */
export function deriveReceiptLineAllocationStatus(value: {
  holds: readonly string[]; rows: readonly unknown[]; review: null | { state: string };
}): "source_held" | "review_stale" | "review_ready" | "saved_distribution" | "no_distribution" {
  if (value.holds.some(hold => hold !== "APPROVAL_EXPIRED" && hold !== "APPROVAL_REVOKED")) return "source_held";
  if (value.holds.length || (value.review && ["stale", "expired", "revoked"].includes(value.review.state))) return "review_stale";
  if (value.review?.state === "ready") return "review_ready";
  return value.rows.length ? "saved_distribution" : "no_distribution";
}
export const receiptLineAllocationViewV1 = z.object({ version: z.literal("receipt-line-allocation-view.v1"),
  environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), jobId: uuid, revision,
  sourceHash: hash, status: z.enum(["no_distribution", "source_held", "review_ready", "review_stale", "saved_distribution"]),
  holds: z.array(receiptLineAllocationHoldCodeV1).max(11), receipts: z.array(receiptV1).max(MAX_ALLOCATION_LINES),
  rows: z.array(receiptLineAllocationSourceV1).max(MAX_ALLOCATION_LINES), review: reviewV1.nullable(),
  commandResult: receiptLineAllocationCommandResultV1.nullable(),
}).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.status !== deriveReceiptLineAllocationStatus(value)) fail("Status precedence mismatch");
  if (value.rows.some(row => row.jobId !== value.jobId)) fail("Foreign job row");
  if (value.commandResult && value.commandResult.jobId !== value.jobId) fail("Foreign job command result");
  if (value.review?.state === "ready" && (value.review.sourceHash !== value.sourceHash || value.review.expectedSourceRevision !== value.revision)) fail("Ready review watermark mismatch");
});
export type ReceiptLineAllocationViewV1 = z.infer<typeof receiptLineAllocationViewV1>;
export const receiptLineAllocationSelectorV1 = z.object({ jobId: uuid, invoiceId: uuid.optional(), paymentId: uuid.optional() }).strict();
export const receiptLineAllocationSnapshotV1 = z.object({ revision, sourceHash: hash,
  rows: z.array(receiptLineAllocationSourceV1).max(MAX_ALLOCATION_LINES), holds: z.array(receiptLineAllocationHoldCodeV1).max(11) }).strict();
export type ReceiptLineAllocationSelector = z.infer<typeof receiptLineAllocationSelectorV1>;
export type ReceiptLineAllocationSnapshot = z.infer<typeof receiptLineAllocationSnapshotV1>;
export class ReceiptLineAllocationContractError extends Error {
  constructor(readonly code: "INVALID_RECEIPT_LINE_COMMAND") { super(code); this.name = "ReceiptLineAllocationContractError"; }
}
export function parseReceiptLineAllocationCommand(raw: unknown): ReceiptLineAllocationCommandV1 {
  const parsed = receiptLineAllocationCommandV1.safeParse(raw);
  if (!parsed.success) throw new ReceiptLineAllocationContractError("INVALID_RECEIPT_LINE_COMMAND");
  return parsed.data;
}
