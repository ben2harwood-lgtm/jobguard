import { describe, expect, it } from "vitest";
import { classifyShadowSource, matchBuilderCapture } from "./capture.js";
import { coalesceShadowSignals, createShadowSignal, transitionShadowSignal } from "./signal.js";
import { shadowEvidenceV1, validateShadowEvidence } from "./types.js";
import { attributionPredicates, createAttributionFacts, qualifiesAttribution } from "./attribution.js";
import { createSuccessFeeInput, deriveShadowSuccessFee } from "./success-fee.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3) }, at = "2026-10-03T00:00:00Z";
const evidence = (n = 6, signalId = id(4)) => shadowEvidenceV1.parse({ version: "shadow-evidence.v1", ...binding, signalId, evidenceId: id(n), objectVersionId: `fictional-object-${n}`, sha256: "a".repeat(64), sourceReceivedAt: "2026-10-01T00:00:00Z", lockTiming: "before_lock", adoptionTiming: "after_adoption" });
const make = (signalId = id(4), e = evidence()) => createShadowSignal({ version: "shadow-proposal.v1", ...binding, signalId, signalType: "possible_extra", detectorKind: "deterministic", detectorVersion: "fixture.v1", createdAt: "2026-10-02T00:00:00Z", evidenceCutoffAt: "2026-10-01T00:00:00Z", description: "fitted outside tap", estimatedValuePence: null, confidenceBand: "high", mustSurfaceNow: false, evidence: [e] }, { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, [e]);
const refs = { lockedLineIds: [id(10)], baselineItemIds: [id(11)] };
const held = () => transitionShadowSignal(make(), { version: "shadow-event.v1", ...binding, signalId: id(4), expectedRevision: 0, type: "hold", phase: "pre_lock", lockId: null, at, sourceRef: "fixture://hold" }, refs);
const revealed = () => transitionShadowSignal(held(), { version: "shadow-event.v1", ...binding, signalId: id(4), expectedRevision: 1, type: "reveal", phase: "post_lock", lockId: id(5), at, sourceRef: "fixture://reveal" }, refs);
const act = (type: string, extra: Record<string, unknown> = {}) => transitionShadowSignal(revealed(), { version: "shadow-event.v1", ...binding, signalId: id(4), expectedRevision: 2, type, phase: "post_lock", lockId: id(5), at, sourceRef: "fixture://human", ...extra }, refs);
const match = { version: "shadow-match.v1", tenantId: id(1), jobId: id(2), scopeArea: "garden", description: "fitted outside tap", dateCompatibility: "unknown", valueCompatibility: "unknown", ruleVersion: "builder-favourable-match.v1" };
const capture = (kind: string, state: string | null) => ({ version: "shadow-capture.v1", tenantId: id(1), jobId: id(2), id: id(12), scopeItemId:id(12), revisionId:id(23), serverRecordedAt:"2026-10-01T00:00:00Z", valuePence:null, kind, state, scopeArea: "garden", description: "outside tap", recordedPhase: "pre_lock", aiStructured: true, sourceRef: `fixture://capture/${kind}/${state}` });
const attribution = (paid = true) => createAttributionFacts({ version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, lineId: id(10), lockId: id(5), revisionId: id(13), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map(predicate => [predicate, { version: "shadow-fact.v1", ...binding, lineId: id(10), lockId: id(5), predicate, holds: predicate === "customer_payment_settled_and_allocated_to_that_line" ? paid : true, sourceRef: `fixture://${predicate}` }])) });
const fee = (gross: number, main = 0, separate = false, refund = 0) => {
    const b = { ...binding, lineId: id(10) }, facts = { version: "shadow-eligibility.v1", policyVersion: "reference_recovery_eligibility_policy_v3", environment: "synthetic_reference", ...b, caseId: id(14), category: "missed_variation_final_account", approvedCase: true, unresolvedDispute: false, principalNet: { numerator: "80000", denominator: "1" }, proof: { version: "shadow-settlement-proof.v1", ...b, status: "verified_settled", sourceRef: "fixture://receipt-proof" }, origin: { version: "shadow-eligibility-origin.v1", ...b, kind: "shadow_confirmed_extra", sourceRef: "fixture://origin" }, attribution: attribution() };
    const catchInvoice = separate ? "catch" : "blended", lines = [{ id: id(10), invoiceId: catchInvoice, existedAt: "2026-10-01T00:00:00Z", outstandingGross: { numerator: "96000", denominator: "1" }, netPence: 80000, grossPence: 96000 }, ...(main ? [{ id: "baseline", invoiceId: "blended", existedAt: "2026-10-01T00:00:00Z", outstandingGross: { numerator: String(main), denominator: "1" }, netPence: 3360000, grossPence: main }] : [])];
    const receipt = { version: "receipt-allocation.v1", sourceRef: "fixture://receipt", receiptGross: { numerator: String(gross), denominator: "1" }, effectiveAt: at, direction: "receipt", invoiceId: catchInvoice, separateInvoiceId: separate ? "catch" : null, explicit: null, lines };
    const events = [{ receipt, qualifyingLines: [facts], reversesSourceRef: null }, ...(refund ? [{ receipt: { ...receipt, sourceRef: "fixture://refund", direction: "reversal", receiptGross: { numerator: String(refund), denominator: "1" }, explicit: [{ lineId: id(10), gross: { numerator: String(refund), denominator: "1" } }] }, qualifyingLines: [facts], reversesSourceRef: "fixture://receipt" }] : [])];
    return deriveShadowSuccessFee(createSuccessFeeInput({ version: "shadow-success-fee.v1", environment: "synthetic_reference", tenantId: id(1), jobId: id(2), policyVersion: "reference_fee_policy_v3", derivationId: id(15), allocationEvents: events, principalEntries: [], priorNetPostedPence: refund ? 8000 : 0, priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: refund ? id(16) : null }));
};
describe("SV-1 shadow domain", () => {
    it("labelled A–R pure scenarios meet omission and unsupported-addition expectations", () => {
        const rows: {
            label: string;
            expected: string;
            actual: string;
            sourceRefs: string[];
        }[] = [];
        const row = (label: string, expected: string, actual: string, sourceRefs: string[]) => rows.push({ label, expected, actual, sourceRefs });
        for (const [label, kind, state] of [["A", "log_extra", "approved"], ["B", "final_review", null], ["D", "baseline", null], ["P", "log_extra", "draft"]] as const) {
            const r = matchBuilderCapture(match, [capture(kind, state)]);
            row(label, label === "D" ? "already_in_original_scope" : "builder_captured", r.outcome, r.references.map(r => r.sourceRef));
        }
        // Draft, rejected and withdrawn all appear in this explicit deterministic gate.
        for (const state of ["draft", "rejected", "withdrawn"])
            expect(matchBuilderCapture(match, [capture("log_extra", state)]).outcome).toBe("builder_captured");
        const c = revealed();
        row("C", "revealed", c.state, c.evidence.map(e => e.evidenceId));
        expect(qualifiesAttribution(attribution())).toBe(true);
        expect(fee(96000).F.pence).toBe(8000);
        const e = act("dismiss", { reason: "not_completed", referenceId: null });
        row("E", "dismissed", e.state, e.evidence.map(e => e.evidenceId));
        const f = attribution(false);
        row("F", "fee_free", qualifiesAttribution(f) ? "qualifies" : "fee_free", attributionPredicates.map(p => f.facts[p].sourceRef));
        const g = fee(48000);
        row("G", "4000", String(g.F.pence), [...g.sourceRefs]);
        const h = fee(96000, 0, false, 24000);
        row("H", "-2000", String(h.delta.pence), [...h.sourceRefs]);
        const early = transitionShadowSignal(make(), { version: "shadow-event.v1", ...binding, signalId: id(4), expectedRevision: 0, type: "disclose", phase: "pre_lock", lockId: null, at, sourceRef: "fixture://D13", route: "must_surface_override" }, refs);
        row("I", "surfaced_early", early.state, early.ineligibility.map(e => e.sourceRef));
        const other = make(id(17), evidence(18, id(17))), coalesced = coalesceShadowSignals(make(), other, { version: "shadow-coalescing.v1", ...binding, sameWork: true, sourceRef: "fixture://J", expectedPrimaryRevision: 0, expectedDuplicateRevision: 0 });
        const third = make(id(21), evidence(22, id(21))), all = coalesceShadowSignals(coalesced.primary, third, { version: "shadow-coalescing.v1", ...binding, sameWork: true, sourceRef: "fixture://J/photo", expectedPrimaryRevision: coalesced.primary.revision, expectedDuplicateRevision: 0 });
        row("J", "duplicate_signal", all.duplicate.outcome!, all.primary.evidence.map(e => e.evidenceId));
        expect(all.primary.evidence).toHaveLength(3);
        expect(new Set([all.primary.workId, coalesced.duplicate.workId, all.duplicate.workId]).size).toBe(1);
        const k = act("dismiss", { reason: "already_included", referenceId: id(10) });
        row("K", "dismissed", k.state, [k.dismissal!.referenceId!]);
        expect(act("dismiss", { reason: "already_included", referenceId: id(19) }).state).toBe("attribution_disputed");
        const late = evidence();
        const l = make(id(4), shadowEvidenceV1.parse({ ...late, lockTiming: "after_lock" }));
        row("L", "evidence_after_lock", l.ineligibility[0]!.reason, l.ineligibility.map(e => e.sourceRef));
        const m = fee(2400000, 4032000);
        row("M", "4651", String(m.F.pence), [...m.sourceRefs]);
        const n = fee(96000, 4032000, true);
        row("N", "8000", String(n.F.pence), [...n.sourceRefs]);
        const o = make();
        row("O", "unmatched", matchBuilderCapture(match, []).outcome, o.evidence.map(e => e.evidenceId));
        expect(classifyShadowSource({ version: "shadow-source.v1", kind: "diary", state: null, recordedPhase: "pre_lock", aiStructured: false })).toBe("evidence");
        // Q has no pure equivalent: actual role denial and response indistinguishability belong to SV-2.
        row("Q", "SV-2 required; not evaluated", "SV-2 required; not evaluated", []);
        let rIneligible = false;
        const rSources: string[] = [];
        for (const route of ["support_conversation", "export", "data_subject_access"]) {
            const r = transitionShadowSignal(make(), { version: "shadow-event.v1", ...binding, signalId: id(4), expectedRevision: 0, type: "disclose", phase: "pre_lock", lockId: null, at, sourceRef: `fixture://R/${route}`, route }, refs);
            expect(r.disclosedBeforeLock).toBe(true);
            rSources.push(...r.ineligibility.map(e => e.sourceRef));
            rIneligible = !qualifiesAttribution(createAttributionFacts({ ...attribution(), exclusions: r.ineligibility }));
            expect(rIneligible).toBe(true);
        }
        row("R", "permanently_ineligible", rIneligible ? "permanently_ineligible" : "qualifies", rSources);
        rows.sort((a, b) => a.label < b.label ? -1 : 1);
        expect(rows.map(r => r.label).join("")).toBe("ABCDEFGHIJKLMNOPQR");
        const omitted = rows.filter(r => ["A", "B", "D", "P"].includes(r.label) && r.actual !== r.expected).length, unsupported = rows.filter(r => r.label !== "Q" && r.actual !== r.expected).length;
        expect(omitted).toBe(0);
        expect(unsupported).toBe(0);
        const expectedSources = new Set([id(6), id(18), id(22), id(10), "fixture://receipt", "fixture://refund", "fixture://receipt-proof", "fixture://origin", "fixture://D13", ...attributionPredicates.map(p => `fixture://${p}`), ...["support_conversation", "export", "data_subject_access"].map(r => `fixture://R/${r}`), ...[["log_extra", "approved"], ["final_review", null], ["baseline", null], ["log_extra", "draft"]].map(([kind, state]) => `fixture://capture/${kind}/${state}`)]);
        validateShadowEvidence([evidence()], [evidence()]);
        for (const r of rows) {
            if(r.label === "Q")continue;
            expect(r.actual, r.label).toBe(r.expected);
            expect(r.sourceRefs.length, r.label).toBeGreaterThan(0);
            if (r.label !== "Q")
                expect(r.sourceRefs.every(ref => expectedSources.has(ref)), r.label).toBe(true);
        }
        for (const changes of [{ scopeArea: "roof" }, { description: "install electrical socket" }, { jobId: id(99) }])
            expect(matchBuilderCapture({ ...match, ...changes }, [capture("log_extra", "draft")]).outcome).toBe("unmatched");
        console.info("SV-1 deterministic A–R outcomes", JSON.stringify(rows));
    });
    it("evaluation rejects unsupported citations and cross-job sources", () => {
        const good = evidence();
        for (const changes of [{ evidenceId: id(99) }, { objectVersionId: "fabricated" }, { sha256: "b".repeat(64) }, { jobId: id(99) }, { tenantId: id(99) }])
            expect(() => validateShadowEvidence([{ ...good, ...changes }], [good])).toThrow();
        expect(validateShadowEvidence([good], [good])).toEqual([good]);
    });
    it("ambiguous date and value matches favour builder capture", () => { for (const dateCompatibility of ["compatible", "unknown"])
        for (const valueCompatibility of ["compatible", "unknown"])
            expect(matchBuilderCapture({ ...match, dateCompatibility, valueCompatibility }, [capture("log_extra", "withdrawn")]).outcome).toBe("builder_captured"); });
});
