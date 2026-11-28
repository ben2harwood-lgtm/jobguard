import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCaptureFixture, CaptureFixtureError, spokenPounds } from "./capture-fixture-parser.js";

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

// Spoken quote intake (26 Nov 2026): continuous speech with no punctuation, the way Tommy dictates a job.
describe("continuous spoken quotes", () => {
  const rows = (text: string) => citations(text).lines.map(line => [line.description.value, line.quantity.value, line.unit.value, line.unitPricePence.value]);
  const cited = (text: string, line: { unitPricePence: { provenance: { kind: string; span?: { start: number; end: number } } } }) => {
    const provenance = line.unitPricePence.provenance;
    return provenance.kind === "extracted" && provenance.span ? text.slice(provenance.span.start, provenance.span.end) : null;
  };
  it("splits four spoken items in order, keeps six base units and leaves every price blank", () => {
    const text = "strip out the old kitchen fit six base units hang the new doors paint the walls";
    expect(rows(text)).toEqual([["strip out the old kitchen", "1", "item", null], ["fit six base units", "6", "base units", null],
      ["hang the new doors", "1", "item", null], ["paint the walls", "1", "item", null]]);
    const unit = citations(text).lines[1]!.unit.provenance;
    expect(unit.kind === "extracted" ? text.slice(unit.span.start, unit.span.end) : null).toBe("base units");
  });
  it("puts spoken amounts on their own rows and keeps the last price open", () => {
    const text = "strip out the old kitchen for two hundred pounds fit the new units for six hundred pounds paint the walls";
    const result = citations(text);
    expect(rows(text)).toEqual([["strip out the old kitchen", "1", "item", 20000], ["fit the new units", "1", "item", 60000],
      ["paint the walls", "1", "item", null]]);
    expect(result.lines.map(line => cited(text, line))).toEqual(["two hundred pounds", "six hundred pounds", null]);
    expect(result.lines.reduce((sum, line) => sum + (line.unitPricePence.value ?? 0), 0)).toBe(80000);
  });
  it.each(["paint the walls two hundred pounds and fit the door sixty pounds", "paint the walls £200 and fit the door £60"])(
    "reads spoken and written amounts alike: %s", text => {
      expect(rows(text)).toEqual([["paint the walls", "1", "item", 20000], ["fit the door", "1", "item", 6000]]);
    });
  it("keeps supply and fit one door as one £300 line", () => {
    const text = "supply and fit one door for three hundred pounds";
    expect(rows(text)).toEqual([["supply and fit one door", "1", "door", 30000]]);
    expect(cited(text, citations(text).lines[0]!)).toBe("three hundred pounds");
  });
  it("keeps a whole-job figure for review, never as a line price or split across rows", () => {
    const text = "strip out the old kitchen fit the new units paint the walls eight hundred pounds for the whole job";
    const result = citations(text);
    expect(rows(text)).toEqual([["strip out the old kitchen", "1", "item", null], ["fit the new units", "1", "item", null],
      ["paint the walls", "1", "item", null]]);
    expect(result.questions.map(q => q.question.value)).toContain("You said “eight hundred pounds for the whole job”. Add a price to each line, or put it on one line.");
  });
  it("keeps a price for several items as the line price and asks about it", () => {
    const text = "strip out the old kitchen fit six base units for six hundred pounds";
    const result = citations(text);
    expect(rows(text)).toEqual([["strip out the old kitchen", "1", "item", null], ["fit six base units", "1", "item", 60000]]);
    expect(result.questions.map(q => q.question.value)).toContain("Check “fit six base units”: six hundred pounds is kept as the price for the whole line, not for each.");
  });
  // Independent check, 26 Nov: these two read as £50 and £20 before, with no question.
  it("reads a price each as the unit price for the spoken count", () => {
    const text = "fit six doors at fifty pounds each";
    const result = citations(text);
    expect(rows(text)).toEqual([["fit six doors", "6", "doors", 5000]]);
    expect(cited(text, result.lines[0]!)).toBe("fifty pounds");
    const line = result.lines[0]!;
    expect(Number(line.quantity.value) * line.unitPricePence.value!).toBe(30000);
  });
  it("keeps spoken pence with the pounds in one amount", () => {
    const text = "supply and fit one door at twenty pounds and fifty pence";
    expect(rows(text)).toEqual([["supply and fit one door", "1", "door", 2050]]);
    expect(cited(text, citations(text).lines[0]!)).toBe("twenty pounds and fifty pence");
  });
  it.each(["supply and fit one door at £20 and 50p", "supply and fit one door at twenty pounds 50", "fit the door at twenty pounds and fifty five hundred pence"])(
    "leaves a partly read amount open with a price question: %s", text => {
      const result = citations(text);
      expect(result.lines.map(line => line.unitPricePence.value)).toEqual([null]);
      expect(result.questions.map(q => q.question.value)).toContain(`Confirm price: ${text}`);
    });
  it("leaves a per-item price open when the count or the price position is not clear", () => {
    const noCount = citations("strip out the old kitchen hang the doors at fifty pounds each");
    expect(noCount.lines[1]!.quantity.value).toBeNull();
    expect(noCount.lines[1]!.unitPricePence.value).toBe(5000);
    expect(noCount.questions.map(q => q.question.value)).toContain("Confirm how many: “hang the doors” is priced at fifty pounds each.");
    const middle = citations("strip out the old kitchen fit six doors at fifty pounds each side");
    expect(middle.lines[1]!.unitPricePence.value).toBeNull();
    expect(middle.questions.some(q => q.question.value.startsWith("Confirm price: fit six doors"))).toBe(true);
  });
  it("does not split where the verb belongs to the clause, and refuses malformed spoken amounts", () => {
    expect(rows("paint the walls and then paint the ceiling")).toEqual([["paint the walls", "1", "item", null], ["paint the ceiling", "1", "item", null]]);
    expect(rows("clear the loft ready to fit the boards paint the walls").map(row => row[0])).toEqual(["clear the loft ready to fit the boards", "paint the walls"]);
    expect(rows("strip out the old kitchen two two pounds paint the walls").map(row => row[3])).toEqual([null, null]);
  });
  // Codex review on #1001: each of these read a wrong figure with no question.
  it.each(["paint the walls for one point five pounds fit the door", "paint the walls for one million two hundred pounds fit the door"])(
    "leaves an amount open when only its end was read: %s", text => {
      const result = citations(text);
      expect(result.lines.map(line => line.unitPricePence.value)).toEqual([null, null]);
      expect(result.questions.some(q => q.question.value.startsWith("Confirm price: paint the walls"))).toBe(true);
    });
  it("keeps a material after old or new with its verb", () => {
    expect(rows("remove old paint £200 fit the door")).toEqual([["remove old paint", "1", "item", 20000], ["fit the door", "1", "item", null]]);
  });
  it.each(["fit twenty one doors paint the walls", "fit one hundred doors paint the walls"])("does not read part of a count: %s", text => {
    expect(rows(text)[0]!.slice(1, 3)).toEqual(["1", "item"]);
  });
  it("reads per only for the counted thing", () => {
    expect(rows("fit six doors at fifty pounds per door")).toEqual([["fit six doors", "6", "doors", 5000]]);
    for (const text of ["fit six doors at fifty pounds per pair", "fit six doors at fifty pounds per day"]) {
      const result = citations(text);
      expect(result.lines[0]!.unitPricePence.value).toBeNull();
      expect(result.questions.map(q => q.question.value)).toContain(`Confirm price: ${text}`);
    }
  });
  it("reads a door like per door, and leaves a day open", () => {
    expect(rows("fit six doors at fifty pounds a door")).toEqual([["fit six doors", "6", "doors", 5000]]);
    const text = "fit six doors at fifty pounds a day", result = citations(text);
    expect(result.lines[0]!.unitPricePence.value).toBeNull();
    expect(result.questions.map(q => q.question.value)).toContain(`Confirm price: ${text}`);
  });
  // Codex review on #1032 (planner spec, 28 Nov): a fraction, multiplier or range before an amount leaves it open; the figure is never worked out.
  it.each(["paint the walls for half a thousand pounds fit the door", "paint the walls for a quarter of a thousand pounds fit the door",
    "paint the walls for between four hundred and five hundred pounds fit the door", "paint the walls for four hundred to five hundred pounds fit the door",
    "paint the walls for 400 or 500 pounds fit the door", "paint the walls for £400 to £500 fit the door"])(
    "leaves a fraction or range open with a price question: %s", text => {
      const result = citations(text);
      expect(result.lines.map(line => line.unitPricePence.value)).toEqual([null, null]);
      expect(result.questions.some(q => q.question.value.startsWith("Confirm price: paint the walls"))).toBe(true);
    });
  it("reads only an amount as the other end of a range", () => {
    expect(rows("paint the walls for £500 to a high standard")).toEqual([["paint the walls for £500 to a high standard", "1", "item", 50000]]);
    for (const text of ["paint the walls for fifty pounds or sixty", "paint the walls for £400 to a thousand pounds"]) {
      expect(citations(text).lines[0]!.unitPricePence.value).toBeNull();
    }
  });
  it.each(["fit six doors at fifty pounds a door plus VAT", "fit six doors at fifty pounds per door inc VAT", "fit six doors at fifty pounds each plus VAT"])(
    "reads a per-item price with VAT words after it, keeps the number and asks about VAT: %s", text => {
      const result = citations(text);
      expect(rows(text)).toEqual([["fit six doors", "6", "doors", 5000]]);
      expect(cited(text, result.lines[0]!)).toBe("fifty pounds");
      expect(result.questions.map(q => q.question.value)).toContain(`Confirm VAT: you said “${text}”. The price is kept as said; VAT is not added or taken off.`);
    });
  it.each(["fit six doors at fifty pounds a day plus VAT", "fit six doors at fifty pounds a door for the hall"])(
    "leaves a per-item price open when its word is not the counted thing or more words follow: %s", text => {
      const result = citations(text);
      expect(result.lines[0]!.unitPricePence.value).toBeNull();
      expect(result.questions.map(q => q.question.value)).toContain(`Confirm price: ${text}`);
    });
  it("keeps a line price said with VAT words unchanged and asks about VAT", () => {
    const text = "supply and fit one door for two hundred pounds plus VAT";
    const result = citations(text);
    expect(result.lines[0]!.unitPricePence.value).toBe(20000);
    expect(result.questions.map(q => q.question.value)).toContain(`Confirm VAT: you said “${text}”. The price is kept as said; VAT is not added or taken off.`);
  });
  it("keeps a leading decorate, render or rehang clause as a line", () => {
    expect(rows("decorate the bedroom for two hundred pounds fit the door for fifty pounds paint the ceiling for sixty pounds")).toEqual([
      ["decorate the bedroom", "1", "item", 20000], ["fit the door", "1", "item", 5000], ["paint the ceiling", "1", "item", 6000]]);
  });
});
it.each([["two hundred pounds", 200], ["sixty quid", 60], ["a thousand pounds", 1000], ["one thousand two hundred and fifty pounds", 1250],
  ["twenty five pounds", 25], ["two two pounds", null], ["hundred pounds", null], ["fifteen hundred pounds", 1500], ["two hundred three hundred pounds", null]])("reads spoken pounds: %s", (words, value) => {
  expect(spokenPounds(words)).toBe(value);
});
