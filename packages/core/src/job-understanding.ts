import { z } from "zod";
import { provenanceV1, type JobRecordProposal } from "./capture.js";

/**
 * V2-SQ-C: what a spoken job description means, split into areas (rooms) and trade lines.
 * Additive to job-record-proposal-v1: `toJobRecordProposal` turns it back into today's proposal, so everything
 * downstream that reads v1 keeps working. Room and trade are labels a builder changes in one tap; numbers are
 * kept only when the builder said them (`checkUnderstandingNumbers`).
 */
export const JOB_UNDERSTANDING_VERSION = "job-understanding.v1" as const;

/** Closed so plans can key on it. "Tiling" and "Decorating" equal the V2 work-plan template's categories. */
export const JOB_TRADES = ["Strip-out", "Carpentry", "Kitchen fitting", "Plumbing", "Electrics", "Plastering", "Tiling",
  "Flooring", "Decorating", "Roofing", "Brickwork", "Groundworks", "Other"] as const;
export type JobTrade = (typeof JOB_TRADES)[number];

const field = <T extends z.ZodTypeAny>(value: T) => z.strictObject({ value, provenance: provenanceV1 });
const extractedOnly = provenanceV1.refine(provenance => provenance.kind === "extracted", "A said price must cite its words");
const areaKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/u);

export const jobUnderstandingV1 = z.strictObject({
  version: z.literal(JOB_UNDERSTANDING_VERSION),
  title: field(z.string().min(1).max(200)),
  areas: z.array(z.strictObject({ key: areaKey, name: field(z.string().min(1).max(80)), kind: z.enum(["room", "outside", "whole_job"]) }))
    .min(1).max(60),
  lines: z.array(z.strictObject({
    description: field(z.string().min(1).max(500)),
    quantity: field(z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/u).nullable()),
    unit: field(z.string().min(1).max(40).nullable()),
    unitPricePence: field(z.number().int().nonnegative().nullable()),
    areaKey,
    trade: field(z.enum(JOB_TRADES)),
    priceBasis: z.enum(["line", "each", "per_unit", "none"]),
  })).min(1).max(100),
  areaPrices: z.array(z.strictObject({ areaKey, pence: z.number().int().nonnegative(), provenance: extractedOnly })).max(60),
  wholeJobPrice: z.strictObject({ pence: z.number().int().nonnegative(), provenance: extractedOnly }).nullable(),
  questions: z.array(z.strictObject({ text: z.string().min(1).max(500), lineIndex: z.number().int().nonnegative().optional(),
    areaKey: areaKey.optional() })).max(200),
}).superRefine((value, context) => {
  const keys = new Set(value.areas.map(area => area.key));
  if (keys.size !== value.areas.length) context.addIssue({ code: "custom", message: "Area keys are unique" });
  for (const key of [...value.lines.map(line => line.areaKey), ...value.areaPrices.map(price => price.areaKey),
    ...value.questions.flatMap(question => question.areaKey ? [question.areaKey] : [])]) {
    if (!keys.has(key)) context.addIssue({ code: "custom", message: `Unknown area ${key}` });
  }
  for (const question of value.questions) {
    if (question.lineIndex !== undefined && question.lineIndex >= value.lines.length) context.addIssue({ code: "custom", message: "Unknown line" });
  }
});
export type JobUnderstanding = z.infer<typeof jobUnderstandingV1>;
export type UnderstoodLine = JobUnderstanding["lines"][number];

/**
 * Reads the cited words as a number with the parsers that read the transcript (packages/ai supplies them).
 * `money` returns pence, `count` the counted value; null when the words are not exactly one number.
 */
export type SpokenNumberReader = { money(words: string): number | null; count(words: string): number | null;
  /** True when the words of the same sentence either side of a cited amount leave it open ("up to £200", "-£50"). */
  open?(before: string, after: string): boolean };

const NUMBER_WORDS = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|grand|half|point";
const NUMBER_WORD_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${NUMBER_WORDS})(?:[\\s-]+and)?[\\s-]+$`, "iu");
const NUMBER_WORD_AFTER = new RegExp(`^[\\s-]+(?:and[\\s-]+)?(?:${NUMBER_WORDS})(?![\\p{L}])`, "iu");

/**
 * The money rule (plan 4.2), for both readers. A quantity, unit price, room price or whole-job price is kept only
 * when it is extracted and its cited span of the untouched source reads, by JobGuard's own parser, to exactly that
 * value, as a whole number and not part of a larger one. A line's quantity or price must also sit with that line's
 * own words: not inside another line's words, and not across a sentence from them. Anything else is cleared and asked about. A reader can label and group; it can never introduce a number.
 */
export function checkUnderstandingNumbers(understanding: JobUnderstanding, sourceText: string, read: SpokenNumberReader): JobUnderstanding {
  const questions = [...understanding.questions];
  const cites = (provenance: z.infer<typeof provenanceV1>, expected: number, kind: "money" | "count") => {
    if (provenance.kind !== "extracted") return false;
    const { start, end } = provenance.span;
    if (start < 0 || end > sourceText.length || start >= end) return false;
    // A cited span must be a whole number as said: "5k" inside "4.5k" or "200" inside "1,200" is not what was said.
    if (/\d[.,]?$/u.test(sourceText.slice(Math.max(0, start - 2), start)) || /^[.,]?\d/u.test(sourceText.slice(end, end + 2))) return false;
    // … nor "five" inside "twenty five", or "twenty" inside "twenty five" or "two hundred".
    if (NUMBER_WORD_BEFORE.test(sourceText.slice(Math.max(0, start - 40), start)) || NUMBER_WORD_AFTER.test(sourceText.slice(end, end + 40))) return false;
    // … nor an amount the words around it leave open, such as a limit or a credit (V2-SQ-M), within its own sentence.
    if (kind === "money" && read.open) {
      const before = sourceText.slice(Math.max(0, start - 80), start), after = sourceText.slice(end, end + 80);
      if (read.open(before.slice(before.search(/[^.;!?\n]*$/u)), after.slice(0, after.search(/[.;!?\n]|$/u)))) return false;
    }
    return read[kind](sourceText.slice(start, end)) === expected;
  };
  const spanOf = (provenance: z.infer<typeof provenanceV1>) => provenance.kind === "extracted" ? provenance.span : null;
  /** A line's number is said with its own words: not inside another line's words, nor across a sentence from its own. */
  const belongs = (lineIndex: number, provenance: z.infer<typeof provenanceV1>) => {
    const own = spanOf(understanding.lines[lineIndex]!.description.provenance), said = spanOf(provenance);
    // A counted or priced line needs its own said words (plan-check condition 3).
    if (!own || !said) return false;
    if (said.start >= own.start && said.start < own.end) return true;
    // Another line's words inside the number, or between the number and this line's words, mean the number is theirs.
    if (understanding.lines.some((other, index) => { const words = spanOf(other.description.provenance);
      return index !== lineIndex && !!words && (said.start >= words.start && said.start < words.end
        || said.start >= own.end && words.start >= own.end && words.start < said.start
        || said.end <= own.start && words.end <= own.start && words.end > said.end
        // A number said straight after another line's words, before this line's, is that line's.
        || said.end <= own.start && words.end <= said.start && !/[.;!?\n]/u.test(sourceText.slice(words.end, said.start).replace(/(\d)\.(?=\d)/gu, "$1"))); })) return false;
    const between = said.start < own.start ? sourceText.slice(said.end, own.start) : sourceText.slice(own.end, said.start);
    return !/[.;!?\n]/u.test(between.replace(/(\d)\.(?=\d)/gu, "$1"));
  };
  const overlaps = (a: { start: number; end: number } | null, b: { start: number; end: number } | null) => !!a && !!b && a.start < b.end && b.start < a.end;
  // Line words must not overlap: two lines on the same words cannot both hold numbers.
  const sharedWords = new Set(understanding.lines.flatMap((line, index) => understanding.lines.some((other, otherIndex) => otherIndex !== index
    && overlaps(spanOf(line.description.provenance), spanOf(other.description.provenance))) ? [index] : []));
  // One money span, one home: a said amount prices at most one line, one room or the whole job.
  const moneySpans = [...understanding.lines.map(line => line.unitPricePence.value === null ? null : spanOf(line.unitPricePence.provenance)),
    ...understanding.areaPrices.map(price => spanOf(price.provenance)), understanding.wholeJobPrice ? spanOf(understanding.wholeJobPrice.provenance) : null];
  const reused = (at: number) => moneySpans.some((other, index) => index !== at && overlaps(moneySpans[at]!, other));
  /** "each" and "per unit" multiply, so the per-item words must sit beside the cited price. */
  // "a switch" after the price also counts when "switch" is the line's own counted unit (V2-SQ-RA, Codex P2 on #1037).
  // Nouns may be hyphenated ("a down-light"), matching Reader A's own noun rule.
  const ownUnit = (said: { end: number }, unit: string | null) => {
    const word = /^\s*(?:pounds?|quid)?\s*an?\s+([\p{L}-]+)(?![\p{L}-])/iu.exec(sourceText.slice(said.end, said.end + 40))?.[1]?.toLowerCase();
    const own = unit?.split(/\s+/u).at(-1)?.toLowerCase();
    return !!word && !!own && ([own, `${own}s`, `${own}es`].includes(word) || [`${word}s`, `${word}es`].includes(own));
  };
  const perItem = (said: { start: number; end: number } | null, unit: string | null = null) => !!said
    && (ownUnit(said, unit) || /^\s*(?:pounds?|quid)?\s*(?:each|apiece|a piece|per\s+[\p{L}-]+|an?\s+(?:square\s+|linear\s+)?(?:met(?:re|er)|m2|m²|panel|door|unit|item|hour|day|sheet|roll|length|socket|radiator|window|one))(?![\p{L}])/iu.test(sourceText.slice(said.end, said.end + 40))
      || /(?:^|[^\p{L}])(?:each|apiece|per\s+\p{L}+)\s+(?:at\s+|for\s+)?£?\s*$/iu.test(sourceText.slice(Math.max(0, said.start - 30), said.start)));
  const lines = understanding.lines.map((line, lineIndex) => {
    const label = line.description.value.slice(0, 160);
    let { quantity, unitPricePence, priceBasis } = line;
    if ((quantity.value !== null || unitPricePence.value !== null) && sharedWords.has(lineIndex)) {
      if (quantity.value !== null) quantity = { value: null, provenance: { kind: "defaulted", note: "Line words overlap another line; never invented" } };
      if (unitPricePence.value !== null) { unitPricePence = { value: null, provenance: { kind: "defaulted", note: "Line words overlap another line; never invented" } }; priceBasis = "none"; }
      questions.push({ text: `Check “${label}”: its words are shared with another line.`, lineIndex });
    }
    if (unitPricePence.value !== null && reused(lineIndex)) {
      unitPricePence = { value: null, provenance: { kind: "defaulted", note: "Price words already price something else" } };
      priceBasis = "none";
      questions.push({ text: `Price needed for “${label}”: that amount was said for something else.`, lineIndex });
    }
    if (unitPricePence.value !== null && (priceBasis === "each" || priceBasis === "per_unit") && !perItem(spanOf(unitPricePence.provenance), line.unit.value)) priceBasis = "line";
    if (quantity.value !== null && !(cites(quantity.provenance, Number(quantity.value), "count") && belongs(lineIndex, quantity.provenance))) {
      quantity = { value: null, provenance: { kind: "defaulted", note: "Quantity not said exactly; never invented" } };
      questions.push({ text: `How many for “${label}”?`, lineIndex });
    }
    if (unitPricePence.value !== null && !(cites(unitPricePence.provenance, unitPricePence.value, "money") && belongs(lineIndex, unitPricePence.provenance))) {
      unitPricePence = { value: null, provenance: { kind: "defaulted", note: "Price not said exactly; never invented" } };
      priceBasis = "none";
      questions.push({ text: `Price needed for “${label}”.`, lineIndex });
    }
    return { ...line, quantity, unitPricePence, priceBasis };
  });
  /** A room's price is said in a sentence that names that room, and no other room is named nearer to it. */
  const ownsArea = (areaKey: string, said: { start: number; end: number }) => {
    const marks = /[.;!?\n]/gu, plain = sourceText.replace(/(\d)\.(?=\d)/gu, "$1 ");
    let from = 0, to = sourceText.length;
    for (const mark of plain.matchAll(marks)) { if (mark.index! < said.start) from = mark.index! + 1; else if (mark.index! >= said.end) { to = mark.index!; break; } }
    const sentence = sourceText.slice(from, to).toLowerCase();
    const nearest = (name: string) => {
      let best: { distance: number; length: number } | null = null;
      for (const token of [name.toLowerCase().trim(), name.toLowerCase().trim().split(/\s+/u).at(-1)!]) {
        if (!token) continue;
        const word = new RegExp(`(?<![\\p{L}])${token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\p{L}])`, "gu");
        for (const found of sentence.matchAll(word)) {
          const start = from + found.index!, end = start + found[0].length;
          const distance = end <= said.start ? said.start - end : start >= said.end ? start - said.end : 0;
          if (!best || distance < best.distance || distance === best.distance && token.length > best.length) best = { distance, length: token.length };
        }
      }
      return best;
    };
    const own = understanding.areas.find(area => area.key === areaKey);
    const mine = own ? nearest(own.name.value) : null;
    if (!mine) return false;
    return !understanding.areas.some(area => { if (area.key === areaKey || area.kind === "whole_job") return false;
      const theirs = nearest(area.name.value);
      return !!theirs && (theirs.distance < mine.distance || theirs.distance === mine.distance && theirs.length >= mine.length); });
  };
  const areaPrices = understanding.areaPrices.filter((price, index) => {
    if (cites(price.provenance, price.pence, "money") && ownsArea(price.areaKey, spanOf(price.provenance)!) && !reused(understanding.lines.length + index)) return true;
    questions.push({ text: "Price needed for this room.", areaKey: price.areaKey });
    return false;
  });
  let wholeJobPrice = understanding.wholeJobPrice;
  if (wholeJobPrice && (!cites(wholeJobPrice.provenance, wholeJobPrice.pence, "money") || reused(moneySpans.length - 1))) {
    wholeJobPrice = null;
    questions.push({ text: "Check the whole-job price; it was not read exactly." });
  }
  return jobUnderstandingV1.parse({ ...understanding, lines, areaPrices, wholeJobPrice, questions });
}

/**
 * Today's proposal from an understanding. A line without a said count is one item, as v1 shows it, with the
 * default marked; nothing is spread from a room or whole-job price onto lines. Those stay review questions.
 */
export function toJobRecordProposal(understanding: JobUnderstanding): JobRecordProposal {
  const areaName = new Map(understanding.areas.map(area => [area.key, area.name.value]));
  const pounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0 })}`;
  const questions: JobRecordProposal["questions"] = understanding.questions.map(question => ({ question: {
    value: question.text, provenance: { kind: "inferred", note: "A human must resolve the source ambiguity" } } }));
  for (const price of understanding.areaPrices) questions.push({ question: { value:
    `You said ${pounds(price.pence)} for ${areaName.get(price.areaKey) ?? "this room"}. It stays on the room, not spread across its lines.`,
  provenance: { kind: "inferred", note: "Said for the room; check where it belongs" } } });
  for (const line of understanding.lines) if (line.priceBasis === "line" && line.quantity.value !== null && line.quantity.value !== "1") questions.push({ question: {
    value: `“${line.description.value.slice(0, 160)}”: the price covers the whole line, not each of the ${line.quantity.value}. Check before quoting.`,
    provenance: { kind: "inferred", note: "Count said with a whole-line price" } } });
  if (understanding.wholeJobPrice) questions.push({ question: { value:
    `You said ${pounds(understanding.wholeJobPrice.pence)} for the whole job. Add a price to each line, or put it on one line.`,
  provenance: { kind: "inferred", note: "Said for the whole job; never spread across lines" } } });
  return {
    title: understanding.title,
    lines: understanding.lines.map(line => line.priceBasis === "line" && line.quantity.value !== null && line.quantity.value !== "1"
      // A price for the whole line stays one priced item, so a v1 reader never multiplies it by the said count.
      ? { description: line.description, quantity: { value: "1", provenance: { kind: "defaulted", note: `Priced for the whole line; ${line.quantity.value} said is in the words` } },
        unit: { value: "item", provenance: { kind: "defaulted", note: "Priced for the whole line; confirm before quoting" } },
        unitPricePence: line.unitPricePence }
      : line.quantity.value === null && line.priceBasis !== "each" && line.priceBasis !== "per_unit"
      ? { description: line.description, quantity: { value: "1", provenance: { kind: "defaulted", note: "One item per draft line; confirm before quoting" } },
        unit: line.unit.value === null ? { value: "item", provenance: { kind: "defaulted", note: "Draft work item; confirm before quoting" } } : line.unit,
        unitPricePence: line.unitPricePence }
      : { description: line.description, quantity: line.quantity, unit: line.unit, unitPricePence: line.unitPricePence }),
    materials: [{ description: { value: "Review materials required", provenance: { kind: "inferred", note: "Suggestion for human review only" } } }],
    questions,
  };
}
