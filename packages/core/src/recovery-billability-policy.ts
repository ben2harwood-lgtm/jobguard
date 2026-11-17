import { z } from "zod";
import { MAX_MONEY_PENCE, money } from "./money.js";
import { parseExactPence } from "./cumulative-fee.js";
import { createEligibilityFacts, evaluateRecoveryEligibility, shadowEligibilityV1 } from "./shadow-domain/eligibility.js";
import { freezeShadow, type ShadowReadonly } from "./shadow-domain/types.js";

export const RECOVERY_BILLABILITY_POLICY = "reference_recovery_eligibility_policy_v3" as const;
const id = z.string().uuid().refine(v => v === v.toLowerCase(), "Lowercase identity required");
const revision = z.number().int().positive().safe();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const amount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
const category = z.enum(["missed_variation_final_account", "merchant_overcharge", "duplicate_supplier_payment", "withheld_customer_payment", "prevention", "unclassified"]);
const citation = z.object({ sourceId: id, sourceVersion: z.string().min(1).max(300), sourceHash: hash }).strict();
const binding = z.object({
  tenantId: id, jobId: id, caseId: id, caseRevision: revision, evidenceRevision: revision, evidenceHash: hash,
  policyVersion: z.literal(RECOVERY_BILLABILITY_POLICY), policyRevision: z.literal(1),
}).strict();
/** Internal source-owner snapshot, never an HTTP payload. Parsing does not authenticate facts.
 * Field names map to main's RecoveryCaseView: id -> caseId, revision -> caseRevision,
 * caseType and claimedNetPence. No dependency on the parallel M4-1 transition table.
 */
export const recoveryBillabilitySnapshotV1 = z.object({
  version: z.literal("recovery-billability-snapshot.v1"), environment: z.literal("synthetic_demo"),
  binding, caseType: category, claimedNetPence: amount, availableAllocatedNetPence: amount,
  allocationState: z.enum(["available", "already_consumed", "duplicate_claim", "unrelated_payment", "outcome_unknown"]),
  evidenceComplete: z.boolean(), causationCertain: z.boolean(), amountCertain: z.boolean(), taxBasisCertain: z.boolean(),
  builderCaptured: z.boolean(), disclosedBeforeLock: z.boolean(), finalAccountLockId: id.nullable(),
  sources: z.array(citation).max(1000), facts: shadowEligibilityV1.nullable(),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.sources.map(s => s.sourceId)).size !== v.sources.length)
    ctx.addIssue({ code: "custom", message: "Duplicate evidence identity" });
  if (v.facts && (v.facts.tenantId !== v.binding.tenantId || v.facts.jobId !== v.binding.jobId
    || v.facts.caseId !== v.binding.caseId || v.facts.category !== v.caseType))
    ctx.addIssue({ code: "custom", message: "Wrong case/source binding" });
}).readonly();
export type RecoveryBillabilitySnapshot = z.infer<typeof recoveryBillabilitySnapshotV1>;
export class RecoveryBillabilityError extends Error {
  constructor(readonly code: "INVALID_BILLABILITY_INPUT" | "BILLABILITY_FORBIDDEN" | "BILLABILITY_STALE" | "BILLABILITY_NOT_APPROVABLE" | "BILLABILITY_REPLAY_CONFLICT") { super(code); }
}
function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const p = schema.safeParse(raw);
  if (!p.success) throw new RecoveryBillabilityError("INVALID_BILLABILITY_INPUT");
  return p.data;
}
const snapshot = (raw: unknown) => parse(recoveryBillabilitySnapshotV1, raw);

/** Internal policy result only, never a builder-facing response before lock. */
export function evaluateBillabilityPolicy(raw: unknown) {
  const s = snapshot(raw);
  const exclusions: string[] = [];
  if (!s.evidenceComplete || s.sources.length === 0) exclusions.push("missing_proof");
  if (!s.causationCertain || !s.amountCertain || !s.taxBasisCertain) exclusions.push("uncertain_basis");
  if (s.builderCaptured) exclusions.push("builder_capture");
  if (s.disclosedBeforeLock) exclusions.push("disclosed_before_lock");
  if (s.allocationState !== "available") exclusions.push("unavailable_case_allocation");
  let principal = { numerator: 0n, denominator: 1n };
  if (!s.facts) exclusions.push("unclassified_or_missing_facts");
  else {
    const f = createEligibilityFacts(s.facts);
    const result = evaluateRecoveryEligibility(f);
    if (!result.eligible) exclusions.push("failed_d03_predicate");
    principal = parseExactPence(result.qualifyingPrincipal);
    if (f.category === "missed_variation_final_account" && (s.finalAccountLockId === null || s.finalAccountLockId !== f.attribution.lockId))
      exclusions.push("missing_or_wrong_final_account_lock");
    if (principal.numerator > BigInt(s.claimedNetPence) * principal.denominator
      || principal.numerator > BigInt(s.availableAllocatedNetPence) * principal.denominator) exclusions.push("principal_exceeds_claim_or_allocation");
  }
  if (principal.numerator <= 0n) exclusions.push("no_remaining_principal");
  return freezeShadow({ version: "recovery-billability-policy-result.v1" as const, policyVersion: s.binding.policyVersion,
    classification: exclusions.length ? "non_billable" as const : "eligible_for_review" as const,
    exclusions, productionEnabled: false as const });
}

/** A cited classifier suggestion is separate from review and cannot enter the approval transition. */
export const recoveryBillabilityProposalV1 = z.object({
  version: z.literal("recovery-billability-proposal.v1"), binding, proposedCategory: category,
  classifierVersion: z.string().min(1).max(300), confidence: z.number().min(0).max(1), citations: z.array(citation).min(1).max(1000),
}).strict();
export function validateBillabilityProposal(raw: unknown, current: unknown) {
  const p = parse(recoveryBillabilityProposalV1, raw), s = snapshot(current);
  if (!same(p.binding, s.binding)) throw new RecoveryBillabilityError("BILLABILITY_STALE");
  if (new Set(p.citations.map(c => c.sourceId)).size !== p.citations.length
    || p.citations.some(c => !s.sources.some(source => same(c, source))))
    throw new RecoveryBillabilityError("INVALID_BILLABILITY_INPUT");
  return freezeShadow({ ...p, effect: "proposal_only" as const, productionEnabled: false as const });
}
// Compare parsed schemas, never caller key order; arrays retain their meaningful order.
function same(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
    return JSON.stringify(value);
  };
  return canonical(a) === canonical(b);
}
const authoritySchema = z.object({
  environment: z.literal("synthetic_demo"), tenantId: id, jobId: id, membershipId: id,
  identityUserId: id, permission: z.literal("review_recovery_eligibility"),
}).strict();
/** Source owner supplies current authorization after authentication, under its transaction locks.
 * These domain functions perform no I/O and cannot grant permission, persist review or post fees.
 */
function authorize(raw: unknown, s: RecoveryBillabilitySnapshot) {
  const a = authoritySchema.safeParse(raw);
  if (!a.success || a.data.tenantId !== s.binding.tenantId || a.data.jobId !== s.binding.jobId)
    throw new RecoveryBillabilityError("BILLABILITY_FORBIDDEN");
  return a.data;
}
const reviewCommand = z.object({
  version: z.literal("recovery-billability-review-command.v1"), commandId: id, expected: binding,
  claimedEligiblePrincipalPence: amount, reasons: z.string().trim().min(1).max(2000),
}).strict();
const assessment = z.object({
  version: z.literal("recovery-billability-policy-result.v1"), policyVersion: z.literal(RECOVERY_BILLABILITY_POLICY),
  classification: z.enum(["non_billable", "eligible_for_review"]), exclusions: z.array(z.string()), productionEnabled: z.literal(false),
}).strict();
const reviewRecord = z.object({
  version: z.literal("recovery-billability-review.v1"), command: reviewCommand, snapshot: recoveryBillabilitySnapshotV1,
  assessment, reviewer: authoritySchema, productionEnabled: z.literal(false),
}).strict();
export type RecoveryBillabilityReview = ShadowReadonly<z.infer<typeof reviewRecord>>;
/** An immutable, serializable human review record; still no approval or fee entitlement. */
export function reviewBillability(raw: unknown, current: unknown, authority: unknown): RecoveryBillabilityReview {
  const s = snapshot(current), reviewer = authorize(authority, s), command = parse(reviewCommand, raw);
  if (!same(command.expected, s.binding)) throw new RecoveryBillabilityError("BILLABILITY_STALE");
  return freezeShadow({ version: "recovery-billability-review.v1" as const, command, snapshot: s,
    assessment: evaluateBillabilityPolicy(s), reviewer, productionEnabled: false as const });
}
const approvalCommand = z.object({
  version: z.literal("recovery-billability-approval-command.v1"), commandId: id, reviewCommandId: id, expected: binding,
}).strict();
const approvalRecord = z.object({
  version: z.literal("recovery-billability-approval.v1"), command: approvalCommand, review: reviewRecord,
  approvedBy: authoritySchema, productionEnabled: z.literal(false),
}).strict();
export type RecoveryBillabilityApproval = ShadowReadonly<z.infer<typeof approvalRecord>>;
/** No positive approval without a current human review and every deterministic predicate. */
export function approveBillability(raw: unknown, review: unknown, current: unknown, authority: unknown): RecoveryBillabilityApproval {
  const s = snapshot(current), reviewer = authorize(authority, s), command = parse(approvalCommand, raw), r = parse(reviewRecord, review);
  if (!same(r.snapshot, s) || !same(r.command.expected, s.binding) || !same(command.expected, s.binding)
    || command.reviewCommandId !== r.command.commandId || !same(r.reviewer, reviewer)
    || !same(r.assessment, evaluateBillabilityPolicy(s)))
    throw new RecoveryBillabilityError("BILLABILITY_STALE");
  const p = r.command.claimedEligiblePrincipalPence;
  const principal = s.facts ? parseExactPence(createEligibilityFacts(s.facts).principalNet) : { numerator: 0n, denominator: 1n };
  if (evaluateBillabilityPolicy(s).classification !== "eligible_for_review" || p === 0
    || BigInt(p) * principal.denominator > principal.numerator)
    throw new RecoveryBillabilityError("BILLABILITY_NOT_APPROVABLE");
  return freezeShadow({ version: "recovery-billability-approval.v1" as const, command, review: r, approvedBy: reviewer, productionEnabled: false as const });
}
/** Revalidate before consuming a historical approval. Evidence changes, reversals, allocation
 * changes, lock changes and policy revisions invalidate it even if a producer forgot to bump a version.
 */
export function requireCurrentBillabilityApproval(raw: unknown, current: unknown, authority: unknown) {
  const a = parse(approvalRecord, raw);
  approveBillability(a.command, a.review, current, authority);
  if (!same(a.approvedBy, a.review.reviewer)) throw new RecoveryBillabilityError("BILLABILITY_STALE");
  return freezeShadow({ approvedPrincipal: money(a.review.command.claimedEligiblePrincipalPence), productionEnabled: false as const });
}
/** The durable command owner must enforce UNIQUE(tenant_id,command_id) under locks.
 * An exact replay returns its original record, never a new approval against today's policy.
 */
export function replayBillabilityApproval(saved: unknown, command: unknown, current: unknown, authority: unknown): RecoveryBillabilityApproval {
  const s = snapshot(current), reviewer = authorize(authority, s), a = parse(approvalRecord, saved), c = parse(approvalCommand, command);
  if (!same(c, a.command) || !same(reviewer, a.approvedBy) || !same(s.binding, a.review.snapshot.binding))
    throw new RecoveryBillabilityError("BILLABILITY_REPLAY_CONFLICT");
  return freezeShadow(a);
}
