import { z } from "zod";
import { MAX_MONEY_PENCE } from "../money.js";
import { exactPenceV1, feeRateV1, MAX_ALLOCATION_LINES } from "../cumulative-fee.js";
import { instantV1, receiptAllocationV1 } from "../receipt-allocation.js";
import { jobTrackV1, variationOriginV1, contractorOriginV1, smallBuilderOriginV1, extraOriginV1 } from "../extra-origin.js";

export const enterpriseRoles = ["operative", "supervisor", "surveyor", "commercial_manager", "finance", "admin", "owner", "read_only", "client_approver", "connector"] as const;
export const enterpriseStates = ["logged", "awaiting_approval", "approved", "rejected", "withdrawn", "duplicate", "exported", "billed", "part_paid", "paid", "credited", "billing_rejected"] as const;
export const enterpriseCommands = ["LogSiteExtra", "ConfirmPrompt", "RecordOfficeExtra", "RecordClientInstruction", "ImportOrderLine", "SubmitExtra", "PriceExtra", "ApproveExtraStep", "RejectExtra", "WithdrawExtra", "MarkDuplicate", "ReviseExtra", "FinaliseExportBatch", "ImportBillingStatus"] as const;
const raisingCommands = ["LogSiteExtra", "ConfirmPrompt", "RecordOfficeExtra", "RecordClientInstruction", "ImportOrderLine", "LogBuilderExtra", "AddFinalReviewExtra", "ConfirmJobGuardCatch"] as const;
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const text = z.string().min(1).max(300);
const amount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const enterpriseModeV1 = z.enum(["synthetic_demo", "pilot_no_charge", "production_billing"]);
const roleV1 = z.enum(enterpriseRoles);
export class EnterpriseDomainError extends Error {
  constructor(public readonly code: "INVALID_ENTERPRISE_FACTS" | "INVALID_PROMPT_PROPOSAL" | "INVALID_TRANSITION" | "PERMISSION_DENIED" | "SELF_APPROVAL" | "REUSED_APPROVER" | "STALE_REVISION" | "INVALID_ORIGIN" | "INVALID_DUPLICATE_GROUP" | "INVALID_ALLOCATION" | "AGREEMENT_VERSION_MISMATCH" | "UNSUPPORTED_FORMULA" | "INVALID_STATEMENT" | "MONEY_LIMIT" | "COMPENSATION_LINK_REQUIRED") {
    super(code); this.name = "EnterpriseDomainError";
  }
}
export function refuse(code: EnterpriseDomainError["code"]): never { throw new EnterpriseDomainError(code); }
export function readEnterprise<T>(schema: z.ZodType<T>, raw: unknown, code: EnterpriseDomainError["code"] = "INVALID_ENTERPRISE_FACTS"): T {
  const result = schema.safeParse(raw); if (!result.success) return refuse(code); return result.data;
}
export const enterpriseGrantV1 = z.object({ id: uuid, tenantId: uuid, jobId: uuid, membershipId: uuid, role: roleV1 }).strict();
export const enterpriseActorV1 = z.object({ membershipId: uuid, tenantId: uuid, assigned: z.boolean(), grants: z.array(enterpriseGrantV1).max(100) }).strict();
export type EnterpriseGrant = z.infer<typeof enterpriseGrantV1>;
export type EnterpriseActor = z.infer<typeof enterpriseActorV1>;
const approvalRole = z.enum(["supervisor", "surveyor", "commercial_manager", "client_approver", "contract_rule"]);
export const enterpriseRequirementV1 = z.object({ ruleVersion: text,
  steps: z.array(z.object({ role: approvalRole, alternates: z.array(z.enum(["supervisor", "surveyor", "commercial_manager", "client_approver"])).max(4) }).strict()).min(1).max(20),
  photoRequired: z.boolean(), residentRequired: z.boolean(),
}).strict();
export type EnterpriseRequirement = z.infer<typeof enterpriseRequirementV1>;
export const enterpriseApprovalV1 = z.object({ index: z.number().int().min(0).max(19), revisionId: uuid, hash,
  netPence: amount, ruleVersion: text, actorId: uuid, grant: enterpriseGrantV1.nullable(),
  role: approvalRole, timing: z.enum(["before_work", "after_work"]), serverRecordedAt: instantV1,
}).strict();
export type EnterpriseApproval = z.infer<typeof enterpriseApprovalV1>;
export const enterpriseRevisionV1 = z.object({ id: uuid, hash, serverRecordedAt: instantV1, netPence: amount.nullable(), priceConfirmed: z.boolean(),
  priceSource: z.enum(["server_sor", "surveyor_quoted", "unpriced"]), requirement: enterpriseRequirementV1.nullable(),
  approvals: z.array(enterpriseApprovalV1).max(20),
}).strict();
export type EnterpriseRevision = z.infer<typeof enterpriseRevisionV1>;
const billingFactV1 = z.object({ tenantId: uuid, jobId: uuid, scopeItemId: uuid, revisionId: uuid, revisionHash: hash,
  exportLineId: uuid, invoiceId: text, invoiceLineId: text, sourceRef: text, kind: z.enum(["invoiced", "credited", "settled", "reversed"]),
  net: exactPenceV1, recordedAt: instantV1, effectiveAt: instantV1, allocationRule: z.enum(["explicit", "separate_invoice", "pro_rata"]).nullable(),
  originalSourceRef: text.nullable(), status: z.enum(["finalized", "pending"]),
}).strict();
const raisingCommandV1 = z.object({ id: uuid, type: z.enum(raisingCommands), actorId: uuid, role: roleV1, grant: enterpriseGrantV1, assigned: z.boolean() }).strict();
export const enterpriseExtraV1 = z.object({ id: uuid, tenantId: uuid, jobId: uuid, scopeItemId: uuid, state: z.enum(enterpriseStates), duplicateOf: uuid.nullable(),
  billingBalances: z.object({ billedNetPence: amount, settledNetPence: amount }).strict().nullable(), workDone: z.boolean(), exportedAt: instantV1.nullable(), revision: enterpriseRevisionV1, origin: extraOriginV1, raisingCommand: raisingCommandV1,
  orderAtOrigin: z.object({ revisionId: uuid, hash, coverage: z.enum(["new", "excess", "fully_instructed"]) }).strict(),
  captureNote: z.string().min(1).max(4000).nullable(),
  photo: z.object({ status: z.enum(["none", "verified", "pending", "rejected"]), evidenceId: uuid.nullable(), hash: hash.nullable(), tenantId: uuid.nullable(), jobId: uuid.nullable(), scopeItemId: uuid.nullable(), objectVersionId: text.nullable() }).strict(),
  residentCaptured: z.boolean(), residentConfirmationHash: hash.nullable(),
  prompt: z.object({ id: uuid, surfacedAt: instantV1, confirmedBy: enterpriseActorV1 }).strict().nullable(),
  exportLineId: uuid.nullable(), billingFacts: z.array(billingFactV1).max(MAX_ALLOCATION_LINES),
}).strict();
export type EnterpriseExtra = z.infer<typeof enterpriseExtraV1>;
export function assertExtraProvenance(e: EnterpriseExtra): void {
  const o = e.origin, c = e.raisingCommand;
  if (o.tenantId !== e.tenantId || o.jobId !== e.jobId || o.variationId !== e.id || c.id !== o.commandId || c.actorId !== o.raisingMembershipId ||
    c.role !== o.raisingRole || c.grant.membershipId !== c.actorId || c.grant.role !== c.role || c.grant.tenantId !== e.tenantId || c.grant.jobId !== e.jobId ||
    originForCommand(c.type, o.origin.jobTrack).kind !== o.origin.kind) return refuse("INVALID_ORIGIN");
  if ((e.photo.tenantId !== null && e.photo.tenantId !== e.tenantId) || (e.photo.jobId !== null && e.photo.jobId !== e.jobId) || (e.photo.scopeItemId !== null && e.photo.scopeItemId !== e.scopeItemId)) return refuse("INVALID_ENTERPRISE_FACTS");
}
const groupShapeV1 = z.object({ version: z.literal("enterprise-group.v1"), tenantId: uuid, jobId: uuid, jobTrack: jobTrackV1,
  currency: z.literal("GBP"), mode: enterpriseModeV1, feeGate: z.boolean(), canonicalId: uuid,
  members: z.array(enterpriseExtraV1).min(1).max(MAX_ALLOCATION_LINES), unresolvedCandidateIds: z.array(uuid).max(MAX_ALLOCATION_LINES), agreementVersionId: text,
}).strict();
export type EnterpriseGroup = z.infer<typeof groupShapeV1>;
const originCommands: Record<typeof raisingCommands[number], string> = {
  LogSiteExtra: "site_user", ConfirmPrompt: "jobguard_surfaced_confirmed", RecordOfficeExtra: "office_entry", RecordClientInstruction: "client_instruction", ImportOrderLine: "client_instruction",
  LogBuilderExtra: "builder_logged", AddFinalReviewExtra: "final_review", ConfirmJobGuardCatch: "jobguard_catch",
};
export function originForCommand(command: string, jobTrack: z.infer<typeof jobTrackV1>): z.infer<typeof variationOriginV1> {
  const kind = originCommands[command as keyof typeof originCommands];
  const allowed = jobTrack === "contractor" ? contractorOriginV1 : smallBuilderOriginV1;
  if (!kind || !allowed.safeParse(kind).success) return refuse("INVALID_ORIGIN");
  return readEnterprise(variationOriginV1, { version: "variation-origin.v1", jobTrack, kind }, "INVALID_ORIGIN");
}
/** Relationship validation only. The future server must authenticate and compose these facts. */
export const enterpriseGroupV1 = groupShapeV1.superRefine((g, context) => {
  const bad = (message: string) => context.addIssue({ code: "custom", message });
  if (!g.members.some(e => e.id === g.canonicalId) || new Set(g.members.map(e => e.id)).size !== g.members.length) bad("Member identity");
  for (const e of g.members) {
    const o = e.origin, c = e.raisingCommand;
    if ((e.photo.tenantId !== null && e.photo.tenantId !== e.tenantId) || (e.photo.jobId !== null && e.photo.jobId !== e.jobId) || (e.photo.scopeItemId !== null && e.photo.scopeItemId !== e.scopeItemId)) bad("Photo identity");
    if (e.tenantId !== g.tenantId || e.jobId !== g.jobId || o.tenantId !== g.tenantId || o.jobId !== g.jobId || o.variationId !== e.id || o.origin.jobTrack !== g.jobTrack) bad("Origin identity");
    if (c.id !== o.commandId || c.actorId !== o.raisingMembershipId || c.role !== o.raisingRole || c.grant.membershipId !== c.actorId || c.grant.role !== c.role || c.grant.tenantId !== g.tenantId || c.grant.jobId !== g.jobId || originCommands[c.type] !== o.origin.kind) bad("Raising command provenance");
    for (const f of e.billingFacts) {
      if (f.tenantId !== g.tenantId || f.jobId !== g.jobId || f.scopeItemId !== e.scopeItemId || f.revisionId !== e.revision.id || f.revisionHash !== e.revision.hash || f.exportLineId !== e.exportLineId) bad("Billing identity/revision/export match");
      if (f.kind === "reversed" && f.originalSourceRef === null) bad("Reversal source missing");
      if ((f.kind === "settled" || f.kind === "reversed") && f.allocationRule === null) bad("Settlement allocation rule missing");
    }
  }
});
export function parseEnterpriseGroup(raw: unknown): EnterpriseGroup { return readEnterprise(enterpriseGroupV1, raw); }

/** AI/advisory boundary: no authority fields, including suggestion prices. Existing gateway schemas are unchanged. */
export const enterprisePromptProposalV1 = z.object({ version: z.literal("enterprise-prompt-proposal.v1"), tenantId: uuid, jobId: uuid,
  scopeItemId: uuid.nullable(), coalescingKey: text, description: z.string().min(1).max(4000),
  producer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("model"), modelVersion: text, promptVersion: text, schemaVersion: z.literal("enterprise-prompt-proposal.v1") }).strict(),
    z.object({ kind: z.literal("rule"), ruleVersion: text, schemaVersion: z.literal("enterprise-prompt-proposal.v1") }).strict(),
  ]), sources: z.array(z.object({ evidenceId: uuid, hash }).strict()).min(1).max(100),
}).strict();
export type EnterprisePromptProposal = z.infer<typeof enterprisePromptProposalV1>;
export function parseEnterprisePromptProposal(raw: unknown): EnterprisePromptProposal { return readEnterprise(enterprisePromptProposalV1, raw, "INVALID_PROMPT_PROPOSAL"); }
export const enterpriseAgreementV1 = z.object({ version: z.literal("enterprise-agreement.v1"), id: text, tenantId: uuid, hash,
  effectiveFrom: instantV1, rate: feeRateV1, basis: z.literal("on_payment"), minimumCommitment: z.null(), onboardingFee: z.null(), volumeBands: z.null(),
}).strict();
export type EnterpriseAgreement = z.infer<typeof enterpriseAgreementV1>;
export const enterpriseStatementV1 = z.object({ version: z.literal("enterprise-statement.v1"), tenantId: uuid, period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
  statementId: uuid, inputFactsHash: hash, recordedCutoff: instantV1, mode: enterpriseModeV1, feeGate: z.boolean(),
  groups: z.array(enterpriseGroupV1).max(MAX_ALLOCATION_LINES), agreements: z.array(enterpriseAgreementV1).min(1).max(100),
  prior: z.array(z.object({ agreementVersionId: text, priorPolicyVersion: text, priorNetPostedPence: amount, derivationId: uuid.nullable(),
    contributions: z.array(z.object({ extraId: uuid, qualifyingPrincipal: exactPenceV1 }).strict()).max(MAX_ALLOCATION_LINES),
  }).strict()).max(100),
}).strict();
export type EnterpriseStatementInput = z.infer<typeof enterpriseStatementV1>;
export const enterpriseReceiptV1 = z.object({ version: z.literal("enterprise-receipt.v1"), tenantId: uuid, jobId: uuid, compositionComplete: z.literal(true),
  receipt: receiptAllocationV1, groups: z.array(enterpriseGroupV1).max(MAX_ALLOCATION_LINES),
  bindings: z.array(z.object({ lineId: text, extraId: uuid.nullable(), exportLineId: uuid.nullable(), revisionId: uuid.nullable(), revisionHash: hash.nullable() }).strict()).max(MAX_ALLOCATION_LINES),
  original: z.object({ sourceRef: text, receipt: receiptAllocationV1,
    remainingGross: z.array(z.object({ lineId: text, gross: exactPenceV1 }).strict()).max(MAX_ALLOCATION_LINES),
  }).strict().nullable(),
}).strict();
export const enterpriseTransitionV1 = z.object({ version: z.literal("enterprise-transition.v1"), command: z.enum(enterpriseCommands), extra: enterpriseExtraV1.nullable(),
  creation: enterpriseExtraV1, actor: enterpriseActorV1, expectedRevisionId: uuid, expectedHash: hash, reason: z.string().max(300),
  serverRecordedAt: instantV1, newRevision: enterpriseRevisionV1, canonical: enterpriseExtraV1, group: enterpriseGroupV1,
  billing: z.object({ kind: z.enum(["invoiced", "credited", "paid", "payment_reversed", "rejected"]), matched: z.boolean(),
    remainingBilledNetPence: amount, remainingSettledNetPence: amount }).strict(), exportLineId: uuid,
}).strict();
/** Covering grants are supplied facts, never grants produced by this package. */
export function covers(actor: EnterpriseActor, extra: Pick<EnterpriseExtra, "tenantId" | "jobId">, roles: readonly string[]): boolean {
  return actor.tenantId === extra.tenantId && actor.grants.some(g => g.membershipId === actor.membershipId && g.tenantId === extra.tenantId && g.jobId === extra.jobId && roles.includes(g.role));
}
/** Exact sub-millisecond comparison; device clocks are never passed by entitlement callers. */
export function compareServerInstants(left: string, right: string): -1 | 0 | 1 {
  const read = (raw: string) => {
    const value = readEnterprise(instantV1, raw);
    const fraction = /\.(\d+)/u.exec(value)?.[1] ?? "";
    const millis = Date.parse(value.replace(/\.\d+/u, ""));
    if (!Number.isSafeInteger(millis)) return refuse("INVALID_ENTERPRISE_FACTS");
    return { seconds: BigInt(millis) / 1000n, fraction: fraction.replace(/0+$/u, "") };
  };
  const a = read(left), b = read(right);
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length), x = a.fraction.padEnd(width, "0"), y = b.fraction.padEnd(width, "0");
  return x === y ? 0 : x < y ? -1 : 1;
}
