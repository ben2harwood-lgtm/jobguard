import { describe, expect, it } from "vitest";
import { money } from "./money.js";
import { allocateGroupTax, candidateM1TaxPolicy, UnsupportedTaxTreatmentError } from "./tax.js";

describe("candidate M1 tax policy", () => {
  it("rounds once at group level and allocates display pennies", () => {
    const lines = [{ id: "a", net: money(2) }, { id: "b", net: money(3) }];
    const tax = candidateM1TaxPolicy.calculateGroup(money(5), "standard_rate_20");
    expect(tax.pence).toBe(1);
    expect([...allocateGroupTax(tax, lines).values()].reduce((sum, value) => sum + value.pence, 0)).toBe(1);
  });
  it("makes credit notes exact sign-symmetric reversals", () => {
    for (const net of [5, 12, 102, 10_003]) {
      expect(candidateM1TaxPolicy.calculateGroup(money(-net), "standard_rate_20").pence)
        .toBe(-candidateM1TaxPolicy.calculateGroup(money(net), "standard_rate_20").pence);
    }
  });
  it("rejects rather than guesses unsupported tax treatment", () => {
    expect(() => candidateM1TaxPolicy.calculateGroup(money(100), "zero_rate")).toThrow(UnsupportedTaxTreatmentError);
  });
});
