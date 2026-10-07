import { z } from "zod";
import { parseShadow, sameShadowBinding, shadowBinding, ShadowDomainError, shadowId, shadowIneligibilityV1, shadowRef } from "./types.js";
export const attributionPredicates = ["evidence_received_before_lock", "not_disclosed_before_lock", "absent_from_accepted_scope", "absent_from_builder_captures_at_lock", "absent_from_locked_final_account", "revealed_after_lock", "builder_confirmed_genuine_extra_and_completed", "billed_through_a_final_account_revision_and_invoice", "customer_payment_settled_and_allocated_to_that_line", "qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits"] as const;
const factBinding = { ...shadowBinding, lineId: shadowId, lockId: shadowId };
const fact = (predicate: typeof attributionPredicates[number]) => z.object({ version: z.literal("shadow-fact.v1"), ...factBinding, predicate: z.literal(predicate), holds: z.boolean(), sourceRef: shadowRef }).strict().readonly();
export const shadowAttributionV1 = z.object({ version: z.literal("shadow-attribution.v1"), policyVersion: z.literal("shadow_attribution_policy_v3"), ...factBinding, revisionId: shadowId, disputeReview: z.object({ version: z.literal("shadow-dispute-review.v1"), ...factBinding, resolution: z.enum(["confirmed_extra", "dismissed"]), sourceRef: shadowRef }).strict().readonly().nullable(), exclusions: z.array(shadowIneligibilityV1).readonly(), facts: z.object({
        evidence_received_before_lock: fact("evidence_received_before_lock"), not_disclosed_before_lock: fact("not_disclosed_before_lock"), absent_from_accepted_scope: fact("absent_from_accepted_scope"), absent_from_builder_captures_at_lock: fact("absent_from_builder_captures_at_lock"), absent_from_locked_final_account: fact("absent_from_locked_final_account"), revealed_after_lock: fact("revealed_after_lock"), builder_confirmed_genuine_extra_and_completed: fact("builder_confirmed_genuine_extra_and_completed"), billed_through_a_final_account_revision_and_invoice: fact("billed_through_a_final_account_revision_and_invoice"), customer_payment_settled_and_allocated_to_that_line: fact("customer_payment_settled_and_allocated_to_that_line"), qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits: fact("qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits"),
    }).strict().readonly() }).strict().superRefine((v, ctx) => { if (v.disputeReview && (!sameShadowBinding(v, v.disputeReview) || v.lineId !== v.disputeReview.lineId || v.lockId !== v.disputeReview.lockId))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Wrong review binding" });
    if (v.disputeReview && !v.exclusions.some(e => e.reason === "attribution_disputed"))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Review requires immutable dispute history" });
    for (const key of attributionPredicates) {
    const f = v.facts[key];
    if (!sameShadowBinding(v, f) || v.lineId !== f.lineId || v.lockId !== f.lockId)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Wrong source binding", path: ["facts", key] });
} }).readonly().brand<"ShadowAttributionFacts">();
export type ShadowAttributionFacts = z.infer<typeof shadowAttributionV1>;
/** Facts must come from independently verified immutable records, never a detector. Pure parsing authenticates nobody. */
export const createAttributionFacts = (raw: unknown): ShadowAttributionFacts => parseShadow(shadowAttributionV1, raw);
export function qualifiesAttribution(facts: ShadowAttributionFacts): boolean {
    const a = createAttributionFacts(facts);
    if (a.disputeReview?.resolution === "dismissed")
        return false;
    if (a.exclusions.some(e => e.reason !== "attribution_disputed" || a.disputeReview?.resolution !== "confirmed_extra"))
        return false;
    return attributionPredicates.every(key => a.facts[key].holds);
}
/** Binding helper for category inputs: no AI proposal overload. */
export function assertAttributionBinding(a: ShadowAttributionFacts, b: {
    tenantId: string;
    jobId: string;
    workId: string;
    lineId: string;
}): void {
    if (!sameShadowBinding(a, b) || a.lineId !== b.lineId)
        throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
}
