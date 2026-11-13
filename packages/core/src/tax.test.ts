import { describe, expect, it } from "vitest";
import { money } from "./money.js";
import { allocateGroupTax, allocateSignedInvoiceTax, candidateM1TaxPolicy, UnsupportedTaxTreatmentError } from "./tax.js";

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

describe("signed invoice VAT allocation", () => {
  it.each([
    [[1000, -500], [200, -100]],
    [[1001, 502], [200, 101]],
    [[7, -1, -1, -1, -1], [5, -1, -1, -1, -1]],
    [[4, 4, -5, 0], [2, 1, -2, 0]],
    [[1000, -1000], [0, 0]],
    [[0, 0], [0, 0]],
    [[3, -1], [0, 0]],
  ])("allocates %j as %j with exact conservation", (nets, expected) => {
    const lines = nets.map((net, index) => ({ id: String(index), net: money(net) }));
    const tax = candidateM1TaxPolicy.calculateGroup(money(nets.reduce((sum, n) => sum + n, 0)), "standard_rate_20");
    const result = allocateSignedInvoiceTax(tax, lines);
    expect(lines.map(line => result.get(line.id)!.pence)).toEqual(expected);
    expect([...result.values()].reduce((sum, value) => sum + value.pence, 0)).toBe(tax.pence);
    expect(allocateSignedInvoiceTax(tax, [...lines].reverse())).toEqual(result);
  });
  it("rejects unsupported negative totals, negative tax and duplicate IDs", () => {
    expect(() => allocateSignedInvoiceTax(money(0), [{id:"a",net:money(-1)}])).toThrow(RangeError);
    expect(() => allocateSignedInvoiceTax(money(-1), [{id:"a",net:money(5)}])).toThrow(RangeError);
    expect(() => allocateSignedInvoiceTax(money(1), [{id:"a",net:money(2)},{id:"a",net:money(3)}])).toThrow(RangeError);
  });
});
