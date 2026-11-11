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
const workClause = (value: string) => workWord.test(value) || /^woodwork\s+in\s+gloss\b/iu.test(value);
const total = /\b(?:in total|altogether|all in)\b/iu;
const priceLiteral = /(?<![\p{L}\p{N}£.,])(?:£(?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?|(?:0|[1-9]\d{0,10}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?\s+(?:pounds|quid))(?=$|[^\p{L}\p{N}.,]|[.,](?:\s|$))/giu;

/** Deterministic local draft helper, not an accuracy claim. A builder must check
 * every line. Offsets always refer to the untouched source, including prices.
 * ITEM: records never enter this path. No source text is executed or fetched.
 */
function plainDraft(text: string): { chunks: Cell[]; notes: string[]; title: Cell | null } {
  const chunks: Cell[] = [], notes: string[] = [];
  const add = (start: number, end: number) => {
    const raw = text.slice(start, end), value = raw.trim();
    if (value) chunks.push({ value, start: start + raw.length - raw.trimStart().length });
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
      if (!separator) continue;
      const next = text.slice(i + separator.length).trimStart();
      // Keep the disposal phrase attached to the removal it describes.
      if (separator.trim().toLowerCase() === "and" && /^take it away\b/iu.test(next)) continue;
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

function plainPrice(chunk: Cell): Cell | null {
  const matches = [...chunk.value.matchAll(priceLiteral)];
  if (matches.length !== 1 || matches[0]![0] === chunk.value || total.test(chunk.value) || /\b(?:about|around|roughly|approximately)\b/iu.test(chunk.value)) return null;
  const match = matches[0]!;
  const originals = [...(chunk.originalValue ?? chunk.value).matchAll(priceLiteral)];
  if (originals.length !== 1 || originals[0]![0] !== match[0]) return null;
  return { value: match[0], start: chunk.start + originals[0]!.index };
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
    if (draft.chunks.length >= 2) {
      plainTitle = draft.title;
      questions[0] = question("Confirm disposal and waste allowance");
      questions.push(...draft.notes.map(question));
      lines = draft.chunks.map(chunk => {
        const rate = plainPrice(chunk);
        if (!rate && [...chunk.value.matchAll(priceLiteral)].length) questions.push(question(`Confirm price: ${chunk.value.slice(0, 450)}`));
        const rateValue = rate ? exactRate(`£${rate.value.replace(/£|,|\s*(?:pounds|quid)/giu, "")}`) : null;
        // A trailing stated price is separate from the work description.
        const description = rate && chunk.value.endsWith(rate.value)
          ? chunk.value.slice(0, -rate.value.length).trimEnd() : chunk.value;
        const kept = description.slice(0, 500);
        if (kept.length < description.length) questions.push(question(`Confirm the description for ${kept.slice(0, 160)}; it is longer than one description and was shortened`));
        return {
          description: { value: kept, provenance: chunk.inferred ? { kind: "inferred", note: "Work description assembled around the customer and site clause; check the original source" } : extracted(chunk.start, kept.length) },
          quantity: { value: "1", provenance: defaulted("One item per draft line; confirm before quoting") },
          unit: { value: "item", provenance: defaulted("Draft work item; confirm before quoting") },
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
