import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCaptureFixture } from "../capture-fixture-parser.js";
import { checkSpokenNumbers, readSpokenJob } from "../context-reader.js";

const sourceId = "00000000-0000-4000-8000-000000000011";
const cases = JSON.parse(readFileSync(new URL("./corpus/RT-11-totals-currency-units.v1.json", import.meta.url), "utf8")) as {
  id: string; transcript: string;
}[];
// Coats, storeys, bedroom counts and material dimensions describe the work;
// they must never become a multiplier on the line's lump-sum price.
const descriptiveNumbers = cases.filter(item => /^RT-11-(?:09[9]|10\d|11[0-8])$/u.test(item.id));

describe("RT-11 descriptive numbers cannot multiply a lump sum", () => {
  it("covers all twenty quantity traps", () => expect(descriptiveNumbers).toHaveLength(20));
  for (const item of descriptiveNumbers) it(item.id, () => {
    const { timeline: _timeline, ...reader } = readSpokenJob(sourceId, item.transcript);
    for (const output of [parseCaptureFixture(sourceId, item.transcript), reader,
      checkSpokenNumbers(reader, item.transcript)]) {
      expect(output.lines, "One piece of work, not one line per dimension or coat").toHaveLength(1);
      const line = output.lines[0]!;
      expect([null, "1"], "A description number is not the count of the work item").toContain(line.quantity.value);
      if (line.quantity.value === "1") expect(line.quantity.provenance.kind).not.toBe("extracted");
    }
  });
});
