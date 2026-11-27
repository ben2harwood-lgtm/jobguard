import { readFileSync } from "node:fs";
import { readSpokenJob } from "./context-reader.js";

/**
 * V2-SQ-C eval gate for Reader A over docs/fixtures/ai/spoken-quote-understanding/cases.v1.json. Deterministic:
 * no model, no network. A number is wrong when the reader keeps one that is not exactly the said number.
 */
type ExpectedLine = { words: string; room: string; trade: string; quantity: string | null; unit: string | null; pence: number | null; basis: string };
type Case = { id: string; text: string; unpunctuated?: boolean; lines: ExpectedLine[]; areaPrices: { room: string; pence: number }[];
  wholeJobPence: number | null; questions: { line?: string; contains?: string }[] };
export type ContextReaderReport = {
  cases: number; expectedLines: number; missedWork: number; inventedWork: number; wrongNumbers: number; missedNumbers: number;
  roomRight: number; tradeRight: number; matchedLines: number; questionsExpected: number; questionsRaised: number;
  misses: string[];
};

export function loadContextReaderCases(path: string): Case[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { version: string; cases: Case[] };
  if (parsed.version !== "spoken-quote-understanding-cases.v1") throw new Error("Unknown case set version");
  return parsed.cases;
}

export function evaluateContextReader(cases: Case[]): ContextReaderReport {
  const report: ContextReaderReport = { cases: cases.length, expectedLines: 0, missedWork: 0, inventedWork: 0, wrongNumbers: 0, missedNumbers: 0,
    roomRight: 0, tradeRight: 0, matchedLines: 0, questionsExpected: 0, questionsRaised: 0, misses: [] };
  for (const item of cases) {
    const result = readSpokenJob(`case-${item.id}`, item.text);
    const roomOf = new Map(result.areas.map(area => [area.key, area.name.value]));
    const used = new Set<number>();
    const matched = new Map<string, number>();
    const miss = (text: string) => report.misses.push(`${item.id}: ${text}`);
    let after = -1;
    for (const expected of item.lines) {
      report.expectedLines++;
      const words = expected.words.toLowerCase();
      let index = result.lines.findIndex((line, at) => at > after && !used.has(at) && line.description.value.toLowerCase().includes(words));
      if (index === -1) index = result.lines.findIndex((line, at) => !used.has(at) && line.description.value.toLowerCase().includes(words));
      if (index === -1) { report.missedWork++; miss(`missed work “${expected.words}”`); continue; }
      used.add(index); after = index; matched.set(expected.words, index); report.matchedLines++;
      const line = result.lines[index]!;
      const room = roomOf.get(line.areaKey) ?? "?";
      if (room === expected.room) report.roomRight++; else miss(`room for “${expected.words}”: ${room}, expected ${expected.room}`);
      if (line.trade.value === expected.trade) report.tradeRight++; else miss(`trade for “${expected.words}”: ${line.trade.value}, expected ${expected.trade}`);
      for (const [name, actual, said] of [["quantity", line.quantity.value, expected.quantity], ["price", line.unitPricePence.value, expected.pence]] as const) {
        if (actual !== null && actual !== said) { report.wrongNumbers++; miss(`WRONG ${name} for “${expected.words}”: ${actual}, said ${said}`); }
        else if (actual === null && said !== null) { report.missedNumbers++; miss(`${name} not kept for “${expected.words}” (said ${said})`); }
      }
    }
    result.lines.forEach((line, at) => { if (!used.has(at)) { report.inventedWork++; miss(`INVENTED work “${line.description.value}”`); } });
    for (const price of result.areaPrices) {
      const room = roomOf.get(price.areaKey);
      if (!item.areaPrices.some(said => said.room === room && said.pence === price.pence)) { report.wrongNumbers++; miss(`WRONG room price ${room} ${price.pence}`); }
    }
    for (const said of item.areaPrices) {
      if (!result.areaPrices.some(price => roomOf.get(price.areaKey) === said.room && price.pence === said.pence)) { report.missedNumbers++; miss(`room price not kept: ${said.room} ${said.pence}`); }
    }
    const whole = result.wholeJobPrice?.pence ?? null;
    if (whole !== null && whole !== item.wholeJobPence) { report.wrongNumbers++; miss(`WRONG whole-job price ${whole}`); }
    else if (whole === null && item.wholeJobPence !== null) { report.missedNumbers++; miss(`whole-job price not kept (said ${item.wholeJobPence})`); }
    for (const question of item.questions) {
      report.questionsExpected++;
      const lineIndex = question.line === undefined ? undefined : matched.get(question.line);
      const raised = result.questions.some(asked => (question.line === undefined || asked.lineIndex === lineIndex)
        && (question.contains === undefined || asked.text.toLowerCase().includes(question.contains.toLowerCase())));
      if (raised) report.questionsRaised++; else miss(`question not raised${question.line ? ` on “${question.line}”` : ""}${question.contains ? ` (“${question.contains}”)` : ""}`);
    }
  }
  return report;
}

export const contextReaderFloors = (report: ContextReaderReport) => ({
  wrongNumbers: report.wrongNumbers === 0,
  inventedWork: report.inventedWork === 0,
  room: report.roomRight >= Math.ceil(0.85 * report.expectedLines),
  trade: report.tradeRight >= Math.ceil(0.8 * report.expectedLines),
});

export function formatContextReaderReport(report: ContextReaderReport): string {
  const pct = (count: number) => `${count}/${report.expectedLines} (${Math.round(100 * count / Math.max(1, report.expectedLines))}%)`;
  return [
    `Reader A on ${report.cases} transcripts, ${report.expectedLines} expected lines`,
    `wrong or invented numbers: ${report.wrongNumbers} (floor 0)`,
    `invented work: ${report.inventedWork} (floor 0)`,
    `missed work: ${report.missedWork}`,
    `room right: ${pct(report.roomRight)} (floor 85%)`,
    `trade right: ${pct(report.tradeRight)} (floor 80%)`,
    `said numbers not kept (asked instead): ${report.missedNumbers}`,
    `questions raised when expected: ${report.questionsRaised}/${report.questionsExpected}`,
    "Per-fixture misses:",
    ...(report.misses.length ? report.misses.map(text => `  - ${text}`) : ["  none"]),
  ].join("\n");
}
