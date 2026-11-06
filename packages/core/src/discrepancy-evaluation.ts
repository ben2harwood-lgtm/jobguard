import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";

const amount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const discrepancyEvaluationV1 = z.object({
  version: z.literal("discrepancy-evaluation.v1"), dataset: z.literal("development"),
  stage: z.enum(["confirmed_source_facts", "end_to_end"]),
  cases: z.array(z.object({ id: z.string().min(1), label: z.enum(["discrepancy", "match", "ambiguous"]),
    labelledNetPence: amount, predictedNetPence: amount,
  }).strict()).superRefine((cases, ctx) => {
    if (new Set(cases.map(row => row.id)).size !== cases.length)
      ctx.addIssue({ code: "custom", message: "Duplicate evaluation case identity" });
    if (cases.some(row => row.label === "discrepancy" ? row.labelledNetPence < 2500 : row.labelledNetPence !== 0))
      ctx.addIssue({ code: "custom", message: "Label discrepancies of at least £25 net; other classes have zero labelled exposure" });
  }),
}).strict();

/** One row per independently labelled opportunity, including non-predictions.
 * Scores confirmed facts separately from extraction/matching. Development targets
 * are diagnostic only: this function cannot accept held-out or G2 evidence. */
export function evaluateDiscrepancyPredictions(raw: unknown) {
  const input = discrepancyEvaluationV1.parse(raw);
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const classCounts = { discrepancy: 0, match: 0, ambiguous: 0 };
  const errorExamples: { id: string; error: "false_positive" | "false_negative";
    label: string; labelledNetPence: number; predictedNetPence: number }[] = [];
  for (const row of input.cases) {
    classCounts[row.label]++;
    const actual = row.label === "discrepancy", predicted = row.predictedNetPence > 0;
    if (actual && predicted) tp++;
    else if (actual) fn++;
    else if (predicted) fp++;
    else tn++;
    if (actual !== predicted) errorExamples.push({ ...row, error: predicted ? "false_positive" : "false_negative" });
  }
  const predictions = tp + fp, positives = tp + fn;
  return { version: "discrepancy-evaluation-report.v1" as const, dataset: input.dataset, stage: input.stage,
    notice: "DEVELOPMENT DATA ONLY — not the frozen held-out benchmark, an accuracy claim or G2 evidence.",
    uncertainty: "Small made-up cases are not representative; ratios are descriptive and do not establish population performance.",
    labelledThresholdNetPence: 2500, classCounts, confusionMatrix: { tp, fp, tn, fn }, errorExamples,
    falseDiscoveryProportion: predictions ? fp / predictions : null,
    precision: predictions ? tp / predictions : null, recall: positives ? tp / positives : null,
    diagnosticTargetsMet: predictions > 0 && positives > 0 && fp * 100 <= predictions * 5 && tp * 100 >= positives * 90,
    releaseEvidence: false as const };
}
