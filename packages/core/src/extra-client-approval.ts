import { offsetDatetimeV1 } from "./datetime.js";
import { z } from "zod";
import { readExtraConstraint } from "./extra-approval.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";
const reference = z.string().trim().min(1).max(300), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = offsetDatetimeV1;
const recipient = z.email({ error: "Invalid email" }).refine(s => s.toLowerCase().endsWith(".invalid"));
const binding = { requestId: reference, recipient, packHash: hash, revisionId: reference, expiresAt: instant };
export const extraSendConstraintV1 = z.object({ version: z.literal("extra-send-constraint.v1"), ...binding, now: instant, cancelled: z.boolean(),
  approval: z.object({ ...binding, status: z.enum(["approved", "dismissed", "rejected", "revoked", "expired", "superseded"]) }).strict().nullable() }).strict();
/** A synthetic binding constraint, not sending authority or a token/access verifier. No default lifetime exists. */
export function individualSendConstraint(raw: unknown): boolean {
  const input = readExtraConstraint(extraSendConstraintV1, raw), a = input.approval;
  return !input.cancelled && a !== null && a.status === "approved" && compareServerInstants(input.now, input.expiresAt) < 0 &&
    a.requestId === input.requestId && a.recipient === input.recipient && a.packHash === input.packHash && a.revisionId === input.revisionId && a.expiresAt === input.expiresAt;
}
export const extraRequestReplacementV1 = z.object({ version: z.literal("extra-request-replacement.v1"), previousId: reference, replacementId: reference }).strict().refine(v => v.previousId !== v.replacementId);
export function replaceApprovalRequestConstraint(raw: unknown) {
  const input = readExtraConstraint(extraRequestReplacementV1, raw);
  return Object.freeze({ previousId: input.previousId, replacementId: input.replacementId, previousCancelled: true as const });
}
export const fictionalClientAttributionV1 = z.object({ version: z.literal("fictional-client-attribution.v1"), fictionalRoleName: reference, actualTesterReference: reference }).strict();
export const extraAuthorityLossV1 = z.object({ version: z.literal("extra-authority-loss.v1"), historyReferences: z.array(reference).max(1000),
  permissions: z.array(z.object({ id: reference, used: z.boolean() }).strict()).max(1000).refine(v => new Set(v.map(p => p.id)).size === v.length) }).strict();
export function stopUnusedAuthorityConstraint(raw: unknown) {
  const input = readExtraConstraint(extraAuthorityLossV1, raw);
  return Object.freeze({ historyReferences: Object.freeze(input.historyReferences), futureActionAllowed: false as const,
    cancelledUnusedIds: Object.freeze(input.permissions.filter(p => !p.used).map(p => p.id)), usedIds: Object.freeze(input.permissions.filter(p => p.used).map(p => p.id)) });
}
