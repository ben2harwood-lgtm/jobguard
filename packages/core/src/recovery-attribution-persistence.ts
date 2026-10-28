import { z } from "zod";
import { attributionPredicates, assertAttributionBinding, qualifiesAttribution, shadowAttributionV1 } from "./shadow-domain/attribution.js";
import { freezeShadow, shadowId as baseShadowId, shadowRef } from "./shadow-domain/types.js";
import { compareExactPence, parseExactPence, exactPenceV1 } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { instantV1 } from "./receipt-allocation.js";
// Canonical wire identities must match PostgreSQL UUID equality without silent rewriting.
const shadowId = baseShadowId.refine(v => v === v.toLowerCase(), "Lowercase UUID required");
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().positive().safe();
const selector = { jobId: shadowId, caseId: shadowId, workId: shadowId, lineId: shadowId, lockId: shadowId };
const simulation = { environment: z.literal("synthetic_demo"), productionEnabled: z.literal(false), realExternalActions: z.literal(0) };
const policies = { attributionPolicyVersion: z.literal("shadow_attribution_policy_v3"), eligibilityPolicyVersion: z.literal("reference_recovery_eligibility_policy_v3"), policyBundleRef: shadowRef };
const commandIdentity = {
  version: z.literal("recovery-attribution-command.v1"), commandId: shadowId, caseId: shadowId, workId: shadowId, lineId: shadowId, lockId: shadowId,
  expectedCaseRevision: revision, expectedAttributionRevision: z.number().int().nonnegative().safe(),
};
export const recoveryAttributionCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...commandIdentity, action: z.literal("assess") }).strict(),
  z.object({ ...commandIdentity, action: z.literal("approve_review"), assessmentId: shadowId, expectedSourceHash: hash, reviewArtifactHash: hash }).strict(),
]).readonly();
export type RecoveryAttributionCommandV1 = z.infer<typeof recoveryAttributionCommandV1>;
export class RecoveryAttributionError extends Error {
  readonly code = "INVALID_RECOVERY_ATTRIBUTION_COMMAND";
  constructor() { super("Invalid recovery attribution command"); this.name = "RecoveryAttributionError"; }
}
export function parseRecoveryAttributionCommand(raw: unknown): RecoveryAttributionCommandV1 {
  const parsed = recoveryAttributionCommandV1.safeParse(raw);
  if (!parsed.success) throw new RecoveryAttributionError();
  return freezeShadow(parsed.data);
}
/** Wire validation only: preserves the exact fraction; never rounds or allocates. */
const principal = exactPenceV1.refine(v => {
  if (!/^(?:0|[1-9]\d*)$/u.test(v.numerator) || !/^[1-9]\d*$/u.test(v.denominator)) return false;
  return BigInt(v.numerator) <= BigInt(MAX_MONEY_PENCE) * BigInt(v.denominator);
}, "Principal outside application bounds").readonly();
export const attributionSourceReferenceV1 = z.object({
  kind: z.enum(["evidence", "disclosure", "baseline_manifest", "capture_manifest", "locked_bill_manifest", "reconciliation", "reveal", "disposition", "dispute_review", "variation", "invoice_line", "settled_movement", "line_allocation", "line_reversal", "refund", "credit", "evidence_invalidation"]),
  sourceId: shadowId, sourceVersion: shadowRef, sourceHash: hash, tenantId: shadowId, jobId: shadowId,
}).strict().readonly();
const factSourceKinds: Readonly<Record<typeof attributionPredicates[number], readonly string[]>> = {
  evidence_received_before_lock: ["evidence"], not_disclosed_before_lock: ["disclosure"],
  absent_from_accepted_scope: ["baseline_manifest"], absent_from_builder_captures_at_lock: ["capture_manifest"],
  absent_from_locked_final_account: ["locked_bill_manifest"], revealed_after_lock: ["reveal"],
  builder_confirmed_genuine_extra_and_completed: ["disposition"], billed_through_a_final_account_revision_and_invoice: ["invoice_line"],
  customer_payment_settled_and_allocated_to_that_line: ["line_allocation"],
  qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits: ["line_allocation", "line_reversal", "refund", "credit"],
};
const absenceKinds = ["baseline_manifest", "capture_manifest", "locked_bill_manifest"] as const;
/** Explicit frozen inventories, including successful zero-result searches. Never a live query result. */
const completeManifest = z.object({
  kind: z.enum(absenceKinds), sourceId: shadowId, lockId: shadowId, status: z.literal("completed"),
  itemIds: z.array(shadowId).max(10_000).readonly(), itemCount: z.number().int().nonnegative().max(10_000),
}).strict().superRefine((v, ctx) => {
  if (v.itemCount !== v.itemIds.length || new Set(v.itemIds).size !== v.itemIds.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete or duplicate item inventory" });
}).readonly();
export const recoveryAttributionRevisionV1 = z.object({
  version: z.literal("recovery-attribution-revision.v1"), ...selector, ...simulation, ...policies,
  tenantId: shadowId, assessmentId: shadowId, revision, previousAssessmentId: shadowId.nullable(), caseRevision: revision,
  sourceRevision: shadowRef, sourceHash: hash, sourceManifest: z.array(attributionSourceReferenceV1).min(1).max(10_000).readonly(),
  completeManifests: z.array(completeManifest).length(3).readonly(), facts: shadowAttributionV1,
  remainingPrincipal: principal, assessmentOutcome: z.enum(["eligible_for_review", "excluded"]), reasonCodes: z.array(shadowRef).max(100).readonly(),
  assessedBy: z.object({ kind: z.enum(["membership", "source_change"]), actorRef: shadowRef }).strict().readonly(), serverRecordedAt: instantV1,
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  try { assertAttributionBinding(v.facts, v); } catch { fail("Wrong attribution binding"); }
  if (v.facts.lockId !== v.lockId || v.facts.revisionId !== v.assessmentId) fail("Wrong lock/assessment binding");
  if ((v.revision === 1) !== (v.previousAssessmentId === null) || v.previousAssessmentId === v.assessmentId) fail("Invalid predecessor");
  const ids = v.sourceManifest.map(s => s.sourceId);
  if (new Set(ids).size !== ids.length) fail("Duplicate source identity");
  if (v.sourceManifest.some(s => s.tenantId !== v.tenantId || s.jobId !== v.jobId)) fail("Foreign source binding");
  const sources = new Map(v.sourceManifest.map(s => [s.sourceId, s]));
  for (const predicate of attributionPredicates) {
    const source = sources.get(v.facts.facts[predicate].sourceRef);
    if (!source || !factSourceKinds[predicate].includes(source.kind)) fail("Unrecorded or wrong-kind fact source");
  }
  for (const e of v.facts.exclusions) if (!sources.has(e.sourceRef)) fail("Unrecorded exclusion source");
  if (v.facts.disputeReview && !sources.has(v.facts.disputeReview.sourceRef)) fail("Unrecorded dispute source");
  for (const kind of absenceKinds) {
    const manifests = v.completeManifests.filter(m => m.kind === kind);
    if (manifests.length !== 1) { fail("Missing or duplicate complete manifest"); continue; }
    const m = manifests[0]!;
    if (m.lockId !== v.lockId || sources.get(m.sourceId)?.kind !== kind) fail("Wrong complete manifest binding");
    const predicate = kind === "baseline_manifest" ? "absent_from_accepted_scope" : kind === "capture_manifest" ? "absent_from_builder_captures_at_lock" : "absent_from_locked_final_account";
    if (v.facts.facts[predicate].sourceRef !== m.sourceId) fail("Absence fact must cite its frozen manifest");
  }
  const ready = qualifiesAttribution(v.facts) && principal.safeParse(v.remainingPrincipal).success && BigInt(v.remainingPrincipal.numerator) > 0n;
  if ((v.assessmentOutcome === "eligible_for_review") !== ready) fail("Assessment outcome disagrees with recorded facts/principal");
  if (ready ? v.reasonCodes.length !== 0 : v.reasonCodes.length === 0) fail("Assessment reasons disagree with outcome");
}).readonly().brand<"RecoveryAttributionRevisionV1">();
export type RecoveryAttributionRevisionV1 = z.infer<typeof recoveryAttributionRevisionV1>;
/** Internal shape only. The caller must reconstruct and reauthorize under the source transaction locks. */
export const qualifyingRecoverySourceV1 = z.object({
  version: z.literal("qualifying-recovery-source.v1"), category: z.literal("missed_variation_final_account"), ...selector, ...simulation, ...policies,
  tenantId: shadowId, assessmentId: shadowId, assessmentRevision: revision, reviewId: shadowId, reviewAuthorizationId: shadowId,
  sourceRevision: shadowRef, sourceHash: hash, lineAllocationIds: z.array(shadowId).min(1).max(10_000).readonly(), exactRemainingPrincipal: principal,
}).strict().superRefine((v, ctx) => {
  if (new Set(v.lineAllocationIds).size !== v.lineAllocationIds.length || !principal.safeParse(v.exactRemainingPrincipal).success || BigInt(v.exactRemainingPrincipal.numerator) <= 0n)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Positive unique saved allocations required" });
}).readonly().brand<"QualifyingRecoverySourceV1">();
export type QualifyingRecoverySourceV1 = z.infer<typeof qualifyingRecoverySourceV1>;
export const attributionReviewResultV1 = z.object({
  version: z.literal("recovery-attribution-review-result.v1"), ...simulation,
  reviewId: shadowId, assessmentId: shadowId, assessmentRevision: revision, sourceRevision: shadowRef, sourceHash: hash,
  reviewAuthorizationId: shadowId, reviewArtifactHash: hash, commandId: shadowId, effect: z.literal("review_recorded"),
}).strict().readonly();
const currentIdentity = {
  version: z.literal("current-attribution-qualification.v1"), ...simulation,
  latestAssessmentId: shadowId.nullable(), currentSourceRevision: shadowRef,
};
export const currentAttributionQualificationV1 = z.discriminatedUnion("state", [
  z.object({ ...currentIdentity, state: z.literal("qualified"), source: qualifyingRecoverySourceV1, reasonCodes: z.tuple([]).readonly() }).strict(),
  z.object({ ...currentIdentity, state: z.enum(["not_assessed", "unreviewed", "held", "excluded"]), source: z.null(), reasonCodes: z.array(shadowRef).min(1).readonly() }).strict(),
]).superRefine((v, ctx) => {
  if (v.state === "qualified" && (v.source.assessmentId !== v.latestAssessmentId || v.source.sourceRevision !== v.currentSourceRevision))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Stale qualification" });
}).readonly();

/** Pure consistency failure, never evidence of a persisted command or authenticated source. */
export class RecoveryAttributionReassessmentError extends Error {
  readonly code = "INVALID_RECOVERY_ATTRIBUTION_REASSESSMENT";
  constructor() { super("Invalid recovery attribution reassessment or stale source"); this.name = "RecoveryAttributionReassessmentError"; }
}
const reassessmentFailure = (): never => { throw new RecoveryAttributionReassessmentError(); };
/**
 * Validate an immediate successor supplied by the source owner. Does not execute a source change,
 * allocate receipts, save history, approve review or choose an automatic reassessment mechanism.
 */
export function reassessRecoveryAttribution(previous: unknown, next: unknown): RecoveryAttributionRevisionV1 {
  const before = recoveryAttributionRevisionV1.safeParse(previous), after = recoveryAttributionRevisionV1.safeParse(next);
  if (!before.success || !after.success) return reassessmentFailure();
  const p = before.data, n = after.data;
  for (const key of ["tenantId", "jobId", "caseId", "workId", "lineId", "lockId", "policyBundleRef"] as const)
    if (p[key] !== n[key]) return reassessmentFailure();
  if (n.previousAssessmentId !== p.assessmentId || n.revision !== p.revision + 1 || n.caseRevision < p.caseRevision)
    return reassessmentFailure();
  if (n.sourceRevision === p.sourceRevision || n.sourceHash === p.sourceHash) return reassessmentFailure();
  return freezeShadow(n);
}
/** Excluded evidence never erases actual remaining receipts; only the qualifying contribution is zero. */
export function qualifyingAttributionPrincipal(raw: unknown): z.infer<typeof exactPenceV1> {
  const parsed = recoveryAttributionRevisionV1.safeParse(raw);
  if (!parsed.success) return reassessmentFailure();
  return freezeShadow(parsed.data.assessmentOutcome === "eligible_for_review"
    ? parsed.data.remainingPrincipal : { numerator: "0", denominator: "1" });
}
/** Internal owner-resolved watermark; JSON validation alone cannot establish that it is current. */
export const attributionCurrentSourceV1 = z.object({
  version: z.literal("attribution-current-source.v1"), ...simulation, ...selector, ...policies,
  tenantId: shadowId, assessmentId: shadowId, assessmentRevision: revision,
  sourceRevision: shadowRef, sourceHash: hash, remainingPrincipal: principal,
}).strict().readonly();
/** Fail closed before using a historical positive result. Owner must read this watermark under source locks. */
export function requireCurrentAttributionQualification(qualification: unknown, current: unknown): z.infer<typeof currentAttributionQualificationV1> {
  const result = currentAttributionQualificationV1.safeParse(qualification), watermark = attributionCurrentSourceV1.safeParse(current);
  if (!result.success || !watermark.success || result.data.state !== "qualified") return reassessmentFailure();
  const q = result.data, s = q.source, c = watermark.data;
  for (const key of ["tenantId", "jobId", "caseId", "workId", "lineId", "lockId", "policyBundleRef", "assessmentId", "assessmentRevision", "sourceRevision", "sourceHash"] as const)
    if (s[key] !== c[key]) return reassessmentFailure();
  if (compareExactPence(parseExactPence(s.exactRemainingPrincipal), parseExactPence(c.remainingPrincipal)) !== 0) return reassessmentFailure();
  return freezeShadow(q);
}
