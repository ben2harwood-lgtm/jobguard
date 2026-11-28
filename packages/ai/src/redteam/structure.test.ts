import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JobRecordProposal, JobUnderstanding } from "@jobguard/core";
import { parseCaptureFixture } from "../capture-fixture-parser.js";
import { checkSpokenNumbers, readSpokenJob } from "../context-reader.js";

// Alternative outcomes are intentional: an exact shared/leading price OR a question is safe.
// These assertions must not force a valid conservative parser to invent a particular line split.
const sourceId = "00000000-0000-4000-8000-000000000001";
const head = "a44f5d35b363a5182b166ff724d2d09ca5c1060f";
type Output = JobRecordProposal | JobUnderstanding;
type FocusCase = {
  id: string; transcript: string; words: string[]; pence: number; priceWords: string;
  room?: string; totalOnly?: boolean;
  why: string; status: "pass" | "open-finding"; finding?: string;
};
type CorpusItem = Pick<FocusCase, "id" | "transcript" | "why" | "status" | "finding">;
const corpus = JSON.parse(readFileSync(new URL("./corpus/RT-04-structure.v1.json", import.meta.url), "utf8")) as CorpusItem[];

const alternativeSpecs: Omit<FocusCase, "transcript" | "why" | "status" | "finding">[] = [
  {"id": "RT-04-109", "words": ["painting"], "pence": 30000, "priceWords": "300", "room": "Hall"},
  {"id": "RT-04-110", "words": ["tiling"], "pence": 32500, "priceWords": "325", "room": "Kitchen"},
  {"id": "RT-04-111", "words": ["plumbing"], "pence": 35000, "priceWords": "350", "room": "Bathroom"},
  {"id": "RT-04-112", "words": ["decorating"], "pence": 37500, "priceWords": "375", "room": "Lounge"},
  {"id": "RT-04-113", "words": ["painting"], "pence": 40000, "priceWords": "400", "room": "Bedroom two"},
  {"id": "RT-04-114", "words": ["paving"], "pence": 42500, "priceWords": "425", "room": "Garden"},
  {"id": "RT-04-115", "words": ["flooring"], "pence": 45000, "priceWords": "450", "room": "Garage"},
  {"id": "RT-04-116", "words": ["repairs"], "pence": 47500, "priceWords": "475", "room": "Roof"},
  {"id": "RT-04-117", "words": ["shelving"], "pence": 50000, "priceWords": "500", "room": "Study"},
  {"id": "RT-04-118", "words": ["painting"], "pence": 52500, "priceWords": "525", "room": "Landing"},
  {"id": "RT-04-119", "words": ["plastering"], "pence": 55000, "priceWords": "550", "room": "Box room"},
  {"id": "RT-04-120", "words": ["drainage"], "pence": 57500, "priceWords": "575", "room": "Side return"},
  {"id": "RT-04-134", "words": ["hall", "landing", "stairs"], "pence": 90000, "priceWords": "900"},
  {"id": "RT-04-135", "words": ["doors", "skirting", "architrave"], "pence": 60000, "priceWords": "600"},
  {"id": "RT-04-136", "words": ["bedroom"], "pence": 50000, "priceWords": "five hundred", "room": "Bedroom two", "totalOnly": true},
  {"id": "RT-04-137", "words": ["strip out", "fit units", "tile splashback", "paint ceiling"], "pence": 120000, "priceWords": "1200", "room": "Kitchen"},
  {"id": "RT-04-017", "words": ["paint the walls"], "pence": 50000, "priceWords": "five hundred", "room": "Bedroom five", "totalOnly": true},
];
const alternatives: FocusCase[] = alternativeSpecs.map(spec => {
  const item = corpus.find(item => item.id === spec.id);
  if (!item) throw new Error(`Missing RT-04 corpus case ${spec.id}`);
  return { ...item, ...spec };
});

function outputs(transcript: string): [string, Output][] {
  const { timeline: _timeline, ...reader } = readSpokenJob(sourceId, transcript);
  return [["capture", parseCaptureFixture(sourceId, transcript)], ["reader", reader],
    ["checked reader", checkSpokenNumbers(reader, transcript)]];
}
const questionText = (output: Output) => output.questions.map(q => "text" in q ? q.text : q.question.value);
const money = (output: Output) => [
  ...output.lines.flatMap(line => line.unitPricePence.value === null ? [] : [line.unitPricePence.value]),
  ...("areas" in output ? [...output.areaPrices.map(price => price.pence), ...(output.wholeJobPrice ? [output.wholeJobPrice.pence] : [])] : []),
];
const hasWords = (text: string, words: string[]) => words.every(word => text.toLowerCase().includes(word.toLowerCase()));

function alternativeFailures(item: FocusCase, output: Output): string[] {
  const failures: string[] = [];
  const questions = questionText(output);
  const descriptions = output.lines.map(line => line.description.value);
  for (const word of item.words) {
    if (![...descriptions, ...questions].some(text => hasWords(text, [word]))) failures.push(`Lost work: ${word}`);
  }
  for (const price of money(output)) if (price !== item.pence) failures.push(`Wrong money: ${price}; expected only ${item.pence}`);
  // A whole-job/area total covers the group. A line price must cover every named item itself.
  for (const line of output.lines) {
    if (line.unitPricePence.value !== null && !hasWords(line.description.value, item.words))
      failures.push(`Shared price placed on only part of the work: ${line.description.value}`);
  }
  if (item.totalOnly && (output.lines.some(line => line.unitPricePence.value !== null)
    || "areas" in output && output.wholeJobPrice !== null)) failures.push("Room total placed on a line or the whole job");
  if ("areas" in output && item.room) {
    const name = (key: string) => output.areas.find(area => area.key === key)?.name.value.toLowerCase();
    for (const line of output.lines) if (line.unitPricePence.value !== null && name(line.areaKey) !== item.room.toLowerCase())
      failures.push(`Line price belongs in ${item.room}`);
    for (const price of output.areaPrices) if (name(price.areaKey) !== item.room.toLowerCase())
      failures.push(`Area price belongs in ${item.room}`);
  }
  const asked = output.questions.some((q, index) => {
    const text = questions[index]!;
    const lineIndex = "lineIndex" in q ? q.lineIndex : undefined;
    // v1 questions have no lineIndex. With one complete fallback line, "this line" is unambiguous.
    const linked = lineIndex === undefined
      ? descriptions.length === 1 && /check this line/iu.test(text) ? descriptions[0]! : ""
      : descriptions[lineIndex] ?? "";
    // A linked "Check this line" preserves a full fallback transcript, too.
    return /\b(?:check|confirm|which|price|split)\b/iu.test(text)
      && (text.includes(item.priceWords) || linked.includes(item.priceWords));
  });
  if (!money(output).includes(item.pence) && !asked) failures.push(`Lost amount: ${item.priceWords}; neither kept nor questioned`);
  return failures;
}

function assertStatus(item: { id: string; status: string; finding?: string }, failures: string[]) {
  if (item.status === "open-finding") {
    expect(item.finding).toMatch(/^RT-04-F\d{3}$/u);
    expect(failures, `${item.id} ${item.finding} now passes; close the finding`).not.toEqual([]);
  } else expect(failures, `${item.id} at ${head}`).toEqual([]);
}

// Do not mistake a quoted transcript containing "second job" for a boundary warning.
const unquoted = (text: string) => text.replace(/[“"].*?[”"]/gu, "");
const boundaryQuestion = (text: string) => {
  const own = unquoted(text);
  return /\b(?:jobs?|customers?|clients?|addresses|address|properties|property)\b/iu.test(own)
    && /\b(?:two|multiple|separate|different|which|confirm|more than one)\b/iu.test(own);
};

describe("RT-04 focused structural alternatives", () => {
  for (const item of alternatives) it(`${item.id} [${item.status}]: ${item.why}`, () => {
    const failures = outputs(item.transcript).flatMap(([path, output]) => alternativeFailures(item, output).map(failure => `${path}: ${failure}`));
    assertStatus(item, failures);
  });
  for (const item of corpus.filter(item => item.why.startsWith("Multiple jobs:"))) {
    it(`${item.id}: an explicit customer/address question, not echoed speech`, () => {
      const failures = outputs(item.transcript).flatMap(([path, output]) =>
        questionText(output).some(boundaryQuestion) ? [] : [`${path}: no explicit multiple-job boundary question`]);
      assertStatus(item, failures);
    });
  }
  for (const item of corpus.filter(item => item.why.startsWith("Totals mismatch:"))) {
    it(`${item.id}: Reader A questions the arithmetic discrepancy`, () => {
      const failures = outputs(item.transcript).filter(([path]) => path !== "capture").flatMap(([path, output]) =>
        questionText(output).some(text => /\b(?:total|sum|discrepancy|mismatch)\b|add up/iu.test(unquoted(text)))
          ? [] : [`${path}: no total discrepancy question`]);
      assertStatus(item, failures);
    });
  }
});
