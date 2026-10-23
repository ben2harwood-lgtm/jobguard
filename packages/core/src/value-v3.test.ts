import { describe, expect, it } from "vitest";
import { valueReceiptV3, formatValueMoney, VALUE_V3_LABELS } from "./value-v3.js";
import { illustrativeValueCases } from "./value-v3.fixtures.js";

describe("CH9-S illustrative contract only (not producer/source proof)", () => {
  it("S01: parses five groups; checked has no money and jobs have no subscription", () => {
    const input = illustrativeValueCases.shadow;
    expect(valueReceiptV3.parse(input).categories).toHaveLength(5);
    expect(valueReceiptV3.safeParse({ ...input, categories: [{ ...input.categories[0], money: { pence: 1, currency: "GBP" } }, ...input.categories.slice(1)] }).success).toBe(false);
    expect(valueReceiptV3.safeParse({ ...input, subscription: {} }).success).toBe(false);
    expect(valueReceiptV3.safeParse({ ...input, categories: [...input.categories, input.categories[0]] }).success).toBe(false);
  });
  it("S03: unknown/incomplete cannot masquerade as known zero", () => {
    for (const state of ["unknown", "incomplete"] as const) {
      const input = structuredClone(illustrativeValueCases.zero);
      input.categories[4]!.qualifying = { state, reason: "source_unavailable" };
      expect(valueReceiptV3.safeParse(input).success).toBe(false); // dependent known fee must also be unavailable
      input.categories[4]!.fee = { state, reason: "source_unavailable" };
      input.categories[4]!.remainder = { state, reason: "source_unavailable" };
      expect(valueReceiptV3.parse(input).categories[4]!.qualifying.state).toBe(state);
    }
    expect(valueReceiptV3.parse(illustrativeValueCases.zero).categories[4]!.qualifying).toMatchObject({ state: "known", money: { pence: 0 } });
  });
  it("unknown/incomplete incoming fee cannot leave a known remainder", () => {
    for (const state of ["unknown", "incomplete"] as const) {
      const input = structuredClone(illustrativeValueCases.fiveHundred);
      input.categories[4].fee = { state, reason: "source_unavailable" };
      expect(valueReceiptV3.safeParse(input).success).toBe(false);
      input.categories[4].remainder = { state, reason: "source_unavailable" };
      expect(valueReceiptV3.safeParse(input).success).toBe(true);
    }
  });
  it.each(["pending", "unapproved", "unpaid", "disputed", "disclosed_before_lock", "after_lock"] as const)("S03: %s never qualifies but preserves its payment", reason => {
    const input = structuredClone(illustrativeValueCases.fiveHundred);
    input.sources[0]!.qualification = reason;
    expect(valueReceiptV3.safeParse(input).success).toBe(false);
    const category = input.categories[4]!;
    for (const field of ["qualifying", "fee", "remainder"] as const) {
      category[field] = { state: "known", money: { pence: 0, currency: "GBP" }, basis: "net_principal", sourceRefs: ["withheld"] };
    }
    expect(valueReceiptV3.parse(input).categories[4]!.settled).toMatchObject({ money: { pence: 50000 } });
  });
  it("S04: incoming hypothetical cumulative derivations retain explicit reversal", () => {
    expect(illustrativeValueCases.recovery.categories[4]).toMatchObject({ qualifying: { money: { pence: 282000 } }, fee: { money: { pence: 28200 } }, remainder: { money: { pence: 253800 } } });
    const result = valueReceiptV3.parse(illustrativeValueCases.reversed);
    expect(result.categories[4]).toMatchObject({ qualifying: { money: { pence: 32000 } }, fee: { money: { pence: 3200 } }, remainder: { money: { pence: 28800 } } });
    expect(result.sources[1]).toMatchObject({ kind: "reversal", corrects: "withheld", netMovement: { pence: -250000 }, feeMovement: { pence: -25000 } });
  });
  it("S05: tracked, found, supplier and withheld remain distinct", () => {
    const result = valueReceiptV3.parse(illustrativeValueCases.shadow);
    expect(result.categories[1]).toMatchObject({ recorded: { money: { pence: 360000 } }, fee: { money: { pence: 0 } } });
    expect(result.categories[2]).toMatchObject({ qualifying: { money: { pence: 80000 } }, fee: { money: { pence: 8000 } }, remainder: { money: { pence: 72000 } } });
    expect(result.categories.map(c => c.category)).toEqual(["checked", "tracked", "found", "supplier", "withheld"]);
  });
  it("S06: independent incoming £500/£50 and unpaid £0/£0 examples", () => {
    expect(valueReceiptV3.parse(illustrativeValueCases.fiveHundred).categories[4]!.fee).toMatchObject({ money: { pence: 5000 } });
    const zero = valueReceiptV3.parse(illustrativeValueCases.zero);
    expect(zero.sources[0]!.qualification).toBe("unpaid");
    expect(zero.categories[4]!.settled.state).toBe("unknown");
    expect(zero.categories[4]!.fee).toMatchObject({ money: { pence: 0 } });
  });
  it("S08: compatibility keeps invoice, variation, payment/reversal/correction facts separate", () => {
    const result = valueReceiptV3.parse(illustrativeValueCases.core);
    expect(result.facts.map(f => [f.kind, f.amount.pence, f.basis])).toEqual([
      ["invoice", 110000, "net_principal"], ["invoice", 132000, "gross"],
      ["approved_variation", 12500, "net_principal"], ["approved_variation", -2500, "net_principal"],
      ["unapproved_variation", 5000, "net_principal"], ["recorded_payment", 50000, "gross"],
      ["recorded_payment", 82000, "gross"], ["payment_reversal", -82000, "gross"], ["invoice_correction", -10000, "net_principal"],
    ]);
    expect(result.sources.find(s => s.id === "payment-reversal")!.corrects).toBe("payment-820");
  });
  it("S09: strict prelock response rejects hidden IDs, prevention money and fee offsets", () => {
    const input = illustrativeValueCases.shadow;
    for (const extra of [{ hiddenSignalId: "secret" }, { preventionPence: 1 }, { subscriptionCredit: 79 }, { cap: 203 }]) {
      expect(valueReceiptV3.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    const period = { version: "value-receipt.v3", environment: "synthetic_demo", evidence: "illustrative_unbound", disclosure: "after_lock", scopeKind: "business", scope: { tenantId: "tenant", sessionRef: "session" }, categories: input.categories, sources: input.sources, facts: [], asOf: input.asOf, subscription: { periodId: "period", policyVersion: "proposed-mon-policy", derivationVersion: "proposed-mon-derivation", sourceRefs: ["period-source"], cost: { state: "known", money: { pence: 2900, currency: "GBP" }, basis: "gross", sourceRefs: ["period-source"] } } };
    expect(valueReceiptV3.safeParse(period).success).toBe(true);
    expect(valueReceiptV3.safeParse({ ...period, subscription: { ...period.subscription, offsetsSuccessFee: true } }).success).toBe(false);
  });
  it("prelock projection shape cannot include a found-source identity", () => {
    expect(valueReceiptV3.safeParse({ ...illustrativeValueCases.shadow, disclosure: "prelock" }).success).toBe(false);
    expect(valueReceiptV3.safeParse(illustrativeValueCases.core).success).toBe(true);
  });
  it("amount boundaries reject floats, unsafe/oversized pence, wrong currency and missing references", () => {
    for (const money of [{ pence: 1.1, currency: "GBP" }, { pence: Number.MAX_SAFE_INTEGER + 1, currency: "GBP" }, { pence: 1000000000001, currency: "GBP" }, { pence: 0, currency: "USD" }]) {
      const input = structuredClone(illustrativeValueCases.fiveHundred);
      Object.assign(input.categories[4].fee, { money });
      expect(valueReceiptV3.safeParse(input).success).toBe(false);
    }
    const input = structuredClone(illustrativeValueCases.fiveHundred);
    Object.assign(input.categories[4].fee, { sourceRefs: [] });
    expect(valueReceiptV3.safeParse(input).success).toBe(false);
  });
  it("illustrative event rules distinguish equal-time events and reject malformed timestamps without claiming S07", () => {
    const input = structuredClone(illustrativeValueCases.core);
    expect(new Set(input.sources.map(s => s.occurredAt)).size).toBe(1);
    expect(valueReceiptV3.safeParse(input).success).toBe(true);
    input.asOf.window = { from: "2026-10-20T00:00:00Z", toExclusive: "not-a-timestamp" };
    expect(valueReceiptV3.safeParse(input).success).toBe(false);
  });
  it("proposed DTO checks refuse missing/duplicate/cross-scope references and broken corrections", () => {
    for (const mutate of [
      (v: typeof illustrativeValueCases.shadow) => { v.sources = []; },
      (v: typeof illustrativeValueCases.shadow) => { v.sources.push(v.sources[0]!); },
      (v: typeof illustrativeValueCases.shadow) => { v.sources[0]!.tenantId = "foreign"; },
      (v: typeof illustrativeValueCases.shadow) => { v.sources[0]!.jobId = "foreign"; },
      (v: typeof illustrativeValueCases.shadow) => { v.sources[0]!.sessionRef = "foreign"; },
      (v: typeof illustrativeValueCases.shadow) => { Object.assign(v.sources[0]!, { policyVersion: "v1" }); },
      (v: typeof illustrativeValueCases.shadow) => { v.sources[0]!.corrects = "missing"; },
    ]) {
      const input = structuredClone(illustrativeValueCases.shadow); mutate(input);
      expect(valueReceiptV3.safeParse(input).success).toBe(false);
    }
  });
  it("formats exact pence and labels unavailable values without zero", () => {
    expect(formatValueMoney({ state: "known", money: { pence: 28800, currency: "GBP" }, basis: "net_principal", sourceRefs: ["a"] })).toBe("£288.00");
    expect(formatValueMoney({ state: "unknown", reason: "source_unavailable" })).toBe("Unavailable (unknown)");
    expect(formatValueMoney({ state: "known", money: { pence: -25000, currency: "GBP" }, basis: "net_principal", sourceRefs: ["reversal"] })).toBe("−£250.00");
    expect(VALUE_V3_LABELS.remainder).toBe("yours before VAT and tax");
    expect(VALUE_V3_LABELS.illustration).toBe("Illustration — proposed policy; principal only");
    expect(VALUE_V3_LABELS.tax).toBe("VAT not calculated in this simulation");
  });
});
