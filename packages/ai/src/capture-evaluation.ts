import type { JobRecordProposal } from "@jobguard/core";

export interface WalkaroundSource { id: string; tags: string[]; text: string }
export interface ExpectedLine {
  description: string;
  intents: string[];
  pricePence: number | null;
  quantity: string | null;
  unit: string | null;
}
export interface WalkaroundLabel {
  id: string;
  lines: ExpectedLine[];
  requiredQuestions: string[];
  title: string;
}
export interface CaptureEvaluationResult {
  id: string;
  passed: boolean;
  scopeIntentRecall: { numerator: number; denominator: number };
  citations: { valid: number; total: number; offsetUnit: "UTF-16-code-units" };
  unsupportedMonetaryFacts: number;
  ambiguityChecks: { passed: number; total: number };
  errors: string[];
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const normal = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
function referencePence(text: string): number | null {
  // Deliberately independent from the parser's exactRate implementation.
  if (!/^£\d+(?:\.\d{1,2})?$/u.test(text) || text.length > 16) return null;
  const components = text.substring(1).split(".");
  const minor = (components[1] ?? "").padEnd(2, "0");
  const value = BigInt(components[0]!) * 100n + BigInt(minor);
  return value <= 1_000_000_000_000n ? Number(value) : null;
}

/** Evaluates independently stored labels against actual proposal output. It
 * receives no parser/provider access and never modifies an output to pass it. */
export function evaluateCapture(
  source: WalkaroundSource, label: WalkaroundLabel, output: JobRecordProposal, sourceId: string,
): CaptureEvaluationResult {
  const errors: string[] = [];
  let validCitations = 0, totalCitations = 0, unsupportedMonetaryFacts = 0;
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) { value.forEach((child, index) => visit(child, `${path}[${index}]`)); return; }
    if (!isObject(value)) return;
    if ("value" in value) {
      if (!isObject(value.provenance)) errors.push(`${path}: missing provenance`);
      else if (!["extracted", "inferred", "defaulted", "human_supplied"].includes(String(value.provenance.kind))) {
        errors.push(`${path}: unknown provenance kind`);
      } else if (value.provenance.kind !== "extracted" &&
        (typeof value.provenance.note !== "string" || !value.provenance.note.trim())) {
        errors.push(`${path}: missing provenance explanation`);
      }
    }
    if (value.kind === "extracted") {
      totalCitations++;
      const span = value.span;
      if (isObject(span) && span.sourceId === sourceId && span.sourceVersion === 1 &&
        typeof span.start === "number" && Number.isInteger(span.start) &&
        typeof span.end === "number" && Number.isInteger(span.end) &&
        span.start >= 0 && span.start < span.end && span.end <= source.text.length) validCitations++;
      else errors.push(`${path}: invalid source span`);
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(output, "proposal");
  if (source.id !== label.id) errors.push("Label/source identity mismatch");
  if (normal(output.title.value) !== normal(label.title)) errors.push("Job title differs from label");
  const titleProvenance = output.title.provenance;
  if (titleProvenance.kind === "extracted" &&
    source.text.slice(titleProvenance.span.start, titleProvenance.span.end) !== output.title.value) errors.push("Title does not match its cited text");

  const consumed = new Set<number>();
  const expectedIntentIds = label.lines.flatMap(line => line.intents);
  if (!expectedIntentIds.length || new Set(expectedIntentIds).size !== expectedIntentIds.length) errors.push("Invalid or duplicated intent labels");
  let matchedIntents = 0, ambiguityPassed = 0, ambiguityTotal = 0;
  for (const expected of label.lines) {
    const index = output.lines.findIndex((line, i) => !consumed.has(i) && normal(line.description.value) === normal(expected.description));
    if (index < 0) { errors.push(`Missing scope: ${expected.description}`); continue; }
    consumed.add(index); matchedIntents += expected.intents.length;
    const line = output.lines[index]!;
    for (const [name, value] of [["unitPricePence", expected.pricePence], ["quantity", expected.quantity], ["unit", expected.unit]] as const) {
      if (value === null) { ambiguityTotal++; if (line[name].value === null) ambiguityPassed++; }
      if (line[name].value !== value) errors.push(`${expected.description}: ${name} differs from label`);
    }
  }
  for (const [index, line] of output.lines.entries()) {
    if (!consumed.has(index)) errors.push(`Unsupported or duplicate scope: ${line.description.value}`);
    const description = line.description.provenance;
    const descriptionStart = description.kind === "extracted" ? description.span.start : -1;
    const sourceLineStart = descriptionStart < 0 ? -1 : source.text.lastIndexOf("\n", descriptionStart - 1) + 1;
    const nextNewline = source.text.indexOf("\n", descriptionStart);
    const sourceLineEnd = nextNewline < 0 ? source.text.length : nextNewline;
    if (description.kind !== "extracted" || source.text.slice(description.span.start, description.span.end) !== line.description.value) {
      errors.push(`Scope ${index}: description is not its cited source text`);
    }
    for (const fieldName of ["quantity", "unit"] as const) {
      const field = line[fieldName];
      if (field.provenance.kind === "extracted") {
        const span = field.provenance.span;
        if (field.value === null || source.text.slice(span.start, span.end) !== field.value ||
          span.start < sourceLineStart || span.end > sourceLineEnd) errors.push(`Scope ${index}: ${fieldName} grounding mismatch`);
      }
    }
    const price = line.unitPricePence;
    if (price.value !== null) {
      const span = price.provenance.kind === "extracted" ? price.provenance.span : null;
      if (!Number.isSafeInteger(price.value) || price.value < 0 || price.value > 1_000_000_000_000 ||
        !span || span.sourceId !== sourceId || span.sourceVersion !== 1 ||
        span.start < sourceLineStart || span.end > sourceLineEnd ||
        referencePence(source.text.slice(span.start, span.end)) !== price.value) {
        unsupportedMonetaryFacts++; errors.push(`Scope ${index}: unsupported monetary fact`);
      }
    } else if (price.provenance.kind === "extracted") {
      errors.push(`Scope ${index}: unknown rate incorrectly labelled extracted`);
    }
  }
  for (const required of label.requiredQuestions) {
    ambiguityTotal++;
    if (output.questions.some(item => item.question.value.includes(required))) ambiguityPassed++;
    else errors.push(`Missing review question: ${required}`);
  }
  if (!output.questions.length) errors.push("Human review question missing");
  const recall = { numerator: matchedIntents, denominator: expectedIntentIds.length };
  // The plan's proposed 95% target is also required per case: omissions in a
  // small case cannot be hidden by pooling it with many easy cases.
  const thresholdMet = recall.denominator > 0 && recall.numerator * 100 >= recall.denominator * 95;
  return {
    id: source.id, passed: errors.length === 0 && thresholdMet && unsupportedMonetaryFacts === 0 &&
      totalCitations > 0 && totalCitations === validCitations && ambiguityPassed === ambiguityTotal,
    scopeIntentRecall: recall,
    citations: { valid: validCitations, total: totalCitations, offsetUnit: "UTF-16-code-units" },
    unsupportedMonetaryFacts,
    ambiguityChecks: { passed: ambiguityPassed, total: ambiguityTotal }, errors,
  };
}

/** Fail closed on missing/duplicate/extra corpus identities and malformed labels.
 * Source text and expected values live in separate versioned files. */
export function validateCorpus(sources: WalkaroundSource[], labels: WalkaroundLabel[]): void {
  if (sources.length < 20 || sources.length !== labels.length) throw new Error("Corpus requires at least 20 paired cases");
  const sourceIds = new Set<string>(), labelIds = new Set<string>();
  for (const source of sources) {
    if (!source.id || sourceIds.has(source.id) || !source.text.trim() || source.text.length > 50_000 || !source.tags.length) throw new Error("Invalid source corpus");
    sourceIds.add(source.id);
  }
  for (const label of labels) {
    if (!sourceIds.has(label.id) || labelIds.has(label.id) || !label.title || !label.lines.length || !label.requiredQuestions.length) throw new Error("Invalid label corpus");
    labelIds.add(label.id);
    const ids = label.lines.flatMap(line => line.intents);
    if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error("Invalid intent identities");
    for (const line of label.lines) {
      if (!line.description.trim() || !line.intents.length || (line.pricePence !== null &&
        (!Number.isSafeInteger(line.pricePence) || line.pricePence < 0 || line.pricePence > 1_000_000_000_000))) throw new Error("Invalid expected monetary field");
    }
  }
}
