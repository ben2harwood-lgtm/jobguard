import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCaptureFixture, CaptureFixtureError } from "./capture-fixture-parser.js";

const walk = "Bathroom refit for Mrs Sample at 4 Madeup Lane. Rip out the old suite and take it away, fit a new bath, basin and toilet, tile the walls and floor, new extractor fan. About 4800 pounds all in, should take two weeks.";
function citations(text: string) {
  const proposal = parseCaptureFixture("source", text);
  for (const field of [proposal.title, ...proposal.lines.flatMap(line => [line.description, line.unitPricePence])]) {
    if (field.provenance.kind === "extracted") {
      const { start, end } = field.provenance.span;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(text.length);
      if (typeof field.value === "string") expect(text.slice(start, end)).toBe(field.value);
    }
  }
  return proposal;
}
describe("plain words draft helper", () => {
  it("splits the exact real-builder walk with source offsets, unknown rates and separate total/timing questions", () => {
    const result = citations(walk);
    expect(result.title.value).toBe("Bathroom refit");
    expect(result.lines.map(line => line.description.value)).toEqual([
      "Rip out the old suite and take it away", "fit a new bath, basin and toilet", "tile the walls and floor", "new extractor fan",
    ]);
    expect(result.lines.map(line => line.unitPricePence.value)).toEqual([null, null, null, null]);
    expect(result.questions.map(q => q.question.value)).toEqual([
      "Confirm disposal and waste allowance",
      "You said “About 4800 pounds all in”. Add a price to each line, or put it on one line.",
      "Confirm timing: should take two weeks",
    ]);
    expect(Object.keys(result).sort()).toEqual(["lines", "materials", "questions", "title"]);
  });
  it("matches the entire golden fixture record with the approved parser source hash", async () => {
    const { runCaptureEvaluation } = await import("./evaluation-runner.js");
    const { createGoldenRunRecord } = await import("./golden-run-record.js");
    const actual = await createGoldenRunRecord(await runCaptureEvaluation());
    const recorded = JSON.parse(readFileSync(new URL("../../../docs/fixtures/ai/golden-run.v1.json", import.meta.url), "utf8")) as typeof actual;
    expect(actual).toEqual(recorded);
  });
  it("turns the screen's ordinary-word example into the same six cited work lines", () => {
    const screen = readFileSync(new URL("../../../apps/web/app/ui/jobguard-app.tsx", import.meta.url), "utf8");
    const sample = /const referenceWalk=`([^`]+)`/u.exec(screen)![1]!;
    expect(sample).not.toMatch(/JOB:|ITEM:/u);
    const result = citations(sample);
    expect(result.lines.map(line => line.description.value)).toEqual(["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site", "Replace shelves"]);
    expect(result.lines.map(line => line.unitPricePence.value)).toEqual([20000, 20000, 20000, 20000, 10000, null]);
  });
  it("parses only exact same-chunk prices, including decimals and thousands separators", () => {
    const text = "Bathroom refit. Remove suite £450, fit bath £1,200.50 and tile walls 450 pounds then paint ceiling 450 quid.";
    const result = citations(text);
    expect(result.lines.map(line => line.description.value)).toEqual(["Remove suite", "fit bath", "tile walls", "paint ceiling"]);
    expect(result.lines.map(line => line.unitPricePence.value)).toEqual([45000, 120050, 45000, 45000]);
    expect(result.lines.map(line => {
      const provenance = line.unitPricePence.provenance;
      return provenance.kind === "extracted" ? text.slice(provenance.span.start, provenance.span.end) : null;
    })).toEqual(["£450", "£1,200.50", "450 pounds", "450 quid"]);
  });
  it.each(["about £450", "around 450 quid", "£450 or £500", "£1.234", "£1,20", "£10000000001", "£-450"])("leaves uncertain or invalid rates unknown: %s", price => {
    expect(citations(`Bathroom. Fit bath ${price}; paint walls`).lines[0]?.unitPricePence.value).toBeNull();
  });
  it("keeps material lists together, supports sentence ends and line breaks, and caps titles", () => {
    const result = citations("Bathroom at fictional site! Fit bath, basin and toilet? Paint walls; seal floor\nclean site");
    expect(result.title.value).toBe("Bathroom");
    expect(result.lines.map(line => line.description.value)).toEqual(["Fit bath, basin and toilet", "Paint walls", "seal floor", "clean site"]);
    expect(citations(`${"x".repeat(201)}. Fit bath; paint walls`).title.value).toHaveLength(200);
  });
  it("keeps the old single line and question if fewer than two work lines are found", () => {
    const text = "Bathroom. Fit bath £450. Should take two weeks";
    const result = citations(text);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.description.value).toBe(text);
    expect(result.lines[0]?.unitPricePence.value).toBeNull();
    expect(result.questions.map(q => q.question.value)).toEqual(["Check this line. Use Split to make separate work items, then edit and accept each one."]);
  });
  it("never routes any ITEM: record through the plain splitter (generated prefixes and suffixes)", () => {
    const structured = "JOB: Fixed title\nITEM: Fit bath | £450.00\nITEM: Paint walls | £200.00";
    const expected = parseCaptureFixture("source", structured);
    for (const prefix of ["", walk, ",".repeat(1000), "<script>throw Error()</script>", Array(101).fill("Fit bath").join("; ")]) {
      for (const suffix of ["", walk, "\nFit boiler £700. Remove door"]) {
        const actual = parseCaptureFixture("source", `${prefix}\n${structured}\n${suffix}`);
        // Compare every field and provenance byte, allowing only the source shift.
        const shifted = JSON.parse(JSON.stringify(actual), (_key, value: unknown) => {
          if (value && typeof value === "object" && "sourceId" in value && "start" in value && "end" in value) {
            const span = value as { sourceId: string; start: number; end: number };
            return { ...span, start: span.start - prefix.length - 1, end: span.end - prefix.length - 1 };
          }
          return value;
        });
        expect(shifted).toEqual(expected);
      }
    }
  });
  it.each([",".repeat(50_000), "https://example.invalid/path", "<h1>Fit bath</h1>", "<script>throw new Error('bad')</script>"])("keeps hostile input inert", text => {
    expect(() => citations(text)).not.toThrow();
  });
  it("retains the source and description limits and caps the number of work lines", () => {
    expect(citations(`Bathroom. Fit ${"a".repeat(600)}; paint walls`).lines[0]?.description.value).toHaveLength(500);
    expect(citations(Array(100).fill("Fit bath").join("; ")).lines).toHaveLength(100);
    expect(() => parseCaptureFixture("source", Array(101).fill("Fit bath").join("; "))).toThrowError(new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED"));
    expect(() => parseCaptureFixture("source", "a".repeat(50_001))).toThrowError(new CaptureFixtureError("INVALID_FIXTURE_SOURCE"));
  });
});

it.each(["900 quid", "900 pounds", "£900"])("walk 2 decorating separates work, parties and overall details: %s", amount => {
  const text = `Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about ${amount}, four days.`;
  const result = citations(text);
  expect(result.title.value).toBe("Paint the hall, stairs and landing");
  expect(result.lines.map(line => line.description.value)).toEqual(["Paint the hall, stairs and landing, two coats", "woodwork in gloss"]);
  expect(result.lines[0]?.description.provenance.kind).toBe("inferred");
  expect(result.lines.map(line => line.unitPricePence.value)).toEqual([null, null]);
  expect(result.questions.map(q => q.question.value).join("\n")).toContain(amount);
  expect(result.questions.map(q => q.question.value).join("\n")).toContain("four days");
});

it("keeps combined Unicode descriptions inferred and untouched descriptions exactly cited", () => {
  const text = "Paint café 🧱 for Mr Éxample at 9 Notreal Road, two coats and woodwork in gloss, should be about £1,200.50, four days.";
  const result = citations(text);
  expect(result.lines.map(line => line.description.value)).toEqual(["Paint café 🧱, two coats", "woodwork in gloss"]);
  expect(result.lines[0]?.description.provenance.kind).toBe("inferred");
  expect(result.lines[1]?.description.provenance.kind).toBe("extracted");
  expect(result.lines.every(line => line.unitPricePence.value === null)).toBe(true);
});
it.each(["should be about £900 or £1000", "around 900 pounds", "about £1,200.50", "approximately £900"])("overall price stays a question: %s", price => {
  const result = citations(`Paint walls, woodwork in gloss, ${price}, four days.`);
  expect(result.lines.map(line => line.description.value)).toEqual(["Paint walls", "woodwork in gloss"]);
  expect(result.lines.every(line => line.unitPricePence.value === null)).toBe(true);
  expect(result.questions.some(q => q.question.value.includes(price))).toBe(true);
});

it("keeps exact per-item money cited after removing an intervening party clause", () => {
  const text = "Paint walls for Mr Example at 9 Notreal Road, two coats £900.25; woodwork in gloss £200";
  const result = citations(text);
  expect(result.lines.map(line => line.description.value)).toEqual(["Paint walls, two coats", "woodwork in gloss"]);
  expect(result.lines.map(line => line.unitPricePence.value)).toEqual([90025, 20000]);
  for (const line of result.lines) {
    const provenance = line.unitPricePence.provenance;
    expect(provenance.kind).toBe("extracted");
    if (provenance.kind === "extracted") expect(text.slice(provenance.span.start, provenance.span.end)).toBe(line === result.lines[0] ? "£900.25" : "£200");
  }
});
it("keeps an all-in amount attached to work unallocated and questioned", () => {
  const result = citations("Fit bath £900 all in; paint walls");
  expect(result.lines.every(line => line.unitPricePence.value === null)).toBe(true);
  expect(result.questions.some(q => q.question.value.includes("£900 all in"))).toBe(true);
});
