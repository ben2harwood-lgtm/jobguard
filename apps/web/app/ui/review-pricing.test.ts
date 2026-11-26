import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
// The parser is not a package export; the test reads its source so the four examples run end to end.
import { parseCaptureFixture } from "../../../../packages/ai/src/capture-fixture-parser";
import { combinedPrice, combineLabel, lineTotalPence, originNote, priceFromText, runningTotal, splitBeforeLabel,
  totalLabel, wholeJobLabel, wholeJobWords } from "./review-pricing";

type Row = { scopeItemId: string; quantity: string | null; unit: string | null; unitPricePence: number | null; disposition: string; parentScopeItemIds: string[] };
// As review-proposal's fresh(): each parser line becomes a proposed review row.
function rows(text: string) {
  const proposal = parseCaptureFixture("fictional-sq2", text);
  const lines: Row[] = proposal.lines.map((line, index) => ({ scopeItemId: `s${index}`, quantity: line.quantity.value, unit: line.unit.value,
    unitPricePence: line.unitPricePence.value, disposition: "proposed", parentScopeItemIds: [] }));
  return { lines, questions: proposal.questions.map(q => ({ question: q.question.value })) };
}
const row = (id: string, quantity: string | null, unitPricePence: number | null, disposition = "accepted", parents: string[] = []): Row =>
  ({ scopeItemId: id, quantity, unit: "item", unitPricePence, disposition, parentScopeItemIds: parents });

describe("Ben's four spoken examples through the review total", () => {
  it("four items with no prices: all four rows need a price", () => {
    const { lines } = rows("strip out the old kitchen fit six base units hang the new doors paint the walls");
    expect(totalLabel(runningTotal(lines))).toBe("Total so far £0.00 · incomplete: 4 rows need a price");
  });
  it("£200 and £600 with one open: £800 so far, incomplete", () => {
    const { lines } = rows("strip out the old kitchen for two hundred pounds fit the new units for six hundred pounds paint the walls");
    expect(totalLabel(runningTotal(lines))).toBe("Total so far £800.00 · incomplete: 1 row needs a price");
  });
  it("£200 and £60: £260, complete", () => {
    const { lines } = rows("paint the walls two hundred pounds and fit the door sixty pounds");
    expect(totalLabel(runningTotal(lines))).toBe("Total so far £260.00 · complete");
  });
  it("the whole-job figure is shown beside the total and never added to a row", () => {
    const { lines, questions } = rows("strip out the old kitchen fit the new units paint the walls eight hundred pounds for the whole job");
    expect(lines.every(line => line.unitPricePence === null)).toBe(true);
    const words = wholeJobWords(questions)!;
    expect(wholeJobLabel(words, runningTotal(lines))).toEqual(["You said “eight hundred pounds for the whole job”. It isn't added to any row.", "Rows add up to £0.00 so far"]);
    const door = rows("supply and fit one door for three hundred pounds");
    expect(totalLabel(runningTotal(door.lines))).toBe("Total so far £300.00 · complete");
    expect(wholeJobLabel(words, runningTotal(door.lines))[1]).toBe("Rows add up to £300.00");
  });
  it("six doors at fifty pounds each: £300 from the quantity and the rate", () => {
    expect(lineTotalPence(rows("fit six doors at fifty pounds each").lines[0]!)).toBe(30000);
  });
});

describe("combine and split never invent a figure", () => {
  it("combining priced rows keeps their sum; one unpriced or a non-numeric quantity leaves it blank", () => {
    expect(combinedPrice([row("a", "1", 20000), row("b", "2", 3000)])).toEqual({ unitPricePence: 26000, unpriced: 0 });
    expect(combineLabel(3, combinedPrice([row("a", "1", 20000), row("b", "1", 6000), row("c", "1", null)])))
      .toBe("Combined from 3 rows · 1 had no price, so this needs a price");
    expect(combinedPrice([row("a", "some", 20000), row("b", "1", 6000)]).unitPricePence).toBeNull();
    expect(combineLabel(2, combinedPrice([row("a", "1", 20000), row("b", "1", 6000)]))).toBe("Combined from 2 rows · £260.00");
    expect(combinedPrice([row("a", "1", MAX_MONEY_PENCE), row("b", "1", 1)]).unitPricePence).toBeNull();
  });
  it("split parts start blank, show the figure before the split, and the total is incomplete until both are priced", () => {
    const parent = row("p", "1", 26000, "split");
    const parts = [row("a", "1", null, "proposed", ["p"]), row("b", "1", null, "proposed", ["p"])];
    expect(originNote(parts[0]!, [parent, ...parts])).toBe("Before the split: £260.00 for the whole row");
    expect(splitBeforeLabel(null)).toBe("Before the split: this row had no price");
    expect(totalLabel(runningTotal([parent, ...parts]))).toBe("Total so far £0.00 · incomplete: 2 rows need a price");
    const priced = [parent, { ...parts[0]!, unitPricePence: 16000 }, { ...parts[1]!, unitPricePence: 10000 }];
    expect(totalLabel(runningTotal(priced))).toBe("Total so far £260.00 · complete");
  });
  it("dismissed, split-away and merged-away rows are not counted", () => {
    const lines = [row("a", "1", 1000, "dismissed"), row("b", "1", 2000, "split"), row("c", "1", 3000, "merged"), row("d", "1", 4000, "merged"),
      row("e", "1", 7000, "accepted", ["c", "d"])];
    expect(runningTotal(lines)).toEqual({ pence: 7000, counted: 1, unpriced: 0, complete: true });
    expect(originNote(lines[4]!, lines)).toBe("Combined from 2 rows · £70.00");
  });
});

describe("price box and rounding", () => {
  it("rounds a line once with the quote's own rule (half to even at the penny), as the saved scope does", () => {
    expect(lineTotalPence(row("a", "2.5", 1001))).toBe(2502);
    expect(lineTotalPence(row("a", "2.5", 1003))).toBe(2508);
    expect(lineTotalPence(row("a", "0", 1000))).toBeNull();
  });
  it("reads plain pounds, leaves blank as no price, and refuses anything else or an amount over the limit", () => {
    expect(priceFromText("120")).toEqual({ pence: 12000, error: null });
    expect(priceFromText("£1,250.50")).toEqual({ pence: 125050, error: null });
    expect(priceFromText(" ")).toEqual({ pence: null, error: null });
    expect(priceFromText("twelve").pence).toBeNull();
    expect(priceFromText("12.345").error).not.toBeNull();
    expect(priceFromText(String(MAX_MONEY_PENCE)).error).toBe("Price exceeds the application limit.");
  });
});
