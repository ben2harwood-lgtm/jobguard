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
export type SpokenNumberReader = { money(words: string): number | null; count(words: string): number | null };

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
  const cites = (provenance: z.infer<typeof provenanceV1>, expected: number, kind: keyof SpokenNumberReader) => {
    if (provenance.kind !== "extracted") return false;
    const { start, end } = provenance.span;
    if (start < 0 || end > sourceText.length || start >= end) return false;
    // A cited span must be a whole number as said: "5k" inside "4.5k" or "200" inside "1,200" is not what was said.
    if (/\d[.,]?$/u.test(sourceText.slice(Math.max(0, start - 2), start)) || /^[.,]?\d/u.test(sourceText.slice(end, end + 2))) return false;
    // … nor "five" inside "twenty five", or "twenty" inside "twenty five" or "two hundred".
    if (NUMBER_WORD_BEFORE.test(sourceText.slice(Math.max(0, start - 40), start)) || NUMBER_WORD_AFTER.test(sourceText.slice(end, end + 40))) return false;
    return read[kind](sourceText.slice(start, end)) === expected;
  };
  const spanOf = (provenance: z.infer<typeof provenanceV1>) => provenance.kind === "extracted" ? provenance.span : null;
  /** A line's number is said with its own words: not inside another line's words, nor across a sentence from its own. */
  const belongs = (lineIndex: number, provenance: z.infer<typeof provenanceV1>) => {
    const own = spanOf(understanding.lines[lineIndex]!.description.provenance), said = spanOf(provenance);
    if (!own || !said) return true;
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
  const lines = understanding.lines.map((line, lineIndex) => {
    const label = line.description.value.slice(0, 160);
    let { quantity, unitPricePence, priceBasis } = line;
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
  const areaPrices = understanding.areaPrices.filter(price => {
    if (cites(price.provenance, price.pence, "money")) return true;
    questions.push({ text: "Price needed for this room.", areaKey: price.areaKey });
    return false;
  });
  let wholeJobPrice = understanding.wholeJobPrice;
  if (wholeJobPrice && !cites(wholeJobPrice.provenance, wholeJobPrice.pence, "money")) {
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
  if (understanding.wholeJobPrice) questions.push({ question: { value:
    `You said ${pounds(understanding.wholeJobPrice.pence)} for the whole job. Add a price to each line, or put it on one line.`,
  provenance: { kind: "inferred", note: "Said for the whole job; never spread across lines" } } });
  return {
    title: understanding.title,
    lines: understanding.lines.map(line => line.quantity.value === null && line.priceBasis !== "each" && line.priceBasis !== "per_unit"
      ? { description: line.description, quantity: { value: "1", provenance: { kind: "defaulted", note: "One item per draft line; confirm before quoting" } },
        unit: line.unit.value === null ? { value: "item", provenance: { kind: "defaulted", note: "Draft work item; confirm before quoting" } } : line.unit,
        unitPricePence: line.unitPricePence }
      : { description: line.description, quantity: line.quantity, unit: line.unit, unitPricePence: line.unitPricePence }),
    materials: [{ description: { value: "Review materials required", provenance: { kind: "inferred", note: "Suggestion for human review only" } } }],
    questions,
  };
}
