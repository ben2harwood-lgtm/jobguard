import { expect, it } from "vitest";
import { allocateBillingReceipt, deriveUnambiguousBilling } from "./contractor-billing.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const billingLine = (kind: "original_order" | "extra" = "original_order", patch = {}) => ({
  externalInvoiceLineId: kind, kind, existedAt: "2026-10-01T00:00:00Z",
  netPence: kind === "extra" ? 24000 : 100000, vatPence: kind === "extra" ? 4800 : 20000,
  grossPence: kind === "extra" ? 28800 : 120000,
  match: kind === "extra" ? { exportLineId: id(5), jobId: id(2), extraId: id(3), scopeItemId: id(4), revisionId: id(6), revisionHash: "a".repeat(64) } : null,
  ...patch,
});
const billingEvent = (patch = {}) => ({ version: "billing-status.v1", clientContractId: id(1), source: "fictional-ledger",
  sourceEventId: "invoice-1", invoiceNumber: "INV-1", factType: "invoiced", effectiveAt: "2026-10-01T00:00:00Z",
  remittanceReference: null, reconciliationId: null, originalEventId: null,
  amount: { netPence: 124000, vatPence: 24800, grossPence: 148800 },
  composition: { declared: { netPence: 124000, vatPence: 24800, grossPence: 148800 }, lines: [billingLine(), billingLine("extra")] },
  explicit: null, separateInvoice: false, ...patch,
});

function permutations<T>(xs: T[]): T[][] {
  return xs.length === 0 ? [[]] : xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(tail => [x, ...tail]));
}
const payment = (patch = {}) => billingEvent({ sourceEventId: "paid-1", factType: "paid", effectiveAt: "2026-10-02T00:00:00Z",
  amount: { netPence: 50000, vatPence: 0, grossPence: 50000 }, composition: null, reconciliationId: "movement-1", ...patch });
const allocation = (patch: { invoice?: ReturnType<typeof billingEvent> } & Record<string, unknown> = {}) => {
  const invoice = patch.invoice ?? billingEvent();
  return { version: "billing-allocation.v1", invoice, sourceRef: "paid-1",
    effectiveAt: "2026-10-02T00:00:00Z", gross: { numerator: "50000", denominator: "1" },
    outstanding: invoice.composition.lines.map(l => ({ lineId: l.externalInvoiceLineId,
      gross: { numerator: String(l.grossPence), denominator: "1" } })),
    explicit: null, separateInvoice: false, direction: "receipt", original: null, ...patch };
};

it("E6-17 explicit shares then separate invoice then pro-rata; invalid shares/ratios refuse", () => {
  expect(allocateBillingReceipt(allocation({ explicit: [{ lineId: "original_order", gross: { numerator: "50000", denominator: "1" } }], separateInvoice: true }))[0]!.rule).toBe("explicit");
  expect(allocateBillingReceipt(allocation({ separateInvoice: true }))[0]!.rule).toBe("separate_invoice");
  expect(allocateBillingReceipt(allocation())[0]!.rule).toBe("pro_rata");
  for (const explicit of [[{ lineId: "missing", gross: { numerator: "50000", denominator: "1" } }],
    [{ lineId: "extra", gross: { numerator: "50000", denominator: "1" } }],
    [{ lineId: "extra", gross: { numerator: "1", denominator: "1" } }]]) {
    expect(() => allocateBillingReceipt(allocation({ explicit }))).toThrow();
  }
  expect(() => allocateBillingReceipt(allocation({ gross: { numerator: "148801", denominator: "1" } }))).toThrow();
});

it("E6-15 E6-18 uses the full mixed-ratio invoice and never spreads early deposits onto later lines", () => {
  const invoice = billingEvent({ composition: { declared: { netPence: 124000, vatPence: 4800, grossPence: 128800 },
    lines: [billingLine("original_order", { vatPence: 0, grossPence: 100000 }), billingLine("extra", { existedAt: "2026-10-03T00:00:00Z" })] },
    amount: { netPence: 124000, vatPence: 4800, grossPence: 128800 } });
  const early = allocateBillingReceipt(allocation({ invoice }));
  expect(early.map(a => a.lineId)).toEqual(["original_order"]);
  expect(early[0]!.net).toEqual({ numerator: "50000", denominator: "1" });
  const mixed = allocateBillingReceipt(allocation({ invoice, effectiveAt: "2026-10-04T00:00:00Z", gross: { numerator: "128800", denominator: "1" } }));
  expect(mixed.find(a => a.lineId === "extra")!.net).toEqual({ numerator: "24000", denominator: "1" });
});

it("E6-15 mixed-job extras share the full contract-invoice denominator with original-order lines", () => {
  const extra = billingLine("extra");
  const other = billingLine("extra", { externalInvoiceLineId: "extra-b", netPence: 10000, vatPence: 0, grossPence: 10000,
    match: { ...extra.match!, jobId: id(22), extraId: id(23), scopeItemId: id(24), revisionId: id(25), exportLineId: id(26) } });
  const total = { netPence: 134000, vatPence: 4800, grossPence: 138800 };
  const invoice = billingEvent({ amount: total, composition: { declared: total,
    lines: [billingLine("original_order", { netPence: 100000, vatPence: 0, grossPence: 100000 }), extra, other] } });
  const result = allocateBillingReceipt(allocation({ invoice }));
  expect(result.find(l => l.lineId === "extra")!.net).toEqual({ numerator: "3000000", denominator: "347" });
  expect(result.find(l => l.lineId === "extra-b")!.net).toEqual({ numerator: "1250000", denominator: "347" });
  expect(result.find(l => l.lineId === "original_order")!.matchedExtraNet).toEqual({ numerator: "0", denominator: "1" });
});

it("E6-19 linked reversals preserve ratios and refuse more than the original remaining allocation", () => {
  const original = allocateBillingReceipt(allocation());
  const reversed = allocateBillingReceipt(allocation({ direction: "reversal", original, outstanding: null }));
  expect(reversed.find(a => a.lineId === "extra")!.net).toEqual({ numerator: "-250000", denominator: "31" });
  expect(() => allocateBillingReceipt(allocation({ direction: "reversal", original, outstanding: null, gross: { numerator: "50001", denominator: "1" } }))).toThrow();
  expect(() => allocateBillingReceipt(allocation({ direction: "reversal", original: null, outstanding: null }))).toThrow();
  expect(() => allocateBillingReceipt(allocation({ direction: "reversal", outstanding: null, original: original.map((a, i) => ({ ...a, sourceRef: `different-${i}` })) }))).toThrow();
});

it("E6-17 requires complete current balances and never resets exhausted lines to invoice gross", () => {
  const balances = allocation().outstanding;
  for (const outstanding of [undefined, null, [], balances.slice(1), [balances[0], balances[0]],
    [...balances, { lineId: "unknown", gross: { numerator: "1", denominator: "1" } }],
    balances.map(l => ({ ...l, gross: { numerator: "-1", denominator: "1" } })),
    balances.map(l => ({ ...l, gross: { numerator: "148801", denominator: "1" } }))]) {
    expect(() => allocateBillingReceipt(allocation({ outstanding }))).toThrow("BILLING_INVALID");
  }
  const outstanding = balances.map(l => ({ ...l, gross: {
    numerator: l.lineId === "extra" ? "0" : "50000", denominator: "1" } }));
  const result = allocateBillingReceipt(allocation({ outstanding }));
  expect(result.map(l => l.lineId)).toEqual(["original_order"]);
  expect(result[0]!.gross).toEqual({ numerator: "50000", denominator: "1" });
  expect(result[0]!.matchedExtraNet).toEqual({ numerator: "0", denominator: "1" });
  expect(() => allocateBillingReceipt(allocation({ outstanding, gross: { numerator: "50001", denominator: "1" } })))
    .toThrow("BILLING_INVALID");
});

it("E6-20 all arrival permutations of unambiguous invoice, payment, credit and reversal derive the same projection", () => {
  const credit = billingEvent({ sourceEventId: "credit-1", factType: "credited", originalEventId: "invoice-1", effectiveAt: "2026-10-03T00:00:00Z",
    composition: null, amount: { netPence: 100, vatPence: 20, grossPence: 120 },
    lineAdjustments: [{ externalInvoiceLineId: "extra", netPence: 100, vatPence: 20, grossPence: 120 }] });
  const reversal = payment({ sourceEventId: "reversal-1", factType: "payment_reversed", originalEventId: "paid-1", reconciliationId: "reversal-movement-1", effectiveAt: "2026-10-04T00:00:00Z" });
  const facts = [billingEvent(), payment(), credit, reversal];
  const expected = deriveUnambiguousBilling(facts);
  expect(expected.held).toEqual([]);
  expect(expected.lines.find(l => l.lineId === "extra")!.paidNet).toEqual({ numerator: "0", denominator: "1" });
  expect(expected.lines.find(l => l.lineId === "extra")!.creditedNet).toEqual({ numerator: "100", denominator: "1" });
  for (const order of permutations(facts)) expect(deriveUnambiguousBilling(order)).toEqual(expected);
  expect(deriveUnambiguousBilling([payment()]).held[0]!.reason).toBe("INVOICE_REQUIRED");
  expect(deriveUnambiguousBilling([reversal]).held[0]!.reason).toBe("INVOICE_REQUIRED");
  expect(deriveUnambiguousBilling([billingEvent(), reversal]).held[0]!.reason).toBe("ORIGINAL_MOVEMENT_REQUIRED");
  expect(deriveUnambiguousBilling([credit]).held[0]!.reason).toBe("INVOICE_REQUIRED");
});

it("E6-11 E6-12 pure duplicate observations use explicit identity, changed content conflicts", () => {
  const events = [billingEvent(), payment()];
  expect(deriveUnambiguousBilling([...events, payment()])).toEqual(deriveUnambiguousBilling(events));
  expect(deriveUnambiguousBilling([...events, payment({ sourceEventId: "api-paid-1" })]).lines).toEqual(deriveUnambiguousBilling(events).lines);
  expect(() => deriveUnambiguousBilling([...events, payment({ amount: { netPence: 1, vatPence: 0, grossPence: 1 } })])).toThrow("BILLING_CONFLICT");
  expect(deriveUnambiguousBilling([billingEvent(), payment({ reconciliationId: null })]).held[0]!.reason).toBe("MOVEMENT_IDENTITY_REQUIRED");
});

it("E6-20 policy-dependent equal-time facts and competing invoice compositions stay outside this evaluator", () => {
  expect(() => deriveUnambiguousBilling([billingEvent(), payment({ effectiveAt: "2026-10-01T00:00:00Z" })])).toThrow("BILLING_POLICY_HELD");
  expect(() => deriveUnambiguousBilling([billingEvent(), billingEvent({ sourceEventId: "invoice-2" })])).toThrow("BILLING_POLICY_HELD");
});

it("E6-15 remaining ENT-F2 receipt yields exact extra net 24000 pence without rounding", () => {
  const result = deriveUnambiguousBilling([billingEvent(), payment(), payment({ sourceEventId: "paid-2", reconciliationId: "movement-2",
    effectiveAt: "2026-10-03T00:00:00Z", amount: { netPence: 98800, vatPence: 0, grossPence: 98800 } })]);
  expect(result.lines.find(l => l.lineId === "extra")!.paidNet).toEqual({ numerator: "24000", denominator: "1" });
});

it("E6-19 partial linked reversals cannot reverse an exhausted movement", () => {
  const reversal = payment({ sourceEventId: "reverse-1", factType: "payment_reversed", originalEventId: "paid-1", reconciliationId: "rev-1",
    effectiveAt: "2026-10-03T00:00:00Z", amount: { netPence: 25000, vatPence: 0, grossPence: 25000 } });
  const again = { ...reversal, sourceEventId: "reverse-2", reconciliationId: "rev-2", effectiveAt: "2026-10-04T00:00:00Z" };
  const full = deriveUnambiguousBilling([billingEvent(), payment(), reversal, again]);
  expect(full.lines.find(l => l.lineId === "extra")!.paidNet).toEqual({ numerator: "0", denominator: "1" });
  expect(() => deriveUnambiguousBilling([billingEvent(), payment(), reversal, again,
    { ...again, sourceEventId: "reverse-3", reconciliationId: "rev-3", effectiveAt: "2026-10-05T00:00:00Z" }])).toThrow();
});

it("E6-18 distinguishes sub-millisecond existence and does not use arrival order", () => {
  const invoice = billingEvent({ composition: { declared: { netPence: 124000, vatPence: 24800, grossPence: 148800 },
    lines: [billingLine(), billingLine("extra", { existedAt: "2026-10-02T00:00:00.000002Z" })] } });
  const result = allocateBillingReceipt(allocation({ invoice, effectiveAt: "2026-10-02T00:00:00.000001Z" }));
  expect(result.map(l => l.lineId)).toEqual(["original_order"]);
});

it("E6-19 E6-22 pure credits, rejection and totals preserve exact drill-down sums", () => {
  const credited = billingEvent({ sourceEventId: "credit-all", factType: "credited", originalEventId: "invoice-1", composition: null,
    effectiveAt: "2026-10-03T00:00:00Z", amount: { netPence: 24000, vatPence: 4800, grossPence: 28800 },
    lineAdjustments: [{ externalInvoiceLineId: "extra", netPence: 24000, vatPence: 4800, grossPence: 28800 }] });
  const rejection = { ...credited, sourceEventId: "rejected-1", factType: "rejected", effectiveAt: "2026-10-04T00:00:00Z" };
  const result = deriveUnambiguousBilling([billingEvent(), payment(), credited, rejection]);
  expect(result.lines.find(l => l.lineId === "extra")!.rejected).toBe(true);
  expect(result.totals.creditedNet).toEqual({ numerator: "24000", denominator: "1" });
  expect(result.totals.paidGross).toEqual({ numerator: "50000", denominator: "1" });
  expect(result.totals.paidNet).toEqual({ numerator: "125000", denominator: "3" });
});
