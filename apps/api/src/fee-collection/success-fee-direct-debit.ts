import { z } from "zod";
import { paymentFeeBindingV1 } from "@jobguard/core";
import { FeeCollectionError, parse, pence, type CollectionIntent, type CollectionSessionContext } from "./contracts.js";
const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const authority = z.object({
  id, decisionId: id, tenantId: id, actorMembershipId: id, action: z.literal("payment_fee.collect"),
  recipientRef: z.literal("platform:jobguard"), policyVersion: z.literal("reference_fee_policy_v3"),
  currency: z.literal("GBP"), state: z.enum(["approved", "revoked", "disputed"]),
  expiresAt: z.string().datetime(),
});
/** Locked server reconstruction, not an HTTP payload or a new statement/authority writer.
 * The MON-4A binding is mapped from its immutable statement document. No fee is recalculated.
 * The source owner must verify receipt, case and attribution disputes and prior-statement sources.
 * A standing source is fake-only until its owning writer/terms contract exists. */
export const successFeeCollectionSourcesV1 = z.object({
  version: z.literal("success-fee-collection-sources.v1"), tenantId: id, jobId: id, invoiceId: id,
  invoiceHash: hash, paymentId: id, binding: paymentFeeBindingV1,
  currentSourceHash: hash, settlementVerified: z.boolean(), current: z.boolean(),
  receiptDisputed: z.boolean(), caseDisputed: z.boolean(), attributionDisputed: z.boolean(),
  verifiedFeePence: pence, creditsPence: pence, priorReceiptsPence: pence,
  authorization: z.discriminatedUnion("kind", [
    authority.extend({ kind: z.literal("statement"), statementId: id, statementHash: hash, amountPence: pence }).strict(),
    authority.extend({ kind: z.literal("standing"), optedIn: z.literal(true), jobId: id,
      capPerVerifiedFeePence: pence }).strict(),
  ]),
}).strict();
export type SuccessFeeCollectionSources = z.infer<typeof successFeeCollectionSourcesV1>;
export type SuccessFeePauseReason = "SETTLEMENT_UNVERIFIED" | "RECEIPT_DISPUTED" | "CASE_DISPUTED"
  | "ATTRIBUTION_DISPUTED" | "AUTHORITY_REVOKED" | "AUTHORITY_DISPUTED" | "AUTHORITY_EXPIRED"
  | "MANDATE_REVOKED" | "MANDATE_NOT_ACTIVE" | "AUTHORITY_STALE" | "FEE_CAP_EXCEEDED" | "SUCCESS_FEE_DEPENDENCY_BOUND";
export class SuccessFeeCollectionError extends FeeCollectionError {
  constructor(readonly reason: SuccessFeePauseReason) { super("COLLECTION_REFUSED"); this.message = reason; }
}
export const pauseSuccessFee = (reason: SuccessFeePauseReason): never => { throw new SuccessFeeCollectionError(reason); };
export function validateSuccessFee(raw: unknown, ctx: CollectionSessionContext, intent: CollectionIntent,
  actorMembershipId: string, now: string) {
  const s = parse(successFeeCollectionSourcesV1, raw), b = s.binding, a = s.authorization;
  if (s.tenantId !== ctx.tenantId || s.jobId !== intent.jobId || s.invoiceId !== intent.invoiceId
    || b.statementHash !== intent.statementHash || b.recipientRef !== "platform:jobguard"
    || b.policyVersion !== "reference_fee_policy_v3" || a.tenantId !== ctx.tenantId
    || a.actorMembershipId !== actorMembershipId) return pauseSuccessFee("AUTHORITY_STALE");
  if (!s.settlementVerified) return pauseSuccessFee("SETTLEMENT_UNVERIFIED");
  if (s.receiptDisputed) return pauseSuccessFee("RECEIPT_DISPUTED");
  if (s.caseDisputed) return pauseSuccessFee("CASE_DISPUTED");
  if (s.attributionDisputed) return pauseSuccessFee("ATTRIBUTION_DISPUTED");
  if (!s.current || s.currentSourceHash !== b.sourceHash) return pauseSuccessFee("AUTHORITY_STALE");
  if (a.state === "revoked") return pauseSuccessFee("AUTHORITY_REVOKED");
  if (a.state === "disputed") return pauseSuccessFee("AUTHORITY_DISPUTED");
  if (Date.parse(a.expiresAt) <= Date.parse(now)) return pauseSuccessFee("AUTHORITY_EXPIRED");
  if (intent.amountPence !== b.principal.pence || b.principal.pence > s.verifiedFeePence
    || (a.kind === "standing" && (a.capPerVerifiedFeePence > s.verifiedFeePence
      || intent.amountPence > a.capPerVerifiedFeePence))) return pauseSuccessFee("FEE_CAP_EXCEEDED");
  if (a.kind === "statement" ? a.statementId !== b.statementId || a.statementHash !== b.statementHash
    || a.amountPence !== intent.amountPence : a.jobId !== s.jobId) return pauseSuccessFee("AUTHORITY_STALE");
  return { ...s, statementId: b.statementId, statementHash: b.statementHash, sourceHash: b.sourceHash,
    principalPence: b.principal.pence, taxPence: 0, amountPence: intent.amountPence, decisionId: a.decisionId, authorizationId: a.id };
}
