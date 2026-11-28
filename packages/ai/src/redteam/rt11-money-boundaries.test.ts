import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSpokenNumbers, readSpokenJob } from "../context-reader.js";

const sourceId = "00000000-0000-4000-8000-000000000011";
type Case = {
  id: string; transcript: string; status: "pass" | "open-finding"; finding?: string;
  expect: { lines: { descriptionIncludes: string; unitPricePence: number | null }[];
    areaPrices: { room: string; pence: number }[]; wholeJobPricePence: number | null };
};
const corpus = JSON.parse(readFileSync(new URL("./corpus/RT-11-totals-currency-units.v1.json", import.meta.url), "utf8")) as Case[];
const unsafeMoney = new Set([
  "RT-11-046", "RT-11-055", "RT-11-056", "RT-11-057", "RT-11-058", "RT-11-059",
  "RT-11-060", "RT-11-061", "RT-11-062", "RT-11-065", "RT-11-066", "RT-11-068",
  "RT-11-069", "RT-11-071",
]);

// The corpus records every mismatch. These focused checks pin the P0 money failure
// separately, so a repair cannot leave it hidden behind a missing clarification.
describe("RT-11 P0 money boundaries", () => {
  it("covers every unsafe currency or incompatible-rate finding", () => {
    expect(corpus.filter(item => unsafeMoney.has(item.id))).toHaveLength(14);
  });
  for (const item of corpus.filter(item => unsafeMoney.has(item.id))) {
    for (const path of ["reader", "checked reader"] as const) {
      const test = item.status === "open-finding" ? it.fails : it;
      test(`${item.id} ${path} [${item.status}: ${item.finding ?? "fixed"}]`, () => {
        const { timeline: _timeline, ...read } = readSpokenJob(sourceId, item.transcript);
        const output = path === "reader" ? read : checkSpokenNumbers(read, item.transcript);
        // One comparison covers all three possible money homes. Questions are
        // deliberately outside this assertion: only wrong money can fail it.
        expect({
          lines: output.lines.map(line => line.unitPricePence.value),
          areaPrices: output.areaPrices.map(price => ({
            room: output.areas.find(area => area.key === price.areaKey)!.name.value,
            pence: price.pence,
          })),
          wholeJobPricePence: output.wholeJobPrice?.pence ?? null,
        }).toEqual({
          lines: item.expect.lines.map(line => line.unitPricePence),
          areaPrices: item.expect.areaPrices,
          wholeJobPricePence: item.expect.wholeJobPricePence,
        });
      });
    }
  }
});
