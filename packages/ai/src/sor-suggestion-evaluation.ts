import { readFile } from "node:fs/promises";
import { z } from "zod";
import { sha256 } from "@jobguard/core";
import { SorSuggestionFixtureProposer, SOR_SUGGESTION_EVALUATION_VERSION } from "./sor-suggestion.js";
import type { RecordedFixture } from "./fixture-provider.js";

const id = z.string().min(1).max(100);
const codes = z.array(z.string().min(1).max(80)).max(100).refine(values => new Set(values).size === values.length);
const uniqueCases = (rows: readonly { id: string }[]) => new Set(rows.map(row => row.id)).size === rows.length;
const predictionsV1 = z.array(z.object({ id, codes }).strict()).min(1).refine(uniqueCases);
const labelsV1 = z.array(z.object({ id, acceptableCodes: codes, ambiguous: z.boolean() }).strict()).min(1).refine(uniqueCases)
  .refine(rows => rows.every(row => !row.ambiguous || row.acceptableCodes.length === 0));

/** Each fictional extra has zero or one relevant work item; acceptableCodes can name equivalent alternatives.
 * Correct-item rate = cases with an acceptable suggestion / cases requiring an item.
 * Wrong-suggestion rate = unacceptable suggested codes / all suggested codes. Empty denominators are null. */
export function scoreSorSuggestions(rawPredictions: unknown, rawLabels: unknown) {
  const predictions = predictionsV1.parse(rawPredictions), labels = labelsV1.parse(rawLabels);
  const byId = new Map(predictions.map(row => [row.id, row.codes]));
  if (predictions.length !== labels.length || labels.some(row => !byId.has(row.id))) throw new Error("INVALID_EVALUATION_IDENTITIES");
  let correctItems = 0, missedItems = 0, wrongSuggestions = 0, expectedItems = 0, suggestedItems = 0, ambiguousCases = 0, ambiguityAbstentions = 0;
  for (const label of labels) {
    const actual = byId.get(label.id)!;
    suggestedItems += actual.length;
    wrongSuggestions += actual.filter(code => !label.acceptableCodes.includes(code)).length;
    if (label.acceptableCodes.length) {
      expectedItems++;
      if (actual.some(code => label.acceptableCodes.includes(code))) correctItems++; else missedItems++;
    }
    if (label.ambiguous) { ambiguousCases++; if (!actual.length) ambiguityAbstentions++; }
  }
  return { correctItems, missedItems, wrongSuggestions, expectedItems, suggestedItems, ambiguousCases, ambiguityAbstentions,
    correctItemRate: expectedItems ? correctItems / expectedItems : null,
    wrongSuggestionRate: suggestedItems ? wrongSuggestions / suggestedItems : null };
}

const inputFileV1 = z.object({ version: z.literal("sor-suggestion-inputs.v1"), fictional: z.literal(true),
  items: z.array(z.object({ code: z.string(), description: z.string(), unit: z.string() }).strict()).min(1),
  cases: z.array(z.object({ id, text: z.string().min(1) }).strict()).min(1).refine(uniqueCases),
}).strict();
const responsesFileV1 = z.object({ version: z.literal("sor-suggestion-responses.v1"),
  cases: z.array(z.object({ id, output: z.unknown(), citations: z.array(z.object({ sourceId: z.string(), start: z.number(), end: z.number() }).strict()) }).strict())
    .min(1).refine(uniqueCases),
}).strict();
const labelFileV1 = z.object({ version: z.literal("sor-suggestion-labels.v1"),
  labelStatus: z.literal("AUTHOR_PROPOSED_INDEPENDENT_REVIEW_PENDING"), cases: labelsV1,
}).strict();

/** Fixture regression only, never a live-model quality claim. Labels are opened after predictions finish. */
export async function runSorSuggestionEvaluation() {
  const read = async (name: string): Promise<unknown> => JSON.parse(await readFile(new URL(`../../../docs/fixtures/ai/${name}.v1.json`, import.meta.url), "utf8"));
  const input = inputFileV1.parse(await read("sor-suggestion-inputs"));
  const responses = responsesFileV1.parse(await read("sor-suggestion-responses"));
  if (input.cases.length !== responses.cases.length || responses.cases.some(row => !input.cases.some(source => source.id === row.id)))
    throw new Error("INVALID_FIXTURE_IDENTITIES");
  const fixtures: Record<string, RecordedFixture> = Object.fromEntries(responses.cases.map(row =>
    [row.id, { output: row.output, citations: row.citations }]));
  const proposer = new SorSuggestionFixtureProposer(fixtures);
  const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const predictions = [];
  let validCitations = 0, citationCount = 0;
  for (const source of input.cases) {
    const result = await proposer.propose({ version: "sor-suggestion-input.v1", environment: "synthetic_demo",
      job: { tenantId: uuid(1), id: uuid(2), clientContractVersionId: uuid(3), workOrderRevisionId: uuid(4), sorVersionId: uuid(5) },
      extra: { tenantId: uuid(1), jobId: uuid(2), id: uuid(6), kind: "free_text", captureText: source.text, sha256: sha256(source.text) },
      schedule: { tenantId: uuid(1), clientContractVersionId: uuid(3), versionId: uuid(5), items: input.items },
    }, source.id);
    predictions.push({ id: source.id, codes: result.output.suggestions.map(item => item.sorCode) });
    // propose() fails the run on an invalid citation; never count rejected predictions as successful abstentions.
    citationCount += result.output.suggestions.length;
    validCitations += result.output.suggestions.length;
  }
  const labels = labelFileV1.parse(await read("sor-suggestion-labels"));
  return { version: SOR_SUGGESTION_EVALUATION_VERSION, caseCount: input.cases.length, labelStatus: labels.labelStatus,
    ...scoreSorSuggestions(predictions, labels.cases), citationValidity: citationCount ? validCitations / citationCount : null,
    liveModel: "NOT RUN — M0-12a/D04/G2 and DPA held" as const, releaseDecision: "NOT_AUTHORIZED" as const };
}
