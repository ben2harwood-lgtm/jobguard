import { describe, expect, it } from "vitest";
import { createShadowSignal, transitionShadowSignal, coalesceShadowSignals, shadowSignalV1, shadowEventV1 } from "./signal.js";
import { disclosureRoutes, signalStates, reconciledOutcomes, dismissalReasons } from "./types.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3) };
const evidence = (n = 6) => ({ version: "shadow-evidence.v1", ...binding, signalId: id(4), evidenceId: id(n), objectVersionId: `v${n}`, sha256: "a".repeat(64), sourceReceivedAt: "2026-10-01T00:00:00Z", lockTiming: "before_lock", adoptionTiming: "after_adoption" } as const);
const proposal = (n = 4) => ({ version: "shadow-proposal.v1", ...binding, signalId: id(n), signalType: "possible_extra", detectorKind: "ai_proposal", detectorVersion: "fixture.v1", createdAt: "2026-10-02T00:00:00Z", evidenceCutoffAt: "2026-10-01T00:00:00Z", description: "outside tap", estimatedValuePence: null, confidenceBand: "low", mustSurfaceNow: false, evidence: [{ ...evidence(), signalId: id(n) }] });
const make = () => createShadowSignal(proposal(), { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, [evidence()]);
const event = (type: string, phase = "post_lock", extra: Record<string, unknown> = {}) => ({ version: "shadow-event.v1", ...binding, signalId: id(4), expectedRevision: 0, type, phase, lockId: phase === "post_lock" ? id(5) : null, at: "2026-10-03T00:00:00Z", sourceRef: "fixture://human-command", ...extra });
const state = (name: string) => shadowSignalV1.parse({ ...make(), state: name, lockId: name === "candidate" || name === "held_for_final_check" || name === "surfaced_early" ? null : id(5), disclosedBeforeLock: name === "surfaced_early", firstBuilderVisibleAt: name === "surfaced_early" ? "2026-10-02T00:00:00Z" : null, ineligibility: name === "surfaced_early" ? [{ version: "shadow-ineligibility.v1", reason: "disclosed_before_lock", sourceRef: "fixture://old", at: "2026-10-02T00:00:00Z" }] : [] });
describe("SV-1 shadow domain", () => {
    it("full allowed and forbidden state-event table", () => {
        const events = [event("hold", "pre_lock"), event("reconcile", "post_lock", { outcome: "not_enough_evidence", referenceId: null }), event("reveal"), event("dismiss", "post_lock", { reason: "not_completed", referenceId: null }), event("confirm", "post_lock", { humanReviewRef: null }), event("dispute"), event("human_confirm", "post_lock", { humanReviewRef: "fixture://review" }), event("human_dismiss", "post_lock", { reason: "not_completed", referenceId: null, humanReviewRef: "fixture://review" }), event("mark_recovery_case"), event("disclose", "pre_lock", { route: "support_conversation" })];
        const allowed: Record<string, string[]> = { candidate: ["hold", "disclose"], held_for_final_check: ["reconcile", "reveal", "disclose"], revealed: ["dismiss", "confirm", "dispute", "disclose"], attribution_disputed: ["human_confirm", "human_dismiss", "disclose"], confirmed_extra: ["mark_recovery_case", "disclose"], recovery_case_created: ["disclose"], reconciled: ["disclose"], dismissed: ["disclose"], surfaced_early: ["disclose"] };
        for (const name of signalStates)
            for (const e of events) {
                const s = state(name);
                const valid = allowed[name]?.includes(e.type) && !(e.phase === "pre_lock" && s.lockId !== null);
                if (valid)
                    expect(() => transitionShadowSignal(s, e, { lockedLineIds: [], baselineItemIds: [] })).not.toThrow();
                else
                    expect(() => transitionShadowSignal(s, e, { lockedLineIds: [], baselineItemIds: [] })).toThrow();
            }
    });
    it("every reconciled outcome and dismissal reason preserves exact references", () => {
        for (const outcome of reconciledOutcomes) {
            const ref = outcome === "not_enough_evidence" ? null : id(7);
            expect(transitionShadowSignal(state("held_for_final_check"), event("reconcile", "post_lock", { outcome, referenceId: ref }), { lockedLineIds: [id(7)], baselineItemIds: [id(7)] }).outcome).toBe(outcome);
        }
        for (const reason of dismissalReasons) {
            const ref = reason === "already_included" || reason === "in_original_scope" ? id(7) : null;
            expect(transitionShadowSignal(state("revealed"), event("dismiss", "post_lock", { reason, referenceId: ref }), { lockedLineIds: [id(7)], baselineItemIds: [id(7)] }).dismissal?.reason).toBe(reason);
        }
        for (const reason of ["already_included", "in_original_scope"])
            expect(transitionShadowSignal(state("revealed"), event("dismiss", "post_lock", { reason, referenceId: id(8) }), { lockedLineIds: [id(7)], baselineItemIds: [id(7)] }).state).toBe("attribution_disputed");
    });
    it("signal transitions never create authoritative commercial effects", () => {
        let s = transitionShadowSignal(make(), event("hold", "pre_lock"), { lockedLineIds: [], baselineItemIds: [] });
        for (const e of [event("reveal"), event("confirm", "post_lock", { humanReviewRef: null }), event("mark_recovery_case")])
            s = transitionShadowSignal(s, { ...e, expectedRevision: s.revision }, { lockedLineIds: [], baselineItemIds: [] });
        expect(s.state).toBe("recovery_case_created");
        for (const key of ["variation", "invoiceLine", "debt", "journal", "fee", "authority", "recoveryCase"])
            expect(s).not.toHaveProperty(key);
    });
    it("early surfacing and disclosure cannot be undone", () => {
        let s = make();
        for (const route of disclosureRoutes) {
            s = transitionShadowSignal(s, { ...event("disclose", "pre_lock", { route }), expectedRevision: s.revision }, { lockedLineIds: [], baselineItemIds: [] });
            expect(s.disclosedBeforeLock).toBe(true);
        }
        expect(s.ineligibility.filter(r => r.reason === "disclosed_before_lock")).toHaveLength(disclosureRoutes.length);
        for (const type of ["hold", "reveal", "confirm", "human_confirm", "mark_recovery_case"])
            expect(() => transitionShadowSignal(s, { ...event(type, "post_lock", { humanReviewRef: "fixture://review" }), expectedRevision: s.revision }, { lockedLineIds: [], baselineItemIds: [] })).toThrow();
    });
    it("a serialized disclosure cannot be relabelled as an undisclosed signal", () => {
        const early = transitionShadowSignal(make(), event("disclose", "pre_lock", { route: "export" }), { lockedLineIds: [], baselineItemIds: [] });
        expect(shadowSignalV1.safeParse({ ...early, disclosedBeforeLock: false }).success).toBe(false);
    });
    it("disclosure preserves a maximum-length source reference and records the route separately", () => {
        const e = { ...event("disclose", "pre_lock", { route: "data_subject_access" }), sourceRef: "x".repeat(300) };
        const early = transitionShadowSignal(make(), e, { lockedLineIds: [], baselineItemIds: [] });
        expect(early.ineligibility.at(-1)).toMatchObject({ sourceRef: e.sourceRef, disclosureRoute: "data_subject_access" });
    });
    it("refuses stale revisions, wrong identities and phase facts without mutation", () => {
        const s = make(), before = JSON.stringify(s);
        for (const changes of [{ expectedRevision: 3 }, { jobId: id(9) }, { signalId: id(9) }, { phase: "post_lock", lockId: null }, { extraAuthority: true }])
            expect(() => transitionShadowSignal(s, { ...event("hold", "pre_lock"), ...changes }, { lockedLineIds: [], baselineItemIds: [] })).toThrow();
        expect(JSON.stringify(s)).toBe(before);
        expect(Object.isFrozen(s.evidence[0])).toBe(true);
        expect(shadowEventV1.safeParse({ ...event("human_confirm"), humanReviewRef: null }).success).toBe(false);
    });
    it("post-lock creations and pre-adoption evidence remain excluded", () => {
        const e = { ...evidence(), lockTiming: "after_lock", adoptionTiming: "before_adoption" } as const;
        const s = createShadowSignal({ ...proposal(), evidence: [e] }, { version: "shadow-phase.v1", phase: "post_lock", lockId: id(5) }, [e]);
        expect(s.state).toBe("revealed");
        expect(s.ineligibility.map(r => r.reason)).toEqual(expect.arrayContaining(["evidence_after_lock", "pre_adoption_evidence"]));
    });
    it("J coalesces duplicate evidence under one work identity without creating uniqueness", () => {
        const a = make(), p = proposal(8), b = createShadowSignal(p, { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, p.evidence);
        const result = coalesceShadowSignals(a, b, { version: "shadow-coalescing.v1", ...binding, sameWork: true, sourceRef: "fixture://same-work" });
        expect(result.primary.evidence).toHaveLength(2);
        expect(result.duplicate.coalescedIntoSignalId).toBe(a.signalId);
        expect(result.duplicate.workId).toBe(a.workId);
        expect(Object.isFrozen(result.primary.evidence)).toBe(true);
        expect(() => coalesceShadowSignals(a, b, { version: "shadow-coalescing.v1", ...binding, workId: id(9), sameWork: true, sourceRef: "fixture://wrong" })).toThrow();
    });
});
