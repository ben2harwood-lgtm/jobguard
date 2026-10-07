import { z } from "zod";
import { instantV1 } from "../receipt-allocation.js";
import { disclosureRoutes, dismissalReasons, freezeShadow, ineligibilityReasons, parseShadow, reconciledOutcomes, sameShadowBinding, shadowBinding, ShadowDomainError, shadowEvidenceV1, shadowId, shadowIneligibilityV1, shadowProposalV1, shadowProposalShape, shadowRef, signalStates, validateShadowEvidence, type ShadowEvidence } from "./types.js";
export const shadowPhaseV1 = z.object({ version: z.literal("shadow-phase.v1"), phase: z.enum(["pre_lock", "post_lock"]), lockId: shadowId.nullable() }).strict().refine(v => (v.phase === "pre_lock") === (v.lockId === null));
export const shadowSignalV1 = z.object({
    ...shadowProposalShape, version: z.literal("shadow-signal.v1"), revision: z.number().int().nonnegative(), state: z.enum(signalStates), lockId: shadowId.nullable(), disclosedBeforeLock: z.boolean(), firstBuilderVisibleAt: instantV1.nullable(),
    outcome: z.enum(reconciledOutcomes).nullable(), matchReferenceId: shadowId.nullable(), dismissal: z.object({ reason: z.enum(dismissalReasons), referenceId: shadowId.nullable() }).strict().readonly().nullable(),
    coalescedIntoSignalId: shadowId.nullable(), humanReviewRef: shadowRef.nullable(), ineligibility: z.array(shadowIneligibilityV1).readonly(),
}).strict().refine(v => !v.disclosedBeforeLock || (v.firstBuilderVisibleAt !== null && v.ineligibility.some(r => r.reason === "disclosed_before_lock")), "Disclosure needs immutable provenance").refine(v => v.disclosedBeforeLock === v.ineligibility.some(r => r.reason === "disclosed_before_lock"), "Disclosure is monotonic").refine(v => v.state !== "surfaced_early" || v.disclosedBeforeLock).readonly();
export type ShadowSignal = z.infer<typeof shadowSignalV1>;
const eventBase = z.object({ version: z.literal("shadow-event.v1"), ...shadowBinding, signalId: shadowId, expectedRevision: z.number().int().nonnegative(), phase: z.enum(["pre_lock", "post_lock"]), lockId: shadowId.nullable(), at: instantV1, sourceRef: shadowRef });
const dismissalFields = { reason: z.enum(dismissalReasons), referenceId: shadowId.nullable() };
export const shadowEventV1 = z.discriminatedUnion("type", [
    eventBase.extend({ type: z.literal("hold") }).strict(), eventBase.extend({ type: z.literal("reveal") }).strict(), eventBase.extend({ type: z.literal("reconcile"), outcome: z.enum(reconciledOutcomes), referenceId: shadowId.nullable() }).strict(),
    eventBase.extend({ type: z.literal("dismiss"), ...dismissalFields }).strict(), eventBase.extend({ type: z.literal("confirm"), humanReviewRef: z.null() }).strict(), eventBase.extend({ type: z.literal("dispute") }).strict(),
    eventBase.extend({ type: z.literal("human_confirm"), humanReviewRef: shadowRef }).strict(), eventBase.extend({ type: z.literal("human_dismiss"), ...dismissalFields, humanReviewRef: shadowRef }).strict(),
    eventBase.extend({ type: z.literal("mark_recovery_case") }).strict(), eventBase.extend({ type: z.literal("disclose"), route: z.enum(disclosureRoutes) }).strict(),
]).refine(v => (v.phase === "pre_lock") === (v.lockId === null)).readonly();
const referencesV1 = z.object({ lockedLineIds: z.array(shadowId).readonly(), baselineItemIds: z.array(shadowId).readonly() }).strict();
export function createShadowSignal(raw: unknown, phaseRaw: unknown, inventory: readonly ShadowEvidence[]): ShadowSignal {
    const p = parseShadow(shadowProposalV1, raw), phase = parseShadow(shadowPhaseV1, phaseRaw);
    validateShadowEvidence(p.evidence, inventory);
    if (p.evidence.some(e => !sameShadowBinding(e, p) || e.signalId !== p.signalId))
        throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
    const ineligibility: z.infer<typeof shadowIneligibilityV1>[] = [];
    const add = (reason: typeof ineligibilityReasons[number], sourceRef: string) => ineligibility.push({ version: "shadow-ineligibility.v1", reason, sourceRef, at: p.createdAt, disclosureRoute: reason === "disclosed_before_lock" || reason === "surfaced_early" ? "must_surface_override" : null });
    if (phase.phase === "post_lock" || p.evidence.some(e => e.lockTiming === "after_lock"))
        add("evidence_after_lock", p.evidence[0]!.evidenceId);
    if (p.evidence.some(e => e.adoptionTiming === "before_adoption"))
        add("pre_adoption_evidence", p.evidence.find(e => e.adoptionTiming === "before_adoption")!.evidenceId);
    if (p.mustSurfaceNow && phase.phase === "pre_lock") {
        add("surfaced_early", "must_surface_override");
        add("disclosed_before_lock", "must_surface_override");
    }
    return parseShadow(shadowSignalV1, { ...p, version: "shadow-signal.v1", revision: 0, state: p.mustSurfaceNow && phase.phase === "pre_lock" ? "surfaced_early" : phase.phase === "post_lock" ? "revealed" : "candidate", lockId: phase.lockId, disclosedBeforeLock: p.mustSurfaceNow && phase.phase === "pre_lock", firstBuilderVisibleAt: p.mustSurfaceNow || phase.phase === "post_lock" ? p.createdAt : null, outcome: null, matchReferenceId: null, dismissal: null, coalescedIntoSignalId: null, humanReviewRef: null, ineligibility });
}
/** State proposals only; commands/persistence own every commercial effect. */
export function transitionShadowSignal(raw: unknown, eventRaw: unknown, referencesRaw: unknown): ShadowSignal {
    const s = parseShadow(shadowSignalV1, raw), e = parseShadow(shadowEventV1, eventRaw), refs = parseShadow(referencesV1, referencesRaw);
    if (!sameShadowBinding(s, e) || s.signalId !== e.signalId)
        throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
    if (s.revision !== e.expectedRevision)
        throw new ShadowDomainError("STALE_REVISION");
    const fail = (): never => { throw new ShadowDomainError("INVALID_TRANSITION"); };
    if (s.lockId !== null && s.lockId !== e.lockId)
        fail();
    let next = { ...s, revision: s.revision + 1 };
    const reason = (name: typeof ineligibilityReasons[number]) => ({ version: "shadow-ineligibility.v1" as const, reason: name, sourceRef: e.sourceRef, at: e.at, disclosureRoute: e.type === "disclose" ? e.route : null });
    if (e.type === "disclose") {
        if (e.phase !== "pre_lock")
            fail();
        next = { ...next, state: "surfaced_early", disclosedBeforeLock: true, firstBuilderVisibleAt: s.firstBuilderVisibleAt ?? e.at, ineligibility: [...s.ineligibility, reason("disclosed_before_lock"), reason("surfaced_early")] };
    }
    else {
        if (s.state === "surfaced_early")
            fail();
        if (e.type === "hold") {
            if (s.state !== "candidate" || e.phase !== "pre_lock")
                fail();
            next.state = "held_for_final_check";
        }
        else {
            if (e.phase !== "post_lock")
                fail();
            next.lockId = e.lockId;
            switch (e.type) {
                case "reveal":
                    if (s.state !== "held_for_final_check")
                        fail();
                    next.state = "revealed";
                    next.firstBuilderVisibleAt = e.at;
                    break;
                case "reconcile": {
                    if (s.state !== "held_for_final_check")
                        fail();
                    if (e.outcome !== "not_enough_evidence" && e.referenceId === null)
                        fail();
                    if (e.outcome === "already_in_original_scope" && !refs.baselineItemIds.includes(e.referenceId ?? ""))
                        fail();
                    if (e.outcome === "already_on_final_account" && !refs.lockedLineIds.includes(e.referenceId ?? ""))
                        fail();
                    next = { ...next, state: "reconciled", outcome: e.outcome, matchReferenceId: e.referenceId };
                    break;
                }
                case "dismiss":
                case "human_dismiss": {
                    if (e.type === "dismiss" ? s.state !== "revealed" : s.state !== "attribution_disputed")
                        fail();
                    if (e.type === "human_dismiss")
                        next.humanReviewRef = e.humanReviewRef;
                    const matched = e.reason === "already_included" ? refs.lockedLineIds.includes(e.referenceId ?? "") : e.reason === "in_original_scope" ? refs.baselineItemIds.includes(e.referenceId ?? "") : true;
                    next = { ...next, state: matched ? "dismissed" : "attribution_disputed", dismissal: matched ? { reason: e.reason, referenceId: e.referenceId } : null, ineligibility: matched ? s.ineligibility : [...s.ineligibility, reason("attribution_disputed")] };
                    break;
                }
                case "confirm":
                    if (s.state !== "revealed")
                        fail();
                    next.state = "confirmed_extra";
                    break;
                case "human_confirm":
                    if (s.state !== "attribution_disputed")
                        fail();
                    next.state = "confirmed_extra";
                    next.humanReviewRef = e.humanReviewRef;
                    break;
                case "dispute":
                    if (s.state !== "revealed")
                        fail();
                    next = { ...next, state: "attribution_disputed", ineligibility: [...s.ineligibility, reason("attribution_disputed")] };
                    break;
                case "mark_recovery_case":
                    if (s.state !== "confirmed_extra")
                        fail();
                    next.state = "recovery_case_created";
                    break;
            }
        }
    }
    return parseShadow(shadowSignalV1, next);
}
export function coalesceShadowSignals(primaryRaw: unknown, duplicateRaw: unknown, factsRaw: unknown): Readonly<{
    primary: ShadowSignal;
    duplicate: ShadowSignal;
}> {
    const a = parseShadow(shadowSignalV1, primaryRaw), b = parseShadow(shadowSignalV1, duplicateRaw);
    const f = parseShadow(z.object({ version: z.literal("shadow-coalescing.v1"), ...shadowBinding, sameWork: z.literal(true), sourceRef: shadowRef, expectedPrimaryRevision: z.number().int().nonnegative(), expectedDuplicateRevision: z.number().int().nonnegative() }).strict(), factsRaw);
    if (!sameShadowBinding(a, b) || !sameShadowBinding(a, f) || a.signalId === b.signalId || a.lockId !== b.lockId || a.coalescedIntoSignalId !== null || b.coalescedIntoSignalId !== null)
        throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
    if (a.revision !== f.expectedPrimaryRevision || b.revision !== f.expectedDuplicateRevision)
        throw new ShadowDomainError("STALE_REVISION");
    // Once revealed/reconciled, dispositions and recovery history cannot be rewritten as duplicates.
    const mergeable = (s: ShadowSignal) => ["candidate", "held_for_final_check", "surfaced_early"].includes(s.state);
    if (!mergeable(a) || !mergeable(b))
        throw new ShadowDomainError("INVALID_TRANSITION");
    const byIdentity = new Map<string, ShadowEvidence>();
    for (const e of [...a.evidence, ...b.evidence]) {
        const key = `${e.signalId}:${e.evidenceId}:${e.objectVersionId}`;
        const previous = byIdentity.get(key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(e))
            throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
        byIdentity.set(key, e);
    }
    const ineligibility = [...a.ineligibility, ...b.ineligibility];
    const disclosedBeforeLock = a.disclosedBeforeLock || b.disclosedBeforeLock;
    return freezeShadow({ primary: parseShadow(shadowSignalV1, { ...a, revision: a.revision + 1, evidence: [...byIdentity.values()], ineligibility, disclosedBeforeLock, firstBuilderVisibleAt: a.firstBuilderVisibleAt ?? b.firstBuilderVisibleAt, state: disclosedBeforeLock ? "surfaced_early" : a.state }), duplicate: parseShadow(shadowSignalV1, { ...b, revision: b.revision + 1, state: disclosedBeforeLock ? "surfaced_early" : "reconciled", outcome: "duplicate_signal", coalescedIntoSignalId: a.signalId, ineligibility, disclosedBeforeLock, firstBuilderVisibleAt: b.firstBuilderVisibleAt ?? a.firstBuilderVisibleAt }) });
}
