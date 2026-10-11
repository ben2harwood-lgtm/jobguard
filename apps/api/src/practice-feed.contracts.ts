import { z } from "zod";
import { practiceMovementKeyV1 } from "@jobguard/core";
export { practiceFeedCommandV1, practiceFeedQueryV1 } from "@jobguard/core";

const safePence = z.number().int().safe().min(0).max(1_000_000_000_000);
const kind = z.enum(["customer_receipt", "supplier_refund"]);
const fixture = z.enum(["recovery-18800", "shadow-30000", "test-m", "test-n", "supplier-refund"]);

export const practiceFeedCatalogueEntryV1 = z.object({
  movement: practiceMovementKeyV1, grossPence: safePence, kind, fixture, label: z.string().min(1).max(120),
}).strict();

/** A settled movement is a fact only. `allocatedEligibleNetPence` is the literal 0: this leaf can never allocate. */
export const practiceFeedMovementViewV1 = z.object({
  id: z.string().min(1), movementKey: practiceMovementKeyV1, underlyingMovementId: z.string().min(1), kind, fixture,
  label: z.string().min(1).max(120), grossPence: safePence, currency: z.literal("GBP"),
  state: z.enum(["pending", "settled", "possible_duplicate"]),
  allocatedEligibleNetPence: z.literal(0), eligibleForAllocation: z.boolean(),
  eventIds: z.array(z.string()), sourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
}).strict();

export const practiceFeedReceiptAssessmentV1 = z.object({
  status: z.enum(["attested_only", "qualifies", "reversed"]),
  reason: z.enum(["no_generated_amount", "no_movement_yet", "pending", "duplicate_held", "movement_already_matched", "movement_used_by_reversed_receipt", "ready_to_match", "matched", "reversed"]),
  canMatch: z.boolean(), candidateMovementKey: practiceMovementKeyV1.nullable(), matchedMovementKey: practiceMovementKeyV1.nullable(),
}).strict();

export const practiceFeedReceiptViewV1 = z.object({
  paymentId: z.string().uuid(), invoiceId: z.string().uuid(), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  reference: z.string().max(120), amountPence: safePence, currency: z.literal("GBP"), reversed: z.boolean(),
  assessment: practiceFeedReceiptAssessmentV1,
}).strict();

export const practiceFeedResponseV1 = z.object({
  version: z.literal("practice-feed-view.v1"),
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
  catalogue: z.array(practiceFeedCatalogueEntryV1),
  movementCount: z.number().int().nonnegative(),
  movements: z.array(practiceFeedMovementViewV1),
  receipts: z.array(practiceFeedReceiptViewV1),
  allocatedEligibleNetPence: z.literal(0),
  eventCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
}).strict();
export type PracticeFeedResponse = z.infer<typeof practiceFeedResponseV1>;

export const practiceFeedErrorV1 = z.object({ version: z.literal("practice-feed-error.v1"), code: z.string() }).strict();
