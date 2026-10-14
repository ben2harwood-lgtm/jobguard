import { describe, expect, it } from "vitest";
import { evaluateDraftQuote, type QuoteLine } from "./quote.js";

const line: QuoteLine = {
  id: "10000000-0000-4000-8000-000000000001",
  scopeItemId: "10000000-0000-4000-8000-000000000002",
  scopeRevisionId: "10000000-0000-4000-8000-000000000003",
  description: "Fit cabinets",
  origin: "captured",
  included: true,
  exclusionReason: null,
  quantity: "2.5",
  unit: "hour",
  unitRatePence: 12333,
  discountPercent: "5",
  taxTreatment: "standard_rate_20",
  rateProvenance: "entered",
  category: "Joinery",
  region: "London",
};

describe("AUDIT-FIX-PKG-SRC-82 quote regressions", () => {
  it("discounted quote net rounds once", () => {
    const { totals } = evaluateDraftQuote({
      currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", lines: [line],
    });
    // 2.5 × 12333 × 95/100 = 29290.875p; VAT rounds separately.
    expect({ net: totals.net.pence, tax: totals.tax.pence, total: totals.total.pence })
      .toEqual({ net: 29291, tax: 5858, total: 35149 });
  });

  it("a 50 percent discount preserves the half-even net tie", () => {
    const { totals } = evaluateDraftQuote({
      currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
      lines: [{ ...line, quantity: "1", unitRatePence: 3, discountPercent: "50" }],
    });
    expect(totals.net.pence).toBe(2);
  });
});
