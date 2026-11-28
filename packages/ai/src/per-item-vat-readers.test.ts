// One place for the per-item and VAT sentences, run through both readers: the fixture parser and Reader A.
// Rule (planner, 28 Nov): "a <noun>" or "per <noun>" right after the amount is per-item only when the noun is the
// line's own counted thing; VAT words after a price add a VAT question and never change the number; anything else stays open.
import { describe, expect, it } from "vitest";
import { parseCaptureFixture } from "./capture-fixture-parser.js";
import { readSpokenJob } from "./context-reader.js";

const vat = (text: string) => `Confirm VAT: you said “${text}”. The price is kept as said; VAT is not added or taken off.`;
const readers = {
  parser: (text: string) => { const p = parseCaptureFixture("source", text);
    return { pence: p.lines.map(line => line.unitPricePence.value), questions: p.questions.map(q => q.question.value) }; },
  readerA: (text: string) => { const a = readSpokenJob("source", text);
    return { pence: a.lines.map(line => line.unitPricePence.value), questions: a.questions.map(q => q.text) }; },
};

describe.each(Object.entries(readers))("per-item and VAT words, %s", (_name, read) => {
  it.each(["fit six doors at fifty pounds a door plus VAT", "fit six doors at fifty pounds per door inc VAT", "fit six doors at fifty pounds each plus VAT"])(
    "keeps a per-item price for the counted thing and asks about VAT: %s", text => {
      expect(read(text)).toMatchObject({ pence: [5000] });
      expect(read(text).questions).toContain(vat(text));
    });
  it.each(["fit six doors at fifty pounds a day plus VAT", "fit six doors at fifty pounds a door for the hall"])(
    "leaves it open when the word is not the counted thing, or more words follow: %s", text => {
      expect(read(text).pence).toEqual([null]);
      expect(read(text).questions).toContain(`Confirm price: ${text}`);
    });
  it("keeps a line price said with VAT words and asks about VAT", () => {
    const text = "supply and fit one door for two hundred pounds plus VAT";
    expect(read(text)).toMatchObject({ pence: [20000] });
    expect(read(text).questions).toContain(vat(text));
  });
  // The parser reads these two as one unsplit line and asks; Reader A reads the said figure. Neither invents one.
  it.each([["fit six new panels at 95 a panel", 9500], ["tile 30 square metres at 25 a square metre", 2500],
    ["tile 30 square metres at 25 a square metre plus VAT", 2500]] as const)("never reads another number: %s", (text, said) => {
    for (const pence of read(text).pence) expect([null, said]).toContain(pence);
  });
});

describe("Reader A per-item reads", () => {
  it("reads a bare figure per counted thing, and a rate with VAT words, and leaves other nouns open", () => {
    const line = (text: string) => readSpokenJob("source", text).lines[0]!;
    expect(line("fit six new panels at 95 a panel")).toMatchObject({ quantity: { value: "6" }, unitPricePence: { value: 9500 }, priceBasis: "each" });
    expect(line("fit six new panels at 95 a week")).toMatchObject({ unitPricePence: { value: null }, priceBasis: "none" });
    expect(line("fit panels at 95 a panel")).toMatchObject({ unitPricePence: { value: null } });
    const rate = "tile 30 square metres at 25 a square metre plus VAT";
    const job = readSpokenJob("source", rate);
    expect(job.lines[0]).toMatchObject({ quantity: { value: "30" }, unit: { value: "m²" }, unitPricePence: { value: 2500 }, priceBasis: "per_unit" });
    expect(job.questions.map(q => q.text)).toContain(vat(rate));
  });
});
