import { describe, expect, it } from "vitest";
import { checkUnderstandingNumbers, JOB_TRADES, jobUnderstandingV1, toJobRecordProposal, type JobUnderstanding, type SpokenNumberReader } from "./job-understanding.js";

const source = "Kitchen fit six units for 2400, tile 12 square metres at 60 a metre. The kitchen 4.5k all in.";
const span = (words: string) => ({ kind: "extracted" as const, span: { sourceId: "s", sourceVersion: 1 as const, start: source.indexOf(words), end: source.indexOf(words) + words.length } });
const digits: SpokenNumberReader = {
  money: words => /^\d+(?:\.\d)?k$/u.test(words) ? Math.round(Number(words.slice(0, -1)) * 100_000) : /^\d+$/u.test(words) ? Number(words) * 100 : null,
  count: words => words === "six" ? 6 : /^\d+$/u.test(words) ? Number(words) : null,
};
const said = (value: string) => ({ value, provenance: span(value) });
const base = (): JobUnderstanding => jobUnderstandingV1.parse({
  version: "job-understanding.v1", title: said("Kitchen"),
  areas: [{ key: "kitchen", name: said("Kitchen"), kind: "room" }],
  lines: [{ description: said("fit six units"), quantity: { value: "6", provenance: span("six") }, unit: said("units"),
    unitPricePence: { value: 240000, provenance: span("2400") }, areaKey: "kitchen", trade: { value: "Kitchen fitting", provenance: { kind: "inferred", note: "units" } }, priceBasis: "line" }],
  areaPrices: [{ areaKey: "kitchen", pence: 450000, provenance: span("4.5k") }], wholeJobPrice: null, questions: [],
});

describe("V2-SQ-C job understanding contract and money rule", () => {
  it("keeps numbers whose cited words read to exactly that value", () => {
    expect(checkUnderstandingNumbers(base(), source, digits)).toEqual(base());
  });
  it("clears a number the words do not say and asks about it", () => {
    const changed = base();
    changed.lines[0]!.unitPricePence = { value: 250000, provenance: span("2400") };
    changed.lines[0]!.quantity = { value: "7", provenance: span("six") };
    const checked = checkUnderstandingNumbers(changed, source, digits);
    expect(checked.lines[0]).toMatchObject({ quantity: { value: null }, unitPricePence: { value: null }, priceBasis: "none" });
    expect(checked.questions.map(question => question.text)).toEqual(["How many for “fit six units”?", "Price needed for “fit six units”."]);
  });
  it("clears an inferred number and a span that is only part of a said number", () => {
    const changed = base();
    changed.lines[0]!.unitPricePence = { value: 240000, provenance: { kind: "inferred", note: "guess" } };
    const at = source.indexOf("4.5k") + 2;
    changed.areaPrices = [{ areaKey: "kitchen", pence: 500000, provenance: { kind: "extracted", span: { sourceId: "s", sourceVersion: 1, start: at, end: at + 2 } } }];
    const checked = checkUnderstandingNumbers(changed, source, digits);
    expect(checked.lines[0]!.unitPricePence.value).toBeNull();
    expect(checked.areaPrices).toEqual([]);
    expect(checked.questions.at(-1)).toEqual({ text: "Price needed for this room.", areaKey: "kitchen" });
  });
  it("refuses a room or whole-job price without cited words, and unknown areas", () => {
    expect(() => jobUnderstandingV1.parse({ ...base(), wholeJobPrice: { pence: 100, provenance: { kind: "inferred", note: "x" } } })).toThrow();
    expect(() => jobUnderstandingV1.parse({ ...base(), areaPrices: [{ areaKey: "bathroom", pence: 1, provenance: span("2400") }] })).toThrow();
    expect(JOB_TRADES).toContain("Tiling");
    expect(JOB_TRADES).toContain("Decorating");
  });
  it("turns back into today's proposal without spreading a room price onto lines", () => {
    const proposal = toJobRecordProposal(base());
    expect(proposal.lines).toEqual([{ description: said("fit six units"), quantity: { value: "6", provenance: span("six") }, unit: said("units"), unitPricePence: { value: 240000, provenance: span("2400") } }]);
    expect(proposal.questions.map(question => question.question.value)).toEqual(["You said £4,500 for Kitchen. It stays on the room, not spread across its lines."]);
    const open = base();
    open.lines[0]!.quantity = { value: null, provenance: { kind: "defaulted", note: "Not said" } };
    open.lines[0]!.unit = { value: null, provenance: { kind: "defaulted", note: "Not said" } };
    expect(toJobRecordProposal(open).lines[0]).toMatchObject({ quantity: { value: "1", provenance: { kind: "defaulted" } }, unit: { value: "item", provenance: { kind: "defaulted" } } });
  });
});
