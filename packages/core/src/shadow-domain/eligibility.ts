import { z } from "zod";
import { compareExactPence, exactPence, exactPenceV1, parseExactPence, serializeExactPence } from "../cumulative-fee.js";
import { assertAttributionBinding, qualifiesAttribution, shadowAttributionV1 } from "./attribution.js";
import { freezeShadow, parseShadow, sameShadowBinding, shadowAmount, shadowBinding, ShadowDomainError, shadowId, shadowRef } from "./types.js";
const binding = { ...shadowBinding, lineId: shadowRef };
const proofV1 = z.object({ version: z.literal("shadow-settlement-proof.v1"), ...binding, status: z.enum(["verified_settled", "pending", "unverified"]), sourceRef: shadowRef }).strict().readonly();
const originV1 = z.object({ version: z.literal("shadow-eligibility-origin.v1"), ...binding, kind: z.enum(["approved_supplier_case", "builder_opened_case", "shadow_confirmed_extra"]), sourceRef: shadowRef }).strict().readonly();
const base = z.object({ version: z.literal("shadow-eligibility.v1"), policyVersion: z.literal("reference_recovery_eligibility_policy_v3"), environment: z.literal("synthetic_reference"), ...binding, caseId: shadowId, approvedCase: z.boolean(), unresolvedDispute: z.boolean(), proof: proofV1, origin: originV1, principalNet: exactPenceV1.readonly() });
export const shadowEligibilityV1 = z.discriminatedUnion("category", [
    base.extend({ category: z.literal("missed_variation_final_account"), attribution: shadowAttributionV1 }).strict(),
    base.extend({ category: z.literal("merchant_overcharge"), mode: z.enum(["cash_refund", "applied_credit"]), credit: z.object({ consumedNetPence: shadowAmount, laterInvoiceId: shadowId, laterInvoicePayment: z.enum(["unpaid", "partial", "full"]), sourceRef: shadowRef }).strict().readonly().nullable() }).strict(),
    base.extend({ category: z.literal("duplicate_supplier_payment"), doublePaymentEvidenced: z.boolean(), refundForm: z.enum(["cash", "future_credit"]) }).strict(),
    base.extend({ category: z.literal("withheld_customer_payment"), builderOpened: z.boolean(), feeTermsApprovedBeforePursuit: z.boolean(), overdue: z.object({ version: z.literal("D03-overdue.v1"), basis: z.enum(["synthetic_fixture", "evaluated_structured_predicate"]), thresholdMet: z.boolean(), sourceRef: shadowRef }).strict().readonly(), ownReminderResponse: z.enum(["refused", "disputed", "ignored", "normal_reminder", "ordinary_lateness"]), paymentTiming: z.enum(["before_opening", "after_opening"]), proceeds: z.enum(["customer_cash", "insurer"]), component: z.enum(["principal", "statutory_interest", "fixed_compensation", "retention"]), debtor: z.enum(["business", "individual"]) }).strict(),
    base.extend({ category: z.literal("prevention") }).strict(),
]).superRefine((v, ctx) => {
    for (const f of [v.proof, v.origin])
        if (!sameShadowBinding(v, f) || v.lineId !== f.lineId)
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Wrong source binding" });
    if (v.category !== "prevention") {
        const required = v.category === "missed_variation_final_account" ? "shadow_confirmed_extra" : v.category === "withheld_customer_payment" ? "builder_opened_case" : "approved_supplier_case";
        if (v.origin.kind !== required)
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Wrong origin" });
    }
    if (v.category === "merchant_overcharge" && ((v.mode === "cash_refund") !== (v.credit === null)))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Credit facts required only for credit" });
}).readonly().brand<"ShadowEligibilityFacts">();
export type ShadowEligibilityFacts = z.infer<typeof shadowEligibilityV1>;
export function createEligibilityFacts(raw: unknown): ShadowEligibilityFacts {
    const f = parseShadow(shadowEligibilityV1, raw), amount = parseExactPence(f.principalNet);
    if (amount.numerator < 0n)
        throw new ShadowDomainError("INVALID_SHADOW_INPUT");
    if (f.category === "missed_variation_final_account")
        assertAttributionBinding(f.attribution, f);
    if (f.category === "merchant_overcharge" && f.credit && compareExactPence(amount, exactPence(BigInt(f.credit.consumedNetPence))) !== 0)
        throw new ShadowDomainError("INVALID_SHADOW_INPUT");
    return f;
}
/** Proposed reference-policy evaluation, permanently disabled for production in this leaf. */
export function evaluateRecoveryEligibility(facts: ShadowEligibilityFacts) {
    const f = createEligibilityFacts(facts);
    let eligible = f.approvedCase && !f.unresolvedDispute && f.proof.status === "verified_settled";
    switch (f.category) {
        case "missed_variation_final_account":
            eligible = eligible && qualifiesAttribution(f.attribution);
            break;
        case "merchant_overcharge":
            eligible = eligible && (f.mode === "cash_refund" || (f.credit !== null && f.credit.laterInvoicePayment === "full" && f.credit.consumedNetPence >= 25000));
            break;
        case "duplicate_supplier_payment":
            eligible = eligible && f.doublePaymentEvidenced && f.refundForm === "cash";
            break;
        case "withheld_customer_payment":
            eligible = eligible && f.builderOpened && f.feeTermsApprovedBeforePursuit && f.overdue.thresholdMet && ["refused", "disputed", "ignored"].includes(f.ownReminderResponse) && f.paymentTiming === "after_opening" && f.proceeds === "customer_cash" && (f.component === "principal" || (f.component === "statutory_interest" && f.debtor === "business"));
            break;
        case "prevention":
            eligible = false;
            break;
    }
    return freezeShadow({ version: "shadow-eligibility-result.v1" as const, policyVersion: f.policyVersion, eligible, terminal: f.category === "prevention", productionEnabled: false as const, qualifyingPrincipal: eligible ? f.principalNet : serializeExactPence(exactPence(0n)), category: f.category, sourceRef: f.proof.sourceRef, originRef: f.origin.sourceRef, tenantId: f.tenantId, jobId: f.jobId, workId: f.workId, lineId: f.lineId });
}
