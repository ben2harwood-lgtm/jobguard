import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, type JobRecordProposal } from "@jobguard/core";
import { extractCaptureFixture, PINNED_CAPTURE_MODEL } from "./capture.js";
import { CAPTURE_FIXTURE_PARSER_VERSION } from "./capture-fixture-parser.js";
import { evaluateCapture, validateCorpus } from "./capture-evaluation.js";

const identifier = z.string().min(1).max(100);
const sourceFile = z.object({ version: z.literal("synthetic-walkarounds/1"), cases: z.array(z.object({
  id: identifier, tags: z.array(identifier).min(1), text: z.string().min(1).max(50_000),
}).strict()).min(20).max(1000) }).strict();
const labelsFile = z.object({ version: z.literal("synthetic-capture-labels/1"),
  labelStatus: z.literal("AUTHOR_PROPOSED_INDEPENDENT_REVIEW_PENDING"),
  cases: z.array(z.object({ id: identifier, title: z.string().min(1).max(200),
    lines: z.array(z.object({ description: z.string().min(1).max(500), intents: z.array(identifier).min(1),
      pricePence: z.number().int().min(0).max(1_000_000_000_000).nullable(),
      quantity: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/u).nullable(), unit: z.string().min(1).max(40).nullable(),
    }).strict()).min(1), requiredQuestions: z.array(z.string().min(1).max(500)).min(1),
  }).strict()).min(20).max(1000),
}).strict();
export const MUTATIONS = ["omission", "money", "citation", "provenance", "ambiguity"] as const;
export type EvaluationMutation = typeof MUTATIONS[number];
const hash = (data: string) => createHash("sha256").update(data).digest("hex");
export async function runCaptureEvaluation(mutation?: EvaluationMutation) {
  const sourceRaw = await readFile(new URL("../../../docs/fixtures/ai/walkarounds.v1.json", import.meta.url), "utf8");
  const labelRaw = await readFile(new URL("../../../docs/fixtures/ai/labels.v1.json", import.meta.url), "utf8");
  const sources = sourceFile.parse(JSON.parse(sourceRaw)), labels = labelsFile.parse(JSON.parse(labelRaw));
  validateCorpus(sources.cases, labels.cases);
  const started = Date.now();
  const results = [];
  for (const source of sources.cases) {
    const sourceId = `evaluation:${source.id}`;
    const label = labels.cases.find(item => item.id === source.id)!;
    const output: JobRecordProposal = await extractCaptureFixture(sourceId, source.text, `eval-${source.id}`);
    // Explicit negative controls operate only on the evaluator's in-memory
    // observation. They do not alter the fixtures, parser, DB or provider.
    if (source.id === "walk-01" && mutation) {
      switch (mutation) {
        case "omission": output.lines.pop(); break;
        case "money": output.lines[0]!.unitPricePence.value = 99999; break;
        case "citation": {
          const p = output.lines[0]!.description.provenance;
          if (p.kind === "extracted") p.span.end = source.text.length + 1;
          break;
        }
        case "provenance": output.lines[0]!.unitPricePence.provenance = { kind: "inferred", note: "Uncited synthetic attack" }; break;
        case "ambiguity": output.questions = []; break;
      }
    }
    results.push({ ...evaluateCapture(source, label, output, sourceId), sourceSha256: hash(source.text), output });
  }
  const totals = results.reduce((acc, result) => ({
    scopeIntentRecall: { numerator: acc.scopeIntentRecall.numerator + result.scopeIntentRecall.numerator,
      denominator: acc.scopeIntentRecall.denominator + result.scopeIntentRecall.denominator },
    citations: { valid: acc.citations.valid + result.citations.valid, total: acc.citations.total + result.citations.total },
    unsupportedMonetaryFacts: acc.unsupportedMonetaryFacts + result.unsupportedMonetaryFacts,
    ambiguityChecks: { passed: acc.ambiguityChecks.passed + result.ambiguityChecks.passed, total: acc.ambiguityChecks.total + result.ambiguityChecks.total },
  }), { scopeIntentRecall: { numerator: 0, denominator: 0 }, citations: { valid: 0, total: 0 },
    unsupportedMonetaryFacts: 0, ambiguityChecks: { passed: 0, total: 0 } });
  const passed = results.every(result => result.passed);
  return {
    schema: "jobguard-capture-evaluation/1", status: passed ? "PASS" : "FAIL", executionMode: "DETERMINISTIC_STRUCTURED_FIXTURES",
    releaseDecision: "NOT_AUTHORIZED", labelStatus: labels.labelStatus,
    versions: { dataset: sources.version, labels: labels.version, parser: CAPTURE_FIXTURE_PARSER_VERSION,
      fixtureRoute: PINNED_CAPTURE_MODEL, prompt: CAPTURE_PROMPT_VERSION, schema: CAPTURE_SCHEMA_VERSION },
    hashes: { datasetSha256: hash(sourceRaw), labelsSha256: hash(labelRaw) },
    targets: { scopeIntentRecallPercent: 95, unsupportedMonetaryFacts: 0, validCitationsPercent: 100,
      designatedAmbiguities: "ALL", additionalGuard: "Every case must match its explicit labels; no pooling away failures" },
    cases: { passed: results.filter(r => r.passed).length, total: results.length }, totals,
    citationStage: "PROPOSAL_OUTPUT_BEFORE_DATABASE_PERSISTENCE", citationOffsetUnit: "UTF-16-code-units",
    negativeControl: mutation ?? null, costPence: 0, elapsedMs: Date.now() - started,
    notTested: ["Live model or natural-language extraction accuracy", "Independent label review", "Database-persisted citation retrieval", "Real builder usability", "Provider residency or release approval"],
    results,
  };
}
