import { expect, it } from "vitest";
import { projectDashboardBilling, projectDashboardBillingByDimension } from "./enterprise-dashboard-billing.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const amounts = (netPence: number, vatPence: number) => ({ netPence, vatPence, grossPence: netPence + vatPence });
const invoice = { version: "billing-status.v1", clientContractId: id(1), source: "synthetic", sourceEventId: "invoice", invoiceNumber: "Fictional-1",
  factType: "invoiced", effectiveAt: "2026-10-01T00:00:00Z", remittanceReference: null, reconciliationId: null, originalEventId: null,
  amount: amounts(250, 50), composition: { declared: amounts(250, 50), lines: [
    { externalInvoiceLineId: "order", kind: "original_order", existedAt: "2026-10-01T00:00:00Z", ...amounts(100, 20), match: null },
    { externalInvoiceLineId: "extra", kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amounts(150, 30), match: { exportLineId: id(2), jobId: id(3), extraId: id(4), scopeItemId: id(5), revisionId: id(6), revisionHash: "a".repeat(64) } }] },
  explicit: null, separateInvoice: false, lineAdjustments: [] };
const paid = { ...invoice, composition: null, factType: "paid", sourceEventId: "payment", reconciliationId: "movement", amount: amounts(125, 25), effectiveAt: "2026-10-02T00:00:00Z" };
it("[E9-01 E9-05] reuses ENT-6 composition/allocation, preserves credits and reversals and traces each exact contribution", () => {
  const credit = { ...paid, factType: "credited", sourceEventId: "credit", reconciliationId: null, originalEventId: "invoice", effectiveAt: "2026-10-03T00:00:00Z", amount: amounts(50, 10), lineAdjustments: [{ externalInvoiceLineId: "extra", ...amounts(50, 10) }] };
  const reverse = { ...paid, factType: "payment_reversed", sourceEventId: "reversal", reconciliationId: "refund", originalEventId: "payment", effectiveAt: "2026-10-04T00:00:00Z", amount: amounts(50, 10) };
  const result = projectDashboardBilling([[invoice, paid, credit, reverse]], new Map([[id(4), { jobId: id(3), canonicalExtraId: id(4) }]]));
  expect(result.totals.billed.known.pence).toBe(100);
  expect(result.totals.paid.known.pence).toBe(45);
  expect(result.contributions.every(c => c.extraIds.includes(id(4)) && c.sourceIds.includes("invoice"))).toBe(true);
  expect(result.contributions).toHaveLength(2);
});
it("[E9-05] preserves quarantine and does not interpret incomplete composition as zero settled money", () => {
  const result = projectDashboardBilling([[{ ...invoice, composition: null }, paid]], new Map());
  expect(result.held.length).toBeGreaterThan(0);
  expect(result.complete).toBe(false);
  expect(result.contributions).toEqual([]);
});
it("[E9-02 E9-05] rejects a billed non-canonical match instead of counting a duplicate", () => {
  expect(() => projectDashboardBilling([[invoice]], new Map([[id(4), { jobId: id(3), canonicalExtraId: id(9) }]]))).toThrow("DASHBOARD_INVALID");
});
it("[E9-01 E9-05 E9-20] sums exact partial pennies before one half-even display rounding", () => {
  const families = [4, 44].map(n => {
    const line = { ...invoice.composition.lines[1]!, ...amounts(1, 2), match: { ...invoice.composition.lines[1]!.match!, extraId: id(n), exportLineId: id(n + 100) } };
    const i = { ...invoice, invoiceNumber: `Fictional-${n}`, sourceEventId: `invoice-${n}`, amount: amounts(1, 2), composition: { declared: amounts(1, 2), lines: [line] } };
    return [i, { ...paid, invoiceNumber: i.invoiceNumber, sourceEventId: `paid-${n}`, reconciliationId: `movement-${n}`, amount: amounts(0, 1) }];
  });
  const result = projectDashboardBilling(families, new Map([4, 44].map(n => [id(n), { jobId: id(3), canonicalExtraId: id(n) }])));
  expect(result.totals.paid.exactPence).toEqual({ numerator: "2", denominator: "3" });
  expect(result.totals.paid.known.pence).toBe(1);
});
it("[E9-06 E9-19 E9-20] groups supplied billing by authorized dimensions, conserves totals and reproduces method-bearing output", () => {
  const facts = { version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-16T00:00:00Z", billing: { status: "held", prerequisite: "ENT-6B" }, extras: [
    { jobId: id(3), extraId: id(4), canonicalExtraId: id(4), capturedAt: "2026-10-01T00:00:00Z", capturedSourceId: id(20), capturedValueSourceId: null, capturedValue: null, approved: null, steps: [],
      dimensions: { region: id(10), team: id(11), operative: id(12), client: id(13), contract: id(1) } }] };
  const query = { version: "enterprise-dashboard-query.v1", from: "2026-10-01T00:00:00Z", until: "2026-11-01T00:00:00Z", dimension: "operative", filters: {}, offset: 0, limit: 20 };
  const result = projectDashboardBillingByDimension(facts, query, [[invoice, paid]]);
  expect(result.groups[0]?.id).toBe(id(12));
  expect(result.groups[0]?.totals).toEqual(result.totals);
  expect(projectDashboardBillingByDimension(facts, query, [[paid, invoice]])).toEqual(result);
  expect(result.method.text).toContain("ENT-6");
});
