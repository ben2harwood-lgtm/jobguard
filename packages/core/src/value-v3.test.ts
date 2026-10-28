import { describe, expect, it } from "vitest";
import { valueReceiptV3, valueAmountV3, formatValueMoney, VALUE_V3_LABELS } from "./value-v3.js";
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
    const wrongRemainder = structuredClone(result);
    Object.assign(wrongRemainder.categories[4].remainder, { money: { pence: 28801, currency: "GBP" } });
    expect(valueReceiptV3.safeParse(wrongRemainder).success).toBe(false);
    result.sources[1]!.corrects = null;
    expect(valueReceiptV3.safeParse(result).success).toBe(false);
  });
  it("S05: tracked, found, supplier and withheld remain distinct", () => {
    const result = valueReceiptV3.parse(illustrativeValueCases.shadow);
    expect(result.categories[1]).toMatchObject({ recorded: { money: { pence: 360000 } }, fee: { money: { pence: 0 } } });
    expect(result.categories[2]).toMatchObject({ qualifying: { money: { pence: 80000 } }, fee: { money: { pence: 8000 } }, remainder: { money: { pence: 72000 } } });
    expect(result.categories.map(c => c.category)).toEqual(["checked", "tracked", "found", "supplier", "withheld"]);
    Object.assign(result.categories[1].recorded, { sourceRefs: ["final-check"] });
    expect(valueReceiptV3.safeParse(result).success).toBe(false);
  });
  it("S06: independent incoming £500/£50 and unpaid £0/£0 examples", () => {
    expect(valueReceiptV3.parse(illustrativeValueCases.fiveHundred).categories[4]!.fee).toMatchObject({ money: { pence: 5000 } });
    const zero = valueReceiptV3.parse(illustrativeValueCases.zero);
    expect(zero.sources[0]!.qualification).toBe("unpaid");
    expect(zero.categories[4]!.settled.state).toBe("unknown");
    expect(zero.categories[4]!.fee).toMatchObject({ money: { pence: 0 } });
    zero.sources[0]!.qualification = "hypothetical_qualified";
    Object.assign(zero.categories[4].fee, { money: { pence: 500, currency: "GBP" } });
    zero.categories[4].remainder = { state: "unknown", reason: "not_reported" };
    expect(valueReceiptV3.safeParse(zero).success).toBe(false);
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


describe("r1 Claude A/B money guard regressions", () => {
  type Receipt = typeof illustrativeValueCases.shadow;
  const known = (pence: number, sourceRefs = ["withheld"]) => ({ state: "known" as const, money: { pence, currency: "GBP" as const }, basis: "net_principal" as const, sourceRefs });
  const unavailable = { state: "unknown" as const, reason: "not_reported" as const };
  const reject = (input: unknown, message: string) => {
    const result = valueReceiptV3.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.message)).toContain(message);
  };
  it.each([
    ["zero principal / unknown remainder", 0, 500, null, "cumulative_balance"],
    ["smaller principal / unknown remainder", 100, 5000, null, "cumulative_balance"],
    ["zero principal / negative window remainder", 0, 500, -500, "window_movement"],
  ] as const)("S06 rejects %s", (_label, principal, fee, remainder, measure) => {
    const input = structuredClone(illustrativeValueCases.fiveHundred);
    input.asOf.measure = measure;
    input.categories[4].qualifying = known(principal);
    input.categories[4].fee = known(fee);
    input.categories[4].remainder = remainder === null ? unavailable : known(remainder);
    reject(input, "Positive fee requires sufficient known qualifying principal");
  });
  it.each([[2000000, 43, 4651], [24691, 2, 1235]])("F4: non-integral Q=%i/%ip never becomes rounded known money (supplied fee %ip)", (numerator, denominator, fee) => {
    const input = structuredClone(illustrativeValueCases.fiveHundred);
    // This boundary has no upstream display rounding policy: retain no rounded substitute.
    const incomplete = { state: "incomplete" as const, reason: "fractional_pence_requires_upstream_policy" as const };
    expect(valueAmountV3.safeParse(known(numerator / denominator)).success).toBe(false);
    input.categories[4].qualifying = incomplete;
    input.categories[4].fee = incomplete;
    input.categories[4].remainder = incomplete;
    expect(valueReceiptV3.safeParse(input).success).toBe(true);
    expect(formatValueMoney(incomplete)).toBe("Unavailable (incomplete)");
    input.categories[4].fee = known(fee);
    reject(input, "Unavailable qualification requires unavailable dependent values");
  });
  const cases: [string, keyof typeof illustrativeValueCases, (v: Receipt) => void, string][] = [
    ["duplicate source ID", "shadow", v => { v.sources[1]!.id = v.sources[0]!.id; }, "Duplicate illustrative source/event identity"],
    ["duplicate event ID only", "shadow", v => { v.sources[1]!.eventId = v.sources[0]!.eventId; }, "Duplicate illustrative source/event identity"],
    ["prelock found source", "shadow", v => { v.disclosure = "prelock"; }, "No found-source identifiers before lock"],
    ...(["tenantId", "jobId", "sessionRef"] as const).map(field => [field + " mismatch", "fiveHundred", (v: Receipt) => { v.sources[0]![field] = "foreign"; }, "Source scope mismatch"] as [string, "fiveHundred", (v: Receipt) => void, string]),
    ["missing original", "reversed", v => { v.sources[1]!.corrects = "missing"; }, "Invalid direct original/correction link"],
    ["self original", "reversed", v => { v.sources[1]!.corrects = v.sources[1]!.id; }, "Invalid direct original/correction link"],
    ["chained correction", "reversed", v => { v.sources.push({ ...v.sources[1]!, id: "chain", eventId: "chain", corrects: v.sources[1]!.id }); }, "Invalid direct original/correction link"],
    ["cross-category original", "reversed", v => { v.sources[1]!.category = "supplier"; }, "Invalid direct original/correction link"],
    ["cross-job original in business receipt", "reversed", v => { Object.assign(v, { scopeKind: "business", scope: { tenantId: "tenant", sessionRef: "session" }, subscription: subscription() }); v.sources[1]!.jobId = "other-job"; }, "Invalid direct original/correction link"],
    ["reversal without original", "fiveHundred", v => { v.sources[0]!.kind = "reversal"; }, "Correction requires explicit original"],
    ["ordinary source with original", "reversed", v => { v.sources[1]!.kind = "snapshot"; }, "Correction requires explicit original"],
    ["nonqualifying source positive fee movement", "zero", v => { v.sources[0]!.feeMovement = { pence: 1, currency: "GBP" }; }, "Nonqualifying source has positive fee movement"],
    ["missing checked reference", "fiveHundred", v => { v.categories[0].sourceRefs = ["missing"]; }, "Missing checked reference"],
    ["S04 negative cumulative recorded amount", "fiveHundred", v => { v.categories[4].recorded = known(-1); }, "Cumulative balance cannot be negative"],
    ["repeated amount reference", "fiveHundred", v => { v.categories[4].recorded = known(1, ["withheld", "withheld"]); }, "Repeated amount reference"],
    ["missing amount reference", "fiveHundred", v => { v.categories[4].recorded = known(1, ["missing"]); }, "Missing or wrong-category reference"],
    ["S05 wrong-category reference", "shadow", v => { v.categories[1].recorded = known(1, ["final-check"]); }, "Missing or wrong-category reference"],
    ...(["qualifying", "fee", "remainder"] as const).map(field => [field + " gross basis", "fiveHundred", (v: Receipt) => { Object.assign(v.categories[4][field], { basis: "gross" }); }, "Recovery illustration must be principal only"] as [string, "fiveHundred", (v: Receipt) => void, string]),
    ["nonqualifying positive recovery", "fiveHundred", v => { v.sources[0]!.qualification = "builder_capture"; }, "Nonqualifying source cannot support positive recovery/fee"],
    ["unavailable qualification", "fiveHundred", v => { v.categories[4].qualifying = unavailable; }, "Unavailable qualification requires unavailable dependent values"],
    ["unavailable fee", "fiveHundred", v => { v.categories[4].fee = unavailable; }, "Unavailable fee requires unavailable remainder"],
    ["S05 tracked fee-free", "shadow", v => { v.sources[0]!.qualification = "hypothetical_qualified"; v.categories[1].qualifying = known(100, ["capture"]); v.categories[1].fee = known(1, ["capture"]); v.categories[1].remainder = known(99, ["capture"]); }, "Builder capture is fee free"],
    ["S04 remainder mismatch", "reversed", v => { v.categories[4].remainder = known(28801, ["withheld", "withheld-reversal"]); }, "Supplied remainder mismatch"],
    ["duplicate fact ID", "core", v => { v.facts[1]!.id = v.facts[0]!.id; }, "Duplicate fact identity"],
    ["missing factual reference", "core", v => { v.facts[0]!.sourceRef = "missing"; }, "Missing factual source"],
  ];
  it.each(cases)("rejects %s", (_label, fixture, mutate, message) => {
    const input = structuredClone(illustrativeValueCases[fixture]);
    expect(valueReceiptV3.safeParse(input).success).toBe(true);
    mutate(input);
    reject(input, message);
  });
  function subscription() {
    return { periodId: "period", policyVersion: "proposed-policy", derivationVersion: "proposed-derivation", sourceRefs: ["period-source"], cost: known(2900, ["period-source"]) };
  }
  it.each(["duplicate", "job overlap", "foreign cost reference", "negative cost"])("subscription-period separation: %s", fault => {
    const job = structuredClone(illustrativeValueCases.fiveHundred);
    const input = { ...job, scopeKind: "business", scope: { tenantId: "tenant", sessionRef: "session" }, subscription: subscription() };
    expect(valueReceiptV3.safeParse(input).success).toBe(true);
    if (fault === "duplicate") input.subscription.sourceRefs.push("period-source");
    if (fault === "job overlap") input.subscription.sourceRefs.push("withheld");
    if (fault === "foreign cost reference") input.subscription.cost.sourceRefs = ["foreign"];
    if (fault === "negative cost") input.subscription.cost.money.pence = -1;
    reject(input, fault === "duplicate" || fault === "job overlap" ? "Period sources must be unique and separate from job sources" : "Invalid supplied subscription cost references");
  });
});
