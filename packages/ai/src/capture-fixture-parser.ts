import { suggestCapturePartyClause, type JobRecordProposal } from "@jobguard/core";

export const CAPTURE_FIXTURE_PARSER_VERSION = "structured-capture-fixture/2" as const;
const MAX_PENCE = 1_000_000_000_000n;
export class CaptureFixtureError extends Error {
  readonly code: "INVALID_FIXTURE_SOURCE" | "FIXTURE_STRUCTURE_REQUIRED";
  constructor(code: "INVALID_FIXTURE_SOURCE" | "FIXTURE_STRUCTURE_REQUIRED") {
    super(code); this.code = code; this.name = "CaptureFixtureError";
  }
}
type Cell = { value: string; start: number; inferred?: boolean; originalValue?: string };
function cells(raw: string, start: number): Cell[] {
  let offset = 5;
  return raw.slice(5).split("|").map(part => {
    const leading = part.length - part.trimStart().length;
    const cell = { value: part.trim(), start: start + offset + leading };
    offset += part.length + 1;
    return cell;
  });
}
function exactRate(raw: string): number | null {
  // A bounded literal, not a natural-language instruction or executable input.
  const match = /^£(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/u.exec(raw);
  if (!match) return null;
  const value = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return value <= MAX_PENCE ? Number(value) : null;
}
function explicit(candidates: Cell[], prefix: string): Cell | null {
  if (candidates.length !== 1) return null;
  const cell = candidates[0]!;
  const content = cell.value.slice(prefix.length);
  const leading = content.length - content.trimStart().length;
  return { value: content.trim(), start: cell.start + prefix.length + leading };
}

const workWord = /^(?:rip|remove|strip|take|clear|fit|install|supply|new|replace|tile|paint|plaster|skim|board|lay|hang|build|make|fix|repair|wire|plumb|test|prepare|protect|clean|seal|fill|sand|prime|connect|move|cut)\b/iu;
const timing = /^(?:(?:should|will) take|takes?|timing|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?))\b/iu;
const overallPrice = /^(?:(?:should|will) be\s+)?(?:about|around|roughly|approximately)\s+(?:£?\d)/iu;
// The splitter's spoken verbs count too, so a leading "decorate the bedroom …" is never mistaken for a title.
const workClause = (value: string) => workWord.test(value) || spokenVerb.test(value) || /^woodwork\s+in\s+gloss\b/iu.test(value);
const total = /\b(?:in total|altogether|all in|for the whole job|for the lot|for everything)\b/iu;
const priceLiteral = /(?<![\p{L}\p{N}£.,])(?:£(?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?|(?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?\s+(?:pounds|quid))(?=$|[^\p{L}\p{N}.,]|[.,](?:\s|$))/giu;

// Spoken amounts ("two hundred pounds", "a thousand and fifty quid"): the words are the cited price.
const numberWords: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const numberWord = `(?:${Object.keys(numberWords).sort((a, b) => b.length - a.length).join("|")})`;
const spokenAmount = new RegExp(`(?<![\\p{L}\\p{N}])(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*\\s+(?:pounds|quid)(?:\\s+(?:and\\s+)?${numberWord}(?:[\\s-]+${numberWord})?\\s+(?:pence|p))?(?![\\p{L}\\p{N}])`, "giu");
// Pence left over once every amount is read ("£20 and 50p"), or a number right after an amount ("20 pounds 50").
const loosePence = new RegExp(`(?:^|[^\\p{L}])(?:pence|p)(?![\\p{L}\\p{N}])|\\d+p(?![\\p{L}\\p{N}])`, "iu");
const numberAfter = new RegExp(`^\\s+(?:and\\s+)?(?:\\d|${numberWord}(?![\\p{L}]))`, "iu");
/** Whole pounds from number words, or null when the words are not one well-formed amount. */
export function spokenPounds(words: string): number | null {
  let totalValue = 0, group = 0, last: "unit" | "ten" | "hundred" | "thousand" | null = null;
  for (const word of words.toLowerCase().replace(/\s+(?:pounds|quid)$/u, "").split(/[\s-]+/u)) {
    if (word === "and") { if (last !== "hundred" && last !== "thousand") return null; continue; }
    if (word === "a") { if (last !== null) return null; group = 1; last = "unit"; continue; }
    if (word === "hundred") { if ((last !== "unit" && last !== "ten") || group === 0 || group > 99) return null; group *= 100; last = "hundred"; continue; }
    if (word === "thousand") { if (last === null || last === "thousand" || totalValue) return null; totalValue = (group || 1) * 1000; group = 0; last = "thousand"; continue; }
    const value = numberWords[word];
    if (value === undefined) return null;
    if (value >= 20 && value % 10 === 0 && value < 100) { if (group % 100) return null; group += value; last = "ten"; continue; }
    if (last === "unit" || (last === "ten" && value >= 10) || (group % 100 && last !== "ten")) return null;
    group += value; last = "unit";
  }
  return last === null ? null : totalValue + group;
}
type Amount = { text: string; index: number; pence: number | null };
function amounts(value: string): Amount[] {
  const found: Amount[] = [...value.matchAll(priceLiteral)].map(match => ({ text: match[0], index: match.index,
    pence: exactRate(`£${match[0].replace(/£|,|\s*(?:pounds|quid)/giu, "")}`) }));
  for (const match of value.matchAll(spokenAmount)) {
    // "twenty pounds and fifty pence": the pence words are part of the same amount.
    const [poundWords, penceWords] = match[0].split(/(?<=pounds|quid)\s+(?:and\s+)?/iu);
    const pounds = spokenPounds(poundWords!);
    const pence = penceWords === undefined ? 0 : spokenPounds(penceWords.replace(/\s+(?:pence|p)$/iu, ""));
    // "one point five pounds", "one million two hundred pounds": only part of the amount was read, so it has no price.
    const partial = /(?:\d|\b(?:point|million|billion|trillion|grand))[\s-]*$/iu.test(value.slice(0, match.index));
    found.push({ text: match[0], index: match.index,
      pence: partial || pounds === null || pence === null || pence > 99 ? null : pounds * 100 + pence });
  }
  // "half a thousand pounds", "between 400 and 500 pounds", "four to five hundred pounds": only part of what was said is an amount.
  for (const amount of found) if (fractionOrRange.test(value.slice(0, amount.index))) amount.pence = null;
  return found.sort((a, b) => a.index - b.index);
}
// A fraction, multiplier or range word right before an amount. The price stays open; the parser never works out the figure.
const fractionOrRange = new RegExp(`(?:\\b(?:half|halves|quarters?|thirds?|couple|few)(?:\\s+of)?(?:\\s+an?)?|\\bbetween\\b[^.;!?]{0,60}?\\band|(?:\\d|£|\\b(?:${numberWord}|hundred|thousand|grand|k))\\s*(?:-|–|to|or))\\s*$`, "iu");
// The other end of a range or alternative said after the amount: "£400 to £500", "fifty pounds or sixty".
const rangePhrase = `(?:\\d[\\d,.]*|(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*)`;
// Only an amount counts as the other end: "to a high standard" or "to one coat" is not a range.
const rangeAfter = new RegExp(`^\\s*(?:-|–|to|or)\\s*(?:£\\d|${rangePhrase}\\s*(?:pounds|quid|k|grand|hundred|thousand)(?![\\p{L}])|${rangePhrase}\\s*$)`, "iu");
// "plus VAT", "inc VAT", "ex VAT": VAT words never change the stated number, and VAT is asked about, not worked out.
const vatTail = "(?:\\s+(?:plus|\\+|inc|incl|including|inclusive\\s+of|ex|excl|excluding|exclusive\\s+of|no)\\.?(?:\\s+vat)?)";
const vatWords = /\bvat\b|\b(?:inc|incl|ex|excl)\.?$/iu;
// Continuous speech has no punctuation, so a new work item also starts at one of these verbs
// unless the word before it ties it to the clause (for example "the", "to" or "and").
const spokenVerb = /^(?:strip|rip|remove|fit|install|hang|paint|plaster|skim|tile|lay|build|replace|repair|fix|wire|plumb|prepare|sand|prime|clear|supply|render|decorate|re-?hang|re-?fit)\b/iu;
const tiedBefore = /(?:^|\s)(?:the|a|an|to|and|or|of|for|with|then|will|can|please|also|we|i|you|need|needs|want|wants|and\s+then|be|it|them|old|new|existing|fresh|wet|loose|damaged|broken|all|any|some|more)$/iu;
const wholeJobTail = new RegExp(`(?:£?\\d[\\d,.]*\\s*(?:pounds|quid)?|(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*\\s+(?:pounds|quid))\\s+(?:for the whole job|for the lot|for everything|all in|in total|altogether)$`, "iu");

/** Deterministic local draft helper, not an accuracy claim. A builder must check
 * every line. Offsets always refer to the untouched source, including prices.
 * ITEM: records never enter this path. No source text is executed or fetched.
 */
function plainDraft(text: string): { chunks: Cell[]; notes: string[]; title: Cell | null } {
  const chunks: Cell[] = [], notes: string[] = [];
  const add = (start: number, end: number) => {
    // "paint the walls and then paint the ceiling": the "and" before "then" joins the items, it is not work.
    const raw = text.slice(start, end), value = raw.trim().replace(/\s+and$/iu, "");
    if (!value) return;
    const at = start + raw.length - raw.trimStart().length;
    const tail = wholeJobTail.exec(value);
    if (tail && tail.index > 0 && workClause(value.slice(0, tail.index).trim())) {
      const head = value.slice(0, tail.index).trimEnd();
      chunks.push({ value: head, start: at }, { value: tail[0], start: at + tail.index });
    } else chunks.push({ value, start: at });
  };
  const party = suggestCapturePartyClause(text);
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (party && i === party.start) { i = party.end - 1; continue; }
    const char = text[i]!;
    // A decimal point or thousands separator belongs to the amount.
    if (/[.!?;\r\n]/u.test(char) && !(char === "." && /\d/u.test(text[i - 1] ?? "") && /\d/u.test(text[i + 1] ?? ""))) {
      add(start, i); start = i + 1;
    } else {
      const separator = char === "," ? "," : /^(?: and | then )/iu.exec(text.slice(i, i + 6))?.[0];
      if (!separator) {
        // Continuous speech: "strip out the old kitchen fit six base units" starts a new item at "fit".
        if (/\s/u.test(char) && !/\s/u.test(text[i - 1] ?? " ") && spokenVerb.test(text.slice(i + 1))
          && !tiedBefore.test(text.slice(start, i)) && text.slice(start, i).trim().split(/\s+/u).length >= 2) {
          add(start, i); start = i + 1;
        }
        continue;
      }
      const next = text.slice(i + separator.length).trimStart();
      // Keep the disposal phrase attached to the removal it describes.
      if (separator.trim().toLowerCase() === "and" && /^take it away\b/iu.test(next)) continue;
      // "supply and fit one door" is one item.
      if (separator.trim().toLowerCase() === "and" && /(?:^|\s)supply$/iu.test(text.slice(start, i)) && /^(?:fit|install)\b/iu.test(next)) continue;
      if (workClause(next) || timing.test(next) || overallPrice.test(next) || /^(?:about\s+)?(?:£?\d|in total\b|altogether\b|all in\b)/iu.test(next) && total.test(next.split(/[,;.!?\r\n]/u)[0]!)) {
        add(start, i); start = i + separator.length; i = start - 1;
      }
    }
  }
  add(start, text.length);
  const first = chunks[0];
  const titleText = first?.value.split(/ for | at /iu)[0]?.slice(0, 200).trim();
  const title = first && titleText ? { value: titleText, start: first.start } : null;
  const work = chunks.filter((chunk, index) => {
    if (timing.test(chunk.value)) { notes.push(`Confirm timing: ${chunk.value.slice(0, 450)}`); return false; }
    if (!workClause(chunk.value) && (total.test(chunk.value) || overallPrice.test(chunk.value))) {
      notes.push(`You said “${chunk.value.slice(0, 400)}”. Add a price to each line, or put it on one line.`); return false;
    }
    return !/^JOB:/u.test(chunk.value) && !(index === 0 && !workClause(chunk.value));
  });
  if (work.length > 100) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
  const cleaned = work.map(chunk => {
    if (!party || party.start < chunk.start || party.end > chunk.start + chunk.value.length) return chunk;
    const before = text.slice(chunk.start, party.start).trimEnd();
    const after = text.slice(party.end, chunk.start + chunk.value.length);
    return { value: before + after, start: chunk.start, inferred: !!after.trim(), originalValue: chunk.value };
  });
  return { chunks: cleaned, notes, title };
}

function plainPrice(chunk: Cell): (Cell & { pence: number; at: number }) | null {
  const matches = amounts(chunk.value);
  if (matches.length !== 1 || matches[0]!.text === chunk.value || matches[0]!.pence === null || total.test(chunk.value)
    || /\b(?:about|around|roughly|approximately)\b/iu.test(chunk.value)) return null;
  const match = matches[0]!;
  const rest = chunk.value.slice(match.index + match.text.length);
  // Never keep part of an amount: unread pence or a trailing number leaves the price open for a question.
  if (loosePence.test(chunk.value.slice(0, match.index) + " " + rest) || numberAfter.test(rest) || rangeAfter.test(rest)) return null;
  const originals = amounts(chunk.originalValue ?? chunk.value);
  if (originals.length !== 1 || originals[0]!.text !== match.text) return null;
  return { value: match.text, start: chunk.start + originals[0]!.index, pence: match.pence!, at: match.index };
}

const spokenCount: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20 };
/** "fit six base units": the stated count and what it counts. Only right after the item's verb. */
function spokenQuantity(description: string): { count: number; said: string; unit: string; unitStart: number } | null {
  const match = /^(?:[\p{L}-]+(?:\s+and\s+[\p{L}-]+)?)\s+(\d{1,4}|[a-z]+)\s+((?:[\p{L}-]+\s+){0,2}[\p{L}-]+)$/iu.exec(description);
  if (!match || !spokenVerb.test(description)) return null;
  const count = /^\d+$/u.test(match[1]!) ? Number(match[1]) : spokenCount[match[1]!.toLowerCase()];
  if (!count || match[2]!.length > 40 || /^(?:the|a|an|of|for|and|in|on|out|up|off|down)\b/iu.test(match[2]!)) return null;
  // "twenty one doors", "one hundred doors": a count of several words is not read, rather than read in part.
  if (new RegExp(`^(?:${numberWord}|hundred|thousand|and)(?![\\p{L}])`, "iu").test(match[2]!)) return null;
  return { count, said: match[1]!, unit: match[2]!, unitStart: description.length - match[2]!.length };
}

/** "six doors … per door": the rate's word is the counted thing, singular or plural. */
function sameUnit(unit: string, perWord: string): boolean {
  const a = unit.split(/\s+/u).at(-1)!.toLowerCase(), b = perWord.toLowerCase();
  return [a, `${a}s`, `${a}es`].includes(b) || [`${b}s`, `${b}es`].includes(a);
}

/** Structured synthetic recipe parser, NOT a live model or natural-language
 * accuracy claim. JOB:/ITEM: records are inert data. No code, URL or commercial
 * action in a record is evaluated. Additional grammar is opt-in QTY:/UNIT:/RATE:.
 * Legacy ITEM recipes retain their visibly defaulted one-item quantity/unit.
 */
export function parseCaptureFixture(sourceId: string, text: string): JobRecordProposal {
  if (!sourceId || sourceId.length > 128 || !text.trim() || text.length > 50_000) {
    throw new CaptureFixtureError("INVALID_FIXTURE_SOURCE");
  }
  let offset = 0;
  const sourceLines = text.split("\n").map(raw => {
    const line = { raw, start: offset }; offset += raw.length + 1; return line;
  });
  const items = sourceLines.filter(line => /^ITEM:/u.test(line.raw));
  if (items.length > 100) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
  const titles = sourceLines.filter(line => /^JOB:[ \t]*\S/u.test(line.raw));
  const title = titles[0];
  const titleValue = title?.raw.slice(4).trim();
  if (titleValue && titleValue.length > 200) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
  const extracted = (start: number, length: number) => ({
    kind: "extracted" as const,
    span: { sourceId, sourceVersion: 1 as const, start, end: start + length },
  });
  const defaulted = (note: string) => ({ kind: "defaulted" as const, note });
  const question = (value: string) => ({ question: {
    value, provenance: { kind: "inferred" as const, note: "A human must resolve the source ambiguity" },
  } });
  const questions: JobRecordProposal["questions"] = [question(items.length
    ? "Confirm disposal and waste allowance" : "Check this line. Use Split to make separate work items, then edit and accept each one.")];
  if (titles.length > 1) questions.push(question("Confirm which stated job title applies"));
  let lines: JobRecordProposal["lines"];
  let plainTitle: Cell | null = null;
  if (!items.length) {
    const draft = plainDraft(text);
    if (draft.chunks.length && workClause(text.trimStart())) plainTitle = draft.title;
    // One spoken item with a stated price ("supply and fit one door for three hundred pounds") is a line too; an unclear price stays open.
    const single = draft.chunks.length === 1 && workClause(text.trimStart()) && draft.chunks[0]!.start === text.length - text.trimStart().length
      && amounts(draft.chunks[0]!.value).length > 0;
    if (draft.chunks.length >= 2 || single) {
      plainTitle = draft.title;
      questions[0] = question("Confirm disposal and waste allowance");
      questions.push(...draft.notes.map(question));
      lines = draft.chunks.map(chunk => {
        const found = plainPrice(chunk);
        const after = found ? chunk.value.slice(found.at + found.value.length) : "";
        // "fit six doors at fifty pounds each": the price is for one of the counted items.
        // "per door" or "a door" only when it names the counted thing; "per pair" or "a day" leaves the price open.
        // VAT words after the per-item word ("a door plus VAT") do not hide it.
        const per = new RegExp(`^\\s+(?:per|an?)\\s+([\\p{L}-]+)${vatTail}?\\.?$`, "iu").exec(after)
          ?? (/^\s+(?:per|an?)\s+[\p{L}-]+\b/iu.test(after) ? [after, ""] : null);
        const perCount = found && per ? spokenQuantity(chunk.value.slice(0, found.at).trimEnd().replace(/\s+(?:for|at)$/iu, "")) : null;
        const each = new RegExp(`^\\s+(?:each|apiece|a piece)${vatTail}?\\.?$`, "iu").test(after) || (!!per && !!perCount && !!per[1] && sameUnit(perCount.unit, per[1]));
        // A per-item word anywhere else is not read, so the price stays open rather than becoming a line price.
        const rate = found && (each || (!per && !/\b(?:each|apiece|per)\b/iu.test(chunk.value))) ? found : null;
        if (!rate && amounts(chunk.value).length) questions.push(question(`Confirm price: ${chunk.value.slice(0, 450)}`));
        if (rate && vatWords.test(after)) questions.push(question(`Confirm VAT: you said “${chunk.value.slice(0, 400)}”. The price is kept as said; VAT is not added or taken off.`));
        const rateValue = rate ? rate.pence : null;
        // A trailing stated price is separate from the work description, and so is the "for" before it.
        const description = rate && (each || !after)
          ? chunk.value.slice(0, rate.at).trimEnd().replace(/\s+(?:for|at)$/iu, "") : chunk.value;
        const kept = description.slice(0, 500);
        if (kept.length < description.length) questions.push(question(`Confirm the description for ${kept.slice(0, 160)}; it is longer than one description and was shortened`));
        // A spoken count is kept when no price is stated, or when the price is for one. A price for several is a line price.
        const counted = chunk.inferred ? null : spokenQuantity(kept);
        if (each && !counted) questions.push(question(`Confirm how many: “${kept.slice(0, 200)}” is priced at ${rate!.value} each.`));
        if (counted && rate && !each && counted.count > 1) {
          questions.push(question(`Check “${kept.slice(0, 200)}”: ${rate.value} is kept as the price for the whole line, not for each.`));
        }
        const keepCount = counted && (!rate || each || counted.count === 1);
        return {
          description: { value: kept, provenance: chunk.inferred ? { kind: "inferred", note: "Work description assembled around the customer and site clause; check the original source" } : extracted(chunk.start, kept.length) },
          quantity: keepCount ? { value: String(counted.count), provenance: { kind: "inferred", note: `Spoken as “${counted.said}”; confirm before quoting` } }
            : each ? { value: null, provenance: defaulted("Priced each, but the count was not read; confirm how many") }
            : { value: "1", provenance: defaulted("One item per draft line; confirm before quoting") },
          unit: keepCount ? { value: counted.unit, provenance: extracted(chunk.start + counted.unitStart, counted.unit.length) }
            : { value: "item", provenance: defaulted("Draft work item; confirm before quoting") },
          unitPricePence: { value: rateValue, provenance: rateValue !== null && rate
            ? extracted(rate.start, rate.value.length) : defaulted("Rate not stated exactly; never invented") },
        };
      });
    } else {
      const description = text.trim();
      const kept = description.slice(0, 500);
      if (kept.length < description.length) questions.push(question("Confirm the work items; the source note is longer than one description and was shortened"));
      lines = [{
        description: { value: kept, provenance: extracted(text.indexOf(description), kept.length) },
        quantity: { value: null, provenance: defaulted("Quantity not stated in structured fixture grammar") },
        unit: { value: null, provenance: defaulted("Unit not stated in structured fixture grammar") },
        unitPricePence: { value: null, provenance: defaulted("Rate not stated; never invented") },
      }];
    }
  } else {
    lines = items.map(line => {
      const parts = cells(line.raw, line.start);
      const description = parts[0]!;
      if (!description.value) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
      const keptDescription = description.value.slice(0, 500);
      if (keptDescription.length < description.value.length) questions.push(question(`Confirm the description for ${keptDescription.slice(0, 160)}; it is longer than one description and was shortened`));
      const label = keptDescription.slice(0, 160);
      const attributes = parts.slice(1);
      const rateCells = attributes.filter(cell => /^(?:£|RATE:)/u.test(cell.value));
      const rate = rateCells.length === 1
        ? (rateCells[0]!.value.startsWith("RATE:") ? explicit(rateCells, "RATE:") : rateCells[0]!) : null;
      const rateValue = rate ? exactRate(rate.value) : null;
      if (rateCells.length && rateValue === null) questions.push(question(`Confirm rate for ${label}`));
      const quantityCells = attributes.filter(cell => cell.value.startsWith("QTY:"));
      const quantity = explicit(quantityCells, "QTY:");
      const validQuantity = quantity && /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/u.test(quantity.value)
        && BigInt(quantity.value.replace(".", "")) > 0n;
      if (quantityCells.length && !validQuantity) questions.push(question(`Confirm quantity for ${label}`));
      const unitCells = attributes.filter(cell => cell.value.startsWith("UNIT:"));
      const unit = explicit(unitCells, "UNIT:");
      const validUnit = unit && /^[\p{L}\p{N}][\p{L}\p{N} _²³/-]{0,39}$/u.test(unit.value);
      if (unitCells.length && !validUnit) questions.push(question(`Confirm unit for ${label}`));
      return {
        description: { value: keptDescription, provenance: extracted(description.start, keptDescription.length) },
        quantity: quantityCells.length ? {
          value: validQuantity ? quantity!.value : null,
          provenance: validQuantity ? extracted(quantity!.start, quantity!.value.length) : defaulted("Quantity needs confirmation"),
        } : { value: "1", provenance: defaulted("One item per supplied ITEM line; confirm before quoting") },
        unit: unitCells.length ? {
          value: validUnit ? unit!.value : null,
          provenance: validUnit ? extracted(unit!.start, unit!.value.length) : defaulted("Unit needs confirmation"),
        } : { value: "item", provenance: defaulted("Supplied work item; confirm before quoting") },
        unitPricePence: {
          value: rateValue,
          provenance: rateValue !== null ? extracted(rate!.start, rate!.value.length)
            : defaulted(rateCells.length ? "Rate needs confirmation; never guessed" : "Rate not stated; never invented"),
        },
      };
    });
  }
  return {
    title: titleValue && title
      ? { value: titleValue, provenance: extracted(title.start + title.raw.indexOf(titleValue, 4), titleValue.length) }
      : plainTitle ? { value: plainTitle.value, provenance: extracted(plainTitle.start, plainTitle.value.length) }
      : { value: "Work described in your words", provenance: defaulted("No job title was stated") },
    lines,
    materials: [{ description: { value: "Review materials required", provenance: {
      kind: "inferred", note: "Suggestion for human review only",
    } } }],
    questions,
  };
}
