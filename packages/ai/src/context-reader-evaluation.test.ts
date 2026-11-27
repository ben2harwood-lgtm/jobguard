import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
