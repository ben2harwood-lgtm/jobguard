import { describe, expect, it } from "vitest";
import {
  calculateCumulativeFee, exactPence, parseExactPence, serializeExactPence, sumExactPence,
} from "./cumulative-fee.js";
import {
  assertRecoveryAllocationSplit, mapRecoveryReceiptToLines, parseRecoveryAllocationCommand,
  RecoveryAllocationError, recoveryAllocationCommandV1, sumRecoveryDeemedNet,
  type RecoveryDeemedLineAllocation, type RecoveryReceiptFacts,
} from "./recovery-allocation.js";

const before = "2026-10-01T12:00:00.000001Z";
const receiptAt = "2026-10-02T12:00:00.000001Z";
const after = "2026-10-03T12:00:00.000001Z";
const p = (value: number) => serializeExactPence(exactPence(BigInt(value)));
const line = (id: string, netPence: number, grossPence: number, existedAt = before, invoiceId = "blended") => ({
  id, invoiceId, existedAt, outstandingGross: p(grossPence), netPence, grossPence,
});
const composition = () => [line("main", 3_360_000, 4_032_000), line("catch-500", 50_000, 60_000), line("catch-300", 30_000, 36_000)];
const catches = ["catch-500", "catch-300"];
function facts(grossPence: number, lines = composition()): RecoveryReceiptFacts {
  return { version: "recovery-receipt-facts.v1", environment: "synthetic_demo", direction: "receipt", compositionComplete: true,
    receipt: { id: "saved-receipt", invoiceId: "blended", gross: p(grossPence), effectiveAt: receiptAt, sourceRef: "saved-movement:source-hash" },
    lines, explicit: null, separateInvoice: null };
}
const caught = (rows: readonly RecoveryDeemedLineAllocation[]) => sumRecoveryDeemedNet(rows, catches);
function remaining(lines: RecoveryReceiptFacts["lines"], rows: readonly RecoveryDeemedLineAllocation[]): RecoveryReceiptFacts["lines"] {
  return lines.map(l => {
    const allocated = rows.filter(row => row.lineId === l.id).map(row => {
      const gross = parseExactPence(row.gross);
      return exactPence(-gross.numerator, gross.denominator);
    });
    return { ...l, outstandingGross: serializeExactPence(sumExactPence([parseExactPence(l.outstandingGross), ...allocated])) };
  });
}
const cumulativeFee = (net: ReturnType<typeof caught>, priorNetPostedPence = 0) => calculateCumulativeFee({
  version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: "reference_fee_policy_v3", numerator: "1", denominator: "10" },
  cumulativeQualifyingPrincipal: net, priorNetPostedPence, priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: null,
});

describe("M4-8-S exact reference fixtures through the persisted-facts mapping", () => {
  it("F4 retains 2000000/43 pence on the catch lines with pro-rata rule and recorded source", () => {
    const rows = mapRecoveryReceiptToLines(facts(2_400_000));
    expect(caught(rows)).toEqual({ numerator: "2000000", denominator: "43" });
    expect(rows.every(row => row.rule === "pro_rata" && row.sourceRef === "saved-movement:source-hash")).toBe(true);
    expect(sumExactPence(rows.map(row => parseExactPence(row.gross)))).toEqual(exactPence(2_400_000n));
    expect(cumulativeFee(caught(rows)).cumulativeFee.pence).toBe(4651);
  });
  it("F4b sums the remaining receipt to exactly 80000/1 and the once-rounded additional fee to 3349", () => {
    const initial = facts(2_400_000), first = mapRecoveryReceiptToLines(initial);
    const second = mapRecoveryReceiptToLines(facts(1_728_000, remaining(initial.lines, first)));
    const cumulative = caught([...first, ...second]);
    expect(cumulative).toEqual(p(80_000));
    expect(cumulativeFee(cumulative, 4651).cumulativeFee.pence).toBe(8000);
    expect(cumulativeFee(cumulative, 4651).postingDelta.pence).toBe(3349);
  });
  it("F5 deposit never spreads to later catch lines; 1464000 against 2928000 yields 40000/1", () => {
    const lines = composition().map(l => ({ ...l, existedAt: catches.includes(l.id) ? after : before }));
    const depositFacts = facts(1_200_000, lines), deposit = mapRecoveryReceiptToLines(depositFacts);
    expect(caught(deposit)).toEqual(p(0));
    expect(deposit.map(row => row.lineId)).toEqual(["main"]);
    const postDeposit = remaining(lines, deposit);
    expect(sumExactPence(postDeposit.map(l => parseExactPence(l.outstandingGross)))).toEqual(exactPence(2_928_000n));
    const next = { ...facts(1_464_000, postDeposit), receipt: { ...facts(1_464_000).receipt, effectiveAt: "2026-10-04T12:00:00Z" } };
    expect(caught(mapRecoveryReceiptToLines(next))).toEqual(p(40_000));
    expect(cumulativeFee(caught(mapRecoveryReceiptToLines(next))).cumulativeFee.pence).toBe(4000);
  });
  it("F6 explicit non-catch remittance yields zero even when another rule would give a catch more", () => {
    const rows = mapRecoveryReceiptToLines({ ...facts(2_400_000),
      explicit: { sourceRef: "saved-remittance:non-catch-lines", shares: [{ lineId: "main", gross: p(2_400_000) }] },
      separateInvoice: { invoiceId: "blended", sourceRef: "saved-separate-settlement" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lineId: "main", rule: "explicit", sourceRef: "saved-remittance:non-catch-lines" });
    expect(caught(rows)).toEqual(p(0));
    expect(cumulativeFee(caught(rows)).cumulativeFee.pence).toBe(0);
  });
  it("F7 separate invoice settles the catches for 80000/1 and leaves the 4032000 main invoice untouched", () => {
    const lines = composition().map(l => ({ ...l, invoiceId: catches.includes(l.id) ? "supplementary" : "main-invoice" }));
    const base = facts(96_000, lines);
    const rows = mapRecoveryReceiptToLines({ ...base, receipt: { ...base.receipt, invoiceId: "supplementary" },
      separateInvoice: { invoiceId: "supplementary", sourceRef: "saved-separate-invoice" } });
    expect(rows.map(row => row.lineId)).toEqual(catches);
    expect(rows.every(row => row.rule === "separate_invoice" && row.sourceRef === "saved-separate-invoice")).toBe(true);
    expect(caught(rows)).toEqual(p(80_000));
    expect(remaining(lines, rows).find(l => l.id === "main")?.outstandingGross).toEqual(p(4_032_000));
    expect(cumulativeFee(caught(rows)).cumulativeFee.pence).toBe(8000);
  });
  it("split receipts give every line exactly the same net as one combined receipt with the same facts", () => {
    const base = facts(2_400_000), first = mapRecoveryReceiptToLines(base);
    const second = mapRecoveryReceiptToLines(facts(1_728_000, remaining(base.lines, first)));
    const combined = mapRecoveryReceiptToLines(facts(4_128_000));
    for (const l of base.lines) {
      expect(sumRecoveryDeemedNet([...first, ...second], [l.id])).toEqual(sumRecoveryDeemedNet(combined, [l.id]));
    }
  });
});

describe("M4-8-S fixed hierarchy, deposit cutoff and reversal mapping", () => {
  it.each(["pro_rata", "separate_invoice"] as const)("a deposit gives later lines zero under %s", rule => {
    const base = facts(60_000, [line("main", 100_000, 120_000), line("catch-500", 50_000, 60_000, after)]);
    const rows = mapRecoveryReceiptToLines({ ...base, separateInvoice: rule === "separate_invoice" ? { invoiceId: "blended", sourceRef: "separate" } : null });
    expect(caught(rows)).toEqual(p(0));
    expect(rows.map(row => row.lineId)).toEqual(["main"]);
    expect(rows[0]?.rule).toBe(rule);
  });
  it("explicit shares naming a later line are refused rather than silently redirected", () => {
    const base = facts(60_000, [line("main", 100_000, 120_000), line("catch-500", 50_000, 60_000, after)]);
    expect(() => mapRecoveryReceiptToLines({ ...base, explicit: { sourceRef: "remittance", shares: [{ lineId: "catch-500", gross: p(60_000) }] } })).toThrow("INVALID_ALLOCATION_FACTS");
    const rows = mapRecoveryReceiptToLines({ ...base, explicit: { sourceRef: "remittance", shares: [{ lineId: "main", gross: p(60_000) }] } });
    expect(caught(rows)).toEqual(p(0));
    expect(rows[0]?.rule).toBe("explicit");
  });
  it("server timestamps compare the exact microsecond without Date truncation", () => {
    const base = facts(60_000, [line("main", 100_000, 120_000), line("catch-500", 50_000, 60_000, "2026-10-02T12:00:00.000002Z")]);
    expect(caught(mapRecoveryReceiptToLines(base))).toEqual(p(0));
    expect(caught(mapRecoveryReceiptToLines({ ...base, receipt: { ...base.receipt, effectiveAt: "2026-10-02T12:00:00.000002Z" } }))).not.toEqual(p(0));
  });
  it.each(["refund", "credit"])("item-specific %s applies the named line first with its recorded source", kind => {
    const base = facts(24_000);
    const rows = mapRecoveryReceiptToLines({ ...base, direction: "reversal",
      explicit: { sourceRef: `saved-${kind}:item-specific`, shares: [{ lineId: "catch-500", gross: p(24_000) }] },
      separateInvoice: { invoiceId: "blended", sourceRef: "separate-fact" } });
    expect(rows).toEqual([{ lineId: "catch-500", rule: "explicit", sourceRef: `saved-${kind}:item-specific`, gross: p(-24_000), net: p(-20_000) }]);
  });
  it("unallocated refunds reverse pro-rata over the original settlement balances and ratios", () => {
    const base = facts(2_400_000), settled = mapRecoveryReceiptToLines(base);
    const lines = base.lines.map(l => ({ ...l, outstandingGross: settled.find(row => row.lineId === l.id)!.gross }));
    const rows = mapRecoveryReceiptToLines({ ...facts(1_200_000, lines), direction: "reversal" });
    expect(caught(rows)).toEqual({ numerator: "-1000000", denominator: "43" });
    expect(sumExactPence(rows.map(row => parseExactPence(row.gross)))).toEqual(exactPence(-1_200_000n));
    expect(() => mapRecoveryReceiptToLines({ ...facts(2_400_001, lines), direction: "reversal" })).toThrow("INVALID_ALLOCATION_FACTS");
  });
  it("reversal retains the original deposit cutoff even when the catch exists today", () => {
    const base = facts(60_000, [line("main", 100_000, 120_000), line("catch-500", 50_000, 60_000, after)]);
    expect(caught(mapRecoveryReceiptToLines({ ...base, direction: "reversal" }))).toEqual(p(0));
  });
  it.each([false, undefined])("an incomplete composition (%s) is quarantined", complete => {
    expect(() => mapRecoveryReceiptToLines({ ...facts(2_400_000), compositionComplete: complete })).toThrow("INVALID_ALLOCATION_FACTS");
  });
  it.each(["production", "pilot_no_charge"])("synthetic allocation facts cannot run in %s", environment => {
    expect(() => mapRecoveryReceiptToLines({ ...facts(2_400_000), environment })).toThrow("INVALID_ALLOCATION_FACTS");
  });
  it("malformed balances and incompatible source invoice fail with a typed allocation error", () => {
    expect(() => mapRecoveryReceiptToLines({ ...facts(2_400_000), lines: [{ ...composition()[0]!, outstandingGross: { numerator: "NaN", denominator: "1" } }] })).toThrow(RecoveryAllocationError);
    expect(() => mapRecoveryReceiptToLines({ ...facts(2_400_000), separateInvoice: { invoiceId: "other", sourceRef: "foreign-invoice" } })).toThrow("INVALID_ALLOCATION_FACTS");
  });
});

describe("M4-8-S exact case split and command boundaries", () => {
  const split = { grossPence: 38_400, eligibleNetPence: 32_000, taxPence: 6400, evidencedNetPence: 32_000, evidencedGrossPence: 38_400, claimRemainingNetPence: 32_000 };
  it("validates DW1 integer case splits without imposing an invented tax rounding rule", () => {
    expect(() => assertRecoveryAllocationSplit(split)).not.toThrow();
    expect(() => assertRecoveryAllocationSplit({ grossPence: 300_000, eligibleNetPence: 250_000, taxPence: 50_000, evidencedNetPence: 250_000, evidencedGrossPence: 300_000, claimRemainingNetPence: 250_000 })).not.toThrow();
  });
  it.each([
    { taxPence: 6399 }, { eligibleNetPence: 31_999, taxPence: 6401 }, { eligibleNetPence: 32_000.5 },
    { grossPence: 0 }, { grossPence: 1_000_000_000_001 }, { evidencedNetPence: 40_000 },
  ])("rejects inconsistent, fractional or out-of-range case split %j", patch => {
    expect(() => assertRecoveryAllocationSplit({ ...split, ...patch })).toThrow("INVALID_CASE_SPLIT");
  });
  it("rejects claim remainder and available evidenced net overflow", () => {
    expect(() => assertRecoveryAllocationSplit({ ...split, claimRemainingNetPence: 31_999 })).toThrow("ALLOCATION_EXCEEDS_CLAIM");
    expect(() => assertRecoveryAllocationSplit({ ...split, evidencedNetPence: 16_000, evidencedGrossPence: 19_200 })).toThrow("ALLOCATION_EXCEEDS_EVIDENCE");
  });
  const id = "00000000-0000-4000-8000-000000000001";
  const review = { version: "recovery-allocation-command.v1", action: "review", commandId: id, caseId: id, paymentId: id, evidenceId: id, expectedCaseRevision: 1, grossPence: 38_400 };
  it("strictly accepts all review, approval and reversal commands with exact hash binding", () => {
    expect(parseRecoveryAllocationCommand(review)).toEqual(review);
    expect(recoveryAllocationCommandV1.safeParse({ ...review, action: "allocate", approvalHash: "a".repeat(64) }).success).toBe(true);
    expect(recoveryAllocationCommandV1.safeParse({ ...review, remittanceEvidenceId: id }).success).toBe(true);
    const reverse = { version: review.version, action: "review_reverse", commandId: id, allocationId: id, expectedCaseRevision: 1, grossPence: 38_400 };
    expect(recoveryAllocationCommandV1.safeParse(reverse).success).toBe(true);
    expect(recoveryAllocationCommandV1.safeParse({ ...reverse, action: "reverse", approvalHash: "b".repeat(64) }).success).toBe(true);
    expect(recoveryAllocationCommandV1.safeParse({ ...reverse, creditNoteId: id }).success).toBe(true);
    expect(() => parseRecoveryAllocationCommand({ ...review, action: "allocate" })).toThrow("INVALID_COMMAND");
  });
  it.each(["tenantId", "reviewer", "eligibleNetPence", "taxPence", "rule", "rationals", "settlementState", "environment"])("refuses client supplied %s", field => {
    expect(() => parseRecoveryAllocationCommand({ ...review, [field]: "forged" })).toThrow("INVALID_COMMAND");
  });
  it.each([undefined, null, "", "not-a-uuid", 123])("requires a selected finalized evidence identity (%s)", evidenceId => {
    expect(() => parseRecoveryAllocationCommand({ ...review, evidenceId })).toThrow("INVALID_COMMAND");
    expect(() => parseRecoveryAllocationCommand({ ...review, action: "allocate", evidenceId, approvalHash: "a".repeat(64) })).toThrow("INVALID_COMMAND");
  });
  it.each([1.5, -1, 0, 1_000_000_000_001, Number.NaN, "38400"])("refuses invalid gross pence %s", grossPence => {
    expect(() => parseRecoveryAllocationCommand({ ...review, grossPence })).toThrow("INVALID_COMMAND");
  });
  it("DW9 own allocator delegates exact math, contains no deemed-amount rounding or fee derivation", async () => {
    // Core has no Node type dependency; this test-only runtime import keeps that boundary intact.
    const fileModule = "node:fs";
    const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
    const source = readFileSync(new URL("./recovery-allocation.ts", import.meta.url), "utf8");
    expect(source).toMatch(/allocateReceiptToLines\(\{/u);
    expect(source).not.toMatch(/\b(?:divideRounded|multiplyRatio|Math\.round|toFixed|calculateCumulativeFee)\s*\(/u);
    expect(source).not.toMatch(/\bNumber\s*\(/u);
    const f4 = caught(mapRecoveryReceiptToLines(facts(2_400_000)));
    expect(typeof f4.numerator).toBe("string");
    expect(typeof f4.denominator).toBe("string");
    expect(f4.denominator).toBe("43");
  });
});
