import { describe, expect, it } from "vitest";
import { createSuccessFeeInput, deriveShadowSuccessFee } from "./success-fee.js";
import { attributionPredicates } from "./attribution.js";
import { addExactPence, exactPence, serializeExactPence, type ExactPence } from "../cumulative-fee.js";
import { type ReceiptAllocationInput } from "../receipt-allocation.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-03T00:00:00Z", before = "2026-10-01T00:00:00Z", after = "2026-10-04T00:00:00Z";
const pair = (p: number) => ({ numerator: String(p), denominator: "1" });
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4) };
const facts = (lineId = id(4), net = 80000, category = "missed_variation_final_account", changes: Record<string, unknown> = {}) => {
    const b = { ...binding, lineId };
    const common = { version: "shadow-eligibility.v1", policyVersion: "reference_recovery_eligibility_policy_v3", environment: "synthetic_reference", ...b, caseId: id(5), approvedCase: true, unresolvedDispute: false, proof: { version: "shadow-settlement-proof.v1", ...b, status: "verified_settled", sourceRef: `fixture://proof/${lineId}` }, origin: { version: "shadow-eligibility-origin.v1", ...b, kind: category === "missed_variation_final_account" ? "shadow_confirmed_extra" : category === "withheld_customer_payment" ? "builder_opened_case" : "approved_supplier_case", sourceRef: `fixture://origin/${lineId}` }, principalNet: pair(net) };
    const details = category === "missed_variation_final_account" ? { attribution: { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...b, lockId: id(7), revisionId: id(8), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map(predicate => [predicate, { version: "shadow-fact.v1", ...b, lockId: id(7), predicate, holds: true, sourceRef: `fixture://${predicate}` }])) } } : category === "merchant_overcharge" ? { mode: "cash_refund", credit: null } : category === "duplicate_supplier_payment" ? { doublePaymentEvidenced: true, refundForm: "cash" } : category === "withheld_customer_payment" ? { builderOpened: true, feeTermsApprovedBeforePursuit: true, overdue: { version: "D03-overdue.v1", basis: "synthetic_fixture", thresholdMet: true, sourceRef: "fixture://D03" }, ownReminderResponse: "ignored", paymentTiming: "after_opening", proceeds: "customer_cash", component: "principal", debtor: "business" } : {};
    return { ...common, category, ...details, ...changes };
};
const line = (lineId: string, net: number, gross: number, balance = gross, existedAt = before, invoiceId = "blended") => ({ id: lineId, invoiceId, netPence: net, grossPence: gross, outstandingGross: pair(balance), existedAt });
const receipt = (gross: number, lines: ReceiptAllocationInput["lines"], sourceRef = "fixture://receipt"): ReceiptAllocationInput => ({ version: "receipt-allocation.v1", sourceRef, receiptGross: pair(gross), effectiveAt: at, direction: "receipt", invoiceId: "blended", separateInvoiceId: null, explicit: null, lines });
const ev = (r: ReceiptAllocationInput, qs: unknown[] = [facts()], reversesSourceRef: string | null = null) => ({ receipt: r, qualifyingLines: qs, reversesSourceRef });
const input = (events: unknown[] = [], principals: unknown[] = [], prior = 0) => ({ version: "shadow-success-fee.v1", environment: "synthetic_reference", tenantId: id(1), jobId: id(2), policyVersion: "reference_fee_policy_v3", derivationId: id(20), allocationEvents: events, principalEntries: principals, priorNetPostedPence: prior, priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: prior ? id(21) : null });
const principal = (f: unknown, sourceRef = "fixture://principal", direction = "recovery", compensatesSourceRef: string | null = null) => ({ facts: f, sourceRef, direction, compensatesSourceRef });
const derive = (r: unknown) => deriveShadowSuccessFee(createSuccessFeeInput(r));
const check = (raw: unknown, q: number | ExactPence, f: number, delta: number) => { const out = derive(raw); expect(out.Q).toEqual(typeof q === "number" ? exactPence(BigInt(q)) : q); expect(out.F.pence).toBe(f); expect(out.delta.pence).toBe(delta); expect(out.J.pence).toBe(f - delta); expect(out).not.toHaveProperty("creditUsed"); expect(out.productionEnabled).toBe(false); expect(out.journalProposal).toBe(delta === 0 ? "none" : delta < 0 ? "linked_compensation" : "requires_exact_proof_and_statement_approval"); return out; };
const full = () => ev(receipt(96000, [line(id(4), 80000, 96000)]));
const blended = (gross: number, balanceMain = 4032000, balanceCatch = 96000, source = "fixture://receipt") => ev(receipt(gross, [line("baseline", 3360000, 4032000, balanceMain), line(id(4), 80000, 96000, balanceCatch)], source));
// Exact balance update using SH-1 helpers, not rounded pennies; property checks use the same eligible composition.
function advance(lines: ReceiptAllocationInput["lines"], allocations: readonly {
    lineId: string;
    gross: ExactPence;
}[]) { return lines.map(l => { const a = allocations.find(a => a.lineId === l.id); return { ...l, outstandingGross: a ? serializeExactPence(addExactPence(exactPence(BigInt(l.outstandingGross.numerator), BigInt(l.outstandingGross.denominator)), exactPence(-a.gross.numerator, a.gross.denominator))) : l.outstandingGross }; }); }
describe("SV-1 shadow domain", () => {
    const feeFixtures: readonly (readonly [
        string,
        () => void
    ])[] = [
        ["F1", () => { check(input([full()]), 80000, 8000, 8000); }],
        ["F2", () => { const first = ev(receipt(48000, [line(id(4), 80000, 96000)], "fixture://first")); first.receipt.explicit = [{ lineId: id(4), gross: pair(48000) }]; const out = check(input([first]), 40000, 4000, 4000); const second = ev({ ...receipt(48000, advance(first.receipt.lines, out.allocations), "fixture://second"), explicit: [{ lineId: id(4), gross: pair(48000) }] }); check(input([first, second], [], 4000), 80000, 8000, 4000); }],
        ["F3", () => { const original = full(); const reversal = ev({ ...receipt(24000, original.receipt.lines, "fixture://refund"), direction: "reversal", explicit: [{ lineId: id(4), gross: pair(24000) }] }, [facts()], original.receipt.sourceRef); check(input([original, reversal], [], 8000), 60000, 6000, -2000); }],
        ["F4", () => { check(input([blended(2400000)]), exactPence(2000000n, 43n), 4651, 4651); }],
        ["F4b", () => { const first = blended(2400000); const out = derive(input([first])); const second = ev(receipt(1728000, advance(first.receipt.lines, out.allocations), "fixture://rest")); check(input([first, second], [], 4651), 80000, 8000, 3349); }],
        ["F5", () => { const deposit = ev({ ...receipt(1200000, [line("baseline", 3360000, 4032000), line(id(4), 80000, 96000, 96000, after)], "fixture://deposit"), effectiveAt: at }); const payment = blended(1464000, 2832000, 96000, "fixture://after-lock"); payment.receipt.effectiveAt = after; payment.receipt.lines[1]!.existedAt = after; check(input([deposit, payment]), 40000, 4000, 4000); }],
        ["F6", () => { const e = blended(2400000); e.receipt.explicit = [{ lineId: "baseline", gross: pair(2400000) }]; check(input([e]), 0, 0, 0); }],
        ["F7", () => { const r = { ...receipt(96000, [line("baseline", 3360000, 4032000), line(id(4), 80000, 96000, 96000, before, "catch-invoice")]), invoiceId: "catch-invoice", separateInvoiceId: "catch-invoice" }; check(input([ev(r)]), 80000, 8000, 8000); }],
        ["F8", () => {
            // An invoiced catch with no settled cash: zero settlement observation, not a customer payment.
            const unpaid = ev(receipt(0, [line(id(4), 80000, 96000)], "fixture://unpaid-invoice"), [facts(id(4), 80000, "missed_variation_final_account", { proof: { version: "shadow-settlement-proof.v1", ...binding, status: "pending", sourceRef: "fixture://no-receipt" } })]);
            const out = check(input([unpaid]), 0, 0, 0);
            expect(unpaid.receipt.lines[0]?.outstandingGross).toEqual(pair(96000));
            expect(out.allocations).toEqual([]);
        }],
        ["F9", () => {
                for (const [q, f] of [[5, 0], [15, 2], [25, 2]])
                    check(input([ev(receipt(q!, [line(id(4), q!, q!)]), [facts(id(4), q!)])]), q!, f!, f!);
                const qs = [facts(id(4), 10)];
                const first = ev(receipt(5, [line(id(4), 10, 10)], "fixture://5a"), qs);
                const second = ev(receipt(5, [line(id(4), 10, 10, 5)], "fixture://5b"), qs);
                check(input([first]), 5, 0, 0);
                const out = check(input([first, second]), 10, 1, 1);
                expect(new Set(out.allocations.map(a => a.lineId))).toEqual(new Set([id(4)]));
            }],
        ["F10", () => { const first = principal(facts(id(4), 32000, "withheld_customer_payment"), "fixture://first"); check(input([], [first]), 32000, 3200, 3200); const second = ev(receipt(300000, [line(id(9), 250000, 300000)], "fixture://second"), [facts(id(9), 250000, "withheld_customer_payment")]); check(input([second], [first], 3200), 282000, 28200, 25000); }],
        ["F11", () => { const first = principal(facts(id(4), 32000, "withheld_customer_payment"), "fixture://first"); const original = ev(receipt(300000, [line(id(9), 250000, 300000)], "fixture://second"), [facts(id(9), 250000, "withheld_customer_payment")]); const reverse = ev({ ...original.receipt, direction: "reversal", sourceRef: "fixture://reversed" }, original.qualifyingLines, original.receipt.sourceRef); const out = check(input([original, reverse], [first], 28200), 32000, 3200, -25000); expect(out.compensatesDerivationId).toBe(id(21)); expect(out.compensationPrincipal.pence).toBe(25000); }],
        ["F12", () => { const c = facts(id(4), 360000); const a = c.attribution!; const falseCapture = { ...c, attribution: { ...a, facts: { ...a.facts, absent_from_builder_captures_at_lock: { ...a.facts.absent_from_builder_captures_at_lock, holds: false } } } }; check(input([ev(receipt(432000, [line(id(4), 360000, 432000)]), [falseCapture])]), 0, 0, 0); }],
        ["F13", () => { const r = receipt(4128000, [line("baseline", 3360000, 4032000), line(id(4), 50000, 60000), line(id(9), 30000, 36000)]); const out = check(input([ev(r, [facts(id(4), 50000), facts(id(9), 30000)])]), 80000, 8000, 8000); expect(out.Q.numerator - BigInt(out.F.pence)).toBe(72000n); }],
        ["F14", () => { const f = facts(id(4), 30000, "merchant_overcharge", { mode: "applied_credit", credit: { consumedNetPence: 30000, laterInvoiceId: id(9), laterInvoicePayment: "full", sourceRef: "fixture://credit" } }); check(input([], [principal(f)]), 30000, 3000, 3000); }],
        ["F15", () => { check(input([], [principal(facts(id(4), 20000, "merchant_overcharge", { mode: "applied_credit", credit: { consumedNetPence: 20000, laterInvoiceId: id(9), laterInvoicePayment: "full", sourceRef: "fixture://credit" } }))]), 0, 0, 0); }],
        ["F16", () => {
                for (const [payment, q, f] of [["partial", 0, 0], ["full", 30000, 3000]] as const)
                    check(input([], [principal(facts(id(4), 30000, "merchant_overcharge", { mode: "applied_credit", credit: { consumedNetPence: 30000, laterInvoiceId: id(9), laterInvoicePayment: payment, sourceRef: "fixture://credit" } }))]), q, f, f);
            }],
        ["F17", () => { check(input([ev(receipt(54000, [line(id(4), 45000, 54000)]), [facts(id(4), 45000, "duplicate_supplier_payment")])]), 45000, 4500, 4500); }],
        ["F18", () => { check(input([], [principal(facts(id(4), 250000, "withheld_customer_payment"), "fixture://principal"), principal(facts(id(9), 12000, "withheld_customer_payment", { component: "statutory_interest" }), "fixture://interest"), principal(facts(id(10), 7000, "withheld_customer_payment", { component: "fixed_compensation" }), "fixture://compensation")]), 262000, 26200, 26200); }],
        ["F19", () => { check(input([], [principal(facts(id(4), 250000, "withheld_customer_payment", { debtor: "individual" }), "fixture://principal"), principal(facts(id(9), 12000, "withheld_customer_payment", { component: "statutory_interest", debtor: "individual" }), "fixture://interest"), principal(facts(id(10), 7000, "withheld_customer_payment", { component: "fixed_compensation", debtor: "individual" }), "fixture://compensation")]), 250000, 25000, 25000); }],
        ["F20", () => { check(input([ev(receipt(38400, [line(id(4), 32000, 38400)]), [facts(id(4), 32000, "withheld_customer_payment", { paymentTiming: "before_opening" })])]), 0, 0, 0); }],
        ["F21", () => { check(input([], [principal(facts(id(4), 9000, "merchant_overcharge", { proof: { version: "shadow-settlement-proof.v1", ...binding, status: "unverified", sourceRef: "fixture://unpaid-reduction" } }))]), 0, 0, 0); }],
        ["F22", () => { check(input([], [principal(facts(id(4), 9000, "prevention"))]), 0, 0, 0); }],
        ["F23", () => { const out = check(input([full()]), 80000, 8000, 8000); const subscription = { settledPence: 6900, sourceRef: "fixture://subscription" }; expect(subscription.settledPence).toBe(6900); expect(out.F.pence).toBe(8000); expect(() => derive({ ...input([full()]), subscriptionOffset: 6900 })).toThrow(); }]
    ];
    it.each(feeFixtures)("%s", (_fixtureId, run) => run());
    it("round2 P-A2 refuses caller-supplied catch principal without allocation", () => {
        const allocated = check(input([blended(2400000)]), exactPence(2000000n, 43n), 4651, 4651);
        expect(allocated.F.pence).toBe(4651);
        expect(() => derive(input([], [principal(facts())]))).toThrow();
    });
    it("round2 P-A1 refuses catch identity through both routes despite proof aliases", () => {
        const aliased = facts(id(4), 80000, "missed_variation_final_account", {
            proof: { version: "shadow-settlement-proof.v1", ...binding, status: "verified_settled", sourceRef: "fixture://aliased-proof" }
        });
        expect(() => derive(input([full()], [principal(aliased)]))).toThrow();
    });
    it("round2 rejects non-catch qualifying identity through both routes despite proof aliases", () => {
        const q = facts(id(4), 80000, "withheld_customer_payment");
        const alias = { ...q, proof: { ...q.proof, sourceRef: "fixture://alias" } };
        expect(() => derive(input([ev(full().receipt, [q])], [principal(alias)]))).toThrow();
    });
    it("round2 P-A3 refuses one line reissued under a different invoice", () => {
        const other = ev({ ...receipt(96000, [line(id(4), 80000, 96000, 96000, before, "other-invoice")], "fixture://other"), invoiceId: "other-invoice" });
        expect(() => derive(input([full(), other]))).toThrow();
    });
    it.each([
        ["later first", "2026-10-03T00:00:01Z", at],
        ["submillisecond", "2026-10-03T00:00:00.000000002Z", "2026-10-03T00:00:00.000000001Z"],
        ["offset", "2026-10-03T00:00:00.000000002Z", "2026-10-03T01:00:00.000000001+01:00"],
        ["date boundary", "2026-10-03T00:00:00Z", "2026-10-03T00:59:59.999999999+01:00"]
    ])("round2 P-D2 refuses backwards receipt instants: %s", (_label, firstAt, secondAt) => {
        const lines = [line("baseline", 1000, 1000), line(id(4), 1000, 1000)], qs = [facts(id(4), 1000)];
        const later = ev({ ...receipt(500, lines, "fixture://later"), effectiveAt: firstAt!, explicit: [{ lineId: "baseline", gross: pair(500) }] }, qs);
        const earlier = ev({ ...receipt(1000, [line("baseline", 1000, 1000, 500), line(id(4), 1000, 1000)], "fixture://earlier"), effectiveAt: secondAt! }, qs);
        expect(() => derive(input([later, earlier]))).toThrow();
    });
    it("round2 receipt chronology accepts equal instants with offsets and fractional precision", () => {
        const first = ev({ ...receipt(48000, full().receipt.lines, "fixture://t1"), effectiveAt: "2026-10-03T00:00:00.123456789Z" });
        const second = ev({ ...receipt(48000, [line(id(4), 80000, 96000, 48000)], "fixture://t2"), effectiveAt: "2026-10-03T01:00:00.1234567890+01:00" });
        check(input([first, second]), 80000, 8000, 8000);
    });
    it("round2 reversal follows its original cutoff without rewinding receipt chronology", () => {
        const original = full();
        const later = ev({ ...receipt(1, [line(id(9), 1, 1)], "fixture://later"), effectiveAt: after }, [facts(id(9), 1)]);
        const refund = ev({ ...original.receipt, sourceRef: "fixture://refund", direction: "reversal", receiptGross: pair(24000) }, original.qualifyingLines, original.receipt.sourceRef);
        check(input([original, later, refund]), 60001, 6000, 6000);
        expect(() => derive(input([refund, original]))).toThrow();
        const backwards = ev(receipt(1, [line(id(10), 1, 1)], "fixture://backwards"), [facts(id(10), 1)]);
        expect(() => derive(input([original, later, refund, backwards]))).toThrow();
    });
    it("round2 explicit refund of a pro-rata receipt is item-specific first", () => {
        const original = blended(2064000), out = derive(input([original]));
        const settled = original.receipt.lines.map(l => ({ ...l, outstandingGross: serializeExactPence(out.allocations.find(a => a.lineId === l.id)!.gross) }));
        const refund = ev({ ...receipt(24000, settled, "fixture://explicit-refund"), direction: "reversal", explicit: [{ lineId: id(4), gross: pair(24000) }] }, original.qualifyingLines, original.receipt.sourceRef);
        const final = check(input([original, refund], [], 4000), 20000, 2000, -2000);
        expect(final.allocations.at(-1)?.rule).toBe("explicit");
    });
    it("round2 partial principal reversal uses full reversal then new sourced replacement", () => {
        const q = facts(id(4), 32000, "withheld_customer_payment"), original = principal(q);
        const replacement = facts(id(4), 24000, "withheld_customer_payment", { proof: { ...q.proof, sourceRef: "fixture://reduced-proof" } });
        check(input([], [original, principal(q, "fixture://reverse", "reversal", original.sourceRef), principal(replacement, "fixture://replacement")], 3200), 24000, 2400, -800);
        expect(() => derive(input([], [original, principal(q, "fixture://reverse", "reversal", original.sourceRef), principal(q, "fixture://excess", "reversal", original.sourceRef)]))).toThrow();
    });
    it("round2 reduced consumed credit below 25000p removes all qualifying principal", () => {
        const credit = { consumedNetPence: 30000, laterInvoiceId: id(9), laterInvoicePayment: "full", sourceRef: "fixture://credit" };
        const q = facts(id(4), 30000, "merchant_overcharge", { mode: "applied_credit", credit }), original = principal(q);
        const replacement = facts(id(4), 20000, "merchant_overcharge", { mode: "applied_credit", credit: { ...credit, consumedNetPence: 20000, sourceRef: "fixture://reduced-credit" }, proof: { ...q.proof, sourceRef: "fixture://reduced-proof" } });
        check(input([], [original, principal(q, "fixture://reverse", "reversal", original.sourceRef), principal(replacement, "fixture://replacement")], 3000), 0, 0, -3000);
    });
    it("round2 re-receipt after F11 refund currently fails closed for M4-8-S", () => {
        const q = [facts(id(9), 250000, "withheld_customer_payment")];
        const original = ev(receipt(300000, [line(id(9), 250000, 300000)], "fixture://F11"), q);
        const refund = ev({ ...original.receipt, direction: "reversal", sourceRef: "fixture://refund" }, q, original.receipt.sourceRef);
        const fresh = ev({ ...original.receipt, effectiveAt: after, sourceRef: "fixture://fresh-payment" }, q);
        expect(() => derive(input([original, refund, fresh]))).toThrow();
    });
    it.each(Array.from({ length: 10 }, (_value, batch) => batch))("splitting receipts preserves exact cumulative Q and F (batch %i)", batch => {
        let seed = 0x5101;
        const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        // Preserve all 100 original seeded cases and every assertion; bound each test's work.
        for (let draw = 0; draw < batch * 20; draw++) next();
        for (let round = 0; round < 10; round++) {
            const lines = [line(id(4), 1001, 1201), line(id(9), 743, 743), line("baseline", 666, 998)];
            const qs = [facts(id(4), 1001), facts(id(9), 743)];
            const total = 2 + next() % 2900, a = 1 + next() % (total - 1), b = total - a;
            const single = derive(input([ev(receipt(total, lines, "fixture://combined"), qs)]));
            const first = ev(receipt(a, lines, "fixture://split-a"), qs), mid = derive(input([first]));
            const second = ev(receipt(b, advance(lines, mid.allocations), "fixture://split-b"), qs);
            const final = derive(input([first, second], [], mid.F.pence));
            expect(final.Q).toEqual(single.Q);
            expect(final.F).toEqual(single.F);
            expect(mid.delta.pence + final.delta.pence).toBe(single.F.pence);
        }
    });
    it("equal-timestamp permutations preserve exact cumulative Q and F", () => {
        const amounts = [117, 293, 541];
        const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        let expected: ReturnType<typeof derive> | undefined;
        for (const order of permutations) {
            let lines = [line(id(4), 1001, 1201), line(id(9), 743, 743), line("baseline", 666, 998)];
            const qs = [facts(id(4), 1001), facts(id(9), 743)], events: ReturnType<typeof ev>[] = [];
            let j = 0, delta = 0;
            for (const index of order) {
                events.push(ev(receipt(amounts[index]!, lines, `fixture://equal-${index}`), qs));
                const result = derive(input(events, [], j));
                delta += result.delta.pence;
                j = result.F.pence;
                lines = advance(lines, result.allocations.filter(a => a.sourceRef === `fixture://equal-${index}`));
            }
            const result = derive(input(events));
            expect(delta).toBe(result.F.pence);
            if (expected) {
                expect(result.Q).toEqual(expected.Q);
                expect(result.F).toEqual(expected.F);
            }
            else
                expected = result;
        }
    });
    it("split deltas telescope against a nonzero initial posting", () => {
        const original = full(), initialJ = 1234;
        const out = check(input([original], [], initialJ), 80000, 8000, 6766);
        expect(out.delta.pence).toBe(out.F.pence - initialJ);
    });
    it("allocation hierarchy is independent of fee yield", () => {
        const e = blended(2400000);
        const pro = derive(input([e]));
        e.receipt.explicit = [{ lineId: "baseline", gross: pair(2400000) }];
        e.receipt.separateInvoiceId = "blended";
        const explicit = derive(input([e]));
        expect(pro.F.pence).toBeGreaterThan(explicit.F.pence);
        expect(explicit.allocations[0]).toMatchObject({ rule: "explicit", sourceRef: "fixture://receipt" });
        const separate = derive(input([ev({ ...receipt(96000, [line(id(4), 80000, 96000, 96000, before, "catch-invoice"), line("baseline", 3360000, 4032000)]), invoiceId: "catch-invoice", separateInvoiceId: "catch-invoice" })]));
        expect(separate.allocations[0]?.rule).toBe("separate_invoice");
        expect(separate.sourceRefs).toContain("fixture://receipt");
    });
    it("fractional instants and offsets exclude deposits before line creation", () => {
        for (const time of ["2026-10-03T00:00:00.000000001Z", "2026-10-03T01:00:00.000000001+01:00"]) {
            const e = ev(receipt(12000, [line("baseline", 100000, 120000), line(id(4), 80000, 96000, 96000, time)]));
            const out = check(input([e]), 0, 0, 0);
            expect(out.allocations.map(a => a.lineId)).toEqual(["baseline"]);
        }
    });
    it("refunds use original balances, ratios and cutoff, never today's outstanding", () => {
        const original = full();
        const reverse = ev({ ...original.receipt, sourceRef: "fixture://refund", direction: "reversal", receiptGross: pair(24000) }, original.qualifyingLines, original.receipt.sourceRef);
        check(input([original, reverse], [], 8000), 60000, 6000, -2000);
        for (const lines of [[line(id(4), 80000, 96000, 0)], [line(id(4), 70000, 96000)], [line(id(4), 80000, 96000, 96000, after)]])
            expect(() => derive(input([original, { ...reverse, receipt: { ...reverse.receipt, lines } }], [], 8000))).toThrow();
        expect(() => derive(input([original, { ...reverse, receipt: { ...reverse.receipt, effectiveAt: after } }], [], 8000))).toThrow();
    });
    it("mixed-ratio reversals preserve original paid proportions and reject excess or repeated refunds", () => {
        const lines = [line(id(4), 1001, 1201), line("baseline", 666, 998)];
        const q = [facts(id(4), 1001)];
        const original = ev(receipt(1200, lines, "fixture://original"), q), first = derive(input([original]));
        const settledLines = lines.map(l => ({ ...l, outstandingGross: serializeExactPence(first.allocations.find(a => a.lineId === l.id)!.gross) }));
        const refund = ev({ ...receipt(600, settledLines, "fixture://half-refund"), direction: "reversal" }, q, "fixture://original");
        const out = derive(input([original, refund]));
        expect(out.Q).toEqual(exactPence(first.Q.numerator, first.Q.denominator * 2n));
        expect(out.allocations.filter(a => a.sourceRef === "fixture://half-refund").every(a => a.rule === "pro_rata")).toBe(true);
        expect(() => derive(input([original, refund, { ...refund, receipt: { ...refund.receipt, sourceRef: "fixture://stale-refund" } }]))).toThrow();
        expect(() => derive(input([original, { ...refund, receipt: { ...refund.receipt, receiptGross: pair(1201) } }]))).toThrow();
    });
    it("negative and out-of-range Q are refused", () => {
        for (const principalNet of [{ numerator: "-1", denominator: "1" }, { numerator: "1000000000001", denominator: "1" }, { numerator: "1", denominator: "0" }, { numerator: "1.1", denominator: "1" }, { numerator: 9007199254740992, denominator: "1" }])
            expect(() => derive(input([], [principal(facts(id(4), 1, "merchant_overcharge", { principalNet }))]))).toThrow();
        expect(() => derive(input([], [principal(facts(id(4), 1, "merchant_overcharge"), "fixture://negative", "reversal", "fixture://missing")]))).toThrow();
        expect(() => derive(input([
            ev(receipt(1000000000000, [line(id(4), 1000000000000, 1000000000000)], "fixture://huge-a"), [facts(id(4), 1000000000000)]),
            ev(receipt(1, [line(id(9), 1, 1)], "fixture://huge-b"), [facts(id(9), 1)])
        ]))).toThrow("INVALID_SHARED_MONEY");
    });
    it("wrong policy, prior version, overpayment, pending proof, disputes and missing compensation link refuse or yield no positive proposal", () => {
        for (const changes of [{ policyVersion: "v1" }, { priorPolicyVersion: "v1" }, { priorNetPostedPence: 9007199254740992 }, { priorNetPostedPence: 1, compensatesDerivationId: null }])
            expect(() => derive({ ...input(), ...changes })).toThrow();
        expect(() => derive(input([ev(receipt(96001, [line(id(4), 80000, 96000)]))]))).toThrow();
        for (const changes of [{ unresolvedDispute: true }, { proof: { version: "shadow-settlement-proof.v1", ...binding, status: "pending", sourceRef: "fixture://pending" } }])
            check(input([ev(full().receipt, [facts(id(4), 80000, "missed_variation_final_account", changes)])]), 0, 0, 0);
        expect(() => derive(input([full(), full()]))).toThrow();
        expect(() => derive(input([], [principal(facts(id(4), 80000, "merchant_overcharge"), "fixture://alias-a"), principal(facts(id(4), 80000, "merchant_overcharge"), "fixture://alias-b")]))).toThrow();
        expect(() => derive(input([full()], [principal(facts())]))).toThrow();
    });
});
