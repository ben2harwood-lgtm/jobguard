import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractCaptureFixture } from "../capture.js";
import { parseCaptureFixture } from "../capture-fixture-parser.js";
import { checkSpokenNumbers, readSpokenJob } from "../context-reader.js";

const sourceId = "00000000-0000-4000-8000-000000000005";
const cases: { id: string; transcript: string; finding?: string }[] = JSON.parse(
  readFileSync(new URL("./corpus/RT-05-speech-realism.v1.json", import.meta.url), "utf8"),
);
function words(number: number): string {
  const item = cases.find(item => item.id === `RT-05-${String(number).padStart(3, "0")}`);
  if (!item) throw new Error(`Missing RT-05 case ${number}`);
  return item.transcript;
}
function reader(text: string) {
  const { timeline: _timeline, ...output } = readSpokenJob(sourceId, text);
  return output;
}
const paths = ["capture", "gateway", "reader", "checked reader"] as const;
async function outcome(path: typeof paths[number], text: string) {
  if (path === "capture" || path === "gateway") {
    const output = path === "capture" ? parseCaptureFixture(sourceId, text)
      : await extractCaptureFixture(sourceId, text, "rt05-zero-spend");
    return { prices: output.lines.map(line => line.unitPricePence.value), questions: output.questions.map(q => q.question.value) };
  }
  const output = path === "reader" ? reader(text) : checkSpokenNumbers(reader(text), text);
  return { prices: output.lines.map(line => line.unitPricePence.value), questions: output.questions.map(q => q.text) };
}

describe("RT-05 disfluent money qualifiers", () => {
  // One assertion per path and symptom: a safe reader must not conceal an unsafe capture,
  // and a missing question must not conceal a repaired price (or the other way round).
  const p0 = cases.filter(item => /^RT-05-F00[1-4]$/u.test(item.finding ?? ""));
  for (const item of p0) for (const path of paths) {
    const before = false;
    const keepsWrongMoney = false;
    (keepsWrongMoney ? it.fails : it)(`${item.finding} ${item.id} ${path}: qualified money stays open`, async () => {
      expect((await outcome(path, item.transcript)).prices).toEqual([null]);
    });
    (before ? it.fails : it)(`${item.finding} ${item.id} ${path}: asks about the qualified price`, async () => {
      expect((await outcome(path, item.transcript)).questions.some(q => /price/iu.test(q))).toBe(true);
    });
  }
  it.each(p0)("fluent control for $id stays open on all paths", async item => {
    const fluent = item.transcript.replace(/\b(?:er|erm|um|like|you know)\b/giu, "").replace(/\s+/gu, " ");
    for (const path of paths) {
      const result = await outcome(path, fluent);
      expect(result.prices, path).toEqual([null]);
      expect(result.questions.some(q => /price/iu.test(q)), path).toBe(true);
    }
  });
});

describe("RT-05 independent symptoms of open P1 findings", () => {
  for (const path of paths) {
    it(`RT-05-F005 ${path}: a leading er does not discard a hundred pounds`, async () => {
      expect((await outcome(path, words(48))).prices).toEqual([10000]);
    });
  }
  it.fails("RT-05-F006: pal after ninety pounds does not erase the price", () => {
    expect(reader(words(17)).lines[0]!.unitPricePence.value).toBe(9000);
  });
  it.fails.each([
    [1, "Strip-out"], [3, "Electrics"], [6, "Plastering"], [112, "Electrics"],
    [113, "Electrics"], [115, "Electrics"], [116, "Electrics"], [118, "Electrics"],
    [119, "Carpentry"], [120, "Carpentry"], [125, "Plumbing"], [126, "Plumbing"],
    [127, "Plumbing"], [129, "Plastering"], [131, "Plastering"], [137, "Flooring"],
    [138, "Flooring"], [153, "Strip-out"],
  ] as const)("RT-05-F007 case %i: infer the said trade as %s", (number, trade) => {
    expect(reader(words(number)).lines[0]!.trade.value).toBe(trade);
  });
  it.fails.each([
    [158, "Scullery"], [159, "Press"], [160, "Hot press"], [161, "Box room"],
    [162, "Front room"], [163, "Boot room"], [164, "Wet room"],
    [166, "Downstairs loo"], [167, "Upstairs loo"],
  ] as const)("RT-05-F008 case %i: keep the room %s", (number, room) => {
    const output = reader(words(number));
    expect(output.areas.find(area => area.key === output.lines[0]!.areaKey)?.name.value).toBe(room);
  });
  it("RT-05-F009: filler between items never turns the first work into a title", () => {
    const output = reader(words(170));
    expect(output.lines.some(line => /fit the door/iu.test(line.description.value))).toBe(true);
  });
  it.fails("RT-05-F010: fronted sink remains in the work rather than only the title", () => {
    expect(reader(words(47)).lines[0]!.description.value).toContain("sink");
  });
  it.fails("RT-05-F011: forty each is an exact rate for four doors", () => {
    expect(reader(words(5)).lines[0]!.unitPricePence.value).toBe(4000);
  });
  it.fails.each([[193, 15000], [194, 8000], [199, 15000], [200, 15000]] as const)(
    "RT-05-F012 case %i: glued price words retain %i pence", (number, pence) => {
      expect(reader(words(number)).lines[0]!.unitPricePence.value).toBe(pence);
    },
  );
  it.fails.each([[195, "2"], [196, "4"]] as const)(
    "RT-05-F013 case %i: read the glued count %s", (number, count) => {
      expect(reader(words(number)).lines[0]!.quantity.value).toBe(count);
    },
  );
  it.fails("RT-05-F014: a line price does not erase the stated four doors", () => {
    expect(reader(words(100)).lines[0]!.quantity.value).toBe("4");
  });
  it.fails("RT-05-F015: a measured vinyl line keeps its stated lump sum", () => {
    expect(reader(words(197)).lines[0]!.unitPricePence.value).toBe(20000);
  });
});

describe("RT-05 safe recogniser contrasts", () => {
  it.each([96, 97, 98, 99])("case %i: for to ate and won never become extracted counts", number => {
    const output = reader(words(number));
    expect(output.lines[0]!.quantity.value).toBeNull();
    const draft = parseCaptureFixture(sourceId, words(number));
    // A default one draft line is not an extracted physical count of one door.
    expect(draft.lines[0]!.quantity.provenance.kind).toBe("defaulted");
  });
  it.each([4, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95])(
    "case %i: a currency mishearing never becomes GBP through the fixture gateway", async number => {
      expect((await outcome("gateway", words(number))).prices).toEqual([null]);
    },
  );
});
