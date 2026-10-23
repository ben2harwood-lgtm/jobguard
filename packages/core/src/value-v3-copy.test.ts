// @ts-expect-error Core has no resolveJsonModule; Vitest loads this fixture. Validate its unknown contents below.
import fixtureCases from "../../../docs/fixtures/value-v3-receipt-cases.json" with { type: "json" };
import { expect, it } from "vitest";
import { z } from "zod";
import { illustrativeValueCases } from "./value-v3.fixtures.js";
import { renderValueReceipt } from "./value-v3-receipt.js";

const cases = z.object({
  version: z.literal("value-v3-receipt-cases.v1"), evidence: z.literal("illustrative_unbound"),
  cases: z.array(z.object({
    fixture: z.enum(["recovery", "reversed", "shadow", "fiveHundred", "zero", "core"]),
    category: z.enum(["tracked", "found", "supplier", "withheld"]), expected: z.array(z.string()).min(1), corrects: z.string().optional(),
  }).strict()).min(1),
}).strict().parse(fixtureCases as unknown);
for (const c of cases.cases) it(`R04/R05/R08 copy and illustrative amounts: ${c.fixture}`, () => {
  const result = renderValueReceipt(illustrativeValueCases[c.fixture]);
  for (const expected of c.expected) expect(result.text).toContain(expected);
  expect(result.text).toContain(`category=${c.category}`);
  if (c.corrects) expect(result.text).toContain(`corrects="${c.corrects}"`);
  for (const required of ["Illustration — proposed policy; principal only", "yours before VAT and tax", "VAT not calculated in this simulation", "reference_fee_policy_v3", "hypothetical-sv6-output.v1", "GBP", "Source bindings held", "Fee posted (M4): Unavailable", "Fee collected (M4): Unavailable", "Fee refunded (M4): Unavailable"]) expect(result.text).toContain(required);
  expect(result.text).not.toMatch(/saved you|would have forgotten|you kept|prevention.*£|tax invoice|fee paid/i);
  for (const line of result.text.split("\n").filter(line => line.includes("£"))) {
    for (const trace of ["category=", "basis=", "source", "policy", "derivation"]) expect(line).toContain(trace);
  }
  expect(result.status).toBe("incomplete");
});
it("labels builder-recorded payments without asserting bank settlement", () => {
  expect(renderValueReceipt(illustrativeValueCases.core).text).toContain("Builder-recorded payment; bank verification not asserted");
});
