import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE);
const amount = z.object({ pence, currency: z.literal("GBP") }).strict();
const commercialTarget = { id: uuid, revision: z.number().int().safe().positive(), hash, amount };

/** Reference terms only. Parsing or matching these values supplies no authority. */
export const customerPortalApprovalTargetV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quote"), ...commercialTarget, amount: amount.extend({ pence: pence.nonnegative() }).strict() }).strict(),
  z.object({ kind: z.literal("variation"), ...commercialTarget }).strict(),
  // An existing immutable stage_completion and its verified proof; no payment or certification effect.
  z.object({ kind: z.literal("stage"), id: uuid, hash, scopeItemId: uuid,
    evidenceLinkId: uuid, evidenceHash: hash, objectVersionId: z.string().min(1).max(1000) }).strict(),
]);
export const customerPortalApprovalCommandV1 = z.object({
  version: z.literal("customer-portal-approval.v1"), commandId: uuid, jobId: uuid,
  expectedJobRevision: z.number().int().safe().nonnegative(), target: customerPortalApprovalTargetV1,
}).strict();
const practiceReferences = {
  realActorMembershipId: uuid, actingMembershipId: uuid, practiceSwitchId: uuid, practiceSessionRef: uuid,
};
const bindingV1 = z.object({
  tenantId: uuid, customerId: uuid, partyBindingId: uuid, policyVersion: z.string().min(1).max(120),
  ...practiceReferences,
}).strict();

/** A future persisted result has no free text or credential field. It is not an approval writer. */
export const customerPortalApprovalResultV1 = z.object({
  version: z.literal("customer-portal-approval-result.v1"), environment: z.literal("synthetic_demo"),
  approvalId: uuid, commandId: uuid, jobId: uuid, customerId: uuid,
  method: z.literal("customer_authenticated"), target: customerPortalApprovalTargetV1,
  ...practiceReferences,
  approvedAt: z.string().datetime(),
}).strict();
export type CustomerPortalApprovalCommand = z.infer<typeof customerPortalApprovalCommandV1>;
export type CustomerPortalApprovalTarget = z.infer<typeof customerPortalApprovalTargetV1>;

export class CustomerPortalApprovalError extends Error {
  constructor(readonly code: "INVALID_APPROVAL" | "STALE_APPROVAL" | "COMMAND_CONFLICT" | "LINK_UNAVAILABLE") {
    super(code);
    this.name = "CustomerPortalApprovalError";
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CustomerPortalApprovalError("INVALID_APPROVAL");
  return parsed.data;
}
const targetFields = (target: CustomerPortalApprovalTarget) => target.kind === "stage"
  ? [target.kind, target.id, target.hash, target.scopeItemId, target.evidenceLinkId, target.evidenceHash, target.objectVersionId]
  : [target.kind, target.id, target.revision, target.hash, target.amount.pence, target.amount.currency];

/** Canonical text, for hashing inside a future server command boundary; never a credential. */
export function customerPortalApprovalBinding(raw: unknown, binding: unknown): string {
  const command = parse(customerPortalApprovalCommandV1, raw), actor = parse(bindingV1, binding);
  return JSON.stringify([
    command.version, command.commandId, actor.tenantId, actor.customerId, actor.partyBindingId,
    actor.policyVersion, actor.realActorMembershipId, actor.actingMembershipId, actor.practiceSwitchId,
    actor.practiceSessionRef, command.jobId, command.expectedJobRevision, ...targetFields(command.target),
  ]);
}

/** The caller must independently authenticate and lock the current subject before using this check. */
export function assertCustomerPortalApprovalTarget(raw: unknown, current: {
  jobId: string; jobRevision: number; target: CustomerPortalApprovalTarget; approvable: boolean;
}): void {
  const command = parse(customerPortalApprovalCommandV1, raw);
  const target = customerPortalApprovalTargetV1.safeParse(current.target);
  if (!current.approvable || current.jobId !== command.jobId || current.jobRevision !== command.expectedJobRevision ||
      !target.success || JSON.stringify(targetFields(command.target)) !== JSON.stringify(targetFields(target.data))) {
    throw new CustomerPortalApprovalError("STALE_APPROVAL");
  }
}

/** Compare persisted request bindings; no in-memory receipt or successful business effect is created. */
export function customerPortalApprovalReplay(savedBinding: string | null, requestedBinding: string): "new" | "replay" {
  if (savedBinding === null) return "new";
  if (savedBinding !== requestedBinding) throw new CustomerPortalApprovalError("COMMAND_CONFLICT");
  return "replay";
}
