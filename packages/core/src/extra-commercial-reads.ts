import { z } from "zod";
import { addExactPence, compareExactPence, exactPence, exactPenceV1, parseExactPence, serializeExactPence, type ExactPence } from "./cumulative-fee.js";

/**
 * EP-CC-R1: read-only commercial reads over a contractor extra (entitlement context, asked against approved,
 * work list, claim record) and the narrow client projection. Pure: no database, no clock, no network.
 * Fields whose source rows do not exist yet (CC-S1 pricing basis v2 and revision reasons; CC-S2 entitlement
 * flags, decisions, inclusion rule and request evidence list) are returned as an explicit `not_recorded`
 * marker, never inferred. See docs/contracts/extra-commercial-reads-v1.md.
 */

export const extraCommercialReadErrorCodes = ["INVALID_QUERY", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "MODE_FORBIDDEN", "INCONSISTENT_WORK_INPUT", "DATABASE_UNAVAILABLE"] as const;
export type ExtraCommercialReadErrorCode = typeof extraCommercialReadErrorCodes[number];
export class ExtraCommercialReadError extends Error {
  constructor(readonly code: ExtraCommercialReadErrorCode, options?: { cause?: unknown }) { super(code, options); this.name = "ExtraCommercialReadError"; }
}

const uuid = z.guid();
const pence = z.number().int().min(1).max(1_000_000_000_000);
const signedPence = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
const instant = z.iso.datetime({ offset: true });
const code = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u);
const quantity = z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/u);

/** The marker for a field whose source rows land with a later leaf. `source` names that leaf. Never a default value. */
export const notRecordedV1 = z.object({ status: z.literal("not_recorded"), source: z.enum(["CC-S1", "CC-S2", "D5"]) }).strict();
export type NotRecorded = z.infer<typeof notRecordedV1>;
export const notRecorded = (source: NotRecorded["source"]): NotRecorded => Object.freeze({ status: "not_recorded" as const, source });
/** A field the caller's role may not see. Distinct from not_recorded: the row may exist. */
export const notDisclosedV1 = z.object({ status: z.literal("not_disclosed_to_role") }).strict();
export const notDisclosed = Object.freeze({ status: "not_disclosed_to_role" as const });

// ---------------------------------------------------------------------------------------------------------------
// Read roles. Only contractor members with a current job-covering grant (or, for finance, the existing tenant-wide
// finance grant) reach any of these reads; the database scope function decides coverage. This matrix only narrows.
export const extraCommercialReadsV1 = ["entitlement_context", "asked_against_approved", "work_list", "claim_record"] as const;
export type ExtraCommercialRead = typeof extraCommercialReadsV1[number];
export const extraCommercialReaderRolesV1 = ["supervisor", "surveyor", "commercial_manager", "finance"] as const;
export type ExtraCommercialReaderRole = typeof extraCommercialReaderRolesV1[number];
const readMatrix: Readonly<Record<ExtraCommercialRead, readonly ExtraCommercialReaderRole[]>> = Object.freeze({
  // Shown wherever an extra is priced or approved: the pricing and contractor approval roles.
  entitlement_context: ["supervisor", "surveyor", "commercial_manager"],
  asked_against_approved: ["supervisor", "surveyor", "commercial_manager", "finance"],
  work_list: ["supervisor", "surveyor", "commercial_manager", "finance"],
  claim_record: ["supervisor", "surveyor", "commercial_manager", "finance"],
});
export function extraCommercialReadAllowed(role: string, read: ExtraCommercialRead): boolean {
  return (readMatrix[read] as readonly string[]).includes(role);
}

// ---------------------------------------------------------------------------------------------------------------
// Work list (F4): one state, owner role and next action per open extra.

/** In precedence order (§4.4). `included_withdraw` sits with the other entitlement outcomes, after `held_unclear`. */
export const extraWorkStatesV1 = [
  "waiting_for_evidence", "waiting_for_pricing", "waiting_for_entitlement_decision", "held_unclear", "included_withdraw",
  "priced_not_submitted", "duplicate_resolution_required", "waiting_for_contractor_approval", "waiting_for_client_approval",
  "rejected", "approved_not_exported", "exported_not_billed", "billed_not_paid", "part_paid",
] as const;
export type ExtraWorkState = typeof extraWorkStatesV1[number];
export const extraWorkActionsV1 = ["add_evidence", "price", "decide_entitlement", "obtain_instruction", "withdraw", "submit", "resolve_duplicate",
  "approve_or_reject", "client_approve_or_reject", "revise", "export", "chase_billing", "chase_payment", "chase_balance"] as const;
export type ExtraWorkAction = typeof extraWorkActionsV1[number];
export const extraClosedReasonsV1 = ["withdrawn", "duplicate", "paid", "credited_in_full", "billing_rejected"] as const;

export const entitlementFlagsV1 = ["no_rate_code", "manual_price", "excess_over_order", "ancillary_rule"] as const;
export const entitlementOutcomesV1 = ["additional", "included_in_order", "included_in_rate", "unclear"] as const;
const lifecycle = z.enum(["logged", "awaiting_approval", "approved", "rejected", "withdrawn", "duplicate", "exported"]);
const role = z.string().regex(/^[a-z][a-z_]{0,39}$/u);

export const extraWorkInputV1 = z.object({
  version: z.literal("extra-work-input.v1"),
  lifecycle,
  /** null: the contract's evidence rules could not be read; never treated as missing evidence. */
  evidence: z.object({ photoRequired: z.boolean(), photoPresent: z.boolean(), residentConfirmationRequired: z.boolean(), residentConfirmationPresent: z.boolean() }).strict().nullable(),
  /** A current price binding exists (logged extra) or the latest request carries a net amount. */
  priced: z.boolean(),
  /** The latest request when one exists. `nextStep` is the first required step with no step fact. */
  request: z.object({
    nextStep: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("company"), eligibleRoles: z.array(role).min(1) }).strict(),
      z.object({ kind: z.literal("client") }).strict(),
      z.object({ kind: z.literal("contract_rule") }).strict(),
    ]).nullable(),
  }).strict().nullable(),
  /** flags null = not recorded (CC-S2 not landed): entitlement states are then never entered except for a held contract-rule step. */
  entitlement: z.object({
    flags: z.array(z.enum(entitlementFlagsV1)).nullable(),
    /** The decision valid for the current binding and order revision, if any. */
    validDecision: z.enum(entitlementOutcomesV1).nullable(),
  }).strict(),
  duplicate: z.object({ unresolved: z.boolean(), excludedMembershipIds: z.array(uuid) }).strict(),
  /** null until an export line exists. Exact rationals from the stored allocation projection. */
  billing: z.object({ billedNet: exactPenceV1, creditedNet: exactPenceV1, paidNet: exactPenceV1, rejected: z.boolean() }).strict().nullable(),
}).strict();
export type ExtraWorkInput = z.infer<typeof extraWorkInputV1>;

export type ExtraWorkClassification = Readonly<
  | { open: true; state: ExtraWorkState; precedence: number; ownerRoles: readonly string[]; nextAction: ExtraWorkAction; excludedMembershipIds: readonly string[]; balance: z.infer<typeof exactPenceV1> | null }
  | { open: false; closedReason: typeof extraClosedReasonsV1[number] }
>;

const owners: Readonly<Record<Exclude<ExtraWorkState, "waiting_for_contractor_approval">, { roles: readonly string[]; action: ExtraWorkAction }>> = Object.freeze({
  waiting_for_evidence: { roles: ["operative", "supervisor"], action: "add_evidence" },
  waiting_for_pricing: { roles: ["surveyor"], action: "price" },
  waiting_for_entitlement_decision: { roles: ["surveyor"], action: "decide_entitlement" },
  held_unclear: { roles: ["surveyor"], action: "obtain_instruction" },
  // Q11: a supervisor, surveyor or commercial manager with a job-covering grant may withdraw before the outcome is final.
  included_withdraw: { roles: ["supervisor", "surveyor", "commercial_manager"], action: "withdraw" },
  // xa_submit: supervisors and surveyors with a covering grant (an operative may only submit its own server-priced capture).
  priced_not_submitted: { roles: ["supervisor", "surveyor"], action: "submit" },
  duplicate_resolution_required: { roles: ["supervisor", "surveyor", "commercial_manager"], action: "resolve_duplicate" },
  waiting_for_client_approval: { roles: ["client_approver"], action: "client_approve_or_reject" },
  rejected: { roles: ["surveyor"], action: "revise" },
  // Export, status import and chasing are finance-only on main (app.cb_authority); the plan's "commercial manager" cannot
  // perform an export today, so the owner is the role that can (§4.4: every action offered is one the role can already perform).
  approved_not_exported: { roles: ["finance"], action: "export" },
  exported_not_billed: { roles: ["finance"], action: "chase_billing" },
  billed_not_paid: { roles: ["finance"], action: "chase_payment" },
  part_paid: { roles: ["finance"], action: "chase_balance" },
});
const inconsistent = (): never => { throw new ExtraCommercialReadError("INCONSISTENT_WORK_INPUT"); };
const zero = exactPence(0n);
const minus = (a: ExactPence, b: ExactPence) => addExactPence(a, exactPence(-b.numerator, b.denominator));

/** Exactly one state per open extra, by the §4.4 precedence. Impossible snapshots are refused, never guessed. */
export function classifyExtraWork(raw: unknown): ExtraWorkClassification {
  const parsed = extraWorkInputV1.safeParse(raw);
  if (!parsed.success) throw new ExtraCommercialReadError("INVALID_QUERY");
  const i = parsed.data;
  if (i.lifecycle === "withdrawn") return Object.freeze({ open: false, closedReason: "withdrawn" });
  if (i.lifecycle === "duplicate") return Object.freeze({ open: false, closedReason: "duplicate" });
  // Shape checks: a logged extra has no request; every later lifecycle has one; billing appears exactly with export.
  if ((i.lifecycle === "logged") !== (i.request === null)) inconsistent();
  if ((i.lifecycle === "exported") !== (i.billing !== null)) inconsistent();
  const open = (state: ExtraWorkState, extra: { roles?: readonly string[]; balance?: ExactPence } = {}): ExtraWorkClassification => {
    const base = state === "waiting_for_contractor_approval" ? { roles: extra.roles ?? inconsistent(), action: "approve_or_reject" as const }
      : owners[state as Exclude<ExtraWorkState, "waiting_for_contractor_approval">];
    return Object.freeze({ open: true, state, precedence: extraWorkStatesV1.indexOf(state), ownerRoles: Object.freeze([...(extra.roles ?? base.roles)]), nextAction: base.action,
      excludedMembershipIds: Object.freeze(state === "duplicate_resolution_required" ? [...i.duplicate.excludedMembershipIds] : []),
      balance: extra.balance ? serializeExactPence(extra.balance) : null });
  };
  const pre = i.lifecycle === "logged" || i.lifecycle === "awaiting_approval";
  if (pre) {
    const e = i.evidence;
    if (e && ((e.photoRequired && !e.photoPresent) || (e.residentConfirmationRequired && !e.residentConfirmationPresent))) return open("waiting_for_evidence");
    if (!i.priced) {
      // An unpriced request cannot be waiting on a held rule step: unpriced counts above every threshold (Q06).
      if (i.request?.nextStep?.kind === "contract_rule") inconsistent();
      return open("waiting_for_pricing");
    }
    const held = i.request?.nextStep?.kind === "contract_rule";
    const flagged = held || (i.entitlement.flags !== null && i.entitlement.flags.length > 0);
    if (flagged) {
      const d = i.entitlement.validDecision;
      if (d === "unclear") return open("held_unclear");
      if (d === "included_in_order" || d === "included_in_rate") return open("included_withdraw");
      if (d === null) return open("waiting_for_entitlement_decision");
      // A valid `additional` decision completes a held rule step in the same transaction (§4.2), so a still-held step beside it is impossible.
      if (held) inconsistent();
    }
    if (i.lifecycle === "logged") return open("priced_not_submitted");
  }
  if (i.duplicate.unresolved && (pre || i.lifecycle === "approved")) return open("duplicate_resolution_required");
  if (i.lifecycle === "awaiting_approval") {
    const step = i.request!.nextStep;
    if (step === null) inconsistent();
    if (step!.kind === "company") return open("waiting_for_contractor_approval", { roles: [...new Set(step!.eligibleRoles)].sort() });
    return open("waiting_for_client_approval");
  }
  if (i.lifecycle === "rejected") return open("rejected");
  if (i.lifecycle === "approved") return open("approved_not_exported");
  // Exported: billed and paid figures come only from the stored allocation projection.
  const b = i.billing!, billed = parseExactPence(b.billedNet), credited = parseExactPence(b.creditedNet), paid = parseExactPence(b.paidNet);
  if (b.rejected) return Object.freeze({ open: false, closedReason: "billing_rejected" });
  if (compareExactPence(billed, zero) <= 0) return open("exported_not_billed");
  const outstanding = minus(billed, credited);
  if (compareExactPence(outstanding, zero) <= 0) return Object.freeze({ open: false, closedReason: "credited_in_full" });
  if (compareExactPence(paid, outstanding) >= 0) return Object.freeze({ open: false, closedReason: "paid" });
  if (compareExactPence(paid, zero) <= 0) return open("billed_not_paid", { balance: outstanding });
  return open("part_paid", { balance: minus(outstanding, paid) });
}

export const extraWorkListQueryV1 = z.object({
  version: z.literal("extra-work-list-query.v1"),
  states: z.array(z.enum(extraWorkStatesV1)).min(1).max(extraWorkStatesV1.length).optional(),
  orderReference: z.string().trim().min(1).max(100).optional(),
  rateCode: z.string().trim().min(1).max(80).optional(),
  clientContractId: uuid.optional(),
  teamId: uuid.optional(),
  /** Inclusive bounds on when the extra was raised (server time). */
  raisedFrom: instant.optional(),
  raisedTo: instant.optional(),
}).strict().refine(q => !q.raisedFrom || !q.raisedTo || Date.parse(q.raisedFrom) <= Date.parse(q.raisedTo), "raisedFrom after raisedTo");
export type ExtraWorkListQuery = z.infer<typeof extraWorkListQueryV1>;

export const extraWorkListItemV1 = z.object({
  jobId: uuid, extraId: uuid, description: z.string().max(500), orderReference: z.string(), rateCode: z.string().nullable(),
  clientContractId: uuid, teamId: uuid.nullable(), raisedAt: instant,
  state: z.enum(extraWorkStatesV1), precedence: z.number().int().min(0), ownerRoles: z.array(role), nextAction: z.enum(extraWorkActionsV1),
  excludedMembershipIds: z.array(uuid), balance: exactPenceV1.nullable(),
  /** Latest stored fact on the extra's chain; age is server now minus this. */
  stateSince: instant, ageSeconds: z.number().int().min(0),
}).strict();
export const extraWorkListV1 = z.object({ version: z.literal("extra-work-list.v1"), environment: z.literal("synthetic_demo"), generatedAt: instant,
  items: z.array(extraWorkListItemV1) }).strict();

// ---------------------------------------------------------------------------------------------------------------
// Asked against approved (F2).

export const askedRequestInputV1 = z.object({
  requestId: uuid, requestRevision: z.number().int().positive(), netPence: pence.nullable(),
  outcome: z.object({ kind: z.enum(["approved", "rejected", "withdrawn", "duplicate"]), reasonCode: code.nullable() }).strict().nullable(),
}).strict();
export type AskedRequestInput = z.infer<typeof askedRequestInputV1>;

/** Pending amounts are kept apart from approved ones; nothing is summed across revisions. */
export function askedAgainstApprovedSummary(raw: readonly unknown[]) {
  const requests = z.array(askedRequestInputV1).safeParse(raw);
  if (!requests.success) throw new ExtraCommercialReadError("INVALID_QUERY");
  const rows = [...requests.data].sort((a, b) => a.requestRevision - b.requestRevision);
  for (let k = 1; k < rows.length; k++) if (rows[k]!.requestRevision === rows[k - 1]!.requestRevision) throw new ExtraCommercialReadError("INCONSISTENT_WORK_INPUT");
  const first = rows.find(r => r.netPence !== null) ?? null;
  const latest = rows.at(-1) ?? null;
  const approved = [...rows].reverse().find(r => r.outcome?.kind === "approved") ?? null;
  const pending = latest && latest.outcome === null && latest.netPence !== null ? latest : null;
  return Object.freeze({
    firstRequestedNetPence: first?.netPence ?? null, firstRequestedRequestId: first?.requestId ?? null,
    pendingNetPence: pending?.netPence ?? null, pendingRequestId: pending?.requestId ?? null,
    latestUnpricedPending: latest !== null && latest.outcome === null && latest.netPence === null,
    approvedNetPence: approved?.netPence ?? null, approvedRequestId: approved?.requestId ?? null,
    differencePence: approved?.netPence != null && first?.netPence != null ? approved.netPence - first.netPence : null,
  });
}

const basisV1 = z.union([
  z.object({ kind: z.literal("server_sor"), recordedAt: instant }).strict(),
  z.object({ kind: z.literal("basis_not_recorded") }).strict(),
]);
const stepFactV1 = z.object({ stepIndex: z.number().int().min(0), role: z.string(), actorKind: z.enum(["member", "client_approver", "contract_rule"]),
  approvedNetPence: pence.nullable(), recordedAt: instant }).strict();
export const askedAgainstApprovedV1 = z.object({
  version: z.literal("extra-asked-against-approved.v1"), environment: z.literal("synthetic_demo"), jobId: uuid, extraId: uuid,
  revisions: z.array(z.object({
    requestId: uuid, requestRevision: z.number().int().positive(), netPence: pence.nullable(), priced: z.boolean(),
    status: z.enum(["pending", "approved", "rejected", "withdrawn", "duplicate", "superseded"]),
    openedAt: instant, basis: basisV1.nullable(),
    revisionReason: notRecordedV1, answersRequest: notRecordedV1,
    outcome: z.object({ kind: z.enum(["approved", "rejected", "withdrawn", "duplicate"]), reasonCode: code.nullable(), actorKind: z.enum(["member", "client_approver"]), byRule: z.boolean(), recordedAt: instant }).strict().nullable(),
    steps: z.array(stepFactV1),
  }).strict()),
  firstRequestedNetPence: pence.nullable(), pendingNetPence: pence.nullable(), latestUnpricedPending: z.boolean(),
  approvedNetPence: pence.nullable(), differencePence: signedPence.nullable(),
}).strict();

// ---------------------------------------------------------------------------------------------------------------
// Entitlement context (F1) and the claim record (F5).

const orderLineV1 = z.object({ position: z.number().int().min(0), scopeItemId: uuid, clientLineReference: z.string().nullable(), rateCode: z.string(), unit: z.string(), quantity, ratePence: z.number().int().min(0) }).strict();
const orderRevisionV1 = z.object({ workOrderId: uuid, reference: z.string(), revisionId: uuid, revision: z.number().int().positive(), status: z.enum(["ordered", "cancelled"]), lines: z.array(orderLineV1) }).strict();
const rateItemV1 = z.object({ rateListVersionId: uuid, rateListReference: z.string(), effectiveFrom: z.iso.date(), code: z.string(), description: z.string(), unit: z.string(), ratePence: z.number().int().min(0) }).strict();
const claimedV1 = z.object({ coverage: z.enum(["new", "excess"]), rateCode: z.string(), unit: z.string(), instructedQuantity: quantity.nullable(), claimedQuantity: quantity, pricedQuantity: quantity,
  adjustment: z.object({ numerator: z.string(), denominator: z.string() }).strict(), netPence: pence }).strict();
const duplicateGroupV1 = z.object({ groupId: uuid, extras: z.array(z.object({ extraId: uuid, description: z.string() }).strict()) }).strict();

export const extraEntitlementContextV1 = z.object({
  version: z.literal("extra-entitlement-context.v1"), environment: z.literal("synthetic_demo"), jobId: uuid, extraId: uuid,
  extra: z.object({ description: z.string().max(500), rateCode: z.string().nullable(), raisedAt: instant }).strict(),
  originOrder: orderRevisionV1, currentOrder: orderRevisionV1, orderRevisionCurrent: z.boolean(),
  /** First-revision server-priced extras only, from extra_sor_revision; later revisions arrive with CC-S1. */
  claimed: z.union([claimedV1, notRecordedV1]),
  rateItem: rateItemV1.nullable(),
  contract: z.object({ clientContractId: uuid, versionId: uuid, revision: z.number().int().positive(), ruleVersionId: uuid, ruleRevision: z.number().int().positive() }).strict(),
  currentBinding: z.object({ bindingId: uuid, logicalRevision: z.number().int().positive(), sourceKind: z.enum(["server_sor", "ordinary"]), netPence: pence.nullable(), basis: basisV1 }).strict().nullable(),
  inclusionRule: notRecordedV1, rateIncludes: notRecordedV1, flags: notRecordedV1, decision: notRecordedV1, requestEvidence: notRecordedV1,
  originEvidence: z.object({ photoEvidenceId: uuid.nullable(), residentConfirmationEvidenceId: uuid.nullable() }).strict(),
  duplicateCandidates: z.array(duplicateGroupV1),
}).strict();

export const claimEventKindsV1 = ["order_revision", "raised", "event", "priced", "request_opened", "step_approved", "outcome", "client_link_issued", "client_link_closed",
  "escalated", "duplicate_link", "exported", "billing_fact", "fee_contribution"] as const;
export const extraClaimRecordV1 = z.object({
  version: z.literal("extra-claim-record.v1"), environment: z.literal("synthetic_demo"), jobId: uuid, extraId: uuid,
  order: z.object({ originRevision: orderRevisionV1, currentRevision: orderRevisionV1 }).strict(),
  origin: z.object({ kind: z.string(), description: z.string(), rateCode: z.string().nullable(), raisedAt: instant, raisedByMembershipId: uuid.nullable(),
    siteVisitId: uuid.nullable(), photoEvidenceId: uuid.nullable(), residentConfirmationEvidenceId: uuid.nullable() }).strict(),
  pricing: z.array(z.object({ bindingId: uuid, logicalRevision: z.number().int().positive(), sourceKind: z.enum(["server_sor", "ordinary"]), netPence: pence.nullable(), basis: basisV1, recordedAt: instant }).strict()),
  entitlement: z.object({ flags: notRecordedV1, decisions: notRecordedV1 }).strict(),
  requests: askedAgainstApprovedV1.shape.revisions,
  requestEvidence: notRecordedV1,
  duplicates: z.object({ links: z.array(z.object({ linkId: uuid, kind: z.string(), duplicateId: uuid, canonicalId: uuid, recordedAt: instant }).strict()),
    unresolvedCandidates: z.union([z.array(duplicateGroupV1), notDisclosedV1]) }).strict(),
  billing: z.object({
    exportLine: z.object({ exportLineId: uuid, batchId: uuid, requestId: uuid, approvedNetPence: pence, exportedAt: instant }).strict().nullable(),
    invoiceLines: z.array(z.object({ source: z.string(), invoiceNumber: z.string(), externalInvoiceLineId: z.string(), runId: uuid,
      billedNet: exactPenceV1, creditedNet: exactPenceV1, paidNet: exactPenceV1, balance: exactPenceV1, rejected: z.boolean() }).strict()),
    allocations: z.array(z.object({ allocationId: uuid, runId: uuid, sourceRef: z.string(), rule: z.string(), matchedExtraNet: exactPenceV1, current: z.boolean() }).strict()),
    /** The invoice and payment chain passes in full only with a real connection (D5). */
    realConnection: notRecordedV1,
  }).strict(),
  fees: z.union([z.object({ contributions: z.array(z.object({ derivationId: uuid, period: z.string(), allocationId: uuid, exportLineId: uuid, rule: z.string(),
    qualifyingPrincipal: z.object({ numerator: z.string(), denominator: z.string() }).strict(),
    statements: z.array(z.object({ statementId: uuid, revision: z.number().int().positive(), superseded: z.boolean() }).strict()) }).strict()) }).strict(), notDisclosedV1]),
  history: z.array(z.object({ at: instant, kind: z.enum(claimEventKindsV1), ref: z.string(), detail: z.record(z.string(), z.json()) }).strict()),
}).strict();

// ---------------------------------------------------------------------------------------------------------------
// The client's narrow projection (through the existing customer-portal extra route only).
export const clientEntitlementInputV1 = z.object({ version: z.literal("extra-customer.v1"), action: z.literal("entitlement"), jobId: uuid, requestId: uuid }).strict();
export const clientEntitlementProjectionV1 = z.object({
  version: z.literal("extra-client-entitlement.v1"), requestId: uuid, requestRevision: z.number().int().positive(),
  orderLines: z.array(z.object({ position: z.number().int().min(0), clientLineReference: z.string().nullable(), rateCode: z.string(), unit: z.string(), quantity }).strict()),
  claimed: z.union([z.object({ coverage: z.enum(["new", "excess"]), rateCode: z.string(), unit: z.string(), instructedQuantity: quantity.nullable(), claimedQuantity: quantity, pricedQuantity: quantity }).strict(), notRecordedV1]),
  rateItem: z.union([z.object({ code: z.string(), unit: z.string(), ratePence: z.number().int().min(0) }).strict(), notRecordedV1]),
  inclusionRule: notRecordedV1,
  decision: notRecordedV1,
  ownDecisions: z.array(z.object({ requestId: uuid, requestRevision: z.number().int().positive(), decision: z.enum(["approve", "reject"]), netPence: pence.nullable(), reasonCode: code.nullable(), recordedAt: instant }).strict()),
}).strict();
