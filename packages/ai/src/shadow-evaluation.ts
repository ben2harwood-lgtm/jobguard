import { readFile } from "node:fs/promises";
import { z } from "zod";
import { detectShadowObservations, groupShadowProposals } from "@jobguard/core";
import { ShadowFixtureProposer, shadowFixtureCorpusV1 } from "./shadow-proposal.js";
export const shadowEvaluationClasses = ["genuine_extra", "contracted_work", "ambiguity", "chat", "alternative_material", "duplicates", "cancelled_or_unfinished_request", "supplier_spares", "builder_mistake", "already_captured", "extra_several_sources"] as const;
const labelsV1 = z.object({ version: z.literal("shadow-labels.v1"), cases: z.array(z.object({ id: z.string(), class: z.enum(shadowEvaluationClasses), expectedExtras: z.number().int().nonnegative() }).strict()).min(1) }).strict();
/** Runs the entire detector/provider path before opening labels. Labels are evaluator inputs only. */
export async function runShadowEvaluation() {
  const corpus = shadowFixtureCorpusV1.parse(JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-observations.v1.json", import.meta.url), "utf8")));
  const predictions: Record<string, number> = {}; let droppedCitations = 0;
  for (const row of corpus.cases) {
    const at = "2026-10-12T00:00:00Z", proposals = [...detectShadowObservations(row.observations, row.captures, at)], provider = new ShadowFixtureProposer(row.responses);
    for (const o of row.observations) { const result = await provider.propose(o, o.evidence.id, at); proposals.push(...result.proposals); droppedCitations += result.droppedCitations; }
    predictions[row.id] = groupShadowProposals(proposals, row.observations, row.captures).filter(g => g.match.outcome === "unmatched").length;
  }
  const labels = labelsV1.parse(JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-labels.v1.json", import.meta.url), "utf8")));
  if (new Set(corpus.cases.map(c => c.id)).size !== corpus.cases.length || new Set(labels.cases.map(c => c.id)).size !== labels.cases.length ||
      labels.cases.length !== corpus.cases.length || labels.cases.some(c => predictions[c.id] === undefined)) throw new Error("INVALID_EVALUATION_IDENTITIES");
  let truePositive = 0, falsePositive = 0, falseNegative = 0;
  for (const label of labels.cases) { const actual = predictions[label.id]!; truePositive += Math.min(actual, label.expectedExtras); falsePositive += Math.max(0, actual - label.expectedExtras); falseNegative += Math.max(0, label.expectedExtras - actual); }
  return { version: "shadow-evaluation.v1", results: {
    fixture: { status: "completed", cases: labels.cases.length, classes: [...new Set(labels.cases.map(c => c.class))], truePositive, falsePositive, falseNegative,
      recall: truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : null,
      falsePositivePrecision: truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : null, droppedCitations, networkClientsConstructed: 0 },
    live_model: { status: "not_run", reason: "separate release item" },
  } } as const;
}
export function formatShadowEvaluation(report: Awaited<ReturnType<typeof runShadowEvaluation>>): string {
  const f = report.results.fixture;
  return `fixture\nrecall: ${f.recall} (TP ${f.truePositive}, FN ${f.falseNegative})\nfalse-positive precision: ${f.falsePositivePrecision} (TP ${f.truePositive}, FP ${f.falsePositive})\nlive-model: NOT RUN (separate release item)\n`;
}
