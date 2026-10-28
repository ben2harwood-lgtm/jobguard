import { z } from "zod";
import { finalAccountLockCommandV1, finalAccountDispositionCommandV1, finalCheckTermsAcceptanceCommandV1 } from "@jobguard/core";
import { isReceiptDate } from "./customer-invoice.contracts.js";
export { finalAccountLockCommandV1, finalAccountDispositionCommandV1, finalCheckTermsAcceptanceCommandV1 };
const uuid=z.guid({ error: "Invalid uuid" });
export const finalReviewExtraCommandV1=z.object({version:z.literal("final-review-extra.v1"),commandId:uuid,scopeItemId:uuid,
 description:z.string().trim().min(1).max(500),captureText:z.string().trim().min(1).max(4000),
 price:z.object({quantity:z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u),unit:z.string().min(1).max(40),unitRatePence:z.number().int().safe().min(0).max(1_000_000_000_000),direction:z.enum(["addition","omission"])}).strict().nullable(),
}).strict();
export const lockBoundInvoiceCommandV1=z.object({version:z.literal("lock-bound-invoice.issue.v1"),commandId:uuid,finalAccountRevisionId:uuid,
 expectedSourceHash:z.string().regex(/^[a-f0-9]{64}$/u),invoiceKind:z.enum(["final","supplementary"]),recipient:z.email({ error: "Invalid email" }).regex(/@example\.invalid$/u),issuedOn:z.string().refine(isReceiptDate),
}).strict();
