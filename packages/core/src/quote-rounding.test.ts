// Regression promoted from docs/verdicts/SERIOUS-B3/S06.repro.test.ts.
import { expect, it } from "vitest";
import { evaluateDraftQuote, type QuoteLine } from "./quote.js";
it("S06 rounds the exact discounted line once, half-even", () => {
  const line: QuoteLine = { id:"10000000-0000-4000-8000-000000000001", scopeItemId:"10000000-0000-4000-8000-000000000002", scopeRevisionId:"10000000-0000-4000-8000-000000000003", description:"Synthetic work", origin:"captured", included:true, exclusionReason:null, quantity:"2.5", unit:"hour", unitRatePence:12333, discountPercent:"5", taxTreatment:"standard_rate_20", rateProvenance:"entered", category:null, region:null };
  const { totals } = evaluateDraftQuote({currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",lines:[line]});
  expect(totals.net.pence).toBe(29291);
  expect(totals.total.pence).toBe(35149);
});

it.each([
  { quantity: "1", rate: 5, discount: "50", subtotal: 5, net: 2, displayedDiscount: 3 },
  { quantity: "1", rate: 7, discount: "50", subtotal: 7, net: 4, displayedDiscount: 3 },
  { quantity: "0.000001", rate: 1_000_000, discount: "50", subtotal: 1, net: 0, displayedDiscount: 1 },
  { quantity: "1", rate: 4, discount: "12.5", subtotal: 4, net: 4, displayedDiscount: 0 },
  { quantity: "1.5", rate: 1, discount: "0", subtotal: 2, net: 2, displayedDiscount: 0 },
  { quantity: "2.5", rate: 1, discount: "0", subtotal: 2, net: 2, displayedDiscount: 0 },
  { quantity: "2.5", rate: 12333, discount: "100", subtotal: 30832, net: 0, displayedDiscount: 30832 },
])("rounds quantity $quantity at $rate pence with $discount% discount half-even", (fixture) => {
  const line: QuoteLine = {
    id: "10000000-0000-4000-8000-000000000001",
    scopeItemId: "10000000-0000-4000-8000-000000000002",
    scopeRevisionId: "10000000-0000-4000-8000-000000000003",
    description: "Synthetic rounding boundary", origin: "captured", included: true,
    exclusionReason: null, quantity: fixture.quantity, unit: "hour", unitRatePence: fixture.rate,
    discountPercent: fixture.discount, taxTreatment: "standard_rate_20",
    rateProvenance: "entered", category: null, region: null,
  };
  const { totals } = evaluateDraftQuote({ currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", lines: [line] });
  expect(totals.subtotal.pence).toBe(fixture.subtotal);
  expect(totals.net.pence).toBe(fixture.net);
  expect(totals.discount.pence).toBe(fixture.displayedDiscount);
});
