import { readFile } from "node:fs/promises";
import { z } from "zod";
import { detectEnterpriseFixture, ENTERPRISE_AI_EVALUATION_VERSION, loadEnterpriseFixtureCorpus } from "./enterprise-ai-prompts.js";

const identity = z.string().min(1).max(500), caseId = z.string().min(1).max(200);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const ids = z.array(identity).max(1000).refine(unique);
const labelsV1 = z.object({ version: z.literal("enterprise-ai-labels.v1"), cases: z.array(z.object({ id: caseId, expected: ids, ambiguous: ids,
}).strict().refine(row => row.ambiguous.every(value => row.expected.includes(value)))).max(1000).refine(rows => unique(rows.map(row => row.id))) }).strict();
const predictionsV1 = z.array(z.object({ caseId, items: z.array(z.object({ identity, ambiguity: z.enum(["clear", "review"]), citationValid: z.boolean() }).strict())
  .max(1000).refine(rows => unique(rows.map(row => row.identity))),
}).strict()).max(1000).refine(rows => unique(rows.map(row => row.caseId)));

/** Compare identities, not counts. No empty denominator is presented as measured success. */
export function scoreEnterpriseAiPredictions(rawPredictions: unknown, rawLabels: unknown) {
  const predictions = predictionsV1.parse(rawPredictions), labels = labelsV1.parse(rawLabels);
  const byCase = new Map(predictions.map(row => [row.caseId, row.items]));
  if (predictions.length !== labels.cases.length || labels.cases.some(row => !byCase.has(row.id))) throw new Error("INVALID_EVALUATION_IDENTITIES");
  let truePromptCount = 0, unsupportedAdditionCount = 0, missedExtraCount = 0, validCitationCount = 0, invalidCitationCount = 0, ambiguityErrorCount = 0;
  for (const label of labels.cases) {
    const items = byCase.get(label.id)!, actual = new Map(items.map(item => [item.identity, item]));
    for (const item of items) {
      if (label.expected.includes(item.identity)) truePromptCount++; else unsupportedAdditionCount++;
      if (item.citationValid) validCitationCount++; else invalidCitationCount++;
      if (label.expected.includes(item.identity) && (item.ambiguity === "review") !== label.ambiguous.includes(item.identity)) ambiguityErrorCount++;
    }
    for (const id of label.expected) {
      if (!actual.has(id)) { missedExtraCount++; if (label.ambiguous.includes(id)) ambiguityErrorCount++; }
    }
  }
  const predictedCount = truePromptCount + unsupportedAdditionCount, expectedCount = truePromptCount + missedExtraCount;
  return { version: ENTERPRISE_AI_EVALUATION_VERSION, split: "held-out" as const, provider: "recorded-fixture" as const, liveModelEvaluated: false as const,
    caseCount: labels.cases.length, truePromptCount, unsupportedAdditionCount, missedExtraCount, predictedCount, expectedCount,
    omissionRate: expectedCount ? missedExtraCount / expectedCount : null,
    recall: expectedCount ? truePromptCount / expectedCount : null,
    falsePromptCount: unsupportedAdditionCount, falsePromptPrecision: predictedCount ? truePromptCount / predictedCount : null,
    falsePromptRate: predictedCount ? unsupportedAdditionCount / predictedCount : null,
    validCitationCount, invalidCitationCount, citationValidity: predictedCount ? validCitationCount / predictedCount : null, ambiguityErrorCount,
    status: (missedExtraCount + unsupportedAdditionCount + invalidCitationCount + ambiguityErrorCount === 0 ? "PASS" : "FAIL") as "PASS" | "FAIL",
    releaseDecision: "NOT_AUTHORIZED" as const };
}

/** Recorded outputs are evaluated before held-out labels are opened. This measures fixtures, never a live model. */
export async function runEnterpriseAiEvaluation() {
  const corpus = await loadEnterpriseFixtureCorpus("held-out-inputs");
  const predictions = [];
  for (const row of corpus.cases) {
    const result = await detectEnterpriseFixture({ version: "enterprise-ai-fixture-request.v1", mode: "synthetic_demo", dataClass: "fictional_fixture", provider: "fixture", fixtureId: row.id });
    predictions.push({ caseId: row.id, items: result.output.items.map(item => ({
      identity: item.citations.map(citation => `${citation.sourceId}:${citation.start}:${citation.end}`).sort().join("|"),
      ambiguity: item.ambiguity, citationValid: true,
    })) });
  }
  const labels: unknown = JSON.parse(await readFile(new URL("../../../docs/fixtures/enterprise-ai-prompts/held-out-labels.v1.json", import.meta.url), "utf8"));
  return scoreEnterpriseAiPredictions(predictions, labels);
}
