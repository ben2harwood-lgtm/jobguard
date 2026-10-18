import { readFile } from "node:fs/promises";
import { z } from "zod";
import { detectShadowObservations, groupShadowProposals, shadowDetectionId } from "@jobguard/core";
import { ShadowFixtureProposer, shadowFixtureCorpusV1 } from "./shadow-proposal.js";
export const shadowEvaluationClasses = ["genuine_extra", "contracted_work", "ambiguity", "chat", "alternative_material", "duplicates", "cancelled_or_unfinished_request", "supplier_spares", "builder_mistake", "already_captured", "extra_several_sources"] as const;
const workIdentityV2 = z.object({ tenantId: z.string().uuid(), jobId: z.string().uuid(),
  scopeArea: z.string().min(1), workReference: z.string().min(1) }).strict();
const labelsV2 = z.object({ version: z.literal("shadow-labels.v2"), cases: z.array(z.object({
  id: z.string().min(1), class: z.enum(shadowEvaluationClasses), expectedWork: z.array(workIdentityV2),
}).strict()).min(1) }).strict();
export class ShadowEvaluationError extends Error {
  constructor(readonly code: "INVALID_EVALUATION_INPUT" | "INVALID_EVALUATION_IDENTITIES") { super(code); }
}
function parseEvaluation<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ShadowEvaluationError("INVALID_EVALUATION_INPUT");
  return result.data;
}
/** Runs the entire detector/provider path before opening labels. Labels are evaluator inputs only. */
export async function runShadowEvaluation(fixtures?: { corpus: unknown; labels: unknown }) {
  const corpus = parseEvaluation(shadowFixtureCorpusV1, fixtures ? fixtures.corpus : JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-observations.v1.json", import.meta.url), "utf8")));
  const predictions = new Map<string, ReadonlySet<string>>(); let droppedCitations = 0;
  for (const row of corpus.cases) {
    if (predictions.has(row.id)) throw new ShadowEvaluationError("INVALID_EVALUATION_IDENTITIES");
    const at = "2026-10-12T00:00:00Z", proposals = [...detectShadowObservations(row.observations, row.captures, at)], provider = new ShadowFixtureProposer(row.responses);
    for (const o of row.observations) { const result = await provider.propose(o, o.evidence.id, at); proposals.push(...result.proposals); droppedCitations += result.droppedCitations; }
    predictions.set(row.id, new Set(groupShadowProposals(proposals, row.observations, row.captures)
      .filter(g => g.match.outcome === "unmatched").map(g => g.primary.workId)));
  }
  // v1 labels/corpus stay unchanged. v2 replaces count-only targets with labelled
  // tenant/job/area/work references; no target is inferred from a prediction.
  const labels = parseEvaluation(labelsV2, fixtures ? fixtures.labels : JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-labels.v2.json", import.meta.url), "utf8")));
  if (new Set(labels.cases.map(c => c.id)).size !== labels.cases.length ||
      labels.cases.length !== corpus.cases.length || labels.cases.some(c => !predictions.has(c.id))) throw new ShadowEvaluationError("INVALID_EVALUATION_IDENTITIES");
  let truePositive = 0, falsePositive = 0, falseNegative = 0;
  for (const label of labels.cases) {
    const actual = predictions.get(label.id)!, expected = new Set(label.expectedWork.map(w =>
      shadowDetectionId([w.tenantId, w.jobId, "work", w.scopeArea, w.workReference])));
    if (expected.size !== label.expectedWork.length) throw new ShadowEvaluationError("INVALID_EVALUATION_IDENTITIES");
    for (const workId of actual) { if (expected.has(workId)) truePositive++; else falsePositive++; }
    for (const workId of expected) if (!actual.has(workId)) falseNegative++;
  }
  return { version: "shadow-evaluation.v2", results: {
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
