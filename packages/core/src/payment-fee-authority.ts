import { z } from "zod";
import { MAX_MONEY_PENCE, money } from "./money.js";

// Boundary preparation only. No schema here establishes settlement, qualification,
// receipt contribution, current access or permission to execute a money action.
const id = z.string().uuid().refine(value => value === value.toLowerCase(), "Lowercase UUID required");
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const reference = {
  statementId: id,
  statementRevision: z.number().int().safe().positive(),
  statementHash: hash,
  sourceHash: hash,
};
const principal = z.object({
  pence: z.number().int().nonnegative().max(MAX_MONEY_PENCE),
  currency: z.literal("GBP"),
}).strict().transform(value => money(value.pence));

/** Intent specimen only; deliberately not the held executable command union. */
export const paymentFeeApprovalIntentV1 = z.object({
  version: z.literal("payment-fee-approval-intent.v1"),
  action: z.literal("approve_exact_statement"),
  commandId: id,
  ...reference,
}).strict().readonly();
export type PaymentFeeApprovalIntentV1 = z.infer<typeof paymentFeeApprovalIntentV1>;

/** Server-only structural binding. Values must be reconstructed from accepted sources. */
export const paymentFeeBindingV1 = z.object({
  version: z.literal("payment-fee-binding.v1"),
  action: z.literal("collect_payment_fee"),
  ...reference,
  principal,
  recipientRef: z.string().max(300).refine(value => value.trim().length > 0),
  policyVersion: z.string().max(80).refine(value => value.trim().length > 0),
}).strict().readonly();
export type PaymentFeeBindingV1 = z.infer<typeof paymentFeeBindingV1>;

/** Describes the unimplemented boundary; no statement counts or hidden-source data. */
export const paymentFeePreparationV1 = z.object({
  version: z.literal("payment-fee-preparation.v1"),
  environment: z.literal("synthetic_demo"),
  productionEnabled: z.literal(false),
  realExternalActions: z.literal(0),
  state: z.literal("dependency_bound"),
  approval: z.null(),
  standingAuthority: z.null(),
}).strict().readonly();

export const paymentFeeRefusalV1 = z.object({
  version: z.literal("payment-fee-refusal.v1"),
  code: z.enum(["INVALID_PAYMENT_FEE_BOUNDARY", "PAYMENT_FEE_DEPENDENCY_BOUND"]),
}).strict().readonly();

export class PaymentFeeBoundaryError extends Error {
  readonly code = "INVALID_PAYMENT_FEE_BOUNDARY";
  constructor() { super("Invalid payment fee boundary"); this.name = "PaymentFeeBoundaryError"; }
}

export function parsePaymentFeeApprovalIntent(raw: unknown): PaymentFeeApprovalIntentV1 {
  const parsed = paymentFeeApprovalIntentV1.safeParse(raw);
  if (!parsed.success) throw new PaymentFeeBoundaryError();
  return parsed.data;
}
