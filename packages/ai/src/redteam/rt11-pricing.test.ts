import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";

// Exercise the real web pricing helpers in the AI lane's existing Vitest run.
// Resolve at runtime so compiling this package does not emit web files into ai/dist.
const pricingModule = new URL("../../../../apps/web/app/ui/review-pricing.ts", import.meta.url).href;
const { lineTotalPence, combinedPrice, runningTotal, totalLabel, priceFromText, wholeJobLabel } = await import(pricingModule);
const row = (quantity: string | null, unitPricePence: number | null, disposition = "proposed") =>
  ({ quantity, unitPricePence, disposition });

describe("RT-11 review pricing: exact decimals, limits and incomplete totals", () => {
  it.each([
    ["2.5", 2550, 6375], // 2.5 m at £25.50 = £63.75
    ["2.5", 1001, 2502], // £25.025 -> £25.02, half-even
    ["2.5", 1003, 2508], // £25.075 -> £25.08, half-even
    ["0.5", 1, 0], ["1.5", 1, 2], ["2.5", 1, 2], ["3.5", 1, 4],
    ["0.333333", 3, 1], ["0.000001", 500000, 0], ["0.000001", 1500000, 2],
    ["1.000001", 2550, 2550], ["1", 0, 0],
    ["1", MAX_MONEY_PENCE, MAX_MONEY_PENCE],
    ["0.5", MAX_MONEY_PENCE, 500000000000],
  ] as const)("%s × %i pence = %i pence", (quantity, rate, expected) => {
    expect(lineTotalPence(row(quantity, rate))).toBe(expected);
  });

  it.each([null, "", " ", "0", "0.000000", "-1", "two", "2m", "2,5", "NaN", "Infinity", "0.0000001"])(
    "quantity %s stays incomplete rather than implying one item", quantity => {
      expect(lineTotalPence(row(quantity, 2550))).toBeNull();
      const total = runningTotal([row(quantity, 2550), row("1", 100)]);
      expect(total).toEqual({ pence: 100, counted: 2, unpriced: 1, complete: false });
      expect(totalLabel(total)).toContain("incomplete");
    });

  it.each([MAX_MONEY_PENCE + 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, 2550.5])(
    "refuses unsafe or unsupported rate %s", rate => {
      expect(lineTotalPence(row("1", rate))).toBeNull();
    });
  it("refuses overflow in a line product and a combined sum", () => {
    expect(lineTotalPence(row("2", MAX_MONEY_PENCE))).toBeNull();
    expect(lineTotalPence(row("9007199254740992", 100))).toBeNull();
    expect(combinedPrice([row("1", MAX_MONEY_PENCE), row("1", 1)]).unitPricePence).toBeNull();
    expect(combinedPrice([row("1", MAX_MONEY_PENCE - 1), row("1", 1)]))
      .toEqual({ unitPricePence: MAX_MONEY_PENCE, unpriced: 0 });
  });
  it("an open price cannot make a complete total or a priced combined row", () => {
    const lines = [row("2.5", 2550), row("1", null)];
    expect(runningTotal(lines)).toEqual({ pence: 6375, counted: 2, unpriced: 1, complete: false });
    expect(totalLabel(runningTotal(lines))).toContain("incomplete: 1 row needs a price");
    expect(combinedPrice(lines)).toEqual({ unitPricePence: null, unpriced: 1 });
  });
  it("counts accepted and proposed lines once, excluding retired and dismissed rows", () => {
    expect(runningTotal([row("2.5", 2550), row("1", 1, "accepted"),
      ...["dismissed", "merged", "split"].map(state => row("100", 9000, state))]))
      .toEqual({ pence: 6376, counted: 2, unpriced: 0, complete: true });
    expect(runningTotal([])).toEqual({ pence: 0, counted: 0, unpriced: 0, complete: false });
  });
  it("the whole-job label preserves a discrepant total and leaves the row sum alone", () => {
    const total = runningTotal([row("1", 15000), row("1", 8000)]);
    expect(wholeJobLabel("£300 all in", total)).toEqual([
      "You said “£300 all in”. It isn't added to any row.", "Rows add up to £230.00",
    ]);
    expect(total.pence).toBe(23000);
  });
  it.each(["€2000", "$2000", "2000 euros", "USD 2000", "2.555", "90071992547409.92", "10000000000.01"])(
    "typed price %s cannot silently become valid GBP money", text => {
      expect(priceFromText(text).pence).toBeNull();
      expect(priceFromText(text).error).not.toBeNull();
    });
});
