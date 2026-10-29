import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { landingSuggestionV1, suggestLandingAllocations, type LandingSuggestionFacts } from "./landing-suggestions.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
function fixture(): LandingSuggestionFacts {
  const scope = { tenantId: uuid(1), jobId: uuid(2) };
  return { version: "landing-suggestion-facts.v1", environment: "synthetic_demo", ...scope, hasFinalizedProof: true,
    receipts: [{ ...scope, paymentId: uuid(3), invoiceId: uuid(4), movementId: uuid(5), movementIdentity: "sandbox-account:receipt-384", finalAccountRevisionId: uuid(6),
      invoiceNetPence: 1_880_000, invoiceGrossPence: 2_256_000, availablePence: 38_400,
      settledAt: "2026-10-29T10:00:00.000001Z", paidOn: "2026-10-29", issuedOn: "2026-10-01",
      counterparties: ["Fictional Customer"], held: false, reversed: false }],
    cases: [{ ...scope, caseId: uuid(7), revision: 3, state: "evidence_assembled", sourceRefs: [uuid(4)],
      counterparty: " Fictional   customer ", createdAt: "2026-10-29T10:00:00.000000Z",
      remainingNetPence: 32_000, evidencedRemainingNetPence: 32_000, eligibilityApproved: true }],
  };
}
describe("M4-8 dark deterministic landing suggestions", () => {
  it("suggests £320 and £2,500 with exact tax, requiring human review without changing facts", () => {
    const f = fixture();
    f.receipts.push({ ...f.receipts[0]!, paymentId: uuid(8), movementId: uuid(9), movementIdentity: "sandbox-account:receipt-3000", availablePence: 300_000 });
    f.cases.push({ ...f.cases[0]!, caseId: uuid(10), remainingNetPence: 250_000, evidencedRemainingNetPence: 250_000 });
    const before = JSON.stringify(f), rows = suggestLandingAllocations(f);
    expect(rows).toContainEqual({ caseId: uuid(7), paymentId: uuid(3), expectedCaseRevision: 3,
      grossPence: 38400, eligibleNetPence: 32000, taxPence: 6400, ambiguous: true, requiresHumanReview: true });
    expect(rows).toContainEqual({ caseId: uuid(10), paymentId: uuid(8), expectedCaseRevision: 3,
      grossPence: 300000, eligibleNetPence: 250000, taxPence: 50000, ambiguous: true, requiresHumanReview: true });
    expect(JSON.stringify(f)).toBe(before);
    expect(suggestLandingAllocations({ ...f, receipts: [...f.receipts].reverse(), cases: [...f.cases].reverse() })).toEqual(rows);
    expect(rows.every(row => landingSuggestionV1.safeParse(row).success)).toBe(true);
  });
  it("marks a sole candidate for human review too", () => {
    expect(suggestLandingAllocations(fixture())[0]).toMatchObject({ ambiguous: false, requiresHumanReview: true });
  });
  it.each(["held", "reversed"] as const)("blocks %s movements, including chargebacks/corrections awaiting reversal review", flag => {
    const f = fixture(); f.receipts[0]![flag] = true;
    expect(suggestLandingAllocations(f)).toEqual([]);
  });
  it("deduplicates replays and refuses cash represented by two payments or conflicting observations", () => {
    const f = fixture(), row = f.receipts[0]!;
    f.receipts.push({ ...row }); expect(suggestLandingAllocations(f)).toHaveLength(1);
    f.receipts.push({ ...row, paymentId: uuid(11) }); expect(suggestLandingAllocations(f)).toEqual([]);
    f.receipts = [row, { ...row, availablePence: 300000 }]; expect(suggestLandingAllocations(f)).toEqual([]);
    f.receipts = [row, { ...row, movementId: uuid(98), paymentId: uuid(97) }]; expect(suggestLandingAllocations(f)).toEqual([]);
  });
  it("deduplicates case replays and refuses conflicting claim revisions", () => {
    const f = fixture(); f.cases.push({ ...f.cases[0]! });
    expect(suggestLandingAllocations(f)).toHaveLength(1);
    f.cases.push({ ...f.cases[0]!, revision: 4 }); expect(suggestLandingAllocations(f)).toEqual([]);
  });
  it.each(["tenantId", "jobId"] as const)("does not link across %s even with identical references and amounts", field => {
    const f = fixture(); f.cases[0]![field] = uuid(99);
    expect(suggestLandingAllocations(f)).toEqual([]);
    f.cases = fixture().cases; f.receipts[0]![field] = uuid(99);
    expect(suggestLandingAllocations(f)).toEqual([]);
  });
  it("does not infer counterparties, invoice references, prior dates or unavailable proof", () => {
    for (const change of [
      (f: LandingSuggestionFacts) => { f.receipts[0]!.counterparties = []; },
      (f: LandingSuggestionFacts) => { f.receipts[0]!.counterparties.push("Another customer"); },
      (f: LandingSuggestionFacts) => { f.cases[0]!.counterparty = "Another customer"; },
      (f: LandingSuggestionFacts) => { f.cases[0]!.sourceRefs = [uuid(99)]; },
      (f: LandingSuggestionFacts) => { f.receipts[0]!.paidOn = "2026-09-30"; },
      (f: LandingSuggestionFacts) => { f.cases[0]!.createdAt = "2026-10-29T10:00:00.000002Z"; },
      (f: LandingSuggestionFacts) => { f.hasFinalizedProof = false; },
      (f: LandingSuggestionFacts) => { f.cases[0]!.eligibilityApproved = false; },
    ]) { const f = fixture(); change(f); expect(suggestLandingAllocations(f)).toEqual([]); }
  });
  it.each(["prevented", "closed_no_recovery", "closed_recovered", "landed", "identified"] as const)("does not suggest landing into %s", state => {
    const f = fixture(); f.cases[0]!.state = state; expect(suggestLandingAllocations(f)).toEqual([]);
  });
  it("caps partial/shared receipts at both cash and remaining approved principal with integral ratios", () => {
    const f = fixture(); f.receipts[0]!.availablePence = 19201;
    expect(suggestLandingAllocations(f)[0]).toMatchObject({ grossPence: 19200, eligibleNetPence: 16000, taxPence: 3200 });
    f.cases[0]!.evidencedRemainingNetPence = 10003;
    expect(suggestLandingAllocations(f)[0]).toMatchObject({ grossPence: 12000, eligibleNetPence: 10000, taxPence: 2000 });
    f.cases[0]!.remainingNetPence = 5000;
    expect(suggestLandingAllocations(f)[0]).toMatchObject({ grossPence: 6000, eligibleNetPence: 5000 });
    f.cases[0]!.remainingNetPence = 0; expect(suggestLandingAllocations(f)).toEqual([]);
  });
  it("handles the maximum amount exactly and refuses malformed money, live facts and landed shortcuts", () => {
    const f = fixture(); f.receipts[0]!.invoiceNetPence = MAX_MONEY_PENCE; f.receipts[0]!.invoiceGrossPence = MAX_MONEY_PENCE;
    f.receipts[0]!.availablePence = MAX_MONEY_PENCE; f.cases[0]!.remainingNetPence = MAX_MONEY_PENCE;
    f.cases[0]!.evidencedRemainingNetPence = MAX_MONEY_PENCE;
    expect(suggestLandingAllocations(f)[0]).toMatchObject({ grossPence: MAX_MONEY_PENCE, eligibleNetPence: MAX_MONEY_PENCE, taxPence: 0 });
    for (const value of [-1, 0.5, MAX_MONEY_PENCE + 1, Infinity]) {
      expect(() => suggestLandingAllocations({ ...f, receipts: [{ ...f.receipts[0], availablePence: value }] })).toThrow();
    }
    for (const extra of [{ environment: "production" }, { landed: true }, { hiddenSignalCount: 1 }]) {
      expect(() => suggestLandingAllocations({ ...f, ...extra })).toThrow();
    }
  });
  it("retains sub-millisecond precision and handles timezone-equivalent dates", () => {
    const f = fixture(); f.cases[0]!.createdAt = "2026-10-29T11:00:00.000001+01:00";
    expect(suggestLandingAllocations(f)).toHaveLength(1);
    f.cases[0]!.createdAt = "2026-10-29T11:00:00.0000011+01:00";
    expect(suggestLandingAllocations(f)).toEqual([]);
  });
});
