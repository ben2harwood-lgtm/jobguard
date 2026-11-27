import { toJobRecordProposal } from "@jobguard/core";
import { describe, expect, it } from "vitest";
import { checkSpokenNumbers, readSpokenJob, spokenNumbers, understoodLabels } from "./context-reader.js";

const SMITH = "Smith house refurb. In the kitchen rip out the old units and fit new ones for 2400, tile the floor about 12 square metres at 60 a metre. Upstairs bathroom strip out, new suite supply and fit 3200, and get the sparky to move two sockets. Paint the hallway and landing, two coats, 650.";
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
    const rooms = ["kitchen", "the bathroom", "upstairs bathroom", "back bedroom", "the hallway and landing", "out the back", "loft", "bedroom 2"];
    const work = ["rip out the old units", "fit new units", "tile the floor", "paint the walls", "move two sockets", "fit a new door",
      "skim the ceiling", "lay laminate", "fit six base units", "supply and fit", "replace the slates", "same again", "no, make that three"];
    const money = () => pick([`${Math.floor(random() * 5000)}`, `£${Math.floor(random() * 900)}.${Math.floor(random() * 99)}`, "two hundred pounds",
      "sixty quid", `${Math.floor(random() * 9)}.${Math.floor(random() * 9)}k`, "6 grand", `${Math.floor(random() * 3)},${Math.floor(100 + random() * 899)}`]);
    const tails = [() => "", () => ` for ${money()}`, () => ` ${money()}`, () => ` about ${Math.floor(random() * 40)} square metres at ${money()} a metre`,
      () => ` ${money()} each`, () => `, the ${pick(rooms)} all in ${money()}`, () => ` ${money()} for the whole job`, () => ` roughly ${money()}`];
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
