import { z } from "zod";
const uuid = z.string().uuid();
const pence = z.number().int().min(0).max(1_000_000_000_000);

/** Parse user-entered pounds without binary-float multiplication or rounding. */
export function parseReceiptPounds(value: string): number | null {
  if (!/^\d{1,11}(?:\.\d{1,2})?$/u.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return result > 0n && result <= 1_000_000_000_000n ? Number(result) : null;
}

/** A calendar date, not an instant that Date.parse may silently normalise. */
export function isReceiptDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}
const receiptDate = z.string().refine(isReceiptDate, "Enter a valid calendar date");
export const practiceInvoiceIssueV1=z.object({version:z.literal("practice-customer-invoice.issue.v1"),commandId:uuid,finalAccountRevisionId:uuid,expectedSourceHash:z.string().regex(/^[a-f0-9]{64}$/u),recipient:z.string().email().regex(/@example\.invalid$/u),issuedOn:receiptDate}).strict();
export const practiceInvoiceV1=z.object({id:uuid,number:z.string(),issuedOn:z.string(),recipient:z.string(),pdfSha256:z.string().length(64),finalAccountRevisionId:uuid,sourceHash:z.string().length(64),netPence:pence,taxPence:pence,totalPence:pence,balancePence:pence,customerCreditPence:pence,paidPence:pence.optional(),creditedPence:pence.optional(),delivery:z.literal("simulated_delivery")});
export const practiceInvoiceResponseV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),jobId:uuid,invoices:z.array(practiceInvoiceV1)});
export type PracticeInvoiceResponse=z.infer<typeof practiceInvoiceResponseV1>;
export const practiceCreditPreviewV1=z.object({version:z.literal("practice-credit-note.preview.v1"),invoiceId:uuid,netPence:pence.positive(),reason:z.string().trim().min(3).max(240)}).strict();
export const practiceCreditIssueV1=z.object({version:z.literal("practice-credit-note.issue.v1"),commandId:uuid,invoiceId:uuid,netPence:pence.positive(),reason:z.string().trim().min(3).max(240),previewHash:z.string().regex(/^[a-f0-9]{64}$/u)}).strict();
export const practiceCreditNoteV1=z.object({id:uuid,number:z.string(),netPence:z.number().int().negative(),taxPence:z.number().int().nonpositive(),totalPence:z.number().int().negative(),reason:z.string(),pdfSha256:z.string().length(64),approvedAt:z.string(),sourceInvoiceHash:z.string().length(64)});
export const practiceCreditViewV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),jobId:uuid,invoice:practiceInvoiceV1,credits:z.array(practiceCreditNoteV1)});
export type PracticeCreditView=z.infer<typeof practiceCreditViewV1>;
export const practiceReceiptRecordV1=z.object({version:z.literal("practice-customer-receipt.record.v1"),commandId:uuid,invoiceId:uuid,paidOn:receiptDate,amountPence:pence.positive(),method:z.enum(["bank_transfer","cash","card_elsewhere","cheque","other"]),reference:z.string().trim().min(1).max(120)}).strict();
export const practiceReceiptReverseV1=z.object({version:z.literal("practice-customer-receipt.reverse.v1"),commandId:uuid,invoiceId:uuid,paymentId:uuid,reason:z.string().trim().min(3).max(240)}).strict();
export const practiceReceiptV1=z.object({id:uuid,paidOn:receiptDate,amountPence:pence.positive(),method:z.string(),reference:z.string(),recordedAt:z.string(),reversal:z.object({id:uuid,reason:z.string(),reversedAt:z.string()}).nullable()});
export const practiceReceiptViewV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),jobId:uuid,invoice:practiceInvoiceV1,receipts:z.array(practiceReceiptV1),eligibleRecoveryPrincipalPence:z.literal(0),baseCreditPence:z.literal(0)});
export type PracticeReceiptView=z.infer<typeof practiceReceiptViewV1>;
