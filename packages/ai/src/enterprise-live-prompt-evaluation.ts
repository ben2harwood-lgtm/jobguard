import { readFile } from "node:fs/promises";
import { z } from "zod";
import { calculateCompletionWorkFindings, completionWorkInputV1 } from "@jobguard/core";

const caseId = z.string().min(1).max(200);
const ids = z.array(z.string().uuid()).max(10000).refine(values => new Set(values).size === values.length);
const uniqueCases = (values: readonly { id: string }[]) => new Set(values.map(value => value.id)).size === values.length;
const corpusV1 = z.object({ version: z.literal("enterprise-completion-corpus.v1"),
  cases: z.array(z.object({ id: caseId, input: completionWorkInputV1 }).strict()).max(10000).refine(uniqueCases),
}).strict();
const labelsV1 = z.object({ version: z.literal("enterprise-completion-labels.v1"),
  cases: z.array(z.object({ id: caseId, expectedObservationIds: ids }).strict()).max(10000).refine(uniqueCases),
}).strict();
const predictionsV1 = z.array(z.object({ caseId, observationIds: ids }).strict()).max(10000)
  .refine(values => new Set(values.map(value => value.caseId)).size === values.length);
export type CompletionWorkPrediction = z.infer<typeof predictionsV1>[number];

/** The detector accepts input facts alone; case/observation IDs are evaluation identities, never coalescing keys. */
export function predictCompletionWorkCorpus(raw: unknown): CompletionWorkPrediction[] {
  return corpusV1.parse(raw).cases.map(row => ({ caseId: row.id,
    observationIds: calculateCompletionWorkFindings(row.input).map(finding => finding.observationId),
  }));
}

export function scoreCompletionWorkPredictions(rawPredictions: unknown, rawLabels: unknown) {
  const predictions = predictionsV1.parse(rawPredictions), labels = labelsV1.parse(rawLabels);
  const actualByCase = new Map(predictions.map(row => [row.caseId, new Set(row.observationIds)]));
  if (labels.cases.length !== predictions.length || labels.cases.some(row => !actualByCase.has(row.id))) throw new Error("INVALID_EVALUATION_IDENTITIES");
  let truePromptCount = 0, falsePromptCount = 0, missedExtraCount = 0;
  for (const label of labels.cases) {
    const actual = actualByCase.get(label.id)!, expected = new Set(label.expectedObservationIds);
    for (const id of actual) { if (expected.has(id)) truePromptCount++; else falsePromptCount++; }
    for (const id of expected) if (!actual.has(id)) missedExtraCount++;
  }
  const predictedCount = truePromptCount + falsePromptCount, expectedCount = truePromptCount + missedExtraCount;
  return { version: "enterprise-completion-evaluation.v1" as const, rulesEvaluated: ["a"] as const, caseCount: labels.cases.length,
    truePromptCount, falsePromptCount, missedExtraCount, predictedCount, expectedCount,
    falsePromptRate: predictedCount === 0 ? null : falsePromptCount / predictedCount,
    missedExtraRate: expectedCount === 0 ? null : missedExtraCount / expectedCount };
}

/** Predictions finish before labels are opened. No model, gateway, provider factory or network client is imported. */
export async function runCompletionWorkEvaluation() {
  const input = JSON.parse(await readFile(new URL("../../../docs/fixtures/enterprise-live-prompts/held-out-inputs.v1.json", import.meta.url), "utf8"));
  const predictions = predictCompletionWorkCorpus(input);
  const labels = JSON.parse(await readFile(new URL("../../../docs/fixtures/enterprise-live-prompts/held-out-labels.v1.json", import.meta.url), "utf8"));
  return scoreCompletionWorkPredictions(predictions, labels);
}

export function formatCompletionWorkEvaluation(report: ReturnType<typeof scoreCompletionWorkPredictions>): string {
  return `ENT-8a synthetic held-out rule (a), cases: ${report.caseCount}\n` +
    `false prompts: ${report.falsePromptCount} / ${report.predictedCount} (rate ${report.falsePromptRate ?? "n/a"})\n` +
    `missed extras: ${report.missedExtraCount} / ${report.expectedCount} (rate ${report.missedExtraRate ?? "n/a"})\n` +
    "rules (b), (c), (d): HELD; no all-rule or production evaluation\n";
}
