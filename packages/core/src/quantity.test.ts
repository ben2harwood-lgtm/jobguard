import { describe, expect, it } from "vitest";
import { money } from "./money.js";
import { calculateNetLine, parseQuantity } from "./quantity.js";

describe("quantity and net lines", () => {
  it("parses exact decimals and calculates a discounted line with one half-even rounding", () => {
    expect(parseQuantity("12.345678").scaled).toBe(12_345_678n);
    expect(calculateNetLine(parseQuantity("1.5"), money(999), { numerator: 1n, denominator: 10n }).pence).toBe(1_349);
  });
  it("rejects non-integral syntax, excess precision, and implicit negative adjustments", () => {
    for (const invalid of ["1e3", "1.0000001", ".5", "01", "NaN"]) expect(() => parseQuantity(invalid)).toThrow(RangeError);
    expect(() => parseQuantity("-1.5")).toThrow(RangeError);
    expect(parseQuantity("-1.5", { adjustment: true }).scaled).toBe(-15n);
  });
  it("rejects invalid discounts", () => {
    expect(() => calculateNetLine(parseQuantity("1"), money(100), { numerator: 2n, denominator: 1n })).toThrow(RangeError);
  });
});
