import { describe, expect, it } from "vitest";
import { extractCaptureFixture } from "./capture.js";
import { checkSpokenNumbers, readSpokenJob } from "./context-reader.js";

const sourceId = "00000000-0000-4000-8000-000000000002";

describe("amounts that are limits or credits", () => {
  it.each([
    "up to two hundred pounds", "at most £200", "no more than £200", "a maximum of £200",
    "at least two hundred pounds", "£200 minimum", "two hundred pounds or less", "a maximum price of £200",
    "prices starting at £200", "£200 tops", "minus fifty pounds", "-£50", "−£50", "a credit of £50",
    "fifty pounds credit", "fifty pounds off the bill",
  ])("keeps %s unpriced on both draft paths and asks the builder", async words => {
    const text = `Paint the lounge ceiling for ${words}`;
    const proposal = await extractCaptureFixture(sourceId, text, "price-qualifier-test");
    const read = readSpokenJob(sourceId, text);
    expect(proposal.lines.map(line => line.unitPricePence.value)).toEqual([null]);
    expect(proposal.questions.map(q => q.question.value)).toContain(`Confirm price: ${text}`);
    expect(read.lines.map(line => [line.unitPricePence.value, line.priceBasis])).toEqual([[null, "none"]]);
    expect(read.questions.some(q => /price/iu.test(q.text))).toBe(true);
  });

  it("preserves an exact price after a punctuation dash", async () => {
    const text = "Paint the lounge ceiling - £200";
    const proposal = await extractCaptureFixture(sourceId, text, "price-punctuation-test");
    expect(proposal.lines[0]!.unitPricePence.value).toBe(20000);
    expect(readSpokenJob(sourceId, text).lines[0]!.unitPricePence.value).toBe(20000);
  });

  it("keeps an exact rate in the next room with its own VAT and source words", async () => {
    const text = "In the lounge. Hang six doors at up to fifty pounds each. In the kitchen. Hang two doors at forty pounds per door plus VAT.";
    const proposal = await extractCaptureFixture(sourceId, text, "two-rooms-test");
    const read = readSpokenJob(sourceId, text);
    for (const lines of [proposal.lines, read.lines]) {
      expect(lines.map(line => line.unitPricePence.value)).toEqual([null, 4000]);
      expect(lines[1]!.quantity.value).toBe("2");
      const source = lines[1]!.unitPricePence.provenance;
      expect(source.kind === "extracted" && text.slice(source.span.start, source.span.end)).toBe("forty pounds");
    }
    expect(proposal.questions.some(q => /Confirm VAT/u.test(q.question.value))).toBe(true);
    expect(read.questions.some(q => /Confirm VAT/u.test(q.text))).toBe(true);
  });

  it("checked line, room, and whole-job amounts also honour qualifiers outside the cited digits", () => {
    const exact = "In the kitchen paint the ceiling for       £200. The kitchen all in       £300. For the whole job       £400.";
    const { timeline: _timeline, ...original } = readSpokenJob(sourceId, exact);
    expect(original.lines[0]!.unitPricePence.value).toBe(20000);
    expect(original.areaPrices.map(a => a.pence)).toEqual([30000]);
    expect(original.wholeJobPrice?.pence).toBe(40000);
    // Keep the number spans in the same positions. Each candidate cites the correct digits
    // but loses the qualifier if it only checks the selected substring.
    const qualified = exact.replaceAll("      £", "up to £");
    const checked = checkSpokenNumbers(original, qualified);
    expect(checked.lines[0]!.unitPricePence.value).toBeNull();
    expect(checked.areaPrices).toEqual([]);
    expect(checked.wholeJobPrice).toBeNull();
  });
});
