import { multipleJobQuestion, suggestCapturePartyClause, type JobRecordProposal } from "@jobguard/core";
import { hideRoomNumbers, roomOnly, roomPart } from "./room-words.js";

export const CAPTURE_FIXTURE_PARSER_VERSION = "structured-capture-fixture/3" as const;
const MAX_PENCE = 1_000_000_000_000n;
export class CaptureFixtureError extends Error {
  readonly code: "INVALID_FIXTURE_SOURCE" | "FIXTURE_STRUCTURE_REQUIRED";
  constructor(code: "INVALID_FIXTURE_SOURCE" | "FIXTURE_STRUCTURE_REQUIRED") {
    super(code); this.code = code; this.name = "CaptureFixtureError";
  }
}
// Source-facing trimming keeps format characters, including the whitespace BOM, in the cited text.
export const trimSourceText = (value: string) => value.replace(/^[^\S\uFEFF]+|[^\S\uFEFF]+$/gu, "");
// Offset calculations use the original prefix length, never indices from a shortened recognition copy.
export const leadingContentOffset = (value: string) => /^[\s\p{Cf}\p{Default_Ignorable_Code_Point}]*/u.exec(value)![0].length;
export type Cell = { value: string; start: number; inferred?: boolean; originalValue?: string; correction?: string };
function cells(raw: string, start: number): Cell[] {
  let offset = 5;
  return raw.slice(5).split("|").map(part => {
    const value = trimSourceText(part);
    const leading = part.indexOf(value);
    const cell = { value, start: start + offset + leading };
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
  const value = trimSourceText(content);
  return { value, start: cell.start + prefix.length + content.indexOf(value) };
}

const workWord = /^(?:rip|remove|strip|take|clear|fit|install|supply|new|replace|tile|paint|plaster|skim|board|lay|hang|build|make|fix|repair|wire|plumb|test|prepare|protect|clean|seal|fill|sand|prime|connect|move|cut)\b/iu;
export const timing = /^(?:(?:should|will) take|takes?|timing|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?))\b/iu;
const overallPrice = /^(?:(?:should|will) be\s+)?(?:about|around|roughly|approximately)\s+(?:£?\d)/iu;
// The splitter's spoken verbs count too, so a leading "decorate the bedroom …" is never mistaken for a title.
// Recognition only: never use this copy for source spans or amount parsing.
export const visibleWorkText = (value: string) => value.replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, "").trimStart();
const speechFillerWords = "um|uh|er|erm|like|you\\s+know|sort\\s+of|kind\\s+of|i\\s+mean";
const speechFillers = new RegExp(`(?:,\\s*)?(?<![\\p{L}\\p{N}-])(${speechFillerWords})(?![\\p{L}\\p{N}-])(?:\\s*,)?`, "giu");
const leadingSpeechFillers = new RegExp(`^(?:[\\s,]*(?:${speechFillerWords})(?![\\p{L}\\p{N}-]))+[\\s,]*`, "iu");
/** Recognition copy only. Same UTF-16 length; source text and cited offsets never change. */
export function speechComparison(value: string, leadingOnly = false): string {
  const mask = (words: string) => words.replace(/[^\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, " ");
  const input = leadingOnly ? value.slice(0, leadingSpeechFillers.exec(value)?.[0].length ?? 0) : value;
  const comparison = input.replace(speechFillers, (match: string, word: string, at: number) => {
    if (/^like$/iu.test(word) && (/\bwould\s*$/iu.test(value.slice(0, at)) || /^\s*new\b/iu.test(value.slice(at + match.length)))) return match;
    return mask(match);
  });
  if (leadingOnly) return comparison + value.slice(input.length);
  return comparison.replace(/\b(?:yeah|so)(?:[\s,]+(?:yeah|so))*[\s,]*(?=[.!?;]*$)/giu, (words: string, at: number) =>
    /^so\b/iu.test(words) && /\bor\s+$/iu.test(comparison.slice(0, at)) ? words.slice(0, 2) + mask(words.slice(2)) : mask(words));
}
export const workClause = (value: string) => {
  // Formula-like prefixes are literal description characters, never commands. Recognition only.
  const visible = speechComparison(visibleWorkText(value), true).trimStart().replace(/^[=+@'’-]+(?=\p{L})/u, "");
  return workWord.test(visible) || spokenVerb.test(visible) || /^woodwork\s+in\s+gloss\b/iu.test(visible);
};
export const total = /\b(?:in total|altogether|all in|for the whole job|for the lot|for everything)\b/iu;
// Keep corrupted literals whole so they produce an open price, never a valid prefix or a second work line.
export const invisibleFormat = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
const priceLiteral = /(?<![\p{L}\p{N}£.,])(?:[£€$](?=[\d.,\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}\p{Cs}\x00]*[\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}\p{Cs}\x00])[\d.,\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}\p{Cs}\x00]+|[£€$](?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2}|\.{2,}\d+)?|(?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2}|\.{2,}\d+)?\s+(?:pounds|quid|euros?|dollars?))(?:[km½]|ish)?(?=$|[^\p{L}\p{N}.,]|[.,](?:\s|$))/giu;
/** Decimal punctuation, including malformed repeated dots, belongs to the amount rather than a new clause. */
export function amountPoints(text: string): Set<number> {
  const points = new Set<number>();
  for (const match of text.matchAll(/\d(\.+)(?=\d)/gu)) {
    for (let offset = 1; offset <= match[1]!.length; offset++) points.add(match.index + offset);
  }
  // Entity terminators and dots in an email address are literal text, not spoken pauses.
  const literals = [...text.matchAll(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,8}|#x[\da-f]{1,8});/giu),
    ...(text.includes("@") ? [...text.matchAll(/[\w.+@-]+/gu)].filter(match => match[0].includes("@")) : [])];
  for (const match of literals) {
    const end = match[0].startsWith("&") ? match[0].length : match[0].replace(/\.+$/u, "").length;
    for (let at = 0; at < end; at++) if (/[.;]/u.test(match[0][at]!)) points.add(match.index + at);
  }
  return points;
}

// Spoken amounts ("two hundred pounds", "a thousand and fifty quid"): the words are the cited price.
export const numberWords: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const numberWord = `(?:${Object.keys(numberWords).sort((a, b) => b.length - a.length).join("|")})`;
// A number word, digit, fraction or multiplier next to an amount, with only "and", "a", "an", "of", hyphens or spaces between.
const unreadNumber = `(?:\\d[\\d,.]*k?|\\b(?:${numberWord}|hundred|thousand|million|billion|trillion|grand|k|point|half|halves|quarters?|thirds?|couple|few|dozen|score)(?![\\p{L}]))`;
const correctionNumber = new RegExp(unreadNumber, "iu");
const withdrawal = /\b(?:scratch|scrap|forget|cancel)\b/iu;
// One correction marker guard for splitting, price safety and the builder's question. Never choose between said values.
export const spokenCorrection = new RegExp(
  `\\b(?:(?:no[\\s,]+)?make\\s+(?:that|it)(?=\\s+(?:£?\\d|${numberWord}(?![\\p{L}])|a[\\s-]+${unreadNumber}))` +
  `|oh[\\s,]+it['’]?s|it['’]?s\\s+actually` +
  `|actually|sorry|new\\s+price|revised|instead|i\\s+mean(?:t)?|hang\\s+on|wait|nah|nope|no(?!\\s+(?:vat|more|less|charge)\\b)` +
  `|${withdrawal.source}|start\\s+again|correction|not(?=\\s+(?:£?\\d|${numberWord}(?![\\p{L}])))` +
  `|(?:change|revise|replace)\\s+(?:(?:that|the|first)\\s+)*(?:price|figure|amount|first\\s+item|room)\\b|change\\s+the\\s+first\\s+item|change\\s+that\\s+to|revise\\b[^.;!?\\r\\n]{0,60}?\\bprice|the\\b[^.;!?\\r\\n]{0,60}?\\bfigure\\s+was\\s+wrong` +
  `|that\\s+(?:should\\s+be|was\\s+euros|figure\\s+is\\s+a\\s+credit)` +
  `|(?:do\\s+not|don't)\\s+(?:use|bother)|we\\s+are\\s+not\\s+doing|leave\\b[^.;!?\\r\\n]{0,60}?\\bout|cannot\\s+give\\s+a\\s+figure` +
  `|or\\s+rather|call\\s+it\\s+[^;!?\\r\\n]{1,100}?\\binstead)\\b`, "iu");
// Boundary predicates only ask about offset zero; never search every remaining suffix for a later correction.
export const leadingSpokenCorrection = new RegExp(`^(?:${spokenCorrection.source})`, "iu");
/** The same explicit question follows a correction through both draft readers. */
export const correctionQuestion = (words: string) => `A spoken correction was made: “${words.slice(0, 380)}”. Check the item, room, quantity and price; is the work in or out?`;

const spokenAmount = new RegExp(`(?<![\\p{L}\\p{N}])(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand|million))*(?:\\s+and)?\\s+(?:pounds|quid)(?:\\s+(?:and\\s+)?${numberWord}(?:[\\s-]+${numberWord})?\\s+(?:pence|p))?(?![\\p{L}\\p{N}])`, "giu");
// Pence left over once every amount is read ("£20 and 50p"), or a number right after an amount ("20 pounds 50").
const loosePence = new RegExp(`(?:^|[^\\p{L}])(?:pence|p)(?![\\p{L}\\p{N}])|\\d+p(?![\\p{L}\\p{N}])`, "iu");
const numberAfter = new RegExp(`^\\s+(?:and\\s+)?(?:\\d|${numberWord}(?![\\p{L}]))`, "iu");
/** Whole pounds from number words, or null when the words are not one well-formed amount. */
export function spokenPounds(words: string): number | null {
  let totalValue = 0, group = 0, scale = Infinity, joined = false;
  let last: "unit" | "ten" | "hundred" | "scale" | null = null;
  for (const word of words.toLowerCase().replace(/\s+(?:pounds|quid)$/u, "").split(/[\s-]+/u)) {
    if (word === "and") { if (joined || last !== "hundred" && last !== "scale") return null; joined = true; continue; }
    // Keep the supported million grammar explicit; incomplete or unsupported joins stay open.
    if (last === "scale" && scale === 1_000_000 && !joined) return null;
    if (joined && /^(?:hundred|thousand|million)$/u.test(word)) return null;
    joined = false;
    if (word === "a") { if (last !== null) return null; group = 1; last = "unit"; continue; }
    if (word === "hundred") { if ((last !== "unit" && last !== "ten") || group === 0 || group > 99) return null; group *= 100; last = "hundred"; continue; }
    if (word === "thousand" || word === "million") {
      const nextScale = word === "million" ? 1_000_000 : 1000;
      if (last === null || last === "scale" || !group || group > 999 || nextScale >= scale) return null;
      totalValue += group * nextScale; group = 0; scale = nextScale; last = "scale"; continue;
    }
    const value = numberWords[word];
    if (value === undefined) return null;
    if (value >= 20 && value % 10 === 0 && value < 100) { if (group % 100) return null; group += value; last = "ten"; continue; }
    if (last === "unit" || (last === "ten" && value >= 10) || (group % 100 && last !== "ten")) return null;
    group += value; last = "unit";
  }
  return last === null || joined ? null : totalValue + group;
}
export type Amount = { text: string; index: number; pence: number | null };
export function amounts(said: string): Amount[] {
  // "Bedroom two £500": a numbered room's ordinal is never part of an amount nor beside one (V2-SQ-L). Same length.
  const value = hideRoomNumbers(said);
  const found: Amount[] = [...value.matchAll(priceLiteral)].map(match => ({ text: match[0], index: match.index,
    pence: exactRate(`£${match[0].replace(/£|,|\s*(?:pounds|quid)/giu, "")}`) }));
  // A spoken amount requires this currency word. Avoid retrying an unterminated number chain at every word.
  for (const match of /(?:pounds|quid)(?![\p{L}\p{N}])/iu.test(value) ? value.matchAll(spokenAmount) : []) {
    // "twenty pounds and fifty pence": the pence words are part of the same amount.
    const [poundWords, penceWords] = match[0].split(/(?<=pounds|quid)\s+(?:and\s+)?/iu);
    const pounds = spokenPounds(poundWords!);
    const pence = penceWords === undefined ? 0 : spokenPounds(penceWords.replace(/\s+(?:pence|p)$/iu, ""));
    // Unsupported decimal words or scales must never leave a priced suffix.
    const partial = /(?:\d|\b(?:point|million|billion|trillion|grand))[\s-]*$/iu.test(value.slice(0, match.index));
    found.push({ text: match[0], index: match.index,
      pence: partial || pounds === null || pence === null || pence > 99 || BigInt(pounds) * 100n + BigInt(pence) > MAX_PENCE ? null : pounds * 100 + pence });
  }
  // "half a thousand pounds", "between 400 and 500 pounds", "four to five hundred pounds": only part of what was said is an amount.
  // Unread number guard: "one thousand and a hundred pounds", "fifty pounds and five": a number said next to the amount
  // but outside it means the amount was read in part, so it has no price.
  for (const amount of found) if (readInPart(value.slice(0, amount.index), value.slice(amount.index + amount.text.length))) amount.pence = null;
  return found.sort((a, b) => a.index - b.index);
}
// A fraction, multiplier or range word right before an amount. The price stays open; the parser never works out the figure.
const fractionOrRange = new RegExp(`(?:\\b(?:half|halves|quarters?|thirds?|couple|few)(?:\\s+of)?(?:\\s+an?)?|\\bbetween\\b[^.;!?]{0,60}?\\band|(?:\\d|£|\\b(?:${numberWord}|hundred|thousand|grand|k))\\s*(?:-|–|—|to|or))\\s*$`, "iu");
const unreadBefore = new RegExp(`${unreadNumber}(?:[\\s-]+(?:and|a|an|of))*[\\s-]*$`, "iu");
const unreadAfter = new RegExp(`^(?:[\\s-]+(?:and|a|an|of)(?![\\p{L}]))*[\\s-]+${unreadNumber}`, "iu");
/**
 * The one unread-number guard, for line prices and for room and whole-job totals alike: true when the words just
 * before or after an amount are a fraction, range, multiplier or another number ("a quarter of a thousand pounds",
 * "one million two hundred pounds", "fifty pounds and five"). The amount was then read in part, so it has no price.
 */
export function readInPart(before: string, after: string): boolean {
  return fractionOrRange.test(before) || unreadBefore.test(before) || unreadAfter.test(after);
}
/** A rate qualifier right after an amount: "a/an/per <noun>" (group 1 is the noun) or "each". The amount is then a rate. */
const rateQualifier = /^[\s,]*(?:(?:\/\s*|(?:per|an?)\s+)((?:(?:square|linear)\s+)?[\p{L}²2-]+)(?![\p{L}])|(?:each|apiece)(?![\p{L}]))/iu;
export function rateAfter(after: string): RegExpExecArray | null {
  return rateQualifier.exec(after);
}
// The other end of a range or alternative said after the amount: "£400 to £500", "fifty pounds or sixty".
const rangePhrase = `(?:\\d[\\d,.]*|(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*)`;
// Only an amount counts as the other end: "to a high standard" or "to one coat" is not a range. A bare number counts
// at the end of the clause or before the total words ("five hundred pounds or six for the whole job").
const rangeAfter = new RegExp(`^\\s*(?:-|–|—|to|or)\\s*(?:£\\d|${rangePhrase}\\s*(?:pounds|quid|k|grand|hundred|thousand)(?![\\p{L}])|${rangePhrase}\\s*(?:$|(?=(?:for|all in|in total|altogether)(?![\\p{L}]))))`, "iu");
// A hedge word qualifying the amount itself: "about 500", "roughly £500", "500 or so". "Tile around the bath" is a place.
const hedgeWords = "about|around|roughly|approximately|approx|say|reckon|maybe|give or take|call it|ballpark|somewhere near|in the region of|circa|probably|(?:an?\\s+)?estimate(?:d)?(?:\\s+of)?|(?:a\\s+)?budget of|allow|allowance(?: of)?|provisionally";
const hedgeBefore = new RegExp(`\\b(?:${hedgeWords})\\.?[\\s,]*$`, "iu");
const hedgeAfter = new RegExp(`^[\\s,]*(?:-?ish\\b|or so\\b|(?:${hedgeWords})(?![\\p{L}]))`, "iu");
// Also used by clause splitting: a verb inside a condition is not another work item.
export const priceCondition = /\b(?:if|unless|provided|subject to|depending on|assuming|conditional on)\b/iu;
export const foreignCurrency = /[€$]|\b(?:euros?|dollars?|USD|EUR|CAD|AUD)\b/iu;
const nonPriceWords = /[%]|\b(?:percent|cashback|discount|deposit of|paid\b[^;!?\n]*\balready|day rate|rate of)\b|\bminus the deposit\b/iu;
// A limit, floor or credit around the amount (V2-SQ-M): a ceiling, a floor or a credit is never a fixed price, and a
// credit is never read as a charge or worked out as a negative one; the builder is asked. "Paint the ceiling - £200"
// (a dash with a space after it) is punctuation; "-£50" and "−£50", with the sign against the amount, are a minus.
const limitBefore = /(?:(?<![\p{L}])(?:up\s+to|at\s+(?:the\s+)?(?:most|least|maximum|minimum|max|min)|no\s+(?:more|less|higher|lower|greater)\s+than|not\s+(?:more|less)\s+than|not\s+(?:over|exceeding)|(?:a\s+|the\s+)?(?:maximum|minimum|max|min)(?:\s+(?:price|cost|charge|budget|spend))?(?:\s+of)?|capped\s+at|starting\s+(?:at|from)|(?:take|knock)\s+off|deduct(?:ion)?(?:\s+of)?|discount(?:\s+of)?|minus(?:\s+the)?|less|rebate(?:\s+of)?|refund(?:\s+of)?|back\s+for|(?:a\s+)?credit(?:\s+of)?|under|below|over|above)\s*|(?:^|\s)[-–]|−\s*|\(\s*)$/iu;
const limitAfter = /^\s*(?:[-–−)]|(?:pounds?\s+|quid\s+)?(?:minimum|maximum|min|max|tops|at\s+(?:the\s+)?(?:most|least)|or\s+(?:less|more|under|over|below|above|thereabouts)|credit(?:ed)?|off(?:\s+(?:the\s+)?(?:bill|price|total|invoice|quote))?|discount|rebate|refund(?:ed)?|back)(?![\p{L}]))/iu;
/** Transcript commands and quoted administrative notes are data, never work or amount authority. */
export const instructionClause = (value: string): boolean => /^(?:(?:please|now)\s+)*(?:(?:ignore|disregard)\b|(?:system|assistant)\s*[:,]|you\s+are\s+now\b|(?:delete|send|approve|overwrite|hide|email)\b|mark\s+(?:the|this)\s+(?:quote|invoice)\b|switch\s+(?:the|this)\s+job\b|charge\s+the\s+customer\b|use\s+(?:tenantId|jobId)\b|run\s+javascript:|call\s+(?:the\s+)?\w+\s+tool\b|tool_call:|SYSTEM_OVERRIDE\b|(?:set|reset|override)\b[^.;!?\r\n]{0,80}\b(?:prices?|amount|total)\b|the\s+(?:customer(?:\s+text)?|note|sticker|sign|message|label)\s+(?:wrote|says|reads)\b|[{}]|```|<\/script>\s*system:)/iu.test(visibleWorkText(value));
/**
 * The one place that holds every said-amount guard, for line prices (plainPrice) and room and whole-job totals alike.
 * `before` and `after` are the words of the same clause either side of the amount. The amount stays open, and is asked
 * about, when: it was read in part (readInPart); pence words or a "p" amount sit beside it (loosePence); a number
 * follows it (numberAfter); the other end of a range or alternative follows it (rangeAfter: "or six hundred");
 * a hedge word qualifies it ("about 500", "500 or so"); a limit, floor or credit word qualifies it ("up to £200",
 * "£200 minimum", "take off £50", "-£50", "(£50)", "£50-", "£50 off the bill"); invisible format characters
 * occur in its clause (except before its leading text; never stripped from the source); a spoken correction retracts it; or a rate qualifier follows it (rateAfter).
 * Line prices read "each" and "per door" rates themselves, so plainPrice passes rates "line" and only the rest apply.
 */
export function saidAmountOpen(before: string, after: string, rates: "open" | "line" = "open", unit?: string | null): boolean {
  // "I mean" can also retract a price: retain the original correction check.
  const correction = spokenCorrection.test(before) || spokenCorrection.test(after);
  before = speechComparison(before).replace(/[^\S\uFEFF]+/gu, " ");
  after = speechComparison(after).replace(/[^\S\uFEFF]+/gu, " ");
  after = after.replace(/^[\s,]+/u, " ");
  // A prefix before a work/title/room clause is harmless, even when the numeric checker includes the title.
  // Keep a prefix directly beside the amount, and every invisible character inside the clause or amount.
  const content = before.slice(leadingContentOffset(before));
  const priceBefore = /^\p{L}/u.test(content) ? content : before;
  const rate = rateAfter(after);
  const normalUnit = (word: string) => word.toLowerCase().replace(/^(?:square met(?:re|er)s?|m2|m²)$/u, "m²")
    .replace(/^(?:linear )?met(?:re|er)s?$/u, "m").split(/\s+/u).at(-1)!;
  const rateOpen = !!rate && (unit !== undefined ? !!rate[1] && rate[1].toLowerCase() !== "piece" && (!unit || !sameUnit(normalUnit(unit), normalUnit(rate[1])))
    : rates === "open" || /^(?:days?|hours?)$/iu.test(rate[1] ?? "") || /^\s*\//u.test(after));
  return foreignCurrency.test(`${before} ${after}`) || priceCondition.test(before) || priceCondition.test(after) || nonPriceWords.test(`${before} ${after}`)
    || /^[km½]/iu.test(after)
    || [before, after].some(words => words.split(/\s+(?:and|then)\s+|,\s*/iu).some(instructionClause))
    || correction || readInPart(before, after) || loosePence.test(`${before} ${after}`) || numberAfter.test(after) || rangeAfter.test(after)
    || invisibleFormat.test(priceBefore) || invisibleFormat.test(after)
    || hedgeBefore.test(before) || hedgeAfter.test(after) || limitBefore.test(before) || limitAfter.test(after) || rateOpen;
}
// "plus VAT", "inc VAT", "ex VAT": VAT words never change the stated number, and VAT is asked about, not worked out.
const vatTail = "(?:\\s+(?:plus|\\+|inc|incl|including|inclusive\\s+of|ex|excl|excluding|exclusive\\s+of|no)\\.?(?:\\s+vat)?)";
const vatWords = /\bvat\b|\b(?:inc|incl|ex|excl)\.?$/iu;
// Continuous speech has no punctuation, so a new work item also starts at one of these verbs
// unless the word before it ties it to the clause (for example "the", "to" or "and").
export const spokenVerb = /^(?:strip|rip|remove|fit|install|hang|paint|plaster|skim|tile|lay|build|replace|repair|fix|wire|plumb|prepare|sand|prime|clear|supply|render|decorate|re-?hang|re-?fit)\b/iu;
const tiedBefore = /(?:^|\s)(?:the|a|an|to|and|or|of|for|with|then|will|can|please|also|we|i|you|need|needs|want|wants|and\s+then|be|is|are|it|them|old|new|existing|fresh|wet|loose|damaged|broken|all|any|some|more)$/iu;
const wholeJobTail = new RegExp(`(?:£?\\d[\\d,.]*\\s*(?:pounds|quid)?|(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*\\s+(?:pounds|quid))\\s+(?:for the whole job|for the lot|for everything|all in|in total|altogether)$`, "iu");
const wholeJobEnding = /(?:for the whole job|for the lot|for everything|all in|in total|altogether)$/iu;

const nextRoomLead = new RegExp(`^(?:(?:and|then)\\s+)?in\\s+(?:the\\s+)?${roomPart}[,:]?\\s+`, "iu");

/** Normalize once per boundary scan, keeping original UTF-16 offsets even when recognition removes format characters. */
export function boundaryRecognition(text: string): (at: number) => string {
  if (!invisibleFormat.test(text)) return at => text.slice(at).trimStart();
  const removed = new Uint32Array(text.length + 1);
  let at = 0, count = 0;
  const visible = text.replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, (word: string, offset: number) => {
    while (at <= offset) removed[at++] = count;
    count += word.length;
    return "";
  });
  while (at <= text.length) removed[at++] = count;
  return offset => visible.slice(offset - removed[offset]!).trimStart();
}

/** The draft's next-item boundary length, or zero. Shared with numeric checks and total clauses. */
export function plainItemBoundary(text: string, i: number, start: number,
  isNext: (value: string) => boolean = workClause,
  readNext: (at: number) => string = at => visibleWorkText(text.slice(at))): number {
  const char = text[i] ?? "";
  if (/\s/u.test(char) && !/\s/u.test(text[i - 1] ?? " ") && i > start) {
    const next = text.slice(i + 1), room = nextRoomLead.exec(next);
    if (room && visibleWorkText(text.slice(start, i)).trimEnd().split(/\s+/u).length >= 2 && isNext(next.slice(room[0].length))) return 1;
  }
  const separator = char === "," ? "," : /^(?: and | then )/iu.exec(text.slice(i, i + 6))?.[0];
  if (!separator && (!/\s/u.test(char) || /\s/u.test(text[i - 1] ?? " "))) return 0;
  const next = readNext(i + (separator?.length ?? 1));
  // Price revisions qualify the original item, even when "new" or "make" is also a work word.
  // Keep this guard here so draft readers and numeric checks use the same clause.
  if (leadingSpokenCorrection.test(next)) return 0;
  if (!separator) {
    // Continuous speech: "strip out the old kitchen fit six base units" starts a new item at "fit".
    if (/\s/u.test(char) && !/\s/u.test(text[i - 1] ?? " ") && (spokenVerb.test(next)
        || workWord.test(next) && amounts(text.slice(start, i)).some(amount => amount.index + amount.text.length === i - start))
      && !tiedBefore.test(text.slice(start, i)) && visibleWorkText(text.slice(start, i)).trimEnd().split(/\s+/u).length >= 2) {
      return 1;
    }
    return 0;
  }
  // Keep the disposal phrase attached to the removal it describes.
  if (separator.trim().toLowerCase() === "and" && /^take it away\b/iu.test(next)) return 0;
  // "supply and fit one door" is one item.
  if (separator.trim().toLowerCase() === "and" && /(?:^|\s)supply$/iu.test(text.slice(start, i)) && /^(?:fit|install)\b/iu.test(next)) return 0;
  // B6: delegated work after a price is a new item, never a suffix lost by description trimming.
  // Keep its own untouched source span; both readers and numeric checks use this boundary.
  const delegated = /^(?:and\s+)?(?=(?:get|have|ask)\s+the\b)/iu.exec(next);
  if (delegated && !priceCondition.test(text.slice(start, i))) return separator.length + delegated[0].length;
  if (isNext(next)) {
    return separator.length;
  }
  return 0;
}

/** The draft's next-item predicate, shared with numeric checks. */
export function plainNextItem(next: string, isWork: (value: string) => boolean,
  isTiming: (value: string) => boolean): boolean {
  return isWork(next) || isTiming(next) || overallPrice.test(next) || /^(?:about\s+)?(?:£?\d|in total\b|altogether\b|all in\b)/iu.test(next) && total.test(next.slice(0, next.search(/[,;.!?\r\n]|$/u)));
}

/** Deterministic local draft helper, not an accuracy claim. A builder must check
 * every line. Offsets always refer to the untouched source, including prices.
 * ITEM: records never enter this path. No source text is executed or fetched.
 */
// `isWork` lets the context reader (SQ-C) also treat "in the kitchen rip out …" as work; the v1 parser passes the default.
export function plainDraft(text: string, isWork: (value: string) => boolean = workClause,
  isTiming: (value: string) => boolean = value => timing.test(visibleWorkText(value))): { chunks: Cell[]; corrections: Cell[]; notes: string[]; title: Cell | null } {
  const chunks: Cell[] = [], notes: string[] = [];
  let fenced = false;
  const boundary = multipleJobQuestion(text);
  if (boundary) notes.push(boundary);
  if (foreignCurrency.test(text)) notes.push("Confirm the currency: only an unambiguous GBP price can be kept.");
  const points = amountPoints(text);
  const add = (start: number, end: number) => {
    // "paint the walls and then paint the ceiling": the "and" before "then" joins the items, it is not work.
    // U+FEFF is both whitespace and a format character: retain it for the price guard and the source span.
    const raw = text.slice(start, end), value = trimSourceText(raw).replace(/\s+and$/iu, "");
    if (!value) return;
    if (/^```/u.test(value)) fenced = !fenced;
    if (fenced || instructionClause(value)) { notes.push(`Check the instruction or note as source text, not work: ${value.slice(0, 400)}`); return; }
    const at = start + raw.indexOf(value);
    const tail = wholeJobEnding.test(value) ? wholeJobTail.exec(value) : null;
    if (tail && tail.index > 0 && isWork(value.slice(0, tail.index))) {
      const head = value.slice(0, tail.index).trimEnd();
      chunks.push({ value: head, start: at }, { value: tail[0], start: at + tail.index });
    } else chunks.push({ value, start: at });
  };
  const isNext = (next: string) => plainNextItem(next, isWork, isTiming);
  const readNext = boundaryRecognition(text);
  // No party clause can match without "at <site>". Keep the original input and all of its offsets.
  const party = /\bat\s/iu.test(text) ? suggestCapturePartyClause(text) : null;
  const correctionEnds = new Map([...text.matchAll(new RegExp(spokenCorrection.source, "giu"))]
    .map(match => [match.index, match.index + match[0].length]));
  let start = 0, correctionInChunkEnd = -1, correctionNeedsNumber = false, inertClause = false;
  for (let i = 0; i < text.length; i++) {
    if (i === start) inertClause = fenced || instructionClause(text.slice(start));
    if (party && i === party.start) { i = party.end - 1; continue; }
    // A correction marker stays with its source span, including internal commas.
    const correctionEnd = correctionEnds.get(i);
    if (correctionEnd !== undefined) {
      correctionInChunkEnd = correctionEnd;
      correctionNeedsNumber = !withdrawal.test(text.slice(i, correctionEnd));
      i = correctionEnd - 1; continue;
    }
    const char = text[i]!;
    // Withdrawals are complete without a replacement number; the next work item can start after them.
    // A bare number/count also ends the wait, but never resolves the corrected quantity or price.
    const awaitingCorrection = correctionNeedsNumber && correctionInChunkEnd >= start && !correctionNumber.test(text.slice(correctionInChunkEnd, i));
    // A decimal point or thousands separator belongs to the amount.
    if ((/[.!?;\r\n]/u.test(char) || char === "—" && leadingSpokenCorrection.test(visibleWorkText(text.slice(i + 1)))) && !points.has(i)) {
      if (char === "." && /\bapprox$/iu.test(text.slice(start, i)) && /^\s*£?\d/u.test(text.slice(i + 1))) continue;
      // Pauses inside a correction stay with it; work, a room heading or a total after a completed correction starts a new clause.
      const next = visibleWorkText(text.slice(i + 1));
      const nextClause = next.split(/[.!?;\r\n]/u)[0]!;
      if (correctionInChunkEnd >= start && !isWork(next) && !roomOnly.test(nextClause)
        && (awaitingCorrection || !total.test(nextClause))) continue;
      add(start, i); start = i + 1;
    } else {
      const separator = inertClause ? 0 : plainItemBoundary(text, i, start, isNext, readNext);
      if (!awaitingCorrection && separator) {
        add(start, i); start = i + separator; i = start - 1;
      }
    }
  }
  add(start, text.length);
  // Resolve only the target of a correction, never its numbers. Keep source offsets untouched.
  const corrected: Cell[] = [];
  const words = (value: string) => value.toLowerCase().match(/\p{L}+/gu) ?? [];
  const ignored = new Set("the a an for at to price figure amount item first that this it is was should be actually change revise replace forget cancel leave out do not bother with we are doing scratch quote use wrong".split(" "));
  const subjectRooms = new RegExp(`\\b${roomPart}\\b`, "giu");
  // A shared room is context, never the work subject: "kitchen sink" must not select "kitchen walls".
  const subjectWords = (value: string) => words(value.replace(subjectRooms, " ")).filter(word => !ignored.has(word) && !workClause(word));
  const description = (value: string) => {
    const at = amounts(value)[0]?.index ?? value.length;
    return value.slice(0, at).toLowerCase().replace(/^yeah[,\s]+/u, "").replace(/\s+(?:for|at)\s*$/u, "").trim();
  };
  for (const chunk of chunks) {
    if (/^(?:yeah|yes|okay|ok)[,\s]*$/iu.test(chunk.value)) continue;
    const cue = spokenCorrection.exec(chunk.value);
    if (cue && !isWork(chunk.value.slice(0, cue.index)) && corrected.length) {
      const candidates = corrected.filter(item => isWork(item.value) || total.test(item.value) || overallPrice.test(visibleWorkText(item.value)));
      // Include the named noun inside cues such as "revise the fence price" and "leave the lounge out".
      const allNamed = subjectWords(chunk.value);
      const matches = candidates.filter(item => subjectWords(description(item.value)).some(word => allNamed.includes(word)));
      const explicit = /\bfirst\s+(?:price|item|figure)\b/iu.test(chunk.value);
      // Room-only references remain ambiguous; ask across candidates rather than selecting work by its room.
      const backReference = /\b(?:first|revise|figure was wrong)\b/iu.test(chunk.value) || !!chunk.value.match(subjectRooms);
      const targets = explicit ? candidates.slice(0, 1) : matches.length ? matches : backReference ? candidates : candidates.slice(-1);
      if (targets.length) {
        for (const target of targets) target.correction = [target.correction, chunk.value].filter(Boolean).join("; ");
        continue;
      }
    }
    const previous = corrected.at(-1);
    if (previous && isWork(chunk.value) && !amounts(previous.value).length && !previous.correction
      && description(chunk.value).startsWith(`${description(previous.value)} `)) {
      // An unfinished prefix ("fit the, fit the latch") is not an extra item.
      corrected.pop();
      chunk.value = text.slice(previous.start, chunk.start + chunk.value.length);
      chunk.start = previous.start;
    }
    const repeat = previous && amounts(chunk.value).length && amounts(previous.value).length && isWork(previous.value) && isWork(chunk.value)
      && description(previous.value) === description(chunk.value) ? previous : null;
    if (repeat) {
      repeat.correction = [repeat.correction, chunk.value].filter(Boolean).join("; ");
      continue;
    }
    if (cue) chunk.correction = chunk.value;
    corrected.push(chunk);
  }
  chunks.splice(0, chunks.length, ...corrected);
  const first = chunks[0];
  const titleText = first?.value.split(/ for | at /iu)[0]?.slice(0, 200);
  const titleValue = titleText === undefined ? undefined : trimSourceText(titleText);
  const title = first && titleValue ? { value: titleValue, start: first.start + first.value.indexOf(titleValue) } : null;
  const work = chunks.filter((chunk, index) => {
    if (isTiming(chunk.value)) { notes.push(`Confirm timing: ${chunk.value.slice(0, 450)}`); return false; }
    if (!isWork(chunk.value) && (total.test(chunk.value) || overallPrice.test(visibleWorkText(chunk.value)))) {
      if (vatWords.test(chunk.value)) notes.push(`Confirm VAT: you said “${chunk.value.slice(0, 400)}”. VAT is not added or taken off.`);
      notes.push(`You said “${chunk.value.slice(0, 400)}”. Add a price to each line, or put it on one line.`); return false;
    }
    if (index > 0 && !isWork(chunk.value) && !chunk.correction && !amounts(chunk.value).length
      && (!speechComparison(chunk.value).trim() || /^the customer['’]s (?:dog|cat|pet) is (?:called|named) [\p{L}'’-]+[\s.]*$/iu.test(chunk.value))) return false;
    return !/^JOB:/u.test(visibleWorkText(chunk.value)) && !(index === 0 && !isWork(chunk.value) && !chunk.correction);
  });
  if (work.length > 100) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
  const cleaned = work.map(chunk => {
    if (!party || party.start < chunk.start || party.end > chunk.start + chunk.value.length) return chunk;
    const before = text.slice(chunk.start, party.start).trimEnd();
    const after = text.slice(party.end, chunk.start + chunk.value.length);
    return { ...chunk, value: before + after, start: chunk.start, inferred: !!after.trim(), originalValue: chunk.value };
  });
  return { chunks: cleaned, corrections: corrected.filter(chunk => !!chunk.correction), notes, title };
}

/** Cut only a suffix: descriptions always remain a prefix-cited span of the untouched item. */
export function priceDescription(value: string, at: number): string {
  const shorthand = /(?<![\p{L}\p{N}])\d+(?:\.\d+)?\s*k\b/iu.exec(value);
  const bare = new RegExp(`\\s+(?:for|at)\\s+((?:\\d+(?:\\.\\d+)?|(?:a|${numberWord})(?:[\\s-]+(?:and\\s+)?(?:${numberWord}|hundred|thousand))*))(?=\\s*$|\\s+(?:(?:and|then)\\s+)?in\\s)`, "iu").exec(value);
  if (shorthand) at = Math.min(at, shorthand.index);
  if (bare) at = Math.min(at, bare.index);
  let prefix = value.slice(0, at);
  const lead = [...prefix.matchAll(/\s+(?:for|at)\b/giu)].reverse().find(match => {
    const tail = speechComparison(prefix.slice(match.index + match[0].length));
    return !tail.trim() || limitBefore.test(tail) || hedgeBefore.test(tail);
  });
  if (lead) prefix = prefix.slice(0, lead.index);
  return prefix.replace(/(?:\s+(?:for|at)|[\s,]+)+$/iu, "");
}

function plainPrice(chunk: Cell): (Cell & { pence: number; at: number }) | null {
  const matches = amounts(chunk.value);
  if (chunk.correction || matches.length !== 1 || matches[0]!.text === chunk.value || matches[0]!.pence === null || total.test(chunk.value)) return null;
  const match = matches[0]!;
  // Never keep part of an amount: every said-amount guard, the same function totals call.
  const read = hideRoomNumbers(chunk.value);
  if (saidAmountOpen(read.slice(0, match.index), read.slice(match.index + match.text.length), "line")) return null;
  const originals = amounts(chunk.originalValue ?? chunk.value);
  if (originals.length !== 1 || originals[0]!.text !== match.text) return null;
  return { value: match.text, start: chunk.start + originals[0]!.index, pence: match.pence!, at: match.index };
}

export const spokenCount: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20 };
/** "fit six base units": the stated count and what it counts. Only right after the item's verb. */
export function spokenQuantity(description: string): { count: number; said: string; unit: string; unitStart: number } | null {
  const offset = leadingContentOffset(description);
  const visible = speechComparison(description.slice(offset), true).trimStart();
  const match = /^(?:[\p{L}-]+(?:\s+and\s+[\p{L}-]+)?)\s+(\d{1,4}|[a-z]+)\s+((?:[\p{L}-]+\s+){0,2}[\p{L}-]+)$/iu.exec(visible);
  if (!match || !spokenVerb.test(visible)) return null;
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
    const leading = leadingContentOffset(raw);
    const line = { raw: raw.slice(leading), start: offset + leading }; offset += raw.length + 1; return line;
  });
  const items = sourceLines.filter(line => /^ITEM:/u.test(line.raw));
  if (items.length > 100) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
  const titles = sourceLines.filter(line => /^JOB:[ \t]*\S/u.test(line.raw));
  const title = titles[0];
  const titleValue = title ? trimSourceText(title.raw.slice(4)) : undefined;
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
    questions.push(...draft.notes.filter(note => /^(?:This sounds|Confirm the currency)/u.test(note)).map(question));
    for (const chunk of draft.chunks) if (chunk.correction) {
      questions.push(question(correctionQuestion(chunk.correction)));
    }
    // V2-SQ-J: a clause that only names a room ("In the kitchen", "Upstairs bathroom") opens that room for the rows
    // after it (Reader A labels them); it is never a work row itself.
    // The row decision below still counts the room clause, so "Jones flat. In the kitchen. Fit six doors …" keeps its parsed row.
    const said = draft.chunks.length;
    draft.chunks = draft.chunks.filter(chunk => chunk.inferred || !roomOnly.test(visibleWorkText(chunk.value)));
    if (draft.chunks.length && workClause(text)) plainTitle = draft.title;
    // One spoken item with a stated price ("supply and fit one door for three hundred pounds") is a line too; an unclear price stays open.
    const single = draft.chunks.length === 1 && workClause(draft.chunks[0]!.value)
      && draft.title?.start === draft.chunks[0]!.start
      && (amounts(draft.chunks[0]!.value).length > 0 || !!draft.chunks[0]!.correction);
    if ((said >= 2 && draft.chunks.length > 0) || single) {
      plainTitle = draft.title;
      questions[0] = question("Confirm disposal and waste allowance");
      questions.push(...draft.notes.filter(note => !questions.some(item => item.question.value === note)).map(question));
      lines = draft.chunks.map(chunk => {
        const firstAmount = amounts(chunk.value)[0];
        const found = plainPrice(chunk);
        const after = found ? speechComparison(chunk.value.slice(found.at + found.value.length)).trimEnd() : "";
        // "fit six doors at fifty pounds each": the price is for one of the counted items.
        // "per door" or "a door" only when it names the counted thing; "per pair" or "a day" leaves the price open.
        // VAT words after the per-item word ("a door plus VAT") do not hide it.
        // Rate qualifier guard: "a/an/per <noun>" right after the amount is a rate whatever follows it.
        const whole = new RegExp(`^\\s+(?:per|an?)\\s+([\\p{L}-]+)${vatTail}?\\.?$`, "iu").exec(after);
        const qualifier = rateAfter(after);
        const per = whole ?? (qualifier?.[1] !== undefined ? qualifier : null);
        const perCount = found && per ? spokenQuantity(chunk.value.slice(0, found.at).trimEnd().replace(/\s+(?:for|at)$/iu, "")) : null;
        const each = new RegExp(`^\\s+(?:each|apiece|a piece)${vatTail}?\\.?$`, "iu").test(after) || (!!per && !!perCount && !!per[1] && sameUnit(perCount.unit, per[1]));
        // A per-item word anywhere else is not read, so the price stays open rather than becoming a line price.
        const rate = found && (each || (!per && !/\b(?:each|apiece|per)\b/iu.test(chunk.value))) ? found : null;
        if (!rate && firstAmount && rateAfter(chunk.value.slice(firstAmount.index + firstAmount.text.length)))
          questions.push(question(`Confirm the counted unit and rate unit: ${chunk.value.slice(0, 400)}`));
        if (!rate && amounts(chunk.value).length) questions.push(question(`Confirm price: ${chunk.value.slice(0, 450)}`));
        // "a door including hinges": per door, but the words after it are not part of the line, so they are asked about.
        if (rate && each && per && !whole) questions.push(question(`Check “${chunk.value.slice(0, 400)}”: the words after the price were not read into this line.`));
        if (rate && after.trim() && !each && !vatWords.test(after)) questions.push(question(`Confirm price: ${chunk.value.slice(0, 450)}; confirm what the stated amount includes.`));
        if (rate && vatWords.test(after)) questions.push(question(`Confirm VAT: you said “${chunk.value.slice(0, 400)}”. The price is kept as said; VAT is not added or taken off.`));
        const rateValue = rate ? rate.pence : null;
        // A trailing stated price is separate from the work description, and so is the "for" before it.
        const description = !chunk.correction
          ? priceDescription(chunk.value, firstAmount?.index ?? chunk.value.length) || chunk.value : chunk.value;
        if (!rate && !firstAmount && description.length < chunk.value.length)
          questions.push(question(`Confirm price: ${chunk.value.slice(0, 450)}`));
        const kept = description.slice(0, 500);
        if (kept.length < description.length) questions.push(question(`Confirm the description for ${kept.slice(0, 160)}; it is longer than one description and was shortened`));
        // A spoken count is kept when no price is stated, or when the price is for one. A price for several is a line price.
        const counted = chunk.inferred || chunk.correction ? null : spokenQuantity(kept);
        if (each && !counted) questions.push(question(`Confirm how many: “${kept.slice(0, 200)}” is priced at ${rate!.value} each.`));
        if (counted && rate && !each && counted.count > 1) {
          questions.push(question(`Check “${kept.slice(0, 200)}”: ${rate.value} is kept as the price for the whole line, not for each.`));
        }
        const keepCount = counted && (!rate || each || counted.count === 1);
        return {
          description: { value: kept, provenance: chunk.inferred ? { kind: "inferred", note: "Work description assembled around the customer and site clause; check the original source" } : extracted(chunk.start, kept.length) },
          quantity: chunk.correction ? { value: null, provenance: defaulted("Spoken correction; confirm the quantity") } : keepCount ? { value: String(counted.count), provenance: { kind: "inferred", note: `Spoken as “${counted.said}”; confirm before quoting` } }
            : each ? { value: null, provenance: defaulted("Priced each, but the count was not read; confirm how many") }
            : { value: "1", provenance: defaulted("One item per draft line; confirm before quoting") },
          unit: keepCount ? { value: counted.unit, provenance: extracted(chunk.start + counted.unitStart, counted.unit.length) }
            : { value: "item", provenance: defaulted("Draft work item; confirm before quoting") },
          unitPricePence: { value: rateValue, provenance: rateValue !== null && rate
            ? extracted(rate.start, rate.value.length) : defaulted("Rate not stated exactly; never invented") },
        };
      });
    } else {
      if (total.test(text)) questions.push(...draft.notes.filter(note => !questions.some(item => item.question.value === note)).map(question));
      const description = trimSourceText(text);
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
      // Apply the spoken guard to each said description amount and to the description around RATE.
      // Fixture attributes never override a deduction, condition, correction or other qualification.
      const said = amounts(description.value);
      const qualified = said.some(amount => amount.pence === null || saidAmountOpen(description.value.slice(0, amount.index), description.value.slice(amount.index + amount.text.length)))
        || said.length > 1 || saidAmountOpen(description.value, "");
      const suppliedRate = rate ? exactRate(rate.value) : null;
      const rateValue = qualified ? null : suppliedRate;
      if (rateCells.length && suppliedRate === null) questions.push(question(`Confirm rate for ${label}`));
      else if (qualified) questions.push(question(`Confirm price and rate for ${label}`));
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
