import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { JobRecordProposal, JobUnderstanding } from "@jobguard/core";
import { parseCaptureFixture } from "../capture-fixture-parser.js";
import { extractCaptureFixture } from "../capture.js";
import { checkSpokenNumbers, readSpokenJob } from "../context-reader.js";

// HEAD_UNDER_TEST: ac8065af7305d9cc3db110eff4eb38d47248fa51. Synthetic, offline, no providers.
// Truth starts with integer amounts and work parts. No parser/reader supplies expected values.
const sourceId = "00000000-0000-4000-8000-000000000013";
const seed = 0x13c0ffee;
const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function words(value: number): string {
  if (value < 20) return small[value]!;
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${small[value % 10]}` : ""}`;
  return `${small[Math.floor(value / 100)]} hundred${value % 100 ? ` and ${words(value % 100)}` : ""}`;
}
function random(seedValue: number) {
  let state = seedValue >>> 0;
  return (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * limit);
  };
}
const rooms = ["kitchen", "lounge", "bathroom", "bedroom two", "bedroom three", "hall"];
const work = [
  { verb: "Fit", object: "doors", trade: "Carpentry" },
  { verb: "Paint", object: "walls", trade: "Decorating" },
  { verb: "Install", object: "sockets", trade: "Electrics" },
  // Window material is unspecified: the words do not establish a particular trade.
  { verb: "Hang", object: "windows", trade: null },
];
const qualifiers = ["", "", "", "up to ", "minus ", "about ", "at most ", "a maximum of "];
type Truth = {
  description: string; room: string; trade: string | null; quantity: string; unit: string;
  price: number | null; amount: string; start: number; end: number;
};
function generated(pick: ReturnType<typeof random>) {
  let transcript = "";
  const truth: Truth[] = [];
  const count = 2 + pick(3), first = pick(work.length);
  for (let index = 0; index < count; index++) {
    const item = work[(first + index) % work.length]!, room = rooms[pick(rooms.length)]!;
    const quantity = 2 + pick(8), pounds = 1 + pick(999), format = pick(5);
    const amount = format === 0 ? `£${pounds}` : format === 1 ? `${pounds} pounds`
      : format === 2 ? `${words(pounds)} pounds` : format === 3 ? `${words(pounds)} quid`
      : pounds >= 100 && pounds < 200 ? `a hundred${pounds % 100 ? ` and ${words(pounds % 100)}` : ""} pounds` : `£${pounds}`;
    const qualifier = qualifiers[pick(qualifiers.length)]!;
    const description = `${item.verb} ${pick(2) ? words(quantity) : quantity} ${item.object}`;
    const clause = `In the ${room}. ${description} at ${qualifier}${amount} each.`;
    const start = transcript.length + clause.indexOf(amount);
    transcript += clause + " ";
    truth.push({ description, room, trade: item.trade, quantity: String(quantity), unit: item.object,
      price: qualifier ? null : pounds * 100, amount, start, end: start + amount.length });
  }
  return { transcript: transcript.trimEnd(), truth };
}

type Output = JobRecordProposal | JobUnderstanding;
function assertTruth(output: Output, transcript: string, truth: Truth[]) {
  expect(output.lines).toHaveLength(truth.length); // S1/S2, not merely an upper bound.
  const used = new Set<number>();
  for (const wanted of truth) {
    const index = output.lines.findIndex((line, at) => !used.has(at)
      && line.description.value.toLowerCase().includes(wanted.description.toLowerCase()));
    expect(index, `Missing ${wanted.description}`).toBeGreaterThanOrEqual(0);
    used.add(index);
    const line = output.lines[index]!;
    const price = line.unitPricePence;
    // A clean amount may be left open, but it may never become a different number.
    expect(price.value === null || price.value === wanted.price, `Wrong money for ${wanted.description}`).toBe(true);
    if (price.value !== null) {
      expect(price.provenance.kind).toBe("extracted");
      if (price.provenance.kind === "extracted") {
        expect(price.provenance.span.start).toBe(wanted.start);
        expect(price.provenance.span.end).toBe(wanted.end);
        expect(transcript.slice(wanted.start, wanted.end)).toBe(wanted.amount);
      }
    } else {
      const questions = output.questions.map(q => "text" in q ? q.text : q.question.value);
      expect(questions.some(q => q.toLowerCase().includes(wanted.amount.toLowerCase())), "Unplaced amount must be asked about").toBe(true);
    }
    if ("areas" in output) {
      const read = output.lines[index]!;
      expect(output.areas.find(area => area.key === read.areaKey)?.name.value.toLowerCase()).toBe(wanted.room);
      if (wanted.trade !== null) expect(read.trade.value).toBe(wanted.trade);
      expect(read.quantity.value).toBe(wanted.quantity);
      expect(read.unit.value).toBe(wanted.unit);
    }
  }
  if ("areas" in output) {
    expect(output.areaPrices).toEqual([]);
    expect(output.wholeJobPrice).toBeNull();
  }
  // S4: every extracted span belongs to this source and describes its actual words.
  const visit = (value: unknown, field = "") => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const provenance = node.provenance as { kind: string; span?: { start: number; end: number; sourceId: string; sourceVersion: number } } | undefined;
    if (provenance?.kind === "extracted") {
      const span = provenance.span!;
      expect(span.sourceId).toBe(sourceId); expect(span.sourceVersion).toBe(1);
      expect(Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.start < span.end && span.end <= transcript.length).toBe(true);
      if (typeof node.value === "string") {
        const said = transcript.slice(span.start, span.end).toLowerCase();
        if (field === "quantity") expect(String(small.indexOf(said) < 0 ? Number(said) : small.indexOf(said))).toBe(node.value);
        else expect(said).toBe(node.value.toLowerCase());
      }
    }
    for (const [key, child] of Object.entries(node)) visit(child, key);
  };
  visit(output);
}

describe("RT-13 seeded generated truth", () => {
  it("keeps money, counts, units, rooms and citations on their own work (1,000 CI; 100,000 opt-in)", () => {
    const count = Number(process.env.RT13_FUZZ_CASES ?? "1000");
    expect([1000, 100000]).toContain(count);
    const pick = random(seed), started = performance.now();
    const transcripts = new Set<string>();
    for (let index = 0; index < count; index++) {
      const { transcript, truth } = generated(pick);
      transcripts.add(transcript);
      try {
        assertTruth(parseCaptureFixture(sourceId, transcript), transcript, truth);
        const { timeline: _timeline, ...reader } = readSpokenJob(sourceId, transcript);
        assertTruth(reader, transcript, truth);
        assertTruth(checkSpokenNumbers(reader, transcript), transcript, truth);
      } catch (error) {
        throw new Error(`RT-13 seed=${seed} index=${index} transcript=${JSON.stringify(transcript)}`, { cause: error });
      }
    }
    expect(transcripts.size).toBe(count);
    const elapsed = performance.now() - started;
    process.stdout.write(`RT-13 generated: seed=${seed}, unique=${count}, elapsed=${Math.round(elapsed)}ms\n`);
    if (count === 1000) expect(elapsed).toBeLessThan(20000);
  }, 600000);

  it("RT-13-F005: qualified counted work keeps its capture quantity and unit", () => {
    const count = Number(process.env.RT13_FUZZ_CASES ?? "1000");
    const pick = random(seed), started = performance.now();
    let changed = 0, changedQuotes = 0;
    for (let index = 0; index < count; index++) {
      const { transcript, truth } = generated(pick);
      const output = parseCaptureFixture(sourceId, transcript);
      const previous = changed;
      for (const wanted of truth) {
        const line = output.lines.find(line => line.description.value.toLowerCase().includes(wanted.description.toLowerCase()));
        // Fail against the spoken count/unit, including when qualification opens the price.
        if (line?.quantity.value !== wanted.quantity || line?.unit.value !== wanted.unit) changed++;
      }
      if (changed !== previous) changedQuotes++;
    }
    process.stdout.write(`RT-13-F005 generated: quotes=${count}, pass=${count - changedQuotes}, open P1=${changedQuotes}, changed measures=${changed}, elapsed=${Math.round(performance.now() - started)}ms\n`);
    expect(changed, "Count and counted object must survive a qualified price").toBe(0);
  }, 600000);
});

// Metamorphic pairs refer to the corpus, including each minimized counterexample.
// Compare commercial structure, not incidental wording of descriptions/questions or source offsets.
type CorpusCase = { id: string; transcript: string; status: string; finding?: string; why: string };
const corpus = JSON.parse(readFileSync(new URL("./corpus/RT-13-fuzz-metamorphic.v1.json", import.meta.url), "utf8")) as CorpusCase[];
function commercial(output: Output) {
  const understanding = "areas" in output ? output : undefined;
  return output.lines.map((line, index) => ({
    price: line.unitPricePence.value, quantity: line.quantity.value, unit: line.unit.value?.toLowerCase() ?? null,
    ...(understanding ? { room: understanding.areas.find(a => a.key === understanding.lines[index]!.areaKey)?.name.value,
      trade: understanding.lines[index]!.trade.value, basis: understanding.lines[index]!.priceBasis } : {}),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe("RT-13 metamorphic pairs", () => {
  // Every transformed case points to a base id in its why field, checked here as well as by the shared runner.
  const pairs = corpus.filter(item => item.why.startsWith("Metamorphic from "));
  const readChecked = (text: string) => {
    const { timeline: _timeline, ...reader } = readSpokenJob(sourceId, text);
    return checkSpokenNumbers(reader, text);
  };
  it("binds every pair to a passing base and parses every input outside expected-failure assertions", () => {
    for (const item of pairs) {
      const baseId = item.why.split(":")[0]!.slice("Metamorphic from ".length);
      expect(corpus.find(candidate => candidate.id === baseId)?.status).toBe("pass");
      expect(parseCaptureFixture(sourceId, item.transcript).lines.length).toBeGreaterThan(0);
      expect(readChecked(item.transcript).lines.length).toBeGreaterThan(0);
    }
  });
  for (const item of pairs) {
    const baseId = item.why.split(":")[0]!.slice("Metamorphic from ".length);
    const base = corpus.find(candidate => candidate.id === baseId)!;
    const test = item.status === "open-finding" ? it.fails : it;
    test(`${item.id} ${item.finding ?? "invariant"}`, () => {
      expect(base, "Missing base case").toBeDefined();
      const failures: string[] = [];
      for (const [name, read] of [
        ["capture", (text: string) => parseCaptureFixture(sourceId, text)],
        ["reader", (text: string) => readSpokenJob(sourceId, text)],
        ["checked reader", readChecked],
      ] as const) {
        if (JSON.stringify(commercial(read(base.transcript))) !== JSON.stringify(commercial(read(item.transcript)))) failures.push(name);
      }
      expect(failures, `${baseId} -> ${item.id}: commercial structure changed`).toEqual([]);
    });
  }
  it("checks the gateway path on representative pass and open cases", async () => {
    for (const item of corpus.filter((_, index) => index % 5 === 0)) {
      expect(await extractCaptureFixture(sourceId, item.transcript, item.id)).toEqual(parseCaptureFixture(sourceId, item.transcript));
    }
  });
});
