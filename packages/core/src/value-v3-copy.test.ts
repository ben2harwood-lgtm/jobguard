// @ts-expect-error Core has no resolveJsonModule; Vitest loads this fixture. Validate its unknown contents below.
import fixtureCases from "../../../docs/fixtures/value-v3-receipt-cases.json" with { type: "json" };
import { expect, it } from "vitest";
import { z } from "zod";
import { illustrativeValueCases } from "./value-v3.fixtures.js";
import { renderValueReceipt } from "./value-v3-receipt.js";

// Ownership wording must carry its tax qualification on the same rendered line.
function unqualifiedOwnershipLines(text: string): string[] {
  return text.split("\n").filter(line =>
    /\b(?:you kept|you keep|kept by you|stays with you|remains yours|yours)\b/i.test(line)
    && !/\bbefore VAT and tax\b/i.test(line));
}

const cases = z.object({
  version: z.literal("value-v3-receipt-cases.v1"), evidence: z.literal("illustrative_unbound"),
  cases: z.array(z.object({
    fixture: z.enum(["recovery", "reversed", "shadow", "fiveHundred", "zero", "core"]),
    category: z.enum(["tracked", "found", "supplier", "withheld"]), expected: z.array(z.string()).min(1), corrects: z.string().optional(), boundRows: z.array(z.string()).min(1),
  }).strict()).min(1),
}).strict().parse(fixtureCases as unknown);
for (const c of cases.cases) it(`R04/R05/R08 copy and illustrative amounts: ${c.fixture}`, () => {
  const result = renderValueReceipt(illustrativeValueCases[c.fixture]);
  for (const expected of c.expected) expect(result.text).toContain(expected);
  expect(result.text).toContain(`category=${c.category}`);
  const lines = result.text.split("\n");
  for (const row of c.boundRows) {
    expect(lines.filter(line => line === row || line.startsWith(`${row};`)), row).toHaveLength(1);
  }
  if (c.corrects) expect(result.text).toContain(`corrects="${c.corrects}"`);
  for (const required of ["Illustration — proposed policy; principal only", "yours before VAT and tax", "VAT not calculated in this simulation", "reference_fee_policy_v3", "hypothetical-sv6-output.v1", "GBP", "Source bindings held", "Fee posted (M4): Unavailable", "Fee collected (M4): Unavailable", "Fee refunded (M4): Unavailable"]) expect(result.text).toContain(required);
  expect(unqualifiedOwnershipLines(result.text)).toEqual([]);
  expect(result.text).not.toMatch(/saved you|would have forgotten|you kept|prevention.*£|tax invoice|fee paid/i);
  for (const line of result.text.split("\n").filter(line => line.includes("£"))) {
    for (const trace of ["category=", "basis=", "source", "policy", "derivation"]) expect(line).toContain(trace);
  }
  expect(result.status).toBe("incomplete");
});
it("labels builder-recorded payments without asserting bank settlement", () => {
  expect(renderValueReceipt(illustrativeValueCases.core).text).toContain("Builder-recorded payment; bank verification not asserted");
});

it("tracked captures retain the full recorded amount with zero fee and no recovery remainder", () => {
  const tracked = renderValueReceipt(illustrativeValueCases.shadow).text.split("\n").filter(line => line.startsWith("category=tracked;"));
  expect(tracked.some(line => line.startsWith("category=tracked; Supplied recorded amount: £3600.00;"))).toBe(true);
  expect(tracked.some(line => line.startsWith("category=tracked; Fee illustration (SV-6 supplied): £0.00;"))).toBe(true);
  expect(tracked).toContain("category=tracked; Builder capture — JobGuard fee is £0.00; currency=GBP; basis=Net principal (excluding VAT); sources=[\"capture\"]; recorded amount basis=Net principal (excluding VAT); policy/derivation=see referenced supplied source ledger (unverified)");
  expect(tracked.join("\n")).not.toMatch(/qualifying principal|yours before VAT and tax/);
});

const r1CaptureLine = 'category=tracked; Builder capture — the full recorded amount remains yours; JobGuard fee is £0.00; basis=recorded amount; sources=["capture"]; policy/derivation=see referenced supplied source ledger (unverified)';
it("R04 rejects the exact r1 unqualified capture wording", () => {
  expect(unqualifiedOwnershipLines(r1CaptureLine)).toEqual([r1CaptureLine]);
});
it.each(["you kept", "remains yours", "yours", "you keep", "kept by you", "stays with you"])("R04 audits unqualified ownership: %s", phrase => {
  const line = `category=tracked; £3600.00 ${phrase}; basis=recorded amount`;
  expect(unqualifiedOwnershipLines(line)).toEqual([line]);
  expect(unqualifiedOwnershipLines(`${line}\nbefore VAT and tax`)).toEqual([line]);
  expect(unqualifiedOwnershipLines(`${line}; before VAT and tax`)).toEqual([]);
});
