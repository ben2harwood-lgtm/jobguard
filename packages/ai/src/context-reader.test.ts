import { toJobRecordProposal } from "@jobguard/core";
import { describe, expect, it } from "vitest";
import { checkSpokenNumbers, readSpokenJob, spokenNumbers, understoodLabels } from "./context-reader.js";
import { readFileSync } from "node:fs";
import { saidAmountOpen } from "./capture-fixture-parser.js";

const SMITH = "Smith house refurb. In the kitchen rip out the old units and fit new ones for 2400, tile the floor about 12 square metres at 60 a metre. Upstairs bathroom strip out, new suite supply and fit 3200, and get the sparky to move two sockets. Paint the hallway and landing, two coats, 650.";
/** The words either side of a span within its clause, cut where totals() cuts a clause (never inside "1,200" or "4.5k"). */
const clauseAround = (text: string, start: number, end: number): [string, string] => {
  const boundary = (at: number) => /[.!?;\n,]/u.test(text[at] ?? "") && !(/[.,]/u.test(text[at]!) && /\d/u.test(text[at - 1] ?? "") && /\d/u.test(text[at + 1] ?? ""));
  let from = start; while (from > 0 && !boundary(from - 1)) from--;
  let to = end; while (to < text.length && !boundary(to)) to++;
  return [text.slice(from, start), text.slice(end, to)];
};
const strip = <T extends { timeline: unknown }>({ timeline: _, ...rest }: T) => rest;

describe("V2-SQ-C Reader A", () => {
  it("reads the three-room example into rooms, trades and only the said numbers", () => {
    const job = readSpokenJob("smith", SMITH);
    const room = (key: string) => job.areas.find(area => area.key === key)!.name.value;
    expect(job.areas.map(area => area.name.value)).toEqual(["Kitchen", "Upstairs bathroom", "Hallway and landing"]);
    const line = (words: string) => {
      const index = job.lines.findIndex(item => item.description.value.includes(words));
      expect(index, words).toBeGreaterThanOrEqual(0);
      return { ...job.lines[index]!, index, room: room(job.lines[index]!.areaKey) };
    };
    expect(line("fit new ones")).toMatchObject({ room: "Kitchen", unitPricePence: { value: 240000 }, priceBasis: "line" });
    const tiling = line("tile the floor");
    expect(tiling).toMatchObject({ room: "Kitchen", trade: { value: "Tiling" }, quantity: { value: "12" }, unit: { value: "m²" }, unitPricePence: { value: 6000 }, priceBasis: "per_unit" });
    expect(job.questions.some(question => question.lineIndex === tiling.index && /about 12/u.test(question.text))).toBe(true);
    const suite = line("supply and fit 3200");
    expect(suite).toMatchObject({ room: "Upstairs bathroom", unitPricePence: { value: null }, priceBasis: "none" });
    expect(job.questions.some(question => question.lineIndex === suite.index && /Is 3200 the price for/u.test(question.text))).toBe(true);
    expect(line("move two sockets")).toMatchObject({ room: "Upstairs bathroom", trade: { value: "Electrics" }, quantity: { value: "2" } });
    expect(line("Paint the hallway and landing")).toMatchObject({ room: "Hallway and landing", trade: { value: "Decorating" }, unitPricePence: { value: 65000 } });
    expect(job.areaPrices).toEqual([]);
    expect(job.wholeJobPrice).toBeNull();
  });

  it("keeps a room price on the room and a whole-job price on the job, never spread onto lines", () => {
    const room = readSpokenJob("r", "In the lounge skim the ceiling and paint the walls, the lounge all in 900.");
    expect(room.areaPrices).toMatchObject([{ areaKey: "lounge", pence: 90000 }]);
    expect(room.lines.every(line => line.unitPricePence.value === null)).toBe(true);
    const proposal = toJobRecordProposal(strip(room));
    expect(proposal.lines.every(line => line.unitPricePence.value === null)).toBe(true);
    expect(proposal.questions.map(question => question.question.value)).toContain("You said £900 for Lounge. It stays on the room, not spread across its lines.");
    const whole = readSpokenJob("w", "strip out the old kitchen fit the new units paint the walls eight hundred pounds for the whole job");
    expect(whole.wholeJobPrice?.pence).toBe(80000);
    expect(whole.lines.every(line => line.unitPricePence.value === null)).toBe(true);
  });

  it("room and whole-job totals pass the same guards as line prices: read in part, or a rate", () => {
    for (const said of ["a quarter of a thousand pounds", "half a thousand pounds", "one million two hundred pounds", "two billion and fifty pounds",
      "a dozen and sixty pounds", "a score and ten pounds", "four hundred pounds and five", "2k and fifty pounds", "one grand two hundred pounds"]) {
      const room = readSpokenJob("q", `In the bathroom tile the floor. Bathroom all in ${said}.`);
      expect(room.areaPrices, said).toEqual([]);
      const roomQuestions = toJobRecordProposal(strip(room)).questions.map(question => question.question.value);
      expect(roomQuestions.some(question => question.includes(said)), `${said}: ${roomQuestions.join(" | ")}`).toBe(true);
      const whole = readSpokenJob("w", `Tile the floor and paint the walls. All in ${said} for the whole job.`);
      expect(whole.wholeJobPrice?.pence ?? null, said).toBeNull();
      const wholeQuestions = toJobRecordProposal(strip(whole)).questions.map(question => question.question.value);
      expect(wholeQuestions.some(question => question.includes(said)), `${said}: ${wholeQuestions.join(" | ")}`).toBe(true);
    }
    for (const rate of ["per day", "a day", "an hour", "each", "a room"]) {
      const said = `500 pounds ${rate}`;
      const room = readSpokenJob("d", `In the bathroom tile the floor. Bathroom all in ${said}.`);
      expect(room.areaPrices, said).toEqual([]);
      expect(toJobRecordProposal(strip(room)).questions.map(question => question.question.value).some(question => question.includes(said)), said).toBe(true);
      const whole = readSpokenJob("e", `Tile the floor. ${said} for the whole job.`);
      expect(whole.wholeJobPrice?.pence ?? null, said).toBeNull();
    }
    // The other end of a range or alternative, pence beside it, a number after it, or a hedge word: open, as on a line.
    for (const said of ["five hundred pounds or six hundred", "500 pounds to 600", "five hundred pounds or six", "500 pounds and 50p", "500 pounds 2"]) {
      const room = readSpokenJob("o", `In the bathroom tile the floor. Bathroom all in ${said}.`);
      expect(room.areaPrices, said).toEqual([]);
      expect(toJobRecordProposal(strip(room)).questions.map(question => question.question.value).some(question => question.includes(said)), said).toBe(true);
      const whole = readSpokenJob("x", `Tile the floor. All in ${said} for the whole job.`);
      expect(whole.wholeJobPrice?.pence ?? null, said).toBeNull();
      const line = readSpokenJob("l", `Tile the floor for ${said}.`);
      expect(line.lines.every(item => item.unitPricePence.value === null), said).toBe(true);
    }
    // A hedge counts only when it qualifies the amount: "around the bath" is a place.
    expect(readSpokenJob("h", "Tile around the bath for 500 pounds all in.").wholeJobPrice?.pence).toBe(50000);
    for (const said of ["about 500 pounds", "500 pounds or so", "roughly £500"]) {
      expect(readSpokenJob("j", `Tile the floor. ${said} for the whole job.`).wholeJobPrice ?? null, said).toBeNull();
    }
    // Whole amounts said in full are still read exactly.
    expect(readSpokenJob("r", "In the bathroom tile the floor. Bathroom all in one thousand two hundred pounds.").areaPrices.map(price => price.pence)).toEqual([120000]);
    expect(readSpokenJob("g", "Tile the floor. Six grand for the whole job.").wholeJobPrice?.pence).toBe(600000);
  });

  it("two different totals for one room, or for the whole job, offer neither and ask which applies", () => {
    const room = readSpokenJob("t", "In the bathroom tile the floor. Bathroom all in 500 pounds. Bathroom all in 600 pounds.");
    expect(room.areaPrices).toEqual([]);
    expect(room.questions.some(question => /^You said more than one price for bathroom\. Check which applies\.$/iu.test(question.text)
      && question.areaKey === "bathroom"), JSON.stringify(room.questions)).toBe(true);
    const same = readSpokenJob("s", "In the bathroom tile the floor. Bathroom all in 500 pounds. Bathroom all in 500 pounds.");
    expect(same.areaPrices.map(price => price.pence)).toEqual([50000]);
    const whole = readSpokenJob("w", "Tile the floor. 900 pounds for the whole job. Paint the walls. 1200 pounds for the whole job.");
    expect(whole.wholeJobPrice).toBeNull();
    expect(whole.questions.some(question => question.text.startsWith("You said more than one whole-job price"))).toBe(true);
    expect(readSpokenJob("v", "Tile the floor. 900 pounds for the whole job. Paint the walls. 900 pounds for the whole job.").wholeJobPrice?.pence).toBe(90000);
  });

  it("a numbered room next to a stated amount is the room, never part of the price (V2-SQ-L)", () => {
    for (const text of ["In bedroom two paint the walls. Bedroom two £500 all in.", "In bedroom 2 paint the walls. Bedroom 2 £500 all in.",
      "In bedroom two paint the walls. Bedroom two 500 pounds all in."]) {
      const job = readSpokenJob("n", text);
      expect(job.areaPrices.map(price => price.pence), text).toEqual([50000]);
      expect(/^bedroom (?:two|2)$/iu.test(job.areas.find(area => area.key === job.areaPrices[0]!.areaKey)!.name.value), text).toBe(true);
      expect(checkSpokenNumbers(strip(job), text), text).toEqual(strip(job));
    }
    // Said in words straight after the ordinal, the amount is never read as more than was said: it stays open.
    const words = readSpokenJob("m", "In bedroom two paint the walls. Bedroom two five hundred pounds all in.");
    expect(words.areaPrices.map(price => price.pence)).not.toContain(250000);
    expect(words.areaPrices).toEqual([]);
    // A line priced next to a numbered room keeps its price and room.
    const line = readSpokenJob("k", "In bedroom two paint the walls for £300.");
    expect(line.lines.map(item => item.unitPricePence.value)).toEqual([30000]);
    expect(readSpokenJob("l", "Paint the walls in bedroom two £300.").lines.map(item => item.unitPricePence.value)).toEqual([30000]);
    // Guards that stay open: no room, a part amount, a range, a hedge.
    for (const text of ["Tile the floor. Two £500 all in.", "In bedroom two paint the walls. Bedroom two and a half thousand pounds all in.",
      "In bedroom two paint the walls. Bedroom two £500 or £600 all in.", "In bedroom two paint the walls. Bedroom two about £500 all in."]) {
      const job = readSpokenJob("g", text);
      expect(job.areaPrices, text).toEqual([]);
      expect(job.wholeJobPrice ?? null, text).toBeNull();
    }
  });

  it("line prices and room and whole-job totals call one guard function, saidAmountOpen, and nothing else", () => {
    const parser = readFileSync(new URL("./capture-fixture-parser.ts", import.meta.url), "utf8");
    const reader = readFileSync(new URL("./context-reader.ts", import.meta.url), "utf8");
    const body = (source: string, start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const plain = body(parser, "function plainPrice(", "\n}\n");
    const totalsBody = body(reader, "function totals(", "\n}\n");
    for (const source of [plain, totalsBody]) {
      expect(source).toMatch(/saidAmountOpen\(/u);
      // No guard is applied beside it, so the two can never drift apart again.
      expect(source).not.toMatch(/\b(?:readInPart|rangeAfter|numberAfter|loosePence|rateAfter)\b/u);
    }
  });

  it("never reads part of a number: “4.5k” is £4,500 and never “5k”", () => {
    expect(spokenNumbers.money("4.5k")).toBe(450000);
    expect(spokenNumbers.money("6 grand")).toBe(600000);
    expect(spokenNumbers.money("six grand")).toBe(600000);
    expect(spokenNumbers.money("5k all")).toBeNull();
    const job = readSpokenJob("k", "Kitchen refit. In the kitchen strip out the units. The kitchen 4.5k all in.");
    expect(job.areaPrices.map(price => price.pence)).toEqual([450000]);
  });

  it("does not apply a correction or a reference; it asks", () => {
    const fixed = readSpokenJob("c", "In the kitchen fit six base units, no, make that eight, and fit the worktop for 400.");
    expect(fixed.lines[0]).toMatchObject({ quantity: { value: null }, unitPricePence: { value: null } });
    expect(fixed.questions.some(question => question.lineIndex === 0 && /make that eight/u.test(question.text))).toBe(true);
    const again = readSpokenJob("s", "Back bedroom paint the walls two coats for 300. Same again in the front bedroom.");
    expect(again.lines).toHaveLength(2);
    expect(again.lines[1]).toMatchObject({ unitPricePence: { value: null }, quantity: { value: null } });
    expect(again.questions.some(question => question.lineIndex === 1 && /nothing was copied/u.test(question.text))).toBe(true);
  });

  it("leaves a number open when it may belong to another item", () => {
    const corrected = readSpokenJob("n", "kitchen fit three no four wall units and paint it all two coats");
    expect(corrected.lines[0]).toMatchObject({ quantity: { value: null } });
    expect(corrected.questions.some(question => question.lineIndex === 0 && /three no four/u.test(question.text))).toBe(true);
    const runOn = readSpokenJob("r", "en suite new shower tray and enclosure supply and fit 1450 extractor fan 180");
    expect(runOn.lines.every(line => line.quantity.value === null && line.unitPricePence.value === null)).toBe(true);
    const twoItems = readSpokenJob("t", "kitchen tile the splashback four hundred and fifty and the sparky needs to add four double sockets");
    expect(twoItems.lines.every(line => line.quantity.value === null)).toBe(true);
  });

  it("leaves approximate, corrected or measured totals open, and never keeps part of a spoken number", () => {
    const about = readSpokenJob("a", "In the kitchen paint the walls. The kitchen all in about 4500.");
    expect(about.areaPrices).toEqual([]);
    expect(about.questions.length).toBeGreaterThan(0);
    const corrected = readSpokenJob("e", "In the kitchen paint the walls. The kitchen all in 4500, no, make that 5000.");
    expect(corrected.areaPrices).toEqual([]);
    expect(corrected.questions.some(question => /4500/u.test(question.text))).toBe(true);
    const measured = readSpokenJob("d", "In the kitchen tile 12 square metres all in.");
    expect(measured.wholeJobPrice).toBeNull();
    expect(measured.areaPrices).toEqual([]);
    expect(readSpokenJob("b", "tile the floor twenty five square metres at 60 a metre").lines[0]!.quantity.value).toBeNull();
    expect(readSpokenJob("c", "fit twenty five doors").lines[0]!.quantity.value).toBeNull();
  });

  it("checks a swapped price back off the wrong line", () => {
    const text = "Fit the door for 300 and paint the walls for 500.";
    const job = strip(readSpokenJob("s", text));
    expect(job.lines.map(line => line.unitPricePence.value)).toEqual([30000, 50000]);
    const swapped = { ...job, lines: [{ ...job.lines[0]!, unitPricePence: job.lines[1]!.unitPricePence }, { ...job.lines[1]!, unitPricePence: job.lines[0]!.unitPricePence }] };
    expect(checkSpokenNumbers(swapped, text).lines.map(line => line.unitPricePence.value)).toEqual([null, null]);
  });

  it("leaves a price open when another amount follows it after a comma", () => {
    for (const text of ["Fit a door for 300, or 500.", "Fit a door for 300, no, five hundred."]) {
      const job = readSpokenJob("s", text);
      expect(job.lines[0]!.unitPricePence.value).toBeNull();
      expect(job.questions.length).toBeGreaterThan(0);
    }
    expect(readSpokenJob("s", "Fit a door for 300, hang it level.").lines[0]!.unitPricePence.value).toBe(30000);
  });

  it("plan-check money rules: a count with a line price is one priced item, and an alternative rate stays open", () => {
    const doors = readSpokenJob("s", "In the landing fit three doors for 600.");
    expect(doors.lines[0]).toMatchObject({ unitPricePence: { value: 60000 }, priceBasis: "line" });
    expect(toJobRecordProposal(doors).lines[0]).toMatchObject({ quantity: { value: "1" }, unitPricePence: { value: 60000 } });
    const coats = readSpokenJob("s", "Paint the hallway and landing, two coats, 650.");
    expect(coats.lines[0]).toMatchObject({ unitPricePence: { value: 65000 }, priceBasis: "line" });
    const each = readSpokenJob("s", "In the landing hang two doors at 90 each.");
    expect(each.lines[0]).toMatchObject({ quantity: { value: "2" }, unitPricePence: { value: 9000 }, priceBasis: "each" });
    const rates = readSpokenJob("s", "Tile the floor 12 square metres at 60 a metre, or 80 a metre.");
    expect(rates.lines[0]!.unitPricePence.value).toBeNull();
    expect(rates.questions.length).toBeGreaterThan(0);
  });

  it("labels lines proposed from the same words by where they start", () => {
    const labels = understoodLabels("smith", SMITH, [
      { start: SMITH.indexOf("rip out"), description: "rip out the old units" },
      { start: SMITH.indexOf("get the sparky"), description: "get the sparky to move two sockets" },
      { start: SMITH.indexOf("Paint the hallway"), description: "Paint the hallway and landing, two coats" },
      { start: null, description: "Review this line" },
    ]);
    expect(labels).toEqual([{ room: "Kitchen", category: "Strip-out" }, { room: "Upstairs bathroom", category: "Electrics" },
      { room: "Hallway and landing", category: "Decorating" }, { room: "Whole job", category: "Other" }]);
  });

  it("property: for random transcripts no value in the output fails the money rule", () => {
    let seed = 20261127;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
    const rooms = ["kitchen", "the bathroom", "upstairs bathroom", "back bedroom", "the hallway and landing", "out the back", "loft", "bedroom 2", "bedroom two"];
    const work = ["rip out the old units", "fit new units", "tile the floor", "paint the walls", "move two sockets", "fit a new door",
      "skim the ceiling", "lay laminate", "fit six base units", "supply and fit", "replace the slates", "same again", "no, make that three"];
    const money = () => pick([`${Math.floor(random() * 5000)}`, `£${Math.floor(random() * 900)}.${Math.floor(random() * 99)}`, "two hundred pounds",
      "sixty quid", `${Math.floor(random() * 9)}.${Math.floor(random() * 9)}k`, "6 grand", `${Math.floor(random() * 3)},${Math.floor(100 + random() * 899)}`]);
    const rates = ["per day", "a day", "an hour", "per room", "a metre", "each", "apiece"];
    const partly = ["a quarter of", "half of", "one million", "two billion and", "a dozen", "a score and", "3k and", "one grand"];
    const tails = [() => "", () => ` for ${money()}`, () => ` ${money()}`, () => ` about ${Math.floor(random() * 40)} square metres at ${money()} a metre`,
      () => ` ${money()} each`, () => `, the ${pick(rooms)} all in ${money()}`, () => ` ${money()} for the whole job`, () => ` roughly ${money()}`,
      // Room and whole-job totals said in part: a fraction, multiplier or second number next to the amount.
      () => `, the ${pick(rooms)} all in ${pick(partly)} ${money()}`, () => ` ${pick(partly)} ${money()} for the whole job`,
      () => `, the ${pick(rooms)} all in ${money()} and ${pick(["five", "fifty", "2", "a half"])}`,
      // Totals followed by a rate qualifier: a rate, never a room or whole-job price.
      () => `, the ${pick(rooms)} all in ${money()} ${pick(rates)}`, () => ` ${money()} ${pick(rates)} for the whole job`,
      // The other end of a range or alternative: never the first amount alone.
      () => `, the ${pick(rooms)} all in ${money()} or ${pick(["six hundred", "600", "six", "seven hundred pounds"])}`,
      () => ` for ${money()} or ${pick(["six hundred", "600", "seven hundred pounds"])}`];
    for (let run = 0; run < 400; run++) {
      const parts: string[] = [];
      const count = 1 + Math.floor(random() * 6);
      for (let index = 0; index < count; index++) {
        const room = random() < 0.4 ? `${pick(["in the ", "", "then the "])}${pick(rooms)} ` : "";
        parts.push(`${room}${pick(work)}${pick(tails)()}`);
      }
      const separator = random() < 0.4 ? " " : pick([", ", ". ", " and "]);
      const text = parts.join(separator);
      const job = strip(readSpokenJob(`p${run}`, text));
      expect(checkSpokenNumbers(job, text), text).toEqual(job);
      // A room or whole-job total kept as a price is the exact amount of its own words, never part of a longer number.
      for (const price of [...job.areaPrices, ...(job.wholeJobPrice ? [job.wholeJobPrice] : [])]) {
        expect(price.provenance.kind, text).toBe("extracted");
        if (price.provenance.kind !== "extracted") continue;
        const { start, end } = price.provenance.span;
        expect(spokenNumbers.money(text.slice(start, end)), `${text} → ${text.slice(start, end)}`).toBe(price.pence);
        expect(saidAmountOpen(...clauseAround(text, start, end)), `${text} → ${text.slice(start, end)} was read in part, as a range or as a rate`).toBe(false);
      }
      for (const line of job.lines) {
        for (const [value, provenance, kind] of [[line.quantity.value, line.quantity.provenance, "count"], [line.unitPricePence.value, line.unitPricePence.provenance, "money"]] as const) {
          if (value === null) continue;
          expect(provenance.kind, text).toBe("extracted");
          if (provenance.kind !== "extracted") continue;
          const said = text.slice(provenance.span.start, provenance.span.end);
          expect(spokenNumbers[kind](said), `${text} → ${said}`).toBe(kind === "count" ? Number(value) : value);
        }
      }
    }
  });
});

describe("V2-SQ-M limit and credit words only count beside the amount", () => {
  it.each([
    ["Fit the radiator under the window for £150", 15000], ["Paint the hall over the stairs for £300", 30000],
    ["Lay the floor in the back bedroom for £400", 40000], ["Hang the door - £200", 20000], ["Hang the door – £200", 20000],
  ])("keeps %s", (text, pence) => {
    expect(readSpokenJob("00000000-0000-4000-8000-000000000002", text).lines.map(line => line.unitPricePence.value)).toEqual([pence]);
  });
  it("leaves a credit room total and whole-job total open", () => {
    const read = readSpokenJob("00000000-0000-4000-8000-000000000002", "In the kitchen paint the ceiling for £200. The kitchen all in minus £300. For the whole job up to £400.");
    expect(read.areaPrices).toEqual([]);
    expect(read.wholeJobPrice).toBeNull();
  });
});

describe("V2-SQ-M a digits-only citation still sees the words before its currency sign (Codex P2 on #1064)", () => {
  it.each(["up to ", "minus ", "a credit of ", "-"])("clears a line, room and whole-job price cited as digits after %s£", words => {
    const pad = " ".repeat(words.length);
    const exact = `In the kitchen paint the ceiling for ${pad}£200. The kitchen all in ${pad}£300. For the whole job ${pad}£400.`;
    const { timeline: _timeline, ...original } = readSpokenJob("00000000-0000-4000-8000-000000000002", exact);
    expect([original.lines[0]!.unitPricePence.value, original.areaPrices[0]?.pence, original.wholeJobPrice?.pence]).toEqual([20000, 30000, 40000]);
    // Each citation narrowed to its digits, as another reader may cite them; the sign and the words stay outside.
    type Cited = { provenance: { kind: string } };
    const digits = <T extends Cited>(field: T): T => {
      const provenance = field.provenance as { kind: "extracted"; span: { start: number; end: number } };
      return { ...field, provenance: { ...provenance, span: { ...provenance.span, start: provenance.span.start + 1 } } };
    };
    const narrowed = { ...original, lines: original.lines.map(line => ({ ...line, unitPricePence: digits(line.unitPricePence) })),
      areaPrices: original.areaPrices.map(digits), wholeJobPrice: original.wholeJobPrice && digits(original.wholeJobPrice) };
    expect(checkSpokenNumbers(narrowed, exact).lines[0]!.unitPricePence.value).toBe(20000);
    const checked = checkSpokenNumbers(narrowed, exact.replaceAll(`${pad}£`, `${words}£`));
    expect(checked.lines[0]!.unitPricePence.value).toBeNull();
    expect(checked.areaPrices).toEqual([]);
    expect(checked.wholeJobPrice).toBeNull();
  });
});

describe("V2-SQ-L the room-number exception needs a stated amount (Codex P2 on #1063)", () => {
  it("rejects a supplied room price citing all-word money straight after the room's number", () => {
    const said = "In bedroom two paint the walls. Bedroom two £500 all in.";
    const { timeline: _timeline, ...job } = readSpokenJob("00000000-0000-4000-8000-000000000002", said);
    expect(job.areaPrices.map(price => price.pence)).toEqual([50000]);
    const words = "In bedroom two paint the walls. Bedroom two five hundred pounds all in.";
    const start = words.indexOf("five hundred pounds");
    const supplied = { ...job, areaPrices: job.areaPrices.map(price => ({ ...price,
      provenance: { kind: "extracted" as const, span: { sourceId: "00000000-0000-4000-8000-000000000002", sourceVersion: 1 as const, start, end: start + "five hundred pounds".length } } })) };
    expect(checkSpokenNumbers(supplied, words).areaPrices).toEqual([]);
    // The same supplied price, cited as "£500" after the room, is kept.
    expect(checkSpokenNumbers(job, said).areaPrices.map(price => price.pence)).toEqual([50000]);
  });
});
