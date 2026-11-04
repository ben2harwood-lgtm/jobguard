import { z } from "zod";
import { MAX_MONEY_PENCE } from "@jobguard/core";

export class FeeCollectionFakeEventError extends Error {
  readonly code = "INVALID_FEE_COLLECTION_FAKE_EVENT";
  constructor() { super("INVALID_FEE_COLLECTION_FAKE_EVENT"); this.name = "FeeCollectionFakeEventError"; }
}
/** Rule-independent generated-event shape. Parsing never authenticates a financial fact. */
const event = z.object({
  version: z.literal("fee-collection-adapter-event.v1"), adapter: z.literal("fee_collection_fake.v1"),
  environment: z.literal("synthetic_demo"), tenantId: z.string().uuid(), jobId: z.string().uuid(),
  attemptId: z.string().uuid(), eventId: z.string().uuid(), effectKey: z.string().min(1).max(200),
  action: z.enum(["collection", "refund"]),
  kind: z.enum(["pending", "accepted", "outcome_unknown", "definite_failure", "settled"]),
  principal: z.object({ pence: z.number().int().safe().positive().max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict().readonly(),
  target: z.literal("jobguard_synthetic_fee_account"),
}).strict().readonly();
/** Validation only: not an executable adapter. No effect invocation, in-memory ledger,
 * provider ports, fake-fact generation or reconciliation while Q4/source contracts are held.
 * serverMode must come from deployment configuration, never a client request.
 */
export function createFeeCollectionFakeEventValidator(serverMode: unknown) {
  if (serverMode !== "synthetic_demo") throw new FeeCollectionFakeEventError();
  return Object.freeze({ validate(raw: unknown) {
    const result = event.safeParse(raw);
    if (!result.success) throw new FeeCollectionFakeEventError();
    return result.data;
  } });
}
/** Pure duplicate/conflict classification, not durable deduplication or financial settlement. */
export function compareFeeCollectionFakeEvents(first: unknown, next: unknown) {
  const validator = createFeeCollectionFakeEventValidator("synthetic_demo");
  const a = validator.validate(first); const b = validator.validate(next);
  const { eventId: firstId, ...firstPayload } = a;
  const { eventId: nextId, ...nextPayload } = b;
  const samePayload = JSON.stringify(firstPayload) === JSON.stringify(nextPayload);
  const { kind: firstKind, ...firstEffect } = firstPayload;
  const { kind: nextKind, ...nextEffect } = nextPayload;
  // Kind may advance; the original tenant-scoped effect bindings cannot change.
  if (a.tenantId === b.tenantId && a.effectKey === b.effectKey && JSON.stringify(firstEffect) !== JSON.stringify(nextEffect))
    throw new FeeCollectionFakeEventError();
  void firstKind; void nextKind;
  if (firstId === nextId && !samePayload) throw new FeeCollectionFakeEventError();
  if (firstId === nextId) return "same_event" as const;
  return samePayload ? "same_fact" as const : "distinct" as const;
}
