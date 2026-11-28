import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSpokenJob } from "./context-reader.js";
import { combineModelReading } from "./locate-model-reading.js";
import { contextReaderFloors, evaluateContextReader, formatContextReaderReport, loadContextReaderCases } from "./context-reader-evaluation.js";

const casesPath = fileURLToPath(new URL("../../../docs/fixtures/ai/spoken-quote-understanding/cases.v1.json", import.meta.url));

describe("V2-SQ-C eval gate: Reader A on the spoken-quote understanding set", () => {
  const cases = loadContextReaderCases(casesPath);
  it("holds the set the packet asks for", () => {
    expect(cases).toHaveLength(30);
    expect(cases.filter(item => item.unpunctuated).length).toBeGreaterThanOrEqual(8);
    expect(cases.filter(item => item.areaPrices.length).length).toBeGreaterThanOrEqual(5);
    expect(cases.filter(item => /make (?:that|it)|it's|same again|same as/iu.test(item.text)).length).toBeGreaterThanOrEqual(5);
    expect(new Set(cases.map(item => item.id)).size).toBe(30);
  });
  it("meets the merge floors: no wrong number, no invented work, rooms 85%, trades 80%", () => {
    const report = evaluateContextReader(cases);
    const text = formatContextReaderReport(report);
    if (process.env.CONTEXT_READER_REPORT) writeFileSync(process.env.CONTEXT_READER_REPORT, `${text}\n`);
    expect(contextReaderFloors(report), text).toEqual({ wrongNumbers: true, inventedWork: true, room: true, trade: true });
  });
});

const heldOutPath = fileURLToPath(new URL("../../../docs/fixtures/ai/spoken-quote-understanding/held-out.v1.json", import.meta.url));
describe("V2-SQ-C held-out set (planner-written): hard floor gated, rooms and trades reported", () => {
  it("keeps no wrong or invented number and invents no work", () => {
    const cases = loadContextReaderCases(heldOutPath);
    expect(cases).toHaveLength(10);
    const report = evaluateContextReader(cases);
    const text = formatContextReaderReport(report);
    if (process.env.CONTEXT_READER_HELD_OUT_REPORT) writeFileSync(process.env.CONTEXT_READER_HELD_OUT_REPORT, `${text}\n`);
    expect({ wrongNumbers: report.wrongNumbers, inventedWork: report.inventedWork }, text).toEqual({ wrongNumbers: 0, inventedWork: 0 });
  });
});

const heldOutTwoPath = fileURLToPath(new URL("../../../docs/fixtures/ai/spoken-quote-understanding/held-out-2.v1.json", import.meta.url));
describe("V2-SQ-C held-out set 2 (planner-written): hard floor gated, rooms and trades reported", () => {
  it("keeps no wrong or invented number and invents no work", () => {
    const cases = loadContextReaderCases(heldOutTwoPath);
    expect(cases).toHaveLength(10);
    const report = evaluateContextReader(cases);
    const text = formatContextReaderReport(report);
    if (process.env.CONTEXT_READER_HELD_OUT_2_REPORT) writeFileSync(process.env.CONTEXT_READER_HELD_OUT_2_REPORT, `${text}\n`);
    expect({ wrongNumbers: report.wrongNumbers, inventedWork: report.inventedWork }, text).toEqual({ wrongNumbers: 0, inventedWork: 0 });
  });
});

const recordingsPath = fileURLToPath(new URL("../../../docs/fixtures/ai/spoken-quote-understanding/model-reader-recordings.hand-written.v1.json", import.meta.url));
describe("V2-SQ-G Reader B on hand-written recordings (zero spend): numbers equal to Reader A's, rooms and trades no worse", () => {
  const recordings = (JSON.parse(readFileSync(recordingsPath, "utf8")) as { label: string; recordings: { set: string; id: string; wire: unknown }[] });
  it("is labelled hand-written", () => expect(recordings.label).toMatch(/^HAND-WRITTEN, not model output/u));
  for (const [file, path] of [["cases.v1.json", casesPath], ["held-out.v1.json", heldOutPath], ["held-out-2.v1.json", heldOutTwoPath]] as const) {
    it(`${file}: every recording is used, no number differs from Reader A, no invented work`, () => {
      const cases = loadContextReaderCases(path);
      const byId = new Map(recordings.recordings.filter(item => item.set === file).map(item => [item.id, item.wire]));
      expect(byId.size).toBe(cases.length);
      const combined = (sourceId: string, text: string, id: string) => {
        const { timeline: _, ...a } = readSpokenJob(sourceId, text);
        const result = combineModelReading(a, text, byId.get(id), sourceId);
        expect(result.used, id).toBe(true);
        expect(result.understanding.lines.map(line => [line.quantity, line.unit, line.unitPricePence, line.priceBasis]), id)
          .toEqual(a.lines.map(line => [line.quantity, line.unit, line.unitPricePence, line.priceBasis]));
        expect([result.understanding.areaPrices, result.understanding.wholeJobPrice], id).toEqual([a.areaPrices, a.wholeJobPrice]);
        return result.understanding;
      };
      const before = evaluateContextReader(cases);
      const after = evaluateContextReader(cases, combined);
      const text = `Reader A: rooms ${before.roomRight}/${before.matchedLines}, trades ${before.tradeRight}/${before.matchedLines}; with B: rooms ${after.roomRight}/${after.matchedLines}, trades ${after.tradeRight}/${after.matchedLines}\n${formatContextReaderReport(after)}`;
      expect({ wrongNumbers: after.wrongNumbers, inventedWork: after.inventedWork }, text).toEqual({ wrongNumbers: before.wrongNumbers, inventedWork: 0 });
      expect(after.roomRight, text).toBeGreaterThanOrEqual(before.roomRight);
      expect(after.tradeRight, text).toBeGreaterThanOrEqual(before.tradeRight);
    });
  }
});
