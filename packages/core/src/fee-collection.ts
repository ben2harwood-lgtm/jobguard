import { z } from "zod";
import { money, moneyFromBigInt, MAX_MONEY_PENCE } from "./money.js";

export class FeeCollectionError extends Error {
  constructor(readonly code: "INVALID_FEE_COLLECTION_REFERENCE" | "FEE_COLLECTION_IDENTITY_CONFLICT" | "INVALID_FEE_COLLECTION_TRANSITION" = "INVALID_FEE_COLLECTION_REFERENCE") {
    super(code); this.name = "FeeCollectionError";
  }
}
const principal = z.object({ pence: z.number().int().safe().min(0).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
const key = z.string().min(1).max(200);
export const feeCollectionStateV1 = z.enum(["pending", "accepted", "outcome_unknown", "definite_failure", "settled"]);
export type FeeCollectionState = z.infer<typeof feeCollectionStateV1>;
const attempt = z.object({
  id: key, effectKey: key, kind: z.enum(["collection", "refund"]), state: feeCollectionStateV1,
  principal: principal.refine(value => value.pence > 0), originalCollectionId: key.nullable(),
}).strict().refine(value => (value.kind === "collection") === (value.originalCollectionId === null));
/** Supplied reference data ONLY. Never a client command, authorization or persisted-fact reader. */
export const feeCollectionReferenceV1 = z.object({
  version: z.literal("fee-collection-reference.v1"), environment: z.literal("synthetic_demo"),
  currentFeePrincipal: principal, attempts: z.array(attempt).max(10_000),
}).strict();
const identity = z.object({
  version: z.literal("fee-collection-identity.v1"), tenantId: z.string().uuid(), jobId: z.string().uuid(),
  actorId: z.string().uuid(), commandId: z.string().uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
/** Caller must authenticate before loading a stored receipt. This only compares supplied identities. */
export function compareFeeCollectionIdentity(first: unknown, next: unknown): "same" | "conflict" {
  const a = identity.safeParse(first); const b = identity.safeParse(next);
  if (!a.success || !b.success) throw new FeeCollectionError();
  return (Object.keys(a.data) as (keyof typeof a.data)[]).every(k => a.data[k] === b.data[k]) ? "same" : "conflict";
}
const transitions: Record<FeeCollectionState, readonly FeeCollectionState[]> = {
  pending: ["pending", "accepted", "outcome_unknown", "definite_failure", "settled"],
  accepted: ["accepted", "outcome_unknown", "definite_failure", "settled"],
  outcome_unknown: ["outcome_unknown", "definite_failure", "settled"],
  definite_failure: ["definite_failure"], settled: ["settled"],
};
/** Does not establish an event's authenticity. Definite failure requires authoritative reconciliation. */
export function checkFeeCollectionTransition(from: unknown, to: unknown): FeeCollectionState {
  const a = feeCollectionStateV1.safeParse(from); const b = feeCollectionStateV1.safeParse(to);
  if (!a.success || !b.success || !transitions[a.data].includes(b.data)) throw new FeeCollectionError("INVALID_FEE_COLLECTION_TRANSITION");
  return b.data;
}
const active = (state: FeeCollectionState) => state === "pending" || state === "accepted" || state === "outcome_unknown";
const positive = (n: bigint) => n > 0n ? n : 0n;
const lesser = (a: bigint, b: bigint) => a < b ? a : b;
function checked(raw: unknown) {
  const parsed = feeCollectionReferenceV1.safeParse(raw);
  if (!parsed.success) throw new FeeCollectionError();
  const input = parsed.data;
  const ids = new Map(input.attempts.map(a => [a.id, a]));
  if (ids.size !== input.attempts.length || new Set(input.attempts.map(a => a.effectKey)).size !== input.attempts.length)
    throw new FeeCollectionError("FEE_COLLECTION_IDENTITY_CONFLICT");
  for (const a of input.attempts.filter(a => a.kind === "refund")) {
    const original = ids.get(a.originalCollectionId!);
    if (!original || original.kind !== "collection" || original.state !== "settled") throw new FeeCollectionError();
  }
  for (const original of input.attempts.filter(a => a.kind === "collection")) {
    const allocated = input.attempts.filter(a => a.originalCollectionId === original.id && (a.state === "settled" || active(a.state)))
      .reduce((sum, a) => sum + BigInt(a.principal.pence), 0n);
    if (allocated > BigInt(original.principal.pence)) throw new FeeCollectionError();
  }
  return input;
}
function outputMoney(value: bigint) {
  try { return moneyFromBigInt(value); } catch { throw new FeeCollectionError(); }
}
/** Capacity is arithmetic only, before authority, dispute, source-validity and shared-lock checks.
 * B is supplied, never derived here. Corrected B may be below existing reservations.
 * There is no allocation, fee formula, policy selection, expiry or external action in this module.
 */
export function projectFeeCollectionReference(raw: unknown) {
  const input = checked(raw);
  const total = (kind: "collection" | "refund", reserved: boolean) => input.attempts
    .filter(a => a.kind === kind && (reserved ? active(a.state) : a.state === "settled"))
    .reduce((sum, a) => sum + BigInt(a.principal.pence), 0n);
  const C = total("collection", false), R = total("refund", false);
  const collectionReserved = total("collection", true), refundReserved = total("refund", true);
  const retained = C - R, B = BigInt(input.currentFeePrincipal.pence);
  const outstanding = positive(B - retained), due = positive(retained - B);
  const unknownOutcome = input.attempts.some(a => a.state === "outcome_unknown");
  return Object.freeze({
    version: "fee-collection-reference-projection.v1" as const, environment: input.environment,
    settledPrincipal: outputMoney(C), refundedPrincipal: outputMoney(R), retainedPrincipal: outputMoney(retained),
    outstandingPrincipal: outputMoney(outstanding), refundDue: outputMoney(due),
    collectionReservedPrincipal: outputMoney(collectionReserved), refundReservedPrincipal: outputMoney(refundReserved),
    collectionCapacity: outputMoney(unknownOutcome ? 0n : positive(outstanding - collectionReserved)), unknownOutcome,
  });
}
/** Bound to an explicitly supplied original; never selects or splits refunds among collections. */
export function refundableFeeCollectionReference(raw: unknown, originalCollectionId: string) {
  const input = checked(raw); const projection = projectFeeCollectionReference(raw);
  const original = input.attempts.find(a => a.id === originalCollectionId && a.kind === "collection" && a.state === "settled");
  if (!original) throw new FeeCollectionError();
  const used = input.attempts.filter(a => a.originalCollectionId === originalCollectionId && (active(a.state) || a.state === "settled"))
    .reduce((sum, a) => sum + BigInt(a.principal.pence), 0n);
  if (projection.unknownOutcome) return money(0);
  return outputMoney(lesser(BigInt(original.principal.pence) - used,
    positive(BigInt(projection.refundDue.pence) - BigInt(projection.refundReservedPrincipal.pence))));
}
