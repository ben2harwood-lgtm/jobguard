import { z } from "zod";
import { instantV1 } from "../receipt-allocation.js";
import { MAX_MONEY_PENCE } from "../money.js";
import { extraOriginV1 } from "../extra-origin.js";
export const shadowId = z.string().uuid();
export const shadowRef = z.string().min(1).max(300);
export const shadowBinding = { tenantId: shadowId, jobId: shadowId, workId: shadowId };
export const shadowAmount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const signalStates = ["candidate", "held_for_final_check", "reconciled", "revealed", "dismissed", "confirmed_extra", "attribution_disputed", "recovery_case_created", "surfaced_early"] as const;
export const reconciledOutcomes = ["already_in_original_scope", "builder_captured", "already_on_final_account", "duplicate_signal", "not_enough_evidence"] as const;
export const dismissalReasons = ["already_included", "in_original_scope", "not_completed", "not_chargeable", "wrong_job_or_evidence"] as const;
export const disclosureRoutes = ["must_surface_override", "support_conversation", "export", "data_subject_access", "defect", "tell_me_now", "trial_job_live", "paid_human_review", "drawing_review", "upgrade_bridge"] as const;
export const ineligibilityReasons = ["disclosed_before_lock", "surfaced_early", "evidence_after_lock", "pre_adoption_evidence", "attribution_disputed"] as const;
export const shadowIneligibilityV1 = z.object({ version: z.literal("shadow-ineligibility.v1"), reason: z.enum(ineligibilityReasons), sourceRef: shadowRef, at: instantV1, disclosureRoute: z.enum(disclosureRoutes).nullable().default(null) }).strict().readonly();
export const shadowEvidenceV1 = z.object({ version: z.literal("shadow-evidence.v1"), ...shadowBinding, signalId: shadowId, evidenceId: shadowId, objectVersionId: shadowRef, sha256: z.string().regex(/^[a-f0-9]{64}$/u), sourceReceivedAt: instantV1, lockTiming: z.enum(["before_lock", "after_lock"]), adoptionTiming: z.enum(["before_adoption", "after_adoption"]) }).strict().readonly();
export type ShadowEvidence = z.infer<typeof shadowEvidenceV1>;
export const shadowProposalShape = { version: z.literal("shadow-proposal.v1"), ...shadowBinding, signalId: shadowId, signalType: shadowRef, detectorKind: z.enum(["deterministic", "ai_proposal"]), detectorVersion: shadowRef, createdAt: instantV1, evidenceCutoffAt: instantV1, description: z.string().min(1).max(4000), estimatedValuePence: shadowAmount.nullable(), confidenceBand: z.enum(["low", "medium", "high"]), mustSurfaceNow: z.boolean(), evidence: z.array(shadowEvidenceV1).min(1).readonly() };
export const shadowProposalV1 = z.object(shadowProposalShape).strict().readonly();
export type ShadowProposal = z.infer<typeof shadowProposalV1>;
export class ShadowDomainError extends Error {
    constructor(public readonly code: "INVALID_SHADOW_INPUT" | "INVALID_TRANSITION" | "STALE_REVISION" | "SOURCE_BINDING_MISMATCH" | "DUPLICATE_IDENTITY") { super(code); this.name = "ShadowDomainError"; }
}
/** Parse first: Zod clones caller data. Deep freezing must never freeze the caller's objects. */
export type ShadowReadonly<T> = T extends string | number | bigint | boolean | null | undefined ? T : T extends readonly (infer U)[] ? readonly ShadowReadonly<U>[] : T extends object ? {
    readonly [K in keyof T]: ShadowReadonly<T[K]>;
} : T;
export function freezeShadow<T>(value: T): ShadowReadonly<T> {
    if (typeof value === "object" && value !== null) {
        for (const child of Object.values(value))
            freezeShadow(child);
        Object.freeze(value);
    }
    return value as ShadowReadonly<T>;
}
export function parseShadow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
    const p = schema.safeParse(raw);
    if (!p.success)
        throw new ShadowDomainError("INVALID_SHADOW_INPUT");
    freezeShadow(p.data);
    return p.data;
}
export function sameShadowBinding(a: {
    tenantId: string;
    jobId: string;
    workId: string;
}, b: {
    tenantId: string;
    jobId: string;
    workId: string;
}): boolean { return a.tenantId === b.tenantId && a.jobId === b.jobId && a.workId === b.workId; }
export function uniqueShadowIds(ids: readonly string[]): void { if (new Set(ids).size !== ids.length)
    throw new ShadowDomainError("DUPLICATE_IDENTITY"); }
/** A validated origin fact, separate from detector output. A brand is no authentication guarantee. */
export const shadowOriginV1 = extraOriginV1.refine(v => v.origin.jobTrack === "small_builder", "Small-builder origin required").readonly().brand<"ShadowOriginFact">();
export type ShadowOriginFact = ShadowReadonly<z.infer<typeof shadowOriginV1>>;
export const parseShadowOrigin = (raw: unknown): ShadowOriginFact => parseShadow(shadowOriginV1, raw);
/** Bind citations to an immutable inventory supplied by the server; a hash alone is not verification. */
export function validateShadowEvidence(raw: unknown, inventory: readonly ShadowEvidence[]): readonly ShadowEvidence[] {
    const links = parseShadow(z.array(shadowEvidenceV1).min(1).readonly(), raw);
    for (const link of links) {
        const found = inventory.filter(v => v.evidenceId === link.evidenceId && v.objectVersionId === link.objectVersionId);
        if (found.length !== 1 || JSON.stringify(found[0]) !== JSON.stringify(link)) {
            // Compare fields rather than object key insertion order.
            const exact = found.length === 1 && Object.entries(link).every(([k, v]) => Object.entries(found[0]!).some(([key, value]) => key === k && value === v));
            if (!exact)
                throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
        }
    }
    uniqueShadowIds(links.map(e => `${e.signalId}:${e.evidenceId}:${e.objectVersionId}`));
    return links;
}
