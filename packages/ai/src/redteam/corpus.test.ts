import { readdirSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JobRecordProposal, JobUnderstanding } from "@jobguard/core";
import { numberWords, parseCaptureFixture } from "../capture-fixture-parser.js";
import { checkSpokenNumbers, readSpokenJob, spokenNumbers } from "../context-reader.js";
import { hideRoomNumbers } from "../room-words.js";

const pence = z.number().int().nonnegative().safe();
const expectedLine = z.strictObject({
  descriptionIncludes: z.string().min(1),
  room: z.string().nullable().optional(),
  trade: z.string().optional(),
  quantity: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPricePence: z.union([pence.nullable(), z.array(pence.nullable()).min(1)]).optional(),
  priceBasis: z.enum(["line", "each", "per_unit", "none"]).optional(),
});
const corpusCase = z.strictObject({
  id: z.string().min(1), lane: z.string().regex(/^RT-\d{2}$/u),
  transcript: z.string().min(1), why: z.string().min(1),
  expect: z.strictObject({
    lines: z.array(expectedLine).optional(),
    areaPrices: z.array(z.strictObject({ room: z.string(), pence })).optional(),
    wholeJobPricePence: pence.nullable().optional(),
    questionsInclude: z.array(z.string().min(1)).optional(),
    neverPence: z.array(pence).optional(),
    lineCount: z.number().int().nonnegative().optional(),
  }),
  status: z.enum(["pass", "open-finding"]), finding: z.string().min(1).optional(),
}).refine(item => item.status !== "open-finding" || item.finding !== undefined,
  "An open-finding case needs a finding id");
type Case = z.infer<typeof corpusCase>;
type Lines = JobRecordProposal["lines"];
type Provenance = Lines[number]["description"]["provenance"];
type Money = { value: number | null; provenance: Provenance };
const sourceId = "00000000-0000-4000-8000-000000000001";
const corpusDir = new URL("./corpus/", import.meta.url);
const files = readdirSync(corpusDir).filter(file => file.endsWith(".v1.json")).sort();
const cases = files.flatMap(file => z.array(corpusCase).min(1)
  .parse(JSON.parse(readFileSync(new URL(file, corpusDir), "utf8"))));
const numberWord = `(?:${Object.keys(numberWords).join("|")}|hundred|thousand|grand|half|point)`;
const numberBefore = new RegExp(`(?:\\d|£|\\b${numberWord}(?:[\\s-]+and)?)[\\s-]*$`, "iu");
const numberAfter = new RegExp(`^[\\s-]*(?:\\d|£|(?:and[\\s-]+)?${numberWord}\\b)`, "iu");
const unitWords = (words: string) => words.trim().toLowerCase().replace(/\s+/gu, " ")
  .replace(/^(?:square met(?:re|er)s?|sq(?:uare)?\.?\s?m|m2|m²)$/u, "m²")
  .replace(/^(?:linear met(?:re|er)s?|met(?:re|er)s?)$/u, "m");

// Collect rather than throw: every invariant runs even when an expectation already failed.
function invariants(output: { lines: Lines }, transcript: string, money: Money[]): string[] {
  const failures: string[] = [];
  // A numbered room ("Bedroom two £500") names the price's home, not a larger amount.
  // Keep the original transcript for citation content; masking preserves every offset.
  const moneyContext = hideRoomNumbers(transcript);
  const visit = (value: unknown, path: string) => {
    if (value === null || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (object.kind === "extracted") {
      const span = object.span as { start: number; end: number; sourceId: string; sourceVersion: number } | undefined;
      if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end)
        || span.start < 0 || span.end > transcript.length || span.start >= span.end
        || span.sourceId !== sourceId || span.sourceVersion !== 1) failures.push(`S4 ${path}: invalid source span`);
    }
    const provenance = object.provenance as Provenance | undefined;
    if ("value" in object && provenance?.kind === "extracted" && typeof object.value !== "number") {
      const words = transcript.slice(provenance.span.start, provenance.span.end);
      let matches = words === object.value;
      if (typeof object.value === "string") {
        if (path.endsWith(".quantity")) matches = spokenNumbers.count(words) !== null
          && spokenNumbers.count(words) === Number(object.value);
        if (path.endsWith(".name")) matches = words.toLowerCase() === object.value.toLowerCase();
        if (path.endsWith(".unit")) matches = unitWords(words) === unitWords(object.value);
      }
      if (!matches) failures.push(`S4 ${path}: span points at different words`);
    }
    for (const [key, child] of Object.entries(object)) visit(child, `${path}.${key}`);
  };
  visit(output, "output");
  for (const price of money) {
    if (price.value === null) continue;
    const provenance = price.provenance;
    if (provenance.kind !== "extracted"
      || !Number.isSafeInteger(price.value)
      || spokenNumbers.money(transcript.slice(provenance.span.start, provenance.span.end)) !== price.value
      || numberBefore.test(moneyContext.slice(0, provenance.span.start))
      || numberAfter.test(transcript.slice(provenance.span.end))
      || (/[.,]$/u.test(transcript.slice(0, provenance.span.start)) && /^\d/u.test(transcript.slice(provenance.span.start)))
      || /^[.,]\d/u.test(transcript.slice(provenance.span.end))) {
      failures.push(`M1 ${price.value}: no exact cited money`);
    }
  }
  money.forEach((price, index) => {
    if (price.value === null || price.provenance.kind !== "extracted") return;
    const own = price.provenance.span;
    for (const other of money.slice(0, index)) {
      if (other.value !== null && other.provenance.kind === "extracted"
        && own.start < other.provenance.span.end && other.provenance.span.start < own.end)
        failures.push(`S2 money ${index}: overlaps another money span`);
    }
  });
  output.lines.forEach((line, index) => {
    const own = line.description.provenance;
    for (const other of output.lines.slice(0, index)) {
      const previous = other.description.provenance;
      // The same words must never become two lines, even when both prices were cleared.
      const overlap = own.kind === "extracted" && previous.kind === "extracted"
        && own.span.start < previous.span.end && previous.span.start < own.span.end;
      const inferredDuplicate = (own.kind !== "extracted" || previous.kind !== "extracted")
        && line.description.value.trim().toLowerCase() === other.description.value.trim().toLowerCase();
      if (overlap || inferredDuplicate) failures.push(`S2 line ${index}: duplicates one said item`);
    }
  });
  return failures;
}

function checkLines(lines: Lines, expected: Case["expect"], understanding?: JobUnderstanding): string[] {
  const failures: string[] = [];
  const equal = (actual: unknown, wanted: unknown, label: string) => {
    if (!isDeepStrictEqual(actual, wanted)) failures.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
  };
  if (expected.lineCount !== undefined) equal(lines.length, expected.lineCount, "lineCount");
  const used = new Set<number>();
  for (const wanted of expected.lines ?? []) {
    const index = lines.findIndex((line, at) => !used.has(at)
      && line.description.value.toLowerCase().includes(wanted.descriptionIncludes.toLowerCase()));
    if (index < 0) { failures.push(`Missing line: ${wanted.descriptionIncludes}`); continue; }
    used.add(index);
    const line = lines[index]!;
    for (const field of ["quantity", "unit", "unitPricePence"] as const) {
      const value = wanted[field];
      if (Array.isArray(value)) {
        if (!value.includes(line.unitPricePence.value)) failures.push(`${wanted.descriptionIncludes}.${field}: expected one of ${JSON.stringify(value)}`);
      } else if (value !== undefined) equal(line[field].value, value, `${wanted.descriptionIncludes}.${field}`);
    }
    // v1 has no room, trade or basis fields; Reader A owns those assertions.
    if (understanding) {
      const read = understanding.lines[index]!;
      const room = understanding.areas.find(area => area.key === read.areaKey);
      if (wanted.room !== undefined) equal(room?.kind === "whole_job" ? null : room?.name.value, wanted.room, "room");
      if (wanted.trade !== undefined) equal(read.trade.value, wanted.trade, "trade");
      if (wanted.priceBasis !== undefined) equal(read.priceBasis, wanted.priceBasis, "priceBasis");
    }
  }
  return failures;
}

function checkOutput(output: JobRecordProposal | JobUnderstanding, item: Case): string[] {
  const understanding = "areas" in output ? output : undefined;
  const money: Money[] = output.lines.map(line => line.unitPricePence);
  if (understanding) {
    for (const price of understanding.areaPrices) money.push({ value: price.pence, provenance: price.provenance });
    if (understanding.wholeJobPrice) money.push({ value: understanding.wholeJobPrice.pence, provenance: understanding.wholeJobPrice.provenance });
  }
  const failures = [...invariants(output, item.transcript, money), ...checkLines(output.lines, item.expect, understanding)];
  for (const price of money) if (price.value !== null && item.expect.neverPence?.includes(price.value)) failures.push(`Forbidden pence: ${price.value}`);
  const questions = output.questions.map(question => "text" in question ? question.text : question.question.value);
  for (const words of item.expect.questionsInclude ?? []) {
    if (!questions.some(question => question.toLowerCase().includes(words.toLowerCase()))) failures.push(`Missing question: ${words}`);
  }
  if (understanding) {
    if (item.expect.wholeJobPricePence !== undefined
      && (understanding.wholeJobPrice?.pence ?? null) !== item.expect.wholeJobPricePence) failures.push("Wrong whole-job price");
    if (item.expect.areaPrices !== undefined) {
      const prices = understanding.areaPrices.map(price => ({
        room: understanding.areas.find(area => area.key === price.areaKey)!.name.value, pence: price.pence,
      }));
      const sorted = (values: typeof prices) => values.map(value => JSON.stringify(value)).sort();
      if (!isDeepStrictEqual(sorted(prices), sorted(item.expect.areaPrices))) failures.push(`Wrong area prices: ${JSON.stringify(prices)}`);
    }
  }
  return failures;
}

function runCase(item: Case): string[] {
  const failures: string[] = [];
  const run = (path: string, read: () => JobRecordProposal | JobUnderstanding) => {
    // Parse failures are findings too, but never skip the other path.
    let output: JobRecordProposal | JobUnderstanding;
    try { output = read(); } catch (error) { failures.push(`${path}: ${String(error)}`); return; }
    failures.push(...checkOutput(output, item).map(failure => `${path}: ${failure}`));
  };
  run("capture", () => parseCaptureFixture(sourceId, item.transcript));
  let understanding: JobUnderstanding | undefined;
  run("reader", () => {
    const { timeline: _timeline, ...read } = readSpokenJob(sourceId, item.transcript);
    understanding = read;
    return read;
  });
  if (understanding) run("checked reader", () => checkSpokenNumbers(understanding!, item.transcript));
  return failures;
}

function assertStatus(item: Case, failures: string[]) {
  if (item.status === "open-finding") {
    expect(failures, `${item.id} (${item.finding}) now passes: change status to pass and close the finding`).not.toEqual([]);
  } else expect(failures, `${item.id}: ${item.why}`).toEqual([]);
}

describe("spoken-quote red-team corpus", () => {
  it("loads nonempty v1 files and globally unique case ids", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThan(0);
    expect(new Set(cases.map(item => item.id)).size).toBe(cases.length);
  });
  for (const item of cases) it(`${item.lane} ${item.id} [${item.status}]`, () => {
    const failures = runCase(item);
    assertStatus(item, failures);
  });
  afterAll(() => {
    const lanes = [...new Set(cases.map(item => item.lane))].sort();
    process.stdout.write(["Corpus status (unexpected failures fail the suite)", "Lane | Pass | Open", "--- | ---: | ---:", ...lanes.map(lane => {
      const rows = cases.filter(item => item.lane === lane);
      return `${lane} | ${rows.filter(item => item.status === "pass").length} | ${rows.filter(item => item.status === "open-finding").length}`;
    }), ""].join("\n"));
  });
});

describe("corpus runner guards", () => {
  const text = "Fit the door for £150";
  const clean = () => parseCaptureFixture(sourceId, text);
  const guardText = "In the kitchen. Fit six doors for £150. Paint walls for £200. The kitchen all in £300. For the whole job £400.";
  const cite = (transcript: string, words: string): Extract<Provenance, { kind: "extracted" }> => {
    const start = transcript.indexOf(words);
    expect(start).toBeGreaterThanOrEqual(0);
    return { kind: "extracted", span: { sourceId, sourceVersion: 1, start, end: start + words.length } };
  };
  const handmade = (): JobUnderstanding => ({
    version: "job-understanding.v1",
    title: { value: "Work", provenance: { kind: "defaulted", note: "No title" } },
    areas: [{ key: "kitchen", kind: "room", name: { value: "Kitchen", provenance: cite(guardText, "kitchen") } }],
    lines: [
      { description: { value: "Fit six doors", provenance: cite(guardText, "Fit six doors") },
        quantity: { value: "6", provenance: cite(guardText, "six") }, unit: { value: "doors", provenance: cite(guardText, "doors") },
        unitPricePence: { value: 15000, provenance: cite(guardText, "£150") }, areaKey: "kitchen", priceBasis: "line",
        trade: { value: "Carpentry", provenance: { kind: "inferred", note: "From doors" } } },
      { description: { value: "Paint walls", provenance: cite(guardText, "Paint walls") },
        quantity: { value: null, provenance: { kind: "defaulted", note: "Not said" } },
        unit: { value: null, provenance: { kind: "defaulted", note: "Not said" } },
        unitPricePence: { value: 20000, provenance: cite(guardText, "£200") }, areaKey: "kitchen", priceBasis: "line",
        trade: { value: "Decorating", provenance: { kind: "inferred", note: "From paint" } } },
    ],
    areaPrices: [{ areaKey: "kitchen", pence: 30000, provenance: cite(guardText, "£300") }],
    wholeJobPrice: { pence: 40000, provenance: cite(guardText, "£400") }, questions: [],
  });
  const guardCase = (transcript: string): Case => ({ id: "guard", lane: "RT-00", transcript, why: "Runner guard", expect: {}, status: "pass" });

  it("accepts number-word quantities, room capitalisation and distinct money spans", () => {
    expect(checkOutput(handmade(), guardCase(guardText))).toEqual([]);
  });
  it.each(["quantity", "unit", "name"] as const)("rejects an in-bounds but unrelated %s citation", field => {
    const output = handmade();
    const target = field === "name" ? output.areas[0]!.name : output.lines[0]![field];
    target.provenance = cite(guardText, "Paint walls");
    expect(checkOutput(output, guardCase(guardText))).toContain(`S4 output.${field === "name" ? "areas.0.name" : `lines.0.${field}`}: span points at different words`);
  });
  it.each(["metres", "linear metres", "square metres", "sq m", "m2"])("accepts the unit read from %s", words => {
    const transcript = `Fit six ${words}`;
    const line = handmade().lines[0]!;
    line.description = { value: transcript, provenance: cite(transcript, transcript) };
    line.quantity.provenance = cite(transcript, "six");
    line.unit = { value: /square|sq|m2/u.test(words) ? "m²" : "m", provenance: cite(transcript, words) };
    line.unitPricePence = { value: null, provenance: { kind: "defaulted", note: "Not said" } };
    expect(invariants({ lines: [line] }, transcript, [line.unitPricePence])).toEqual([]);
  });
  it.each([
    ["£150", "50", 5000], ["£1500", "£150", 15000], ["£150", "150", 15000],
    ["150.50", "50", 5000], ["1,500", "500", 50000],
    ["£150.50", "£150", 15000], ["£1,500", "£1", 100],
    ["1 50 pounds", "50 pounds", 5000], ["£50 6", "£50", 5000], ["50£", "50", 5000],
    ["one hundred and fifty pounds", "fifty pounds", 5000],
    ["one-hundred-and-fifty pounds", "fifty pounds", 5000],
    ["twenty-five pounds", "five pounds", 500], ["fifty pounds six", "fifty pounds", 5000],
    ["£50 and six", "£50", 5000], ["half £50", "£50", 5000], ["£50 thousand", "£50", 5000],
  ] as const)("rejects partial money in %s citing %s", (transcript, words, value) => {
    const price = { value, provenance: cite(transcript, words) };
    expect(invariants({ lines: [] }, transcript, [price])).toContain(`M1 ${value}: no exact cited money`);
  });
  it.each(["Fit a door for £150.", "Fit a door for £150, then paint walls", "Fit a door for £150 each", "Bedroom two £150 all in"])("accepts a complete amount in %s", transcript => {
    expect(invariants({ lines: [] }, transcript, [{ value: 15000, provenance: cite(transcript, "£150") }])).toEqual([]);
  });
  for (const words of ["£150", "150"]) {
    it.each([
      ["line", "line"], ["line", "area"], ["line", "whole-job"], ["area", "area"], ["area", "whole-job"],
    ] as const)(`rejects overlapping %s / %s money spans citing £150 and ${words}`, (first, second) => {
      const output = handmade();
      for (const line of output.lines) line.unitPricePence = { value: null, provenance: { kind: "defaulted", note: "Not priced" } };
      output.areaPrices = []; output.wholeJobPrice = null;
      let lineIndex = 0;
      for (const [target, said] of [[first, "£150"], [second, words]] as const) {
        const provenance = cite(guardText, said);
        if (target === "line") output.lines[lineIndex++]!.unitPricePence = { value: 15000, provenance };
        else if (target === "area") output.areaPrices.push({ areaKey: "kitchen", pence: 15000, provenance });
        else output.wholeJobPrice = { pence: 15000, provenance };
      }
      expect(checkOutput(output, guardCase(guardText)).some(failure => /^S2 money \d+: overlaps another money span$/u.test(failure))).toBe(true);
    });
  }
  it("accepts either safe correction outcome but rejects the old amount, extra lines or a missing question", () => {
    const item = cases.find(item => item.finding === "RT-00-F002")!;
    const output = handmade();
    output.areas = [{ key: "kitchen", kind: "room", name: { value: "Kitchen", provenance: cite(item.transcript, "kitchen") } }];
    const line = output.lines[1]!;
    line.description = { value: "Paint the kitchen", provenance: cite(item.transcript, "Paint the kitchen") };
    output.lines = [line]; output.areaPrices = []; output.wholeJobPrice = null;
    output.questions = [{ text: "Check this correction", lineIndex: 0 }];
    for (const value of [45000, null]) {
      line.unitPricePence = { value, provenance: value === null ? { kind: "defaulted", note: "Correction left open" } : cite(item.transcript, "£450") };
      expect(checkOutput(output, item)).toEqual([]);
    }
    line.unitPricePence = { value: 40000, provenance: cite(item.transcript, "£400") };
    const failures = checkOutput(output, item);
    expect(failures).toContain("Forbidden pence: 40000");
    expect(failures).toContain("Paint.unitPricePence: expected one of [45000,null]");
    line.unitPricePence = { value: 45000, provenance: cite(item.transcript, "£450") };
    output.lines.push(structuredClone(line));
    expect(checkOutput(output, item)).toContain("lineCount: got 2, expected 1");
    output.lines.pop(); output.questions = [];
    expect(checkOutput(output, item)).toContain("Missing question: check");
  });
  it("detects invented money, duplicated source words and out-of-bounds spans", () => {
    const output = clean();
    const line = output.lines[0]!;
    line.unitPricePence.value = 150;
    output.lines.push(structuredClone(line));
    output.title.provenance = { kind: "extracted", span: { sourceId, sourceVersion: 1, start: 0, end: text.length + 1 } };
    const failures = invariants(output, text, output.lines.map(item => item.unitPricePence));
    for (const rule of ["M1", "S2", "S4"]) expect(failures.some(failure => failure.startsWith(rule))).toBe(true);
  });
  it("rejects a resolved open finding and a malformed finding status", () => {
    const item = corpusCase.parse({ id: "guard", lane: "RT-00", transcript: text, why: "guard", expect: {}, status: "open-finding", finding: "guard" });
    expect(() => assertStatus(item, [])).toThrow(/now passes/u);
    expect(() => assertStatus(item, ["M1 violation"])).not.toThrow();
    expect(corpusCase.safeParse({ ...item, finding: undefined }).success).toBe(false);
  });
  it("rejects an in-bounds citation pointing at the wrong words", () => {
    const output = clean();
    output.lines[0]!.description.provenance = { kind: "extracted", span: { sourceId, sourceVersion: 1, start: 1, end: 4 } };
    expect(invariants(output, text, []).some(failure => failure.includes("different words"))).toBe(true);
  });
  it("does not reuse one actual line to satisfy two expected items", () => {
    const wanted = { descriptionIncludes: "Fit the door" };
    expect(checkLines(clean().lines, { lines: [wanted, wanted] })).toEqual(["Missing line: Fit the door"]);
  });
  it("checks quantities, units, room, trade, basis, totals, questions and forbidden money", () => {
    const transcript = "In the kitchen. Fit two doors at fifty pounds each. The kitchen all in £200. For the whole job £300.";
    const item = corpusCase.parse({ id: "fields", lane: "RT-00", transcript, why: "field guards", status: "pass", expect: {
      lines: [{ descriptionIncludes: "Fit two doors", room: "Kitchen", trade: "Carpentry", quantity: "2", unit: "doors", unitPricePence: 5000, priceBasis: "each" }],
      lineCount: 1, areaPrices: [{ room: "Kitchen", pence: 20000 }], wholeJobPricePence: 30000,
    } });
    const { timeline: _timeline, ...output } = readSpokenJob(sourceId, transcript);
    expect(checkOutput(output, item)).toEqual([]);
    const captureText = "Fit two doors at fifty pounds each";
    expect(checkOutput(parseCaptureFixture(sourceId, captureText), { ...item, transcript: captureText })).toEqual([]);
    const wrong = structuredClone(item);
    Object.assign(wrong.expect.lines![0]!, { room: null, trade: "Plumbing", quantity: "3", unit: "windows", unitPricePence: null, priceBasis: "line" });
    Object.assign(wrong.expect, { lineCount: 2, areaPrices: [], wholeJobPricePence: null, questionsInclude: ["missing question"], neverPence: [30000] });
    const failures = checkOutput(output, wrong);
    for (const label of ["quantity", "unit:", "unitPricePence", "room:", "trade:", "priceBasis", "lineCount", "area prices", "whole-job", "Missing question", "Forbidden pence"])
      expect(failures.some(failure => failure.includes(label)), label).toBe(true);
  });
});
