import { checkUnderstandingNumbers, JOB_UNDERSTANDING_VERSION, jobUnderstandingV1, type JobTrade, type JobUnderstanding,
  type SpokenNumberReader } from "@jobguard/core";
import { amountPoints, amounts, boundaryRecognition, correctionQuestion, invisibleFormat, leadingContentOffset, leadingSpokenCorrection, numberWords, plainDraft, plainItemBoundary, plainNextItem, priceDescription, rateAfter, priceCondition, saidAmountOpen, speechComparison, spokenCorrection, spokenCount, spokenVerb, spokenPounds, timing, total, trimSourceText, visibleWorkText, workClause, type Cell } from "./capture-fixture-parser.js";
import { hideRoomNumbers, roomLead, roomOnly, roomPart } from "./room-words.js";

/**
 * V2-SQ-C Reader A, the context reader. Code only: no model, no network, no spend. It reads one spoken
 * description into rooms and trade lines (job-understanding.v1). It carries a named room forward, maps words
 * to trades from a checked list and reads measures. It never resolves a correction or a reference ("no, make that
 * three", "same again"); those are kept as said and asked about. Every number passes `checkUnderstandingNumbers`.
 */
export const CONTEXT_READER_VERSION = "context-reader/1" as const;

// ---- Numbers, read by the same parsers as the transcript (`amounts`, `spokenPounds`) ------------------------
const digitAmount = /^£?((?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?)$/u;
const toPence = (digits: string) => {
  const [whole, minor = ""] = digits.replace(/,/gu, "").split(".");
  return Number(BigInt(whole!) * 100n + BigInt(minor.padEnd(2, "0")));
};
/** "6 grand", "4.5k", "six grand": thousands only when the words are exactly one such amount. */
function thousands(words: string): number | null {
  const digits = /^(\d{1,4})(?:\.(\d{1,3}))?\s*(?:grand|k)$/iu.exec(words);
  if (digits) return Number(BigInt(digits[1]!) * 100_000n + BigInt((digits[2] ?? "").padEnd(3, "0")) * 100n);
  const spoken = /^(.+?)\s+grand$/iu.exec(words);
  const value = spoken && !/\d/u.test(spoken[1]!) ? spokenPounds(spoken[1]!) : null;
  return value !== null && value > 0 && value < 1000 ? value * 100_000 : null;
}
/** Keep number checks inside the same item boundaries that the context reader passes to plainDraft. */
const isNextItem = (next: string) => plainNextItem(next, isWork, isTiming);
function itemClauses(text: string): string[] {
  const clauses: string[] = [];
  const readNext = boundaryRecognition(text);
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const separator = plainItemBoundary(text, i, start, isNextItem, readNext);
    if (separator) {
      clauses.push(text.slice(start, i)); start = i + separator; i = start - 1;
    }
  }
  clauses.push(text.slice(start));
  return clauses;
}
export const spokenNumbers: SpokenNumberReader = {
  money(words) {
    if (invisibleFormat.test(words)) return null;
    const text = words.trim();
    const found = amounts(text);
    if (found.length === 1 && found[0]!.text === text) return found[0]!.pence;
    if (found.length) return null;
    const bare = digitAmount.exec(text);
    if (bare) return toPence(bare[1]!);
    return thousands(text);
  },
  count(words) {
    const text = words.trim().toLowerCase();
    if (/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/u.test(text)) return Number(text);
    if (!/^[a-z]+(?:[\s-][a-z]+)?$/u.test(text) || /pounds|quid|hundred|thousand/u.test(text)) return null;
    return spokenPounds(text);
  },
  // The same said-amount guards as the reader's own line prices (V2-SQ-M), on the amount's own work clause only:
  // another item in the same sentence ("…, fit a handle for twenty pounds and fifty pence") never opens this one.
  open: (before, after, unit) => {
    const ownBefore = itemClauses(before).at(-1) ?? before, ownAfter = itemClauses(after)[0] ?? after;
    return saidAmountOpen(ownBefore, ownAfter, unit === undefined ? "open" : "line", unit);
  },
};
/** Reader B (SQ-G) passes its output through the same check. */
export const checkSpokenNumbers = (understanding: JobUnderstanding, sourceText: string) => {
  // Reader B must also reject retracted numbers, even when its own proposed output kept them.
  // Reuse the draft's correction targets, including back-references across sentences.
  const corrections = spokenCorrection.test(sourceText) ? plainDraft(sourceText, isWork, isTiming).corrections : [];
  if (!corrections.length) return checkUnderstandingNumbers(understanding, sourceText, spokenNumbers);
  const questions = [...understanding.questions];
  const corrected = (provenance: JobUnderstanding["lines"][number]["description"]["provenance"]) => provenance.kind === "extracted"
    ? corrections.find(chunk => chunk.start < provenance.span.end && chunk.start + chunk.value.length > provenance.span.start) : undefined;
  const ask = (chunk: Cell, lineIndex?: number) => {
    const text = correctionQuestion(chunk.correction!);
    if (questions.some(question => question.text === text && question.lineIndex === lineIndex)) return;
    const question = { text, ...(lineIndex === undefined ? {} : { lineIndex }) };
    if (questions.length < 200) questions.push(question);
    else {
      const at = questions.findIndex(item => item.lineIndex === lineIndex);
      questions[at >= 0 ? at : questions.length - 1] = question;
    }
  };
  const lines = understanding.lines.map((line, index) => {
    const chunk = corrected(line.description.provenance);
    if (!chunk) return line;
    ask(chunk, index);
    return openNumbers(line);
  });
  const areaPrices = understanding.areaPrices.filter(price => {
    const chunk = corrected(price.provenance);
    if (chunk) ask(chunk);
    return !chunk;
  });
  let wholeJobPrice = understanding.wholeJobPrice;
  const whole = wholeJobPrice && corrected(wholeJobPrice.provenance);
  if (whole) { ask(whole); wholeJobPrice = null; }
  return checkUnderstandingNumbers({ ...understanding, lines, areaPrices, wholeJobPrice, questions }, sourceText, spokenNumbers);
};

// ---- Rooms ---------------------------------------------------------------------------------------------------
const OUTSIDE = /^(?:.*\s)?(?:garden|roof|back|front|outside)$/iu;
const roomMention = new RegExp(`(?<![\\p{L}])(?:out the (?:back|front)|${roomPart}(?:\\s+and\\s+(?:the\\s+)?${roomPart})?)(?![\\p{L}])(?!\\s+(?:walls?|fences?|gates?|sheds?|paths?|taps?)\\b)`, "iu");
const leadingRoom = new RegExp(`^${roomLead}(${roomPart}(?:\\s+and\\s+(?:the\\s+)?${roomPart})?|back|front)[\\s,:-]+`, "iu");
/** "new suite supply and fit 3200": a verb with no object of its own finishes the item before it. */
const bareVerb = /^(?:supply and fit|supply and install|supply|fit|install|fitted|supplied)(?:\s+(?:£?\d[\d,.]*(?:\s*(?:grand|k))?|for\b.*|at\b.*))?$/iu;
/** A bare room at the end of continuous speech ("… fit new units bathroom", "… then the kitchen") opens the next item's room. */
const trailingRoomWords = new RegExp(`\\s+((?:and\\s+)?then\\s+(?:the\\s+)?)?(${roomPart}(?:\\s+and\\s+(?:the\\s+)?${roomPart})?)$`, "iu");
const tiedWord = /(?:^|\s)(?:the|a|an|old|new|existing|of|to|for|with|from|into|out|up|down|in|on|my|your|their|his|her|this|that)$/iu;
function trailingRoom(value: string): RegExpExecArray | null {
  const match = trailingRoomWords.exec(value);
  if (!match || match.index === 0) return null;
  return match[1] || !tiedWord.test(value.slice(0, match.index)) ? match : null;
}

const roomName = (words: string) => {
  const name = words.trim().replace(/\s+/gu, " ").replace(/^out the /iu, "");
  const lower = name.toLowerCase().replace(/\bwc\b/gu, "WC");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80) || "area";
function stripLeadingRoom(value: string): { room: string; rest: string; offset: number } | null {
  const leading = leadingContentOffset(value);
  const match = leadingRoom.exec(value.slice(leading));
  if (!match) return null;
  // "the kitchen first take out …", "Downstairs WC just a new toilet": filler words before the work.
  const filler = /^(?:(?:first|next|then|now|also|just)\s+)+/iu.exec(value.slice(leading + match[0].length))?.[0] ?? "";
  const rest = value.slice(leading + match[0].length + filler.length);
  // "Kitchen refit", "Loft conversion": a job title, not work in a room.
  if (/^(?:refit|re-fit|refurb(?:ishment)?|job|conversion|renovation|makeover|works?)\b[\s.]*$/iu.test(rest)) return null;
  return rest && (isVerb(rest) || filler && /^a\s+new\b/iu.test(rest)) ? { room: roomName(match[1]!), rest, offset: leading + match[0].length + filler.length } : null;
}
/** The reader's extra work verbs; "make that eight" or "it's four" are corrections, never work. */
const extraVerb = /^(?:box(?:ing)? in|add|re-?(?:plaster|paint|tile|wire|skim|point|place|felt|grout|hang|fit)|dig|move|get the|have the|knock|take|swap|put|run|board)\b/iu;
function isVerb(value: string) {
  value = visibleWorkText(value);
  return !leadingSpokenCorrection.test(value) && (workClause(value) || extraVerb.test(value));
}
/** "Mrs Patel 14 Orchard Road full rewire of the house five thousand two hundred": the work starts at the verb. */
function lateWorkAt(value: string): number | null {
  const at = /\s(?:(?:full|complete|whole)\s+)?(?=(?:re-?wire|rewiring|re-?plaster|strip|rip|fit|paint|tile|plaster|skim|lay|build|replace|decorate)\b)/iu.exec(value);
  if (!at || visibleWorkText(value.slice(0, at.index)).trimEnd().split(/\s+/u).length < 2 || isVerb(value)) return null;
  return /\d|\b(?:hundred|thousand|grand|pounds|quid)\b/iu.test(value.slice(at.index)) ? at.index + 1 : null;
}
const isWork = (value: string) => isVerb(value) || stripLeadingRoom(value) !== null;
/** "take down the old fence" is work, not a timing note. */
const isTiming = (value: string) => timing.test(visibleWorkText(value)) && !/^take\s+(?:down|out|up|off|away)\b/iu.test(visibleWorkText(value));

// ---- Trades ---------------------------------------------------------------------------------------------------
/** Checked word list; the first match wins. Strip-out is the verb at the start. */
const TRADE_WORDS: [JobTrade, RegExp][] = [
  ["Strip-out", /^(?:rip(?:ping)? out|strip(?:ping)? out|strip|remove|removing|clear|take out|knock out|demolish)\b/iu],
  ["Carpentry", /\b(?:box(?:ing)? in|(?:loft )?ladders?)\b/iu],
  ["Flooring", /\bboard(?:ing)? (?:it )?out\b/iu],
  ["Electrics", /\b(?:sparky|electrician|sockets?|switch(?:es)?|consumer unit|fuse ?box|rewire|wiring|lights?|lighting|spotlights?|downlights?|extractor fan)\b/iu],
  ["Plumbing", /\b(?:plumber|suite|basin|sink|toilet|wc|radiators?|vanity|boiler|taps?|shower|bath|pipes?|pipework|waste)\b/iu],
  ["Tiling", /\b(?:tiles?|tiling|tiled|grout|splashback)\b/iu],
  ["Plastering", /\b(?:skim|plaster(?:ing)?|plasterboard|board(?:ing)?|render)\b/iu],
  ["Decorating", /\b(?:paint(?:ing)?|coats?|gloss|emulsion|decorat(?:e|ing)|wallpaper|undercoat|prime)\b/iu],
  ["Kitchen fitting", /\b(?:units?|worktops?|cabinets?|base units|wall units|kitchen)\b/iu],
  ["Carpentry", /\b(?:doors?|skirting|architraves?|handrails?|banisters?|frames?|shelves|shelving|stud wall|joists?|stairs)\b/iu],
  ["Flooring", /\b(?:laminate|carpet|vinyl|lvt|floorboards|flooring|engineered oak)\b/iu],
  ["Roofing", /\b(?:roof|velux|roof windows?|slates?|gutters?|guttering|flashing|fascias?|soffits?|chimney)\b/iu],
  ["Brickwork", /\b(?:brick(?:s|work)?|pointing|repoint|block ?work|lintel)\b/iu],
  ["Groundworks", /\b(?:dig|footings?|foundations?|drainage|patio|driveway|slab)\b/iu],
];
export function tradeOf(description: string, room: string | null): { trade: JobTrade; word: string | null } {
  for (const [trade, words] of TRADE_WORDS) {
    const match = words.exec(visibleWorkText(description));
    if (match) return { trade, word: match[0] };
  }
  // "fit new ones" in the kitchen: the room says what is being fitted.
  if (room && /kitchen/iu.test(room) && /^(?:fit|install|supply)\b/iu.test(visibleWorkText(description))) return { trade: "Kitchen fitting", word: "kitchen" };
  // "supply and fit" in a bathroom: the room says the suite is being fitted. ("strip out" already matched Strip-out.)
  if (room && /\b(?:bath ?room|en[- ]?suite|wc|cloakroom)\b/iu.test(room) && /^(?:fit|install|supply)\b/iu.test(visibleWorkText(description))) return { trade: "Plumbing", word: "bathroom" };
  return { trade: "Other", word: null };
}

// ---- Lines ----------------------------------------------------------------------------------------------------
const numberWord = `(?:${Object.keys(numberWords).sort((a, b) => b.length - a.length).join("|")})`;
const reference = /\b(?:same again|same as|ditto|the same in)\b/iu;
/** After a comma, more work is fine; another amount, an alternative or a correction leaves the price open. */
const plainCommaTail = /^\s*,(?![^]*(?:\d|\b(?:or|no|nah|actually|sorry|make that|maybe|could be|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|grand|quid|pounds?)\b))/iu;
const measure = new RegExp(`(?:(about|around|roughly|approximately)\\s+)?(\\d{1,4}(?:\\.\\d{1,2})?|${numberWord})\\s+(square\\s+met(?:re|er)s?|sq(?:uare)?\\.?\\s?m|m2|m²|linear\\s+met(?:re|er)s?|met(?:re|er)s?)(?![\\p{L}])`, "iu");
const perMetre = new RegExp(`(?:\\bat|,)\\s+(£?\\d[\\d,]*(?:\\.\\d{1,2})?(?:\\s*(?:pounds|quid))?|${numberWord}(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred))*\\s+(?:pounds|quid))\\s+(?:a|per|each)\\s+(?:square\\s+|linear\\s+)?met(?:re|er)\\b`, "iu");
// "for 2400", "at 300", ", 650" at the end: a bare figure in a price position is a price in pounds.
const pricedBare = /(?:\b(?:for|at)\s+|,\s*)(£?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:grand|k))?)(?=\s*(?:each|apiece|a piece)?\s*$|\s*,|\s+(?:a|an|per)\s+[\p{L}-]+\s*$)/iu;
const strayNumber = /(?<![\p{L}\p{N}£.,])(\d{2,}(?:,\d{3})*(?:\.\d{1,2})?|\d+\s*(?:grand|k))(?![\p{L}\p{N}])/iu;
const strayWords = new RegExp(`(?:(?:${numberWord}|a)[\\s-]+(?:and\\s+)?)+(?:hundred|thousand|grand)(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred))*`, "iu");
// VAT words after a price never change the number; they add a VAT question (the parser's rule, #1033).
const vatTail = "(?:\\s+(?:plus|\\+|inc|incl|including|inclusive\\s+of|ex|excl|excluding|exclusive\\s+of|no)\\.?(?:\\s+vat)?)";
const vatWords = /\bvat\b|\b(?:inc|incl|ex|excl)\.?$/iu;
const vatOnly = new RegExp(`^[\\s,]*${vatTail}\\.?$`, "iu");
const includedTail = /^[\s,]*(?:plus(?:\s+materials)?|labour only)\s*$/iu;
const eachAfter = new RegExp(`^\\s*(?:each|apiece|a piece)${vatTail}?\\.?\\s*$`, "iu");
const perAfter = new RegExp(`^\\s+(?:per|an?)\\s+([\\p{L}-]+)${vatTail}?\\.?$`, "iu");
/** "a door" or "per door" is per-item only for the line's own counted thing: "six doors at fifty pounds a door". */
// Rate qualifier guard: "a/an/per <noun>" right after an amount is a rate whatever follows it.
const perAnyAfter = /^\s+(?:per|an?)\s+([\p{L}-]+)(?![\p{L}])/iu;
const countedBefore = new RegExp(`(?:\\d{1,4}|${numberWord})\\s+(?:[\\p{L}-]+\\s+){0,2}([\\p{L}-]+)\\s+(?:for|at)\\s*$`, "iu");
function sameUnit(unit: string, perWord: string): boolean {
  const a = unit.toLowerCase(), b = perWord.toLowerCase();
  return [a, `${a}s`, `${a}es`].includes(b) || [`${b}s`, `${b}es`].includes(a);
}
const vatQuestion = (value: string) => `Confirm VAT: you said “${value.slice(0, 400)}”. The price is kept as said; VAT is not added or taken off.`;
const notCounted = /^(?:coats?|days?|weeks?|hours?|men|lads|pounds|quid|grand|hundred|thousand|times|layers|percent|metres?|meters?|square|sq|m2|m²|of|the|a|an|and|or|to|in|on|for|at)$/iu;

type Field<T> = { value: T; provenance: { kind: "extracted"; span: { sourceId: string; sourceVersion: 1; start: number; end: number } }
  | { kind: "inferred" | "defaulted"; note: string } };
type Built = { line: JobUnderstanding["lines"][number]; questions: string[] };

function readLine(sourceId: string, chunk: Cell, areaKey: string, room: string | null, inTotalClause: boolean): Built {
  const cite = (start: number, length: number) => ({ kind: "extracted" as const, span: { sourceId, sourceVersion: 1 as const, start: chunk.start + start, end: chunk.start + start + length } });
  const value = chunk.value, questions: string[] = [];
  let descriptionEnd = value.length;
  let quantity: Field<string | null> = { value: null, provenance: { kind: "defaulted", note: "Not said; confirm before quoting" } };
  let unit: Field<string | null> = { value: null, provenance: { kind: "defaulted", note: "Not said; confirm before quoting" } };
  let price: Field<number | null> = { value: null, provenance: { kind: "defaulted", note: "Price not said exactly; never invented" } };
  let priceBasis: JobUnderstanding["lines"][number]["priceBasis"] = "none";
  let perWord: string | null = null, perCountAt = -1, keptCountAt = -1, vatSaid = false;
  const label = () => value.slice(0, descriptionEnd).trim().replace(/[\s,]+$/u, "").slice(0, 160);

  const m = measure.exec(value);
  if (m) {
    const at = m.index + (m[1] ? m[0].indexOf(m[2]!, m[1].length) : 0);
    quantity = { value: String(spokenNumbers.count(m[2]!) ?? ""), provenance: cite(at, m[2]!.length) };
    if (!quantity.value) quantity = { value: null, provenance: { kind: "defaulted", note: "Measure not read exactly" } };
    unit = { value: /square|sq|m2|m²/iu.test(m[3]!) ? "m²" : "m", provenance: cite(m.index + m[0].length - m[3]!.length, m[3]!.length) };
    if (m[1]) questions.push(`You said “${m[0]}” for “${value.slice(0, m.index).trim().slice(0, 120)}”. Confirm the measured quantity.`);
    const rate = perMetre.exec(value);
    if (rate && !inTotalClause) {
      const pence = spokenNumbers.money(rate[1]!);
      // A second rate or a correction after this one ("60 a metre, or 80 a metre") leaves the rate open.
      const tail = value.slice(rate.index + rate[0].length);
      const vat = vatOnly.test(tail);
      const at = rate.index + rate[0].indexOf(rate[1]!);
      if (pence !== null && saidAmountOpen(hideRoomNumbers(value).slice(0, at), hideRoomNumbers(value).slice(at + rate[1]!.length), "line", unit.value)) questions.push(`Confirm the rate and unit: ${value.slice(0, 450)}`);
      else if (pence !== null && !vat && !plainCommaTail.test(`,${tail}`) && tail.trim().replace(/^[.,;]$/u, ""))
        questions.push(`Confirm the rate and unit: ${value.slice(0, 450)}`);
      else if (pence !== null) {
        price = { value: pence, provenance: cite(rate.index + rate[0].indexOf(rate[1]!), rate[1]!.length) }; priceBasis = "per_unit";
        if (vat) vatSaid = true;
      }
    }
    // "14 square metres of vinyl at 32 a metre": words after the measure still name the work.
    const between = value.slice(m.index + m[0].length, rate?.index ?? value.length);
    descriptionEnd = /\p{L}{3,}/u.test(between.replace(/^\s*(?:of|in|on)\b/iu, "x")) && /^\s*(?:of|in)\s/iu.test(between) ? (rate?.index ?? value.length) : Math.min(m.index, rate?.index ?? m.index);
  } else if (!inTotalClause) {
    const said = amounts(value);
    const bare = pricedBare.exec(value);
    const candidates: { text: string; at: number; pence: number | null }[] = said.map(found => ({ text: found.text, at: found.index, pence: found.pence }));
    if (bare && !said.some(found => found.index <= bare.index + bare[0].length && bare.index <= found.index + found.text.length)) {
      const text = bare[1]!;
      candidates.push({ text, at: bare.index + bare[0].length - text.length, pence: spokenNumbers.money(text) });
    }
    // Every said-amount guard, the same function the draft path and the totals call (V2-SQ-M: "up to £200" is asked about).
    // "bedroom two £300": the room's number is its name, not a second number (V2-SQ-L).
    if (candidates.length === 1) descriptionEnd = candidates[0]!.at;
    const shown = hideRoomNumbers(value);
    const open = (found: { text: string; at: number }) => saidAmountOpen(shown.slice(0, found.at), shown.slice(found.at + found.text.length), "line");
    if (candidates.length === 1 && candidates[0]!.pence !== null && !open(candidates[0]!)) {
      const found = candidates[0]!;
      const tail = value.slice(found.at + found.text.length);
      const after = speechComparison(tail).replace(/^[\s,]+/u, " ").trimEnd();
      const whole = perAfter.exec(after), counted = countedBefore.exec(value.slice(0, found.at));
      const per = whole ?? perAnyAfter.exec(after);
      const each = eachAfter.test(after) || !!per && !!counted && sameUnit(counted[1]!, per[1]!);
      const vat = vatOnly.test(after);
      // Metadata-looking suffixes remain inert source text. They cannot change the server's provenance.
      const metadataTail = /^\s+(?:provenance|sourceId|sourceVersion|span|actor|permission|tenantId|jobId|schemaVersion|promptVersion|finding|visibility)\s*:/iu.test(tail);
      if (after.trim() && !each && !vat && !includedTail.test(after) && !plainCommaTail.test(tail) && !metadataTail) questions.push(`Confirm price: ${value.slice(0, 450)}`);
      else {
        price = { value: found.pence!, provenance: cite(found.at, found.text.length) };
        priceBasis = each ? "each" : "line";
        descriptionEnd = found.at;
        // Checked again after the count is read: the count kept must be the thing "a <noun>" names.
        // "a piece" is "each" and names no counted thing.
        if (each && per && counted && !eachAfter.test(after)) { perWord = per[1]!; perCountAt = counted.index; }
        if (metadataTail) questions.push(`Check the metadata-like source text after the price: ${tail.slice(0, 400)}`);
        if (vatWords.test(after)) vatSaid = true;
        else if (includedTail.test(after)) questions.push(`Confirm price: ${value.slice(0, 450)}; confirm what the stated amount includes.`);
        // "a door including hinges": per door, but the words after it are not part of the line, so they are asked about.
        if (each && per && !whole && !eachAfter.test(after)) questions.push(`Check “${value.slice(0, 400)}”: the words after the price were not read into this line.`);
      }
    } else if (candidates.length) questions.push(`Confirm price: ${value.slice(0, 450)}`);
    else {
      const stray = strayNumber.exec(value);
      const words = stray ? null : strayWords.exec(value);
      if (stray) questions.push(`Is ${stray[1]} the price for “${value.slice(0, stray.index).trim().slice(0, 160)}”?`);
      else if (words) questions.push(`Is “${words[0].trim()}” the price for “${value.slice(0, words.index).trim().slice(0, 160)}”?`);
    }
  }
  // Trim the price words ("for", "at", a comma) left at the end of the description; it stays a prefix of the source.
  let description = priceDescription(value, descriptionEnd);
  if (!description) description = value;
  description = description.slice(0, 500);

  if (!m) {
    // A said count ("move two sockets", "fit six base units"), kept unless a price is for several.
    const counted = new RegExp(`(?<![\\p{L}\\p{N}£.,])(\\d{1,4}|${numberWord})\\s+((?:[\\p{L}-]+\\s+){0,2}[\\p{L}-]+)`, "giu");
    for (const match of description.matchAll(counted)) {
      const words = match[2]!.split(/\s+/u);
      const cut = words.findIndex(word => /^(?:for|at|and|in|on|to|with|then|of|no|or)$/iu.test(word));
      const counted = (cut === -1 ? words : words.slice(0, cut)).join(" ");
      const count = spokenNumbers.count(match[1]!);
      // "three no four wall units": a count corrected while speaking is never resolved.
      if (/^(?:no|or|sorry|actually|make)$/iu.test(words[0]!) || /\b(?:no|or|sorry|actually)\s+$/iu.test(description.slice(0, match.index))) {
        questions.push(`You said “${match[0]}”. Check how many for “${label()}”; corrections are not applied.`);
        break;
      }
      if (!counted || notCounted.test(words[0]!) || count === null || count < 1 || /^(?:one)$/iu.test(match[1]!) && /^(?:of|more)$/iu.test(words[0]!)) continue;
      // A count sits directly before what it counts, in the same item. Unsure which thing it belongs to: open and ask.
      const before = description.slice(0, match.index);
      // "fit wardrobes along one wall": a number after a preposition places the work; it does not count it.
      if (/\b(?:along|on|in|into|across|over|under|around|round|from|by|with|at|onto|behind|between|of)\s+$/iu.test(before)) continue;
      if (/^\d+$/u.test(match[1]!) && count > 99 || /\d|\b(?:hundred|thousand|grand|pounds|quid)\b/iu.test(before)
        || /\b(?:and the|and get|needs? to|then)\s/iu.test(before)) {
        questions.push(`Check how many for “${label()}”: “${match[1]} ${counted}” may belong to another item.`);
        break;
      }
      if (price.value !== null && priceBasis === "line" && count > 1) {
        questions.push(`Check “${label()}”: the price is kept for the whole line, not for each.`);
        break;
      }
      quantity = { value: String(count), provenance: cite(match.index, match[1]!.length) };
      keptCountAt = match.index;
      unit = { value: counted.slice(0, 40), provenance: cite(match.index + match[0].indexOf(counted, match[1]!.length), Math.min(counted.length, 40)) };
      break;
    }
    // "six doors and two windows at fifty pounds a window" or "six doors and two doors at fifty pounds a door":
    // the count kept is not the one the price was read against, so the price stays open.
    if (perWord && !(quantity.value !== null && unit.value && keptCountAt === perCountAt
      && sameUnit(unit.value.split(/\s+/u).at(-1)!, perWord))) {
      price = { value: null, provenance: { kind: "defaulted", note: "Price not said exactly; never invented" } };
      priceBasis = "none"; vatSaid = false;
      questions.push(`Confirm price: ${value.slice(0, 450)}`);
      descriptionEnd = value.length;
      description = value.replace(/(?:\s+(?:for|at)|[\s,]+)+$/iu, "").slice(0, 500);
    }
    if (priceBasis === "each" && quantity.value === null) questions.push(`Confirm how many: “${label()}” is priced each.`);
  }
  const firstAmount = amounts(value)[0];
  if (price.value === null && firstAmount && rateAfter(value.slice(firstAmount.index + firstAmount.text.length)))
    questions.push(`Confirm the counted unit and rate unit: ${value.slice(0, 400)}`);
  if (vatSaid) questions.push(vatQuestion(value));
  const { trade, word } = tradeOf(description, room);
  return {
    line: {
      description: { value: description, provenance: chunk.inferred ? { kind: "inferred", note: "Assembled around a customer clause; check the source" } : cite(0, description.length) },
      quantity, unit, unitPricePence: price, areaKey,
      trade: { value: trade, provenance: { kind: "inferred", note: word ? `Trade from the word “${word.slice(0, 60)}”` : "No trade word; check it" } },
      priceBasis,
    },
    questions,
  };
}

// ---- Room and whole-job prices -----------------------------------------------------------------------------------
const priceNear = new RegExp(`£?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?(?:\\s*(?:grand|k|pounds|quid))?|(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*\\s+(?:pounds|quid|grand)`, "giu");
type TotalPrice = { start: number; end: number; pence: number | null; room: string | null; text: string; clauseStart: number; clauseEnd: number; tail: string;
  /** Where the spoken total starts and ends ("the bathroom all in 4500"); line words are cut before it. */
  phraseStart: number; phraseEnd: number };
const besideBefore = /^[\s,]*(?:(?:all in|in total|altogether|total|is|comes to|for|the|about)[\s,]*)*$/iu;
const besideAfter = /^[\s,]*(?:(?:all in|in total|altogether|for|for the|the)[\s,]*)*$/iu;
function totals(text: string): TotalPrice[] {
  const readNext = boundaryRecognition(text);
  const found: TotalPrice[] = [];
  const points = amountPoints(text);
  // A clause ends at punctuation, never at the point or comma inside a number ("4.5k", "1,200").
  const boundary = (at: number) => /[.!?;\n,]/u.test(text[at] ?? "") && !points.has(at)
    && !(text[at] === "," && /\d/u.test(text[at - 1] ?? "") && /\d/u.test(text[at + 1] ?? ""));
  let previousEnd = -1;
  for (const phrase of text.matchAll(new RegExp(total.source, "giu"))) {
    // Scan an extended clause once: rescanning its tail must never rescue one of several overlapping amounts.
    if (phrase.index < previousEnd) continue;
    let clauseStart = phrase.index;
    while (clauseStart > 0 && !boundary(clauseStart - 1)) clauseStart--;
    let clauseEnd = phrase.index;
    while (clauseEnd < text.length && !boundary(clauseEnd) && !plainItemBoundary(text, clauseEnd, clauseStart, isWork, readNext)) clauseEnd++;
    // A comma before a qualifier/correction stays with the total. A new work item still ends it.
    while (text[clauseEnd] === "," && !plainItemBoundary(text, clauseEnd, clauseStart, isWork, readNext)) {
      clauseEnd++;
      while (clauseEnd < text.length && !boundary(clauseEnd) && !plainItemBoundary(text, clauseEnd, clauseStart, isWork, readNext)) clauseEnd++;
    }
    previousEnd = clauseEnd;
    const clause = text.slice(clauseStart, clauseEnd);
    const phraseAt = phrase.index - clauseStart, phraseEnd = phraseAt + phrase[0].length;
    // A measure or a count ("12 square metres", "6 doors") is never a total price.
    // "Bedroom 2 £500": the room's ordinal is never one of the clause's prices (V2-SQ-L). Same length, same indexes.
    const read = hideRoomNumbers(clause);
    const prices = [...read.matchAll(priceNear)].filter(match => /\d|pounds|quid|grand/iu.test(match[0])
      && !/^\s*(?:square|sq\b|m2|m²|met(?:re|er)s?|linear|mm|cm|coats?|days?|weeks?|hours?|units?|doors?|items?|rooms?)/iu.test(clause.slice(match.index + match[0].length)));
    // The price said with the total words: the one nearest them.
    const price = prices.length ? prices.reduce((best, match) => Math.min(Math.abs(match.index - phraseEnd), Math.abs(match.index + match[0].length - phraseAt))
      < Math.min(Math.abs(best.index - phraseEnd), Math.abs(best.index + best[0].length - phraseAt)) ? match : best) : null;
    const words = trimSourceText(price?.[0] ?? "");
    const priceAt = price ? price.index + price[0].indexOf(words) : phraseAt, priceEnd = price ? priceAt + words.length : phraseEnd;
    const lo = Math.min(priceAt, phraseAt), hi = Math.max(priceEnd, phraseEnd);
    const wholeJob = /whole job|the lot|everything/iu.test(phrase[0]);
    const mentions = wholeJob ? [] : [...clause.matchAll(new RegExp(roomMention.source, "giu"))];
    const room = mentions.filter(match => match.index + match[0].length <= lo ? besideBefore.test(clause.slice(match.index + match[0].length, lo))
      : match.index >= hi && besideAfter.test(clause.slice(hi, match.index))).at(-1);
    const phraseStart = clauseStart + Math.min(lo, room?.index ?? lo);
    const phraseStop = clauseStart + Math.max(hi, room && room.index >= hi ? room.index + room[0].length : hi);
    // "all in about 4500", "all in 4500, no, make that 5000": approximate or corrected totals stay open and are asked about.
    const single = !!price && prices.length === 1;
    // Totals call the same function as line prices (saidAmountOpen), with the words of the same clause either side:
    // "a quarter of a thousand pounds", "five hundred pounds or six hundred", "500 pounds per day" all stay open and
    // are asked about with the whole phrase, including comma-separated qualifications and corrections.
    const partial = !!price && saidAmountOpen(read.slice(0, priceAt), read.slice(priceEnd));
    const pence = single && !partial ? spokenNumbers.money(words) : null;
    found.push({ start: clauseStart + priceAt, end: clauseStart + priceEnd, pence: price ? pence : null, room: room ? roomName(room[0]) : null,
      text: clause.trim(), tail: clause.slice(priceEnd), clauseStart: phraseStart, clauseEnd: phraseStop, phraseStart, phraseEnd: phraseStop });
  }
  return found;
}

// ---- The reader ---------------------------------------------------------------------------------------------------
const sameAgain = new RegExp(`\\s+(?=(?:(?:the\\s+)?${roomPart}\\s+)?(?:same again|the same as|same as)\\b)`, "iu");
/** A corrected line keeps its words but none of its numbers: which one stands is the builder's call. */
const openNumbers = (line: JobUnderstanding["lines"][number]): JobUnderstanding["lines"][number] => ({ ...line,
  quantity: { value: null, provenance: { kind: "defaulted", note: "Corrected when said; never resolved" } },
  unit: line.quantity.value === null ? line.unit : { value: null, provenance: { kind: "defaulted", note: "Corrected when said; never resolved" } },
  unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Corrected when said; never resolved" } }, priceBasis: "none" });
const priceOnly = new RegExp(`^(?:call it|say|make it|that'?s|thats|it'?s|about|around|roughly)?\\s*(?:£?\\d[\\d,]*(?:\\.\\d{1,2})?(?:\\s*(?:pounds|quid|grand|k))?|(?:(?:${numberWord}|a)[\\s-]+(?:and\\s+)?)*(?:${numberWord}|hundred|thousand)\\s+(?:pounds|quid|grand))(?:\\s+(?:a|per)\\s+[\\p{L}]+|\\s+each)?[.\\s]*$`, "iu");
type Timeline = { start: number; name: string }[];
function splitWithin(chunk: Cell): Cell[] {
  // "… for 400 second bedroom same again": a reference starts its own item.
  const at = sameAgain.exec(chunk.value);
  if (!at || at.index === 0 || priceCondition.test(chunk.value.slice(0, at.index)) || chunk.inferred || !isWork(chunk.value.slice(0, at.index))) return [chunk];
  const head = chunk.value.slice(0, at.index), tailStart = at.index + at[0].length;
  return [{ value: head, start: chunk.start }, ...splitWithin({ value: chunk.value.slice(tailStart), start: chunk.start + tailStart })];
}

export function readSpokenJob(sourceId: string, text: string): JobUnderstanding & { timeline: Timeline } {
  const draft = plainDraft(text, isWork, isTiming);
  const areas: JobUnderstanding["areas"] = [];
  const timeline: Timeline = [];
  const openArea = (name: string, start: number, at: number, length: number) => {
    const key = keyOf(name);
    if (!areas.some(area => area.key === key)) areas.push({ key, name: { value: name, provenance: { kind: "extracted",
      span: { sourceId, sourceVersion: 1, start: at, end: at + length } } }, kind: name === "Whole job" ? "whole_job" : OUTSIDE.test(name) ? "outside" : "room" });
    timeline.push({ start, name });
    return key;
  };
  const wholeJob = () => {
    if (!areas.some(area => area.key === "whole-job")) areas.push({ key: "whole-job", name: { value: "Whole job", provenance: { kind: "defaulted", note: "No room was named before this work" } }, kind: "whole_job" });
    return "whole-job";
  };
  const lines: JobUnderstanding["lines"] = [];
  const questions: JobUnderstanding["questions"] = [];
  let current: { key: string; name: string } | null = null;
  // "Loft conversion.", "Kitchen job for the Hendersons.": a room in the job's title is where the work starts.
  const titled = draft.title && !isWork(draft.title.value) ? roomMention.exec(draft.title.value) : null;
  if (titled && draft.title) current = { key: openArea(roomName(titled[0]), draft.title.start, draft.title.start + titled.index, titled[0].length), name: roomName(titled[0]) };
  let pendingRoom: { name: string; start: number; length: number } | null = null;
  const priced = totals(text);
  const chunks: Cell[] = [];
  for (let chunk of draft.chunks.flatMap(splitWithin)) {
    const cut = priced.find(price => price.phraseStart > chunk.start && price.phraseStart < chunk.start + chunk.value.length);
    if (cut && !chunk.inferred) chunk = { ...chunk, value: chunk.value.slice(0, cut.phraseStart - chunk.start).replace(/(?:[\s,]+(?:the|for the|for|and))*[\s,]*$/iu, ""), start: chunk.start };
    if (!chunk.value || priced.some(price => chunk.start >= price.phraseStart && chunk.start + chunk.value.length <= price.phraseEnd + 1)) continue;
    const before = chunks[chunks.length - 1];
    const gap = before ? text.slice(before.start + before.value.length, chunk.start) : "";
    // "board and skim the ceiling": a lone verb joined by "and" stays one line; under-splitting beats inventing.
    const loneVerb = before && /^[\p{L}-]+$/u.test(visibleWorkText(before.value)) && isVerb(before.value) && /^\s+and\s+$/iu.test(gap);
    // "new front door supplied by the customer, we just fit it, 250": "fit it" is the same item.
    const sameItem = before && /^\s*$/u.test(gap) && /(?:^|\s)(?:just|we|i|we'll|i'll|they|then we)$/iu.test(visibleWorkText(before.value)) && /^[\p{L}-]+\s+(?:it|them|that|those)\b/iu.test(visibleWorkText(chunk.value));
    if (before && !before.inferred && !chunk.inferred && (/^\s*$/u.test(gap) && bareVerb.test(visibleWorkText(chunk.value)) || loneVerb || sameItem) && !roomOnly.test(visibleWorkText(before.value))) {
      chunks[chunks.length - 1] = { value: text.slice(before.start, chunk.start + chunk.value.length), start: before.start };
    } else chunks.push(chunk);
  }
  // "lay laminate, about 22 square metres, 38 a metre": a measure said after a comma belongs to the item before it.
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]!, end = chunk.start + chunk.value.length;
    const nextStart = chunks[index + 1]?.start ?? text.length;
    const gap = text.slice(end, nextStart);
    if (chunk.inferred || !/^[\s,]*(?:(?:about|around|roughly|approximately)\s+)?\d[\d.]*\s+(?:square|sq\b|m2|m²|linear|met(?:re|er)s?\b)/iu.test(gap)) continue;
    let stop = gap.length;
    for (let at = 0; at < gap.length; at++) if (/[;!?\n]/u.test(gap[at]!) || gap[at] === "." && !(/\d/u.test(gap[at - 1] ?? "") && /\d/u.test(gap[at + 1] ?? ""))) { stop = at; break; }
    chunks[index] = { ...chunk, value: text.slice(chunk.start, end + stop).replace(/[\s,]+$/u, ""), start: chunk.start };
  }
  // The first clause is the title unless work starts inside it after a name ("Mrs Patel 14 Orchard Road full rewire …").
  let titleCell = draft.title;
  const titleClause = draft.title ? text.slice(draft.title.start, chunks[0]?.start ?? text.length).split(/[.!?;\n]|,(?!\d)/u)[0]!.replace(/[\s,]+(?:and|then)?\s*$/iu, "") : "";
  const late = draft.title && (chunks[0]?.start ?? -1) !== draft.title.start ? lateWorkAt(titleClause) : null;
  if (draft.title && late !== null) {
    const workEnd = draft.title.start + titleClause.trimEnd().length;
    titleCell = { value: trimSourceText(titleClause.slice(0, late)), start: draft.title.start };
    const head = { value: text.slice(draft.title.start + late, workEnd), start: draft.title.start + late };
    chunks.splice(0, chunks.filter(chunk => chunk.start < workEnd).length, head);
  }
  for (let index = 0; index < chunks.length; index++) {
    let chunk = chunks[index]!;
    // "Call it 800 pounds a room": a price said on its own is not work. Asked about, never placed.
    if (!chunk.inferred && priceOnly.test(chunk.value.slice(leadingContentOffset(chunk.value)))) {
      questions.push({ text: `You said “${chunk.value.trim().slice(0, 200)}”. Check which work this price is for; it was not placed on a line.` });
      continue;
    }
    // "And downstairs": a place word on its own, not work.
    if (!chunk.inferred && /^(?:and\s+|then\s+)?(?:upstairs|downstairs|outside|inside)[\s,.]*$/iu.test(visibleWorkText(chunk.value))) continue;
    const leading = leadingContentOffset(chunk.value);
    const only = chunk.inferred ? null : roomOnly.exec(chunk.value.slice(leading));
    if (only) {
      const name = roomName(only[1]!);
      pendingRoom = { name, start: chunk.start + leading + only.index + only[0].indexOf(only[1]!), length: only[1]!.length };
      continue;
    }
    if (pendingRoom) { current = { key: openArea(pendingRoom.name, chunk.start, pendingRoom.start, pendingRoom.length), name: pendingRoom.name }; pendingRoom = null; }
    const lead = chunk.inferred ? null : stripLeadingRoom(chunk.value);
    if (lead) {
      const roomAt = chunk.start + chunk.value.toLowerCase().indexOf(lead.room.toLowerCase());
      current = { key: openArea(lead.room, chunk.start, roomAt, lead.room.length), name: lead.room };
      chunk = { ...chunk, value: lead.rest, start: chunk.start + lead.offset };
    } else {
      const mention = roomMention.exec(chunk.value);
      if (mention && !trailingRoom(chunk.value)) {
        const name = roomName(mention[0]);
        current = { key: openArea(name, chunk.start, chunk.start + mention.index, mention[0].length), name };
      }
    }
    // Continuous speech: a bare room at the very end ("… new units bathroom") belongs to the next item.
    const trailing = chunk.inferred || index === chunks.length - 1 ? null : trailingRoom(chunk.value);
    const nextChar = text.slice(chunk.start + chunk.value.length).match(/^\s*(\S)/u)?.[1] ?? "";
    if (trailing && !/[.,;!?]/u.test(nextChar) && trailing.index > 0) {
      const name = roomName(trailing[2]!);
      pendingRoom = { name, start: chunk.start + trailing.index + trailing[0].lastIndexOf(trailing[2]!), length: trailing[2]!.length };
      chunk = { ...chunk, value: chunk.value.slice(0, trailing.index), start: chunk.start };
    }
    const areaKey = current?.key ?? wholeJob();
    const inTotal = priced.some(price => chunk.start < price.phraseEnd && chunk.start + chunk.value.length > price.phraseStart);
    const built = readLine(sourceId, chunk, areaKey, current?.name ?? null, inTotal);
    lines.push(chunk.correction ? openNumbers(built.line) : built.line);
    const lineIndex = lines.length - 1;
    questions.push(...built.questions.map(question => ({ text: question.slice(0, 500), lineIndex })));
    if (chunk.correction) questions.push({ text: correctionQuestion(chunk.correction), lineIndex });
    if (reference.test(chunk.value)) questions.push({ text: `You said “${chunk.value.trim().slice(0, 200)}”. Check what this repeats; nothing was copied.`, lineIndex });
  }
  if (!lines.length) {
    const description = trimSourceText(text).slice(0, 500);
    const start = text.indexOf(description);
    lines.push({ description: { value: description, provenance: { kind: "extracted", span: { sourceId, sourceVersion: 1, start, end: start + description.length } } },
      quantity: { value: null, provenance: { kind: "defaulted", note: "Not said" } }, unit: { value: null, provenance: { kind: "defaulted", note: "Not said" } },
      unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Price not said; never invented" } }, areaKey: wholeJob(),
      trade: { value: tradeOf(description, null).trade, provenance: { kind: "inferred", note: "One line; check it" } }, priceBasis: "none" });
    questions.push({ text: "Check this line and confirm its price. Use Split to make separate work items, then edit and accept each one.", lineIndex: 0 });
  }
  const areaPrices: JobUnderstanding["areaPrices"] = [];
  let wholeJobPrice: JobUnderstanding["wholeJobPrice"] = null;
  let wholeJobConflict = false;
  for (const price of priced) {
    if (price.pence === null) {
      // An unresolved whole-job total cannot leave another total looking definite.
      if (!price.room) wholeJobConflict = true;
      questions.push({ text: `You said “${price.text.slice(0, 300)}”. Check that price; it was not read exactly.` }); continue;
    }
    const provenance = { kind: "extracted" as const, span: { sourceId, sourceVersion: 1 as const, start: price.start, end: price.end } };
    const tail = price.tail;
    if (vatWords.test(tail)) questions.push({ text: vatQuestion(price.text) });
    else if (includedTail.test(tail)) questions.push({ text: `Confirm price: ${price.text.slice(0, 400)}; confirm what the stated amount includes.` });
    // "the WC all in 1100" after "Downstairs WC": the room already open whose name ends with the said words.
    const room = price.room ? areas.find(area => area.key === keyOf(price.room!)) ?? areas.find(area => area.key.endsWith(`-${keyOf(price.room!)}`)) : undefined;
    if (price.room && !room) {
      const key = keyOf(price.room);
      areas.push({ key, name: { value: price.room, provenance }, kind: OUTSIDE.test(price.room) ? "outside" : "room" });
      areaPrices.push({ areaKey: key, pence: price.pence, provenance });
    } else if (room) areaPrices.push({ areaKey: room.key, pence: price.pence, provenance });
    else if (!wholeJobPrice) wholeJobPrice = { pence: price.pence, provenance };
    else if (wholeJobPrice.pence !== price.pence) {
      // Two different whole-job figures: neither is offered; the builder says which applies.
      wholeJobConflict = true;
      questions.push({ text: `You said more than one whole-job price (“${price.text.slice(0, 200)}”). Check which applies.` });
    }
  }
  if (wholeJobConflict) wholeJobPrice = null;
  // Two different totals for one room ("Bathroom all in 500 pounds. Bathroom all in 600 pounds."): neither is offered.
  // The same figure said twice is kept once.
  for (const key of new Set(areaPrices.map(price => price.areaKey))) {
    const said = areaPrices.filter(price => price.areaKey === key);
    if (said.length < 2) continue;
    const keep = new Set(said.map(price => price.pence)).size === 1 ? [said[0]!] : [];
    if (!keep.length) questions.push({ text: `You said more than one price for ${areas.find(area => area.key === key)?.name.value ?? key}. Check which applies.`.slice(0, 500), areaKey: key });
    areaPrices.splice(0, areaPrices.length, ...areaPrices.filter(price => price.areaKey !== key || keep.includes(price)));
  }
  for (const note of draft.notes) if (/^Confirm (?:timing|the currency)/u.test(note)) questions.push({ text: note.slice(0, 500) });
  const title = titleCell && titleCell.value && (titleCell !== draft.title || !isWork(text)) ? titleCell : null;
  const understanding = jobUnderstandingV1.parse({
    version: JOB_UNDERSTANDING_VERSION,
    title: title ? { value: title.value.slice(0, 200), provenance: { kind: "extracted", span: { sourceId, sourceVersion: 1, start: title.start, end: title.start + Math.min(200, title.value.length) } } }
      : { value: "Work described in your words", provenance: { kind: "defaulted", note: "No job title was stated" } },
    areas, lines, areaPrices, wholeJobPrice, questions: questions.slice(0, 200),
  });
  return { ...checkSpokenNumbers(understanding, text), timeline };
}

/**
 * The room and trade for lines already proposed from the same words (the review screen's rows), by where each
 * line's words start in the source. A line before any named room is "Whole job".
 */
export function understoodLabels(sourceId: string, text: string, lines: { start: number | null; description: string }[]): { room: string; category: JobTrade; roomInferred: boolean }[] {
  const { timeline, lines: understood, areas } = readSpokenJob(sourceId, text);
  const names = new Map(areas.map(area => [area.key, area.name.value]));
  return lines.map(line => {
    const same = line.start === null ? undefined : understood.find(item => item.description.provenance.kind === "extracted"
      && item.description.provenance.span.start <= line.start! && line.start! < item.description.provenance.span.end + 1);
    // A room is "said" only when this line's own item sits in an area whose name the builder spoke.
    const said = same && areas.find(area => area.key === same.areaKey)?.name.provenance.kind === "extracted";
    if (same) return { room: names.get(same.areaKey) ?? "Whole job", category: same.trade.value, roomInferred: !said };
    const room = line.start === null ? null : [...timeline].reverse().find(entry => entry.start <= line.start!)?.name ?? null;
    return { room: room ?? "Whole job", category: tradeOf(line.description, room).trade, roomInferred: true };
  });
}
