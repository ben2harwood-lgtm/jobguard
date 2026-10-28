import { z } from "zod";
import { approvalRulesV1, contractorRoles } from "./contractor.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { sha256 } from "./evidence-pack.js";

export class ExtraApprovalConstraintError extends Error {
  readonly code = "INVALID_EXTRA_APPROVAL_INPUT";
  constructor() { super("INVALID_EXTRA_APPROVAL_INPUT"); this.name = "ExtraApprovalConstraintError"; }
}
export function readExtraConstraint<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ExtraApprovalConstraintError();
  return parsed.data;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
const uuid = z.guid({ error: "Invalid uuid" }), hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const extraApprovalInputV1 = z.object({ version: z.literal("extra-approval-input.v1"), ruleVersionId: uuid, ruleDocumentHash: hash, clientContractVersionId: uuid,
  revision: z.object({ id: uuid, hash, net: z.object({ pence: z.number().int().positive().max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict().nullable() }).strict(), rules: approvalRulesV1 }).strict();

/** Proposal only. T and Y are independent comparisons; combined interpretation and operational proceed permission are HELD. */
export function evaluateExtraApprovalRequirement(raw: unknown) {
  const input = readExtraConstraint(extraApprovalInputV1, raw);
  if (sha256(JSON.stringify(input.rules)) !== input.ruleDocumentHash) throw new ExtraApprovalConstraintError();
  const net = input.revision.net?.pence ?? null, rules = input.rules;
  const bandIndex = net === null ? rules.bands.length - 1 : rules.bands.findIndex(b => b.upToPence === null || net <= b.upToPence);
  return freeze({ ...input, version: "extra-approval-proposal.v1" as const, bandIndex, comparisons: {
    withinProceedLimit: net !== null && net <= rules.proceedLimit.pence,
    aboveClientThreshold: rules.clientApproval.kind === "threshold" ? net === null || net > rules.clientApproval.abovePence : false,
    aboveClientBeforeWorkThreshold: rules.clientApproval.kind === "threshold" ? net === null || net > rules.clientApproval.beforeWorkAbovePence : false,
  }, companySteps: rules.bands[bandIndex]!.steps, approvalAuthority: false as const });
}
const companyRole = z.enum(["supervisor", "surveyor", "commercial_manager"]);
export const extraStepFactV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contract_rule"), role: z.literal("contract_rule"), index: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("human"), role: z.enum(["supervisor", "surveyor", "commercial_manager", "client_approver"]), index: z.number().int().nonnegative() }).strict(),
]);
/** Supplied required steps only. No fake person is attached to the rule-derived step. */
export function orderedExtraSteps(company: unknown, customerRequired: unknown): z.infer<typeof extraStepFactV1>[] {
  const roles = readExtraConstraint(z.array(companyRole).max(8), company), client = readExtraConstraint(z.boolean(), customerRequired);
  const result: z.infer<typeof extraStepFactV1>[] = roles.length ? roles.map((role, index) => ({ kind: "human", role, index })) : [{ kind: "contract_rule", role: "contract_rule", index: 0 }];
  if (client) result.push({ kind: "human", role: "client_approver", index: result.length });
  return freeze(result);
}
export const extraRoleConstraintV1 = z.object({ version: z.literal("extra-role-constraint.v1"), action: z.enum(["price", "report", "withdraw"]), role: z.enum(contractorRoles), siteStaff: z.boolean() }).strict();
export function extraRoleConstraint(raw: unknown): "permitted_constraint" | "held" | "refused" {
  const input = readExtraConstraint(extraRoleConstraintV1, raw);
  if (input.action === "price") return input.role === "surveyor" ? "permitted_constraint" : "refused";
  if (input.action === "report") return input.siteStaff ? "permitted_constraint" : "held";
  return input.role === "supervisor" ? "permitted_constraint" : "held";
}
const slot = z.string().trim().min(1).max(100);
const personUuid = uuid.transform(value => value.toLowerCase());
export const extraSeparationV1 = z.object({ version: z.literal("extra-separation.v1"), raiserPerson: personUuid, candidatePerson: personUuid, stepKey: slot, revisionId: uuid,
  history: z.array(z.object({ person: personUuid, stepKey: slot, revisionId: uuid }).strict()).max(1000) }).strict();
export function approvalSeparationConstraint(raw: unknown) {
  const input = readExtraConstraint(extraSeparationV1, raw);
  if (input.raiserPerson === input.candidatePerson) return "refused_self" as const;
  if (input.history.some(h => h.person === input.candidatePerson && h.stepKey !== input.stepKey)) return "refused_reused_person" as const;
  if (input.history.some(h => h.person === input.candidatePerson)) return "held_repeat_semantics" as const;
  return "permitted_constraint" as const;
}
const workReport = z.object({ reference: slot, uncertainty: z.string().trim().min(1).max(1000).nullable() }).strict();
export const extraWorkHistoryV1 = z.object({ version: z.literal("extra-work-history.v1"), start: workReport.nullable(), finish: workReport.nullable(), establishedBreaches: z.array(slot).max(1000) }).strict();
/** Preserves supplied established facts. Does not decide work timing, evidence or whether a breach occurred. */
export function preserveExtraWorkHistory(raw: unknown, additionalEstablishedBreaches: unknown) {
  const previous = readExtraConstraint(extraWorkHistoryV1, raw), additional = readExtraConstraint(z.array(slot).max(1000), additionalEstablishedBreaches);
  return freeze({ ...previous, establishedBreaches: [...new Set([...previous.establishedBreaches, ...additional])] });
}
export const extraOverdueEligibilityV1 = z.object({ version: z.literal("extra-overdue-eligibility.v1"), originalPeople: z.array(uuid).max(100), agreedBackupPeople: z.array(uuid).max(100), agreedWaitElapsed: z.boolean() }).strict();
export function overdueEligibilityConstraint(raw: unknown) {
  const input = readExtraConstraint(extraOverdueEligibilityV1, raw);
  return freeze([...new Set([...input.originalPeople, ...(input.agreedWaitElapsed ? input.agreedBackupPeople : [])])]);
}
