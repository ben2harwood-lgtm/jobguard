import { describe, expect, it } from "vitest";
import { createEligibilityFacts, evaluateRecoveryEligibility } from "./eligibility.js";
import { createAttributionFacts, attributionPredicates } from "./attribution.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4) };
const base = { version: "shadow-eligibility.v1", policyVersion: "reference_recovery_eligibility_policy_v3", environment: "synthetic_reference", ...binding, caseId: id(5), approvedCase: true, unresolvedDispute: false, proof: { version: "shadow-settlement-proof.v1", ...binding, status: "verified_settled", sourceRef: "fixture://settlement" }, origin: { version: "shadow-eligibility-origin.v1", ...binding, kind: "approved_supplier_case", sourceRef: "fixture://origin" }, principalNet: { numerator: "30000", denominator: "1" } };
const merchant = (mode = "cash_refund", changes: Record<string, unknown> = {}) => ({ ...base, category: "merchant_overcharge", mode, credit: mode === "applied_credit" ? { consumedNetPence: 30000, laterInvoiceId: id(9), laterInvoicePayment: "full", sourceRef: "fixture://credit" } : null, ...changes });
const withheld = (changes: Record<string, unknown> = {}) => ({ ...base, origin: { ...base.origin, kind: "builder_opened_case" }, category: "withheld_customer_payment", builderOpened: true, feeTermsApprovedBeforePursuit: true, overdue: { version: "D03-overdue.v1", basis: "synthetic_fixture", thresholdMet: true, sourceRef: "fixture://D03" }, ownReminderResponse: "ignored", paymentTiming: "after_opening", proceeds: "customer_cash", component: "principal", debtor: "business", ...changes });
const eligible = (raw: unknown) => evaluateRecoveryEligibility(createEligibilityFacts(raw));
describe("SV-1 shadow domain", () => {
    it("D03 v3 rejects non-qualifying categories and pending facts", () => {
        expect(eligible(merchant()).eligible).toBe(true);
        for (const change of [{ approvedCase: false }, { unresolvedDispute: true }, { proof: { ...base.proof, status: "pending" } }, { proof: { ...base.proof, status: "unverified" } }, { mode: "unpaid_bill_reduction" }]) {
            const raw = merchant("cash_refund", change);
            if (change.mode)
                expect(() => eligible(raw)).toThrow();
            else
                expect(eligible(raw).eligible).toBe(false);
        }
        for (const change of [{ category: "insurer_proceeds" }, { category: "unknown" }, { environment: "production" }, { origin: { ...base.origin, kind: "ai_proposal" } }, { proof: { ...base.proof, jobId: id(10) } }, { policyVersion: "v1" }])
            expect(() => eligible(merchant("cash_refund", change))).toThrow();
    });
    it("applied credits require consumption, a fully paid later invoice and 25000p per case", () => {
        for (const [pence, payment, expected] of [[24999, "full", false], [25000, "full", true], [25001, "full", true], [0, "full", false], [30000, "partial", false], [30000, "unpaid", false]] as const) {
            const out = eligible(merchant("applied_credit", { principalNet: { numerator: String(pence), denominator: "1" }, credit: { consumedNetPence: pence, laterInvoiceId: id(9), laterInvoicePayment: payment, sourceRef: "fixture://credit" } }));
            expect(out.eligible, `${pence} ${payment}`).toBe(expected);
            expect(out.productionEnabled).toBe(false);
        }
    });
    it("evidenced duplicate payments must be refunded in cash", () => {
        const raw = { ...base, category: "duplicate_supplier_payment", doublePaymentEvidenced: true, refundForm: "cash" };
        expect(eligible(raw).eligible).toBe(true);
        for (const changes of [{ doublePaymentEvidenced: false }, { refundForm: "future_credit" }])
            expect(eligible({ ...raw, ...changes }).eligible).toBe(false);
    });
    it("withheld cases require builder opening, prior terms, evaluated overdue policy and own reminder", () => {
        expect(eligible(withheld()).eligible).toBe(true);
        for (const changes of [{ builderOpened: false }, { feeTermsApprovedBeforePursuit: false }, { overdue: { ...withheld().overdue, thresholdMet: false } }, { ownReminderResponse: "normal_reminder" }, { ownReminderResponse: "ordinary_lateness" }, { paymentTiming: "before_opening" }, { proceeds: "insurer" }, { component: "retention" }])
            expect(eligible(withheld(changes)).eligible).toBe(false);
        for (const ownReminderResponse of ["refused", "disputed", "ignored"])
            expect(eligible(withheld({ ownReminderResponse })).eligible).toBe(true);
        for (const overdue of [null, undefined, { version: "D03-overdue.v1", thresholdDays: 30 }])
            expect(() => eligible(withheld({ overdue }))).toThrow();
    });
    it("interest counts only inside a builder-opened business case when actually paid; compensation never counts", () => {
        expect(eligible(withheld({ component: "statutory_interest" })).eligible).toBe(true);
        for (const changes of [{ debtor: "individual", component: "statutory_interest" }, { component: "fixed_compensation" }, { component: "statutory_interest", builderOpened: false }, { component: "statutory_interest", proof: { ...base.proof, status: "pending" } }])
            expect(eligible(withheld(changes)).eligible).toBe(false);
    });
    it("missed variation requires all attribution conjuncts and a matching immutable origin", () => {
        const a = { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, lockId: id(7), revisionId: id(8), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map(predicate => [predicate, { version: "shadow-fact.v1", ...binding, lockId: id(7), predicate, holds: true, sourceRef: `fixture://${predicate}` }])) };
        const raw = { ...base, category: "missed_variation_final_account", origin: { ...base.origin, kind: "shadow_confirmed_extra" }, attribution: createAttributionFacts(a) };
        expect(eligible(raw).eligible).toBe(true);
        expect(eligible({ ...raw, attribution: createAttributionFacts({ ...a, facts: { ...a.facts, [attributionPredicates[0]]: { ...a.facts[attributionPredicates[0]], holds: false } } }) }).eligible).toBe(false);
        expect(() => eligible({ ...raw, attribution: createAttributionFacts({ ...a, lineId: id(10), facts: Object.fromEntries(Object.entries(a.facts).map(([k, v]) => [k, { ...v, lineId: id(10) }])) }) })).toThrow();
    });
    it("prevention is terminal and always zero", () => { const out = eligible({ ...base, category: "prevention" }); expect(out).toMatchObject({ eligible: false, terminal: true, qualifyingPrincipal: { numerator: "0", denominator: "1" } }); });
});
