import { z } from "zod";
import { MAX_MONEY_PENCE, subscriptionAgreementCheckV1 } from "@jobguard/core";
const id = z.string().uuid().refine(v => v === v.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const pence = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
export const collectionIntentV1 = z.object({
  version: z.literal("fee-collection.v1"), commandId: id, jobId: id, invoiceId: id,
  statementHash: hash, amountPence: pence.refine(v => v > 0),
  rail: z.enum(["stripe_card", "direct_debit"]),
}).strict();
export type CollectionIntent = z.infer<typeof collectionIntentV1>;
export const refundIntentV1 = z.object({
  version: z.literal("fee-refund.v1"), commandId: id, settlementCommandId: id,
  jobId: id, invoiceId: id, creditNoteId: id, creditHash: hash, amountPence: pence.refine(v => v > 0),
}).strict();
export type RefundIntent = z.infer<typeof refundIntentV1>;
/** Server reconstructed and locked sources, never a request payload. Tax is supplied by its approved source. */
export const collectionSourcesV1 = z.object({
  version: z.literal("fee-collection-sources.v1"), tenantId: id, jobId: id, invoiceId: id,
  invoiceHash: hash, statementHash: hash, sourceHash: hash,
  principalPence: pence, taxPence: pence, creditsPence: pence, priorReceiptsPence: pence,
  immutableInvoice: z.literal(true), current: z.literal(true), disputed: z.literal(false),
  refundPending: z.literal(false), finalAccountCurrent: z.literal(true),
  requiredAttributionIds: z.array(id).min(1),
  attributionReviews: z.array(z.object({ attributionId: id, sourceHash: hash,
    currentSourceHash: hash, resolution: z.literal("approved") }).strict()).min(1),
  collectionDecision: z.object({ decisionId: id, action: z.literal("payment_fee.collect"),
    resolution: z.literal("approved"), invoiceId: id, invoiceHash: hash, currency: z.literal("GBP") }).strict(),
  agreement: subscriptionAgreementCheckV1,
}).strict();
export type CollectionSources = z.infer<typeof collectionSourcesV1>;
export const creditSourcesV1 = z.object({
  version: z.literal("fee-credit-sources.v1"),
  tenantId: id, jobId: id, invoiceId: id, invoiceHash: hash, creditNoteId: id, creditHash: hash,
  decisionId: id, actorMembershipId: id, action: z.literal("payment_fee.refund"), currency: z.literal("GBP"),
  settlementCommandId: id, amountPence: pence, approvedAmountPence: pence,
  approved: z.literal(true), currentMembershipVerified: z.literal(true),
  current: z.literal(true), expiresAt: z.string().datetime(),
}).strict();
export type CreditSources = z.infer<typeof creditSourcesV1>;
export class FeeCollectionError extends Error {
  constructor(readonly code: "COLLECTION_DARK" | "COLLECTION_REFUSED" | "IDEMPOTENCY_CONFLICT" | "RECONCILIATION_REQUIRED" | "INVALID_WEBHOOK") {
    super(code); this.name = "FeeCollectionError";
  }
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new FeeCollectionError("COLLECTION_REFUSED");
  return result.data;
}
export type Attempt = {
  kind: "collection" | "refund"; commandId: string; fingerprint: string; actorMembershipId: string; principalPence: number;
  jobId: string; invoiceId: string; invoiceHash: string; sourceHash: string;
  statementHash: string; statementId: string; amountPence: number; rail: "stripe_card" | "direct_debit";
  decisionId: string; settlementCommandId: string | null; settlementObjectId: string | null; creditNoteId: string | null;
  state: "reserved" | "outcome_unknown" | "provider_accepted" | "settled" | "released" | "reconciliation_required";
  paymentState?: DirectDebitPaymentState;
  providerObjectId: string | null;
};
export type CollectionBook = {
  attempts: Attempt[]; events: Record<string, string>;
  audit: { commandId: string; state: Attempt["state"] }[];
};
/** Implementations MUST serialize the whole tenant, commit state and audit atomically,
 * and retain command/event uniqueness durably across processes and restarts.
 * Source readers run inside the same transaction and lock their source revisions.
 * No production implementation is registered by this dark slice. */
export interface ReservationStore {
  transaction<T>(tenantId: string, work: (book: CollectionBook, sources: LockedCollectionSources) => Promise<T>): Promise<T>;
}
export interface LockedCollectionSources {
  /** Recompute current M4-10 derivations, receipts and credits; load the exact immutable invoice,
   * current permission/Decision and M4-13 terms. Enumerate ALL contributing SV-6 attributions
   * and load their exact approved current reviews. Never accept these assertions from callers,
   * query pre-lock shadow tables, or count this book's settlements in priorReceiptsPence. */
  collection(jobId: string, invoiceId: string): Promise<unknown>;
  credit(intent: RefundIntent): Promise<unknown>;
}
/** Credentials only: membership and actor are resolved through AuthProvider on every operation. */
export type CollectionSessionContext = Readonly<{ tenantId: string; environment: "synthetic_demo"; sessionToken: string }>;

export type DirectDebitPaymentState = "pending_submission" | "submitted" | "confirmed" | "paid_out" | "failed" | "cancelled" | "charged_back" | "late_failure";

/** Routing context only; provider signature and account/tenant binding authenticate events. */
export type DirectDebitWebhookContext = Readonly<{ tenantId: string; environment: "synthetic_demo" }>;
