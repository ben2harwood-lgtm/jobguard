import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { instantV1 } from "./receipt-allocation.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";

// Synthetic reference ceiling only; production retry policy still requires approval.
const MAX_REFERENCE_ATTEMPTS = 3;
const uuid = z.guid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().positive().max(MAX_MONEY_PENCE);
const binding = z.object({ tenantId: uuid, agreementVersionId: uuid, termsHash: hash,
  scopeHash: hash, rateHash: hash, limitPence: pence, track: z.enum(["pilot_no_charge", "paid"]), currency: z.literal("GBP") }).strict();
const approval = z.object({ actorId: uuid, decisionId: uuid, resolutionId: uuid, status: z.literal("approved"),
  binding, approvedAt: instantV1, revoked: z.literal(false) }).strict();
export const contractorAgreementV1 = z.object({ version: z.literal("contractor-agreement.v1"), id: uuid,
  binding,
  status: z.enum(["active", "revoked", "cancelled", "provider_cancelled"]), approval,
}).strict().refine(v => sameBinding(v.binding, v.approval.binding), "Agreement approval binding mismatch");
const actionBinding = z.object({ binding, statementId: uuid, statementHash: hash, amountPence: pence, pilotExempt: z.boolean(),
  action: z.enum(["collect", "refund"]), originalActionId: uuid.nullable(), expiresAt: instantV1 }).strict();
const actionApproval = z.object({ actorId: uuid, decisionId: uuid, resolutionId: uuid,
  status: z.literal("approved"), revoked: z.literal(false), artifact: actionBinding }).strict();
const action = z.object({ id: uuid, artifact: actionBinding, approval: actionApproval,
  outcome: z.enum(["queued", "in_flight", "outcome_unknown", "failed", "settled"]), attempts: z.number().int().nonnegative() }).strict();
const event = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("request"), actionId: uuid, artifact: actionBinding, approval: actionApproval }).strict(),
  z.object({ kind: z.literal("start"), actionId: uuid }).strict(),
  z.object({ kind: z.literal("outcome"), actionId: uuid, outcome: z.enum(["outcome_unknown", "failed", "settled"]) }).strict(),
  z.object({ kind: z.literal("reconcile"), actionId: uuid, outcome: z.enum(["failed", "settled"]) }).strict(),
  z.object({ kind: z.literal("revoke") }).strict(),
  z.object({ kind: z.literal("cancel") }).strict(),
  z.object({ kind: z.literal("provider_cancel") }).strict(),
]);
const context = z.object({ tenantId: uuid, actorId: uuid, role: z.enum(["human", "worker", "provider"]) }).strict();
export const contractorMandateReferenceV1 = z.object({ version: z.literal("contractor-mandate-reference.v1"), mode: z.literal("synthetic_demo"),
  agreement: contractorAgreementV1, actions: z.array(action).max(1000),
  events: z.array(z.object({ id: uuid, event, context }).strict()).max(10000),
}).strict().refine(v => new Set(v.actions.map(a => a.id)).size === v.actions.length &&
  new Set(v.events.map(e => e.id)).size === v.events.length, "Duplicate reference identity");
export const contractorMandateEventV1 = z.object({ version: z.literal("contractor-mandate-event.v1"),
  id: uuid, event, now: instantV1,
  context,
}).strict();
export type ContractorMandateReference = z.infer<typeof contractorMandateReferenceV1>;
type Binding = z.infer<typeof binding>;
function sameBinding(a: Binding, b: Binding): boolean {
  return a.tenantId === b.tenantId && a.agreementVersionId === b.agreementVersionId && a.termsHash === b.termsHash &&
    a.scopeHash === b.scopeHash && a.rateHash === b.rateHash && a.limitPence === b.limitPence && a.track === b.track && a.currency === b.currency;
}
function sameArtifact(a: z.infer<typeof actionBinding>, b: z.infer<typeof actionBinding>): boolean {
  return sameBinding(a.binding, b.binding) && a.statementId === b.statementId && a.statementHash === b.statementHash &&
    a.amountPence === b.amountPence && a.pilotExempt === b.pilotExempt && a.action === b.action && a.originalActionId === b.originalActionId && a.expiresAt === b.expiresAt;
}
export class ContractorMandateError extends Error {
  readonly code = "CONTRACTOR_MANDATE_DENIED";
  constructor() { super("Contractor mandate reference refused"); this.name = "ContractorMandateError"; }
}
function deny(): never { throw new ContractorMandateError(); }
function read<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw); return parsed.success ? parsed.data : deny();
}

/**
 * Deterministic synthetic reference reducer only: no provider, route, persistence or money writes.
 * Inputs model trusted, locked records; they are never request-authorized facts. Production activation
 * still needs a durable transactional command/audit/outbox implementation and G4-C/D12/D16 approval.
 * No event creates or edits an agreement or approval; a changed version needs a separate human record.
 */
export function applyContractorMandateReference(rawState: unknown, rawEvent: unknown): ContractorMandateReference {
  const state = read(contractorMandateReferenceV1, rawState), input = read(contractorMandateEventV1, rawEvent);
  const { agreement: g } = state, { event: e, context: c } = input;
  if (c.tenantId !== g.binding.tenantId) deny();
  // A duplicate is a no-op only for the identical event; a revoked mandate never starts new work.
  const prior = state.events.find(v => v.id === input.id);
  if (prior) {
    if (JSON.stringify(prior.event) !== JSON.stringify(e) || prior.context.actorId !== c.actorId || prior.context.role !== c.role) deny();
    return state;
  }
  if (e.kind === "request") request(state, e, c, input.now);
  else if (e.kind === "revoke" || e.kind === "cancel" || e.kind === "provider_cancel") {
    if (e.kind === "provider_cancel" ? c.role !== "provider" : c.role !== "human") deny();
    g.status = e.kind === "revoke" ? "revoked" : e.kind === "cancel" ? "cancelled" : "provider_cancelled";
  } else {
    const a = state.actions.find(v => v.id === e.actionId);
    if (!a) deny();
    if (e.kind === "start") {
      if (c.role !== "worker" || g.binding.track === "pilot_no_charge" || a.artifact.pilotExempt || (a.artifact.action === "collect" && g.status !== "active") || !sameBinding(g.binding, a.artifact.binding) ||
        !sameArtifact(a.artifact, a.approval.artifact) || (a.outcome !== "queued" && a.outcome !== "failed") ||
        a.attempts >= MAX_REFERENCE_ATTEMPTS || compareServerInstants(input.now, a.artifact.expiresAt) >= 0) deny();
      a.outcome = "in_flight"; a.attempts += 1;
    } else {
      if (c.role !== "provider" || (e.kind === "outcome" ? a.outcome !== "in_flight" : a.outcome !== "outcome_unknown")) deny();
      // Cancellation stops dispatch, but cannot erase a previously in-flight provider fact.
      a.outcome = e.outcome;
    }
  }
  state.events.push({ id: input.id, event: e, context: c });
  return read(contractorMandateReferenceV1, state);
}

function request(state: ContractorMandateReference, e: Extract<z.infer<typeof event>, { kind: "request" }>,
  c: z.infer<typeof contractorMandateEventV1>["context"], now: string): void {
  const g = state.agreement, a = e.artifact;
  if (c.role !== "human" || c.actorId === e.approval.actorId || !sameBinding(g.binding, a.binding) || !sameArtifact(a, e.approval.artifact) ||
    compareServerInstants(now, a.expiresAt) >= 0 || g.binding.track === "pilot_no_charge" || a.pilotExempt) deny();
  if (state.actions.some(v => v.id === e.actionId || v.approval.decisionId === e.approval.decisionId ||
    v.artifact.action === a.action && v.artifact.statementId === a.statementId && a.action === "collect")) deny();
  if (a.action === "collect") {
    if (g.status !== "active" || a.originalActionId !== null) deny();
    const reserved = state.actions.filter(v => v.artifact.action === "collect").reduce((sum, v) => sum + BigInt(v.artifact.amountPence), 0n);
    if (reserved + BigInt(a.amountPence) > BigInt(g.binding.limitPence)) deny();
  } else {
    const original = state.actions.find(v => v.id === a.originalActionId);
    if (!original || original.artifact.action !== "collect" || original.outcome !== "settled" ||
      original.artifact.statementId !== a.statementId || original.artifact.statementHash !== a.statementHash) deny();
    const refunded = state.actions.filter(v => v.artifact.originalActionId === original.id)
      .reduce((sum, v) => sum + BigInt(v.artifact.amountPence), 0n);
    if (refunded + BigInt(a.amountPence) > BigInt(original.artifact.amountPence)) deny();
  }
  state.actions.push({ id: e.actionId, artifact: a, approval: e.approval, outcome: "queued", attempts: 0 });
}
