import { z } from "zod";
import { freezeShadow, parseShadow, shadowRef } from "./types.js";
export const shadowMustSurfaceV1 = z.object({ version: z.literal("shadow-must-surface.v1"), policyVersion: z.literal("shadow_attribution_policy_v3"), safetyImplication: z.boolean(), customerClearlyRequested: z.boolean(), needsPriorWrittenAgreement: z.boolean(), significantWork: z.object({ version: z.literal("D13-significance.v1"), basis: z.enum(["synthetic_fixture", "evaluated_structured_predicate"]), sourceRef: shadowRef, significant: z.boolean() }).strict().readonly().optional(), activeDispute: z.boolean(), silenceMateriallyWorsensDispute: z.boolean(), disclosureDuty: z.boolean(), sourceRef: shadowRef }).strict().superRefine((f, ctx) => {
    if (f.customerClearlyRequested && f.needsPriorWrittenAgreement && f.significantWork === undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["significantWork"], message: "Rule 2 requires the evaluated significance fact" });
}).readonly();
/** No sends, Decisions or selected production threshold; callers supply the evaluated D13 fact. */
export function evaluateMustSurface(raw: unknown) {
    const f = parseShadow(shadowMustSurfaceV1, raw);
    const firedRules = ([
        ["safety", f.safetyImplication], ["prior_written_agreement", f.customerClearlyRequested && f.needsPriorWrittenAgreement && f.significantWork?.significant],
        ["worsening_dispute", f.activeDispute && f.silenceMateriallyWorsensDispute], ["disclosure_duty", f.disclosureDuty],
    ] as const).filter(([, fired]) => fired).map(([rule]) => ({ rule, version: f.policyVersion, sourceRef: f.sourceRef, policyFactRef: rule === "prior_written_agreement" ? f.significantWork!.sourceRef : null }));
    return freezeShadow({ version: "shadow-must-surface-result.v1" as const, firedRules, ineligibility: firedRules.length ? (["surfaced_early", "disclosed_before_lock"] as const).map(reason => ({ reason, ruleVersion: f.policyVersion, sourceRef: f.sourceRef })) : [] });
}
