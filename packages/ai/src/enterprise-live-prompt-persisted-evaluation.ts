import { readFile } from "node:fs/promises";
import { z } from "zod";
import { calculateCompletionWorkFindings, calculateMaterialsExcess, calculateVisitExcess, calculateCloseoutFinding } from "@jobguard/core";
const corpus = z.object({ version: z.literal("persisted-prompt-evaluation.v1"), cases: z.array(z.object({ id: z.string().min(1), rule: z.enum(["a", "b", "c", "d"]), input: z.unknown() }).strict()).refine(cases => new Set(cases.map(c => c.id)).size === cases.length) }).strict();
const labelsSchema = z.object({ version: z.literal("persisted-prompt-labels.v1"), cases: z.array(z.object({ id: z.string().min(1), expectedCount: z.number().int().nonnegative() }).strict()).refine(cases => new Set(cases.map(c => c.id)).size === cases.length) }).strict();
export function predictPersistedPromptCases(raw: unknown) {
  return corpus.parse(raw).cases.map(c => ({ id: c.id, rule: c.rule, count: c.rule === "a" ? calculateCompletionWorkFindings(c.input).length : c.rule === "b" ? calculateMaterialsExcess(c.input).filter(f => f.status === "finding").length : c.rule === "c" ? Number(calculateVisitExcess(c.input).status === "finding") : Number(calculateCloseoutFinding(c.input).status === "finding") }));
}
export function scorePersistedPromptCases(predictions: ReturnType<typeof predictPersistedPromptCases>, rawLabels: unknown) {
  const labels = labelsSchema.parse(rawLabels); const expected = new Map(labels.cases.map(c => [c.id, c.expectedCount]));
  if (expected.size !== predictions.length || new Set(predictions.map(p => p.id)).size !== predictions.length || predictions.some(p => !expected.has(p.id))) throw new Error("EVALUATION_CORPUS_MISMATCH");
  return (["a", "b", "c", "d"] as const).map(rule => {
    const cases = predictions.filter(p => p.rule === rule);
    return { rule, caseCount: cases.length, falsePrompts: cases.reduce((n, c) => n + Math.max(0, c.count - expected.get(c.id)!), 0), missedExtras: cases.reduce((n, c) => n + Math.max(0, expected.get(c.id)! - c.count), 0) };
  });
}
/** Fixture-only deterministic rules. This does not execute PostgreSQL or prove stored-source provenance. */
export async function runPersistedPromptEvaluation() {
  const input = JSON.parse(await readFile(new URL("../../../docs/fixtures/enterprise-live-prompts/persisted-held-out-inputs.v1.json", import.meta.url), "utf8"));
  const predictions = predictPersistedPromptCases(input);
  const labels = JSON.parse(await readFile(new URL("../../../docs/fixtures/enterprise-live-prompts/persisted-held-out-labels.v1.json", import.meta.url), "utf8"));
  return scorePersistedPromptCases(predictions, labels);
}
