// Intentionally failing reproduction, held outside normal suites pending coordinator approval.
// Run: pnpm --filter @jobguard/core exec vitest run --root ../.. docs/verdicts/SERIOUS-B3/S06.repro.test.ts
import { expect, it } from "vitest";
import { evaluateDraftQuote, type QuoteLine } from "../../../packages/core/src/quote.js";
it("S06 rounds the exact discounted line once, half-even", () => {
  const line: QuoteLine = { id:"10000000-0000-4000-8000-000000000001", scopeItemId:"10000000-0000-4000-8000-000000000002", scopeRevisionId:"10000000-0000-4000-8000-000000000003", description:"Synthetic work", origin:"captured", included:true, exclusionReason:null, quantity:"2.5", unit:"hour", unitRatePence:12333, discountPercent:"5", taxTreatment:"standard_rate_20", rateProvenance:"entered", category:null, region:null };
  const { totals } = evaluateDraftQuote({currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",lines:[line]});
  expect(totals.net.pence).toBe(29291);
  expect(totals.total.pence).toBe(35149);
});
