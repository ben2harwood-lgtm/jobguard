import { z } from "zod";
import { practiceFactKeyV1 } from "@jobguard/core";
export { practiceFactsCommandV1, practiceFactsQueryV1 } from "@jobguard/core";

const safePence = z.number().int().safe().min(0).max(1_000_000_000_000);
const kind = z.enum(["customer_receipt", "supplier_invoice_payment"]);
const fixture = z.enum(["test-m", "later-supplier-invoice", "F18-outside-vat"]);

export const practiceFactsCatalogueEntryV1 = z.object({
  movement: practiceFactKeyV1, grossPence: safePence, kind, fixture, label: z.string().min(1).max(120),
}).strict();

/** A settled movement is a fact only. `allocatedEligibleNetPence` is the literal 0: this leaf can never allocate. */
export const practiceFactsMovementViewV1 = z.object({
  id: z.string().min(1), movementKey: practiceFactKeyV1, underlyingMovementId: z.string().min(1), kind, fixture,
  label: z.string().min(1).max(120), grossPence: safePence, currency: z.literal("GBP"),
  state: z.enum(["pending", "settled", "possible_duplicate"]),
  allocatedEligibleNetPence: z.literal(0), eligibleForAllocation: z.boolean(),
  eventIds: z.array(z.string()), sourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
}).strict();

export const practiceFactsReceiptAssessmentV1 = z.object({
  status: z.enum(["attested_only", "qualifies", "reversed"]),
  reason: z.enum(["no_generated_amount", "no_movement_yet", "pending", "duplicate_held", "movement_already_matched", "movement_used_by_reversed_receipt", "ready_to_match", "matched", "reversed"]),
  canMatch: z.boolean(), candidateMovementKey: practiceFactKeyV1.nullable(), matchedMovementKey: practiceFactKeyV1.nullable(),
}).strict();

export const practiceFactsReceiptViewV1 = z.object({
  paymentId: z.string().uuid(), invoiceId: z.string().uuid(), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  reference: z.string().max(120), amountPence: safePence, currency: z.literal("GBP"), reversed: z.boolean(),
  assessment: practiceFactsReceiptAssessmentV1,
}).strict();

export const practiceFactsResponseV1 = z.object({
  version: z.literal("practice-facts-view.v1"),
  environment: z.literal("synthetic_demo"),
  realExternalActions: z.literal(0),
  jobId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  feedState: z.enum(["not_connected", "connected", "disconnected"]),
  consent: z.object({
    version: z.literal("practice-feed-consent.v1"), scope: z.literal("read_generated_movements"), provider: z.literal("none"),
    grantedAtRevision: z.number().int().positive(), revokedAtRevision: z.number().int().positive().nullable(),
  }).strict().nullable(),
  revision: z.number().int().nonnegative(),
  catalogue: z.array(practiceFactsCatalogueEntryV1),
  movementCount: z.number().int().nonnegative(),
  movements: z.array(practiceFactsMovementViewV1),
  receipts: z.array(practiceFactsReceiptViewV1),
  allocatedEligibleNetPence: z.literal(0),
  eventCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  laterInvoice: z.object({fixture:z.literal("later-supplier-invoice"),cashDuePence:z.literal(144000),settledPence:safePence,state:z.enum(["unpaid","part_paid","paid_in_full"])}).strict(),
}).strict();
export type PracticeFactsResponse = z.infer<typeof practiceFactsResponseV1>;

export const practiceFactsErrorV1 = z.object({ version: z.literal("practice-facts-error.v1"), code: z.string() }).strict();
