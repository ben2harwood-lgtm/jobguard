import type { JobRecordProposal } from "@jobguard/core";

export const CAPTURE_FIXTURE_PARSER_VERSION = "structured-capture-fixture/2" as const;
const MAX_PENCE = 1_000_000_000_000n;
export class CaptureFixtureError extends Error {
  readonly code: "INVALID_FIXTURE_SOURCE" | "FIXTURE_STRUCTURE_REQUIRED";
  constructor(code: "INVALID_FIXTURE_SOURCE" | "FIXTURE_STRUCTURE_REQUIRED") {
    super(code); this.code = code; this.name = "CaptureFixtureError";
  }
}
type Cell = { value: string; start: number };
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
    ? "Confirm disposal and waste allowance" : "Please turn these words into work items")];
  if (titles.length > 1) questions.push(question("Confirm which stated job title applies"));
  let lines: JobRecordProposal["lines"];
  if (!items.length) {
    const description = text.trim();
    if (description.length > 500) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
    lines = [{
      description: { value: description, provenance: extracted(text.indexOf(description), description.length) },
      quantity: { value: null, provenance: defaulted("Quantity not stated in structured fixture grammar") },
      unit: { value: null, provenance: defaulted("Unit not stated in structured fixture grammar") },
      unitPricePence: { value: null, provenance: defaulted("Rate not stated; never invented") },
    }];
  } else {
    lines = items.map(line => {
      const parts = cells(line.raw, line.start);
      const description = parts[0]!;
      if (!description.value || description.value.length > 500) throw new CaptureFixtureError("FIXTURE_STRUCTURE_REQUIRED");
      const label = description.value.slice(0, 160);
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
        description: { value: description.value, provenance: extracted(description.start, description.value.length) },
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
      : { value: "Work described in your words", provenance: defaulted("No job title was stated") },
    lines,
    materials: [{ description: { value: "Review materials required", provenance: {
      kind: "inferred", note: "Suggestion for human review only",
    } } }],
    questions,
  };
}
