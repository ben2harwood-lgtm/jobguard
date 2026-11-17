import { z } from "zod";
import { addExactPence, calculateCumulativeFee, compareExactPence, exactPence, parseExactPence, serializeExactPence, sumExactPence, type ExactPence } from "../cumulative-fee.js";
import { allocateReceiptToLines, receiptAllocationV1, type ReceiptLineAllocation } from "../receipt-allocation.js";
import { money } from "../money.js";
import { createEligibilityFacts, evaluateRecoveryEligibility, shadowEligibilityV1, type ShadowEligibilityFacts } from "./eligibility.js";
import { freezeShadow, parseShadow, shadowAmount, ShadowDomainError, shadowId, shadowRef, uniqueShadowIds } from "./types.js";
const allocationEvent = z.object({ receipt: receiptAllocationV1, qualifyingLines: z.array(shadowEligibilityV1).readonly(), reversesSourceRef: shadowRef.nullable() }).strict().readonly();
const principalEntry = z.object({ facts: shadowEligibilityV1.refine(f => f.category !== "missed_variation_final_account", "Catch principal requires receipt-to-line allocation"), sourceRef: shadowRef, direction: z.enum(["recovery", "reversal"]), compensatesSourceRef: shadowRef.nullable() }).strict().readonly();
export const shadowSuccessFeeV1 = z.object({ version: z.literal("shadow-success-fee.v1"), environment: z.literal("synthetic_reference"), tenantId: shadowId, jobId: shadowId, policyVersion: z.literal("reference_fee_policy_v3"), derivationId: shadowId, allocationEvents: z.array(allocationEvent).readonly(), principalEntries: z.array(principalEntry).readonly(), priorNetPostedPence: shadowAmount, priorPolicyVersion: z.literal("reference_fee_policy_v3"), compensatesDerivationId: shadowId.nullable() }).strict().readonly().brand<"ShadowSuccessFeeInput">();
export type ShadowSuccessFeeInput = z.infer<typeof shadowSuccessFeeV1>;
export const createSuccessFeeInput = (raw: unknown): ShadowSuccessFeeInput => parseShadow(shadowSuccessFeeV1, raw);
const negate = (p: ExactPence) => exactPence(-p.numerator, p.denominator);
/**
 * SH-1 keeps its instant comparator private. Its explicit zero-share cutoff check accepts exactly
 * earlier <= later, including offsets and arbitrary fractional precision. This internal probe
 * contributes no money or source to the derivation and copies none of SH-1's timestamp logic.
 */
function assertReceiptOrder(earlier: string, later: string): void {
    try {
        const zero = { numerator: "0", denominator: "1" };
        allocateReceiptToLines({
            version: "receipt-allocation.v1", sourceRef: "shadow-internal-instant-order",
            receiptGross: zero, effectiveAt: later, direction: "receipt",
            invoiceId: "instant-order", separateInvoiceId: null,
            explicit: [{ lineId: "instant-order", gross: zero }],
            lines: [{ id: "instant-order", invoiceId: "instant-order", existedAt: earlier,
                outstandingGross: { numerator: "1", denominator: "1" }, netPence: 1, grossPence: 1 }],
        });
    } catch {
        throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
    }
}
/**
 * Reference proposals only. The complete invoice snapshots and verified source facts are caller responsibilities.
 * A persisted allocator must quarantine omitted lines; this pure adapter cannot discover an incomplete snapshot.
 * Reversals consume original settled balances and retain original ratios/cutoff, never today's outstanding balance.
 */
export function deriveShadowSuccessFee(input: ShadowSuccessFeeInput) {
    const f = createSuccessFeeInput(input), fail = (): never => { throw new ShadowDomainError("SOURCE_BINDING_MISMATCH"); };
    uniqueShadowIds([...f.allocationEvents.map(e => e.receipt.sourceRef), ...f.principalEntries.map(e => e.sourceRef)]);
    const validate = (raw: ShadowEligibilityFacts) => {
        const facts = createEligibilityFacts(raw);
        if (facts.tenantId !== f.tenantId || facts.jobId !== f.jobId)
            fail();
        return { facts, result: evaluateRecoveryEligibility(facts) };
    };
    const identity = (q: ShadowEligibilityFacts) => JSON.stringify([q.category, q.caseId, q.workId, q.lineId]);
    const principalIdentities = new Set(f.principalEntries.map(e => identity(e.facts)));
    if (f.allocationEvents.some(e => e.qualifyingLines.some(q => principalIdentities.has(identity(q)))))
        fail();
    type Original = {
        event: typeof f.allocationEvents[number];
        remaining: Map<string, ExactPence>;
        allocations: readonly ReceiptLineAllocation[];
    };
    const originals = new Map<string, Original>(), current = new Map<string, {
        line: typeof receiptAllocationV1._type.lines[number];
        remaining: ExactPence;
    }>();
    const allocations: ReceiptLineAllocation[] = [], terms: ExactPence[] = [], sources: string[] = [];
    const allocatedNet = new Map<string, ExactPence>();
    let lastReceiptAt: string | undefined;
    for (const event of f.allocationEvents) {
        const r = event.receipt;
        uniqueShadowIds(event.qualifyingLines.map(q => q.lineId));
        const qualified = event.qualifyingLines.map(validate);
        const byLine = new Map(qualified.map(q => [q.facts.lineId, q]));
        if (event.qualifyingLines.some(q => !r.lines.some(l => l.id === q.lineId && compareExactPence(parseExactPence(q.principalNet), exactPence(BigInt(l.netPence))) === 0)))
            fail();
        if (r.direction === "receipt") {
            if (event.reversesSourceRef !== null)
                fail();
            if (lastReceiptAt !== undefined)
                assertReceiptOrder(lastReceiptAt, r.effectiveAt);
            lastReceiptAt = r.effectiveAt;
            for (const line of r.lines) {
                const known = current.get(line.id);
                if (known && (known.line.invoiceId !== line.invoiceId || known.line.netPence !== line.netPence || known.line.grossPence !== line.grossPence || known.line.existedAt !== line.existedAt || compareExactPence(known.remaining, parseExactPence(line.outstandingGross)) !== 0))
                    fail();
            }
        }
        else {
            const original = originals.get(event.reversesSourceRef ?? "");
            if (!original)
                throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
            if (r.effectiveAt !== original.event.receipt.effectiveAt || r.invoiceId !== original.event.receipt.invoiceId || r.separateInvoiceId !== original.event.receipt.separateInvoiceId || JSON.stringify(event.qualifyingLines) !== JSON.stringify(original.event.qualifyingLines))
                fail();
            if (r.lines.length !== original.allocations.length)
                fail();
            for (const line of r.lines) {
                const originalLine = original.event.receipt.lines.find(l => l.id === line.id), remaining = original.remaining.get(line.id);
                if (!originalLine || !remaining || originalLine.netPence !== line.netPence || originalLine.grossPence !== line.grossPence || originalLine.existedAt !== line.existedAt || originalLine.invoiceId !== line.invoiceId || compareExactPence(remaining, parseExactPence(line.outstandingGross)) !== 0)
                    fail();
            }
        }
        // The hierarchy, ratios, time comparisons and all exact allocation are exclusively SH-1.
        const allocated = allocateReceiptToLines(r);
        allocations.push(...allocated);
        sources.push(r.sourceRef);
        for (const a of allocated) {
            const line = r.lines.find(l => l.id === a.lineId)!;
            const cumulative = addExactPence(allocatedNet.get(a.lineId) ?? exactPence(0n), a.net);
            if (compareExactPence(cumulative, exactPence(0n)) < 0 || compareExactPence(cumulative, exactPence(BigInt(line.netPence))) > 0)
                fail();
            allocatedNet.set(a.lineId, cumulative);
            const q = byLine.get(a.lineId);
            if (q?.result.eligible) {
                terms.push(a.net);
                sources.push(q.facts.proof.sourceRef, q.facts.origin.sourceRef);
            }
        }
        if (r.direction === "receipt") {
            for (const line of r.lines) {
                const a = allocated.find(a => a.lineId === line.id);
                current.set(line.id, { line, remaining: addExactPence(exactPence(BigInt(line.outstandingGross.numerator), BigInt(line.outstandingGross.denominator)), a ? negate(a.gross) : exactPence(0n)) });
            }
            originals.set(r.sourceRef, { event, remaining: new Map(allocated.map(a => [a.lineId, a.gross])), allocations: allocated });
        }
        else {
            const original = originals.get(event.reversesSourceRef ?? "")!;
            for (const a of allocated)
                original.remaining.set(a.lineId, addExactPence(original.remaining.get(a.lineId)!, a.gross));
        }
    }
    uniqueShadowIds(f.principalEntries.filter(e => e.direction === "recovery").map(e => e.facts.proof.sourceRef));
    const principalProofs = new Set(f.principalEntries.filter(e => e.direction === "recovery").map(e => e.facts.proof.sourceRef));
    if(f.allocationEvents.some(e => e.qualifyingLines.some(q => principalProofs.has(q.proof.sourceRef))))fail();
    const principalOriginals = new Map<string, {
        facts: ShadowEligibilityFacts;
        remaining: ExactPence;
    }>();
    for (const entry of f.principalEntries) {
        const q = validate(entry.facts), amount = parseExactPence(q.result.qualifyingPrincipal);
        sources.push(entry.sourceRef, q.facts.proof.sourceRef, q.facts.origin.sourceRef);
        if (entry.direction === "recovery") {
            if (entry.compensatesSourceRef !== null)
                fail();
            terms.push(amount);
            principalOriginals.set(entry.sourceRef, { facts: q.facts, remaining: amount });
        }
        else {
            const original = principalOriginals.get(entry.compensatesSourceRef ?? "");
            if (!original)
                throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
            if (JSON.stringify(original.facts) !== JSON.stringify(q.facts) || compareExactPence(amount, original.remaining) > 0)
                fail();
            terms.push(negate(amount));
            original.remaining = addExactPence(original.remaining, negate(amount));
        }
    }
    const Q = sumExactPence(terms);
    const calculated = calculateCumulativeFee({ version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: f.policyVersion, numerator: "10", denominator: "100" }, cumulativeQualifyingPrincipal: serializeExactPence(Q), priorNetPostedPence: f.priorNetPostedPence, priorPolicyVersion: f.priorPolicyVersion, compensatesDerivationId: f.compensatesDerivationId });
    return freezeShadow({ version: "shadow-success-fee-proposal.v1" as const, derivationId: f.derivationId, policyVersion: f.policyVersion, productionEnabled: false as const, Q, F: calculated.cumulativeFee, J: money(f.priorNetPostedPence), delta: calculated.postingDelta, roundingPolicy: calculated.roundingPolicy, compensatesDerivationId: calculated.compensatesDerivationId, compensationPrincipal: money(calculated.postingDelta.pence < 0 ? -calculated.postingDelta.pence : 0), journalProposal: calculated.postingDelta.pence === 0 ? "none" as const : calculated.postingDelta.pence < 0 ? "linked_compensation" as const : "requires_exact_proof_and_statement_approval" as const, allocations, sourceRefs: [...new Set(sources)] });
}
