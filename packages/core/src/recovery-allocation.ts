import { z } from "zod";
import {
  compareExactPence, exactPence, exactPenceInputV1, parseExactPence, serializeExactPence, sumExactPence,
} from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { allocateReceiptToLines, instantV1, receiptAllocationV1 } from "./receipt-allocation.js";

const amount = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const positiveAmount = amount.refine(value => value > 0);
const revision = z.number().int().safe().positive().max(1_000_000);
const approvalHash = z.string().regex(/^[a-f0-9]{64}$/u);
const commandBase = {
  version: z.literal("recovery-allocation-command.v1"), commandId: z.guid({ error: "Invalid uuid" }),
  expectedCaseRevision: revision, grossPence: positiveAmount,
};
const allocationTarget = { caseId: z.guid({ error: "Invalid uuid" }), paymentId: z.guid({ error: "Invalid uuid" }), evidenceId: z.guid({ error: "Invalid uuid" }), remittanceEvidenceId: z.guid({ error: "Invalid uuid" }).optional() };
const reversalTarget = { allocationId: z.guid({ error: "Invalid uuid" }), creditNoteId: z.guid({ error: "Invalid uuid" }).optional(), remittanceEvidenceId: z.guid({ error: "Invalid uuid" }).optional() };

/** The human chooses an amount to review, never its split, rule, reviewer or settlement facts. */
export const recoveryAllocationCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...commandBase, ...allocationTarget, action: z.literal("review") }).strict(),
  z.object({ ...commandBase, ...allocationTarget, action: z.literal("allocate"), approvalHash }).strict(),
  z.object({ ...commandBase, ...reversalTarget, action: z.literal("review_reverse") }).strict(),
  z.object({ ...commandBase, ...reversalTarget, action: z.literal("reverse"), approvalHash }).strict(),
]);
export type RecoveryAllocationCommand = z.infer<typeof recoveryAllocationCommandV1>;
export type RecoveryAllocationErrorCode =
  | "INVALID_COMMAND" | "INVALID_ALLOCATION_FACTS" | "INVALID_CASE_SPLIT" | "FRACTIONAL_CASE_SPLIT"
  | "ALLOCATION_EXCEEDS_AVAILABLE" | "ALLOCATION_EXCEEDS_CLAIM" | "ALLOCATION_EXCEEDS_EVIDENCE"
  | "ALLOCATION_SOURCE_REQUIRED" | "ALLOCATION_APPROVAL_CHANGED" | "ALLOCATION_REVISION_CONFLICT"
  | "ALLOCATION_IDEMPOTENCY_CONFLICT" | "ALLOCATION_NOT_FOUND" | "ALLOCATION_FORBIDDEN"
  | "ALLOCATION_SYNTHETIC_ONLY" | "ALLOCATION_EVIDENCE_HELD" | "ALLOCATION_REVERSAL_SOURCE_REQUIRED";
export class RecoveryAllocationError extends Error {
  constructor(readonly code: RecoveryAllocationErrorCode) { super(code); this.name = "RecoveryAllocationError"; }
}
export function parseRecoveryAllocationCommand(raw: unknown): RecoveryAllocationCommand {
  const parsed = recoveryAllocationCommandV1.safeParse(raw);
  if (!parsed.success) throw new RecoveryAllocationError("INVALID_COMMAND");
  return parsed.data;
}

const splitV1 = z.object({
  grossPence: positiveAmount, eligibleNetPence: positiveAmount, taxPence: amount,
  evidencedNetPence: positiveAmount, evidencedGrossPence: positiveAmount, claimRemainingNetPence: amount,
}).strict();
/** Integer split validation only; the server obtains the split from SH-1's exact ratio primitives. */
export function assertRecoveryAllocationSplit(raw: unknown): void {
  const parsed = splitV1.safeParse(raw);
  if (!parsed.success) throw new RecoveryAllocationError("INVALID_CASE_SPLIT");
  const split = parsed.data;
  if (compareExactPence(exactPence(BigInt(split.grossPence)), sumExactPence([
    exactPence(BigInt(split.eligibleNetPence)), exactPence(BigInt(split.taxPence)),
  ])) !== 0
    || split.evidencedNetPence > split.evidencedGrossPence
    || BigInt(split.eligibleNetPence) * BigInt(split.evidencedGrossPence)
      !== BigInt(split.grossPence) * BigInt(split.evidencedNetPence)) {
    throw new RecoveryAllocationError("INVALID_CASE_SPLIT");
  }
  if (split.eligibleNetPence > split.claimRemainingNetPence) throw new RecoveryAllocationError("ALLOCATION_EXCEEDS_CLAIM");
  if (split.eligibleNetPence > split.evidencedNetPence) throw new RecoveryAllocationError("ALLOCATION_EXCEEDS_EVIDENCE");
}

const sourceRef = z.string().min(1).max(300);
/** These facts are assembled from persisted rows, never accepted as an HTTP command. */
export const recoveryReceiptFactsV1 = z.object({
  version: z.literal("recovery-receipt-facts.v1"), environment: z.literal("synthetic_demo"),
  direction: z.enum(["receipt", "reversal"]), compositionComplete: z.literal(true),
  receipt: z.object({ id: z.string().min(1).max(200), invoiceId: z.string().min(1).max(200),
    gross: exactPenceInputV1, effectiveAt: instantV1, sourceRef }).strict(),
  lines: receiptAllocationV1.shape.lines,
  explicit: z.object({ sourceRef, shares: receiptAllocationV1.shape.explicit.unwrap() }).strict().nullable(),
  separateInvoice: z.object({ invoiceId: z.string().min(1).max(200), sourceRef }).strict().nullable(),
}).strict();
export type RecoveryReceiptFacts = z.infer<typeof recoveryReceiptFactsV1>;
export type RecoveryDeemedLineAllocation = Readonly<{
  lineId: string; rule: "explicit" | "separate_invoice" | "pro_rata"; sourceRef: string;
  gross: Readonly<{ numerator: string; denominator: string }>;
  net: Readonly<{ numerator: string; denominator: string }>;
}>;

/** Fixed priority and exact arithmetic are owned entirely by the shared receipt kernel. */
export function mapRecoveryReceiptToLines(raw: unknown): readonly RecoveryDeemedLineAllocation[] {
  const parsed = recoveryReceiptFactsV1.safeParse(raw);
  if (!parsed.success) throw new RecoveryAllocationError("INVALID_ALLOCATION_FACTS");
  const facts = parsed.data;
  try {
    const rows = allocateReceiptToLines({
      version: "receipt-allocation.v1", receiptGross: facts.receipt.gross, effectiveAt: facts.receipt.effectiveAt,
      direction: facts.direction, invoiceId: facts.receipt.invoiceId, lines: facts.lines,
      explicit: facts.explicit?.shares ?? null, separateInvoiceId: facts.separateInvoice?.invoiceId ?? null,
      sourceRef: facts.explicit?.sourceRef ?? facts.separateInvoice?.sourceRef ?? facts.receipt.sourceRef,
    });
    return Object.freeze(rows.map(row => Object.freeze({
      lineId: row.lineId, rule: row.rule, sourceRef: row.sourceRef,
      gross: Object.freeze(serializeExactPence(row.gross)), net: Object.freeze(serializeExactPence(row.net)),
    })));
  } catch { throw new RecoveryAllocationError("INVALID_ALLOCATION_FACTS"); }
}

/** Exact read projection for consumers; neither fee qualification nor a posting calculation. */
export function sumRecoveryDeemedNet(
  rows: readonly RecoveryDeemedLineAllocation[], lineIds?: readonly string[],
): Readonly<{ numerator: string; denominator: string }> {
  try {
    const total = sumExactPence(rows.filter(row => lineIds === undefined || lineIds.includes(row.lineId)).map(row => parseExactPence(row.net)));
    // Validation uses the shared magnitude comparison; reversals can produce negative totals.
    if (compareExactPence(total, exactPence(BigInt(MAX_MONEY_PENCE))) > 0
      || compareExactPence(total, exactPence(-BigInt(MAX_MONEY_PENCE))) < 0) {
      throw new RecoveryAllocationError("INVALID_ALLOCATION_FACTS");
    }
    return Object.freeze(serializeExactPence(total));
  } catch { throw new RecoveryAllocationError("INVALID_ALLOCATION_FACTS"); }
}
