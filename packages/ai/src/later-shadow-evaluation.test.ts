import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { parseObservation, sha256 } from "@jobguard/core";
import { FixtureAiProvider } from "./fixture-provider.js";
import { runShadowEvaluation } from "./shadow-evaluation.js";

const id = "10000000-0000-4000-8000-000000000001", at = "2026-10-16T00:00:00Z";
const text = "Fitted outside tap.";
const observation = parseObservation({ version: "observation.v1", tenantId: id, jobId: id, kind: "note_or_voice", text,
  evidence: { id, objectVersionId: "synthetic-v1", sha256: sha256(text), serverReceivedAt: at },
  citations: [{ start: 0, end: text.length, quote: text }],
  facts: { workReference: "outside-tap", scopeArea: "garden", description: "outside tap", status: "completed",
    estimatedValuePence: null, safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false,
    significantWork: null, activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false } });
const identity = { tenantId: id, jobId: id, scopeArea: "garden", workReference: "outside-tap" };
const corpus = { version: "shadow-observation-corpus.v1", cases: [{ id: "L131-substitution", observations: [observation], captures: [],
  responses: { [id]: { output: { version: "shadow-ai-proposals.v1", proposals: [] }, citations: [] } } }] };
const labels = (expectedWork: unknown[]) => ({ version: "shadow-labels.v2", cases: [{ id: "L131-substitution", class: "genuine_extra", expectedWork }] });

describe("LATER-B6 evaluates actual grouped identities", () => {
  it("L131: wrong finding with the right count is a false positive and a miss", async () => {
    const report = await runShadowEvaluation({ corpus, labels: labels([{ ...identity, workReference: "garden-light" }]) });
    expect(report.results.fixture).toMatchObject({ cases: 1, truePositive: 0, falsePositive: 1, falseNegative: 1,
      recall: 0, falsePositivePrecision: 0 });
  });

  it("L131: exact identities match, and replayed sources count as one finding", async () => {
    const duplicate = { ...corpus, cases: [{ ...corpus.cases[0]!, observations: [observation, observation] }] };
    const report = await runShadowEvaluation({ corpus: duplicate, labels: labels([identity]) });
    expect(report.results.fixture).toMatchObject({ truePositive: 1, falsePositive: 0, falseNegative: 0 });
  });

  it.each(["tenantId", "jobId", "scopeArea", "workReference"] as const)("L131: %s is part of the labelled identity", async field => {
    const value = field.endsWith("Id") ? "10000000-0000-4000-8000-000000000002" : "different";
    const report = await runShadowEvaluation({ corpus, labels: labels([{ ...identity, [field]: value }]) });
    expect(report.results.fixture).toMatchObject({ truePositive: 0, falsePositive: 1, falseNegative: 1 });
  });

  it("L131: v2 labels preserve the existing 11-case metrics and never enter provider requests", async () => {
    const execute = vi.spyOn(FixtureAiProvider.prototype, "execute");
    try {
      const report = await runShadowEvaluation();
      expect(report.results.fixture).toMatchObject({ cases: 11, truePositive: 3, falsePositive: 0, falseNegative: 0 });
      expect(report.results.live_model.status).toBe("not_run");
      const stored = JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-labels.v2.json", import.meta.url), "utf8"));
      expect(stored.version).toBe("shadow-labels.v2");
      expect(stored.cases).toHaveLength(11);
      expect(execute).toHaveBeenCalled();
      for (const [request] of execute.mock.calls) expect(JSON.stringify(request)).not.toMatch(/expectedWork|shadow-labels|genuine_extra/u);
    } finally { execute.mockRestore(); }
  });

  it("L131: invalid or duplicate label/case identities fail rather than reporting success", async () => {
    for (const invalid of [labels([identity, identity]), { ...labels([]), cases: [] },
      { ...labels([]), cases: [labels([]).cases[0], labels([]).cases[0]] },
      { ...labels([]), cases: [{ ...labels([]).cases[0], id: "unknown-case" }] }]) {
      await expect(runShadowEvaluation({ corpus, labels: invalid })).rejects.toThrow();
    }
    await expect(runShadowEvaluation({ corpus: { ...corpus, cases: [corpus.cases[0], corpus.cases[0]] }, labels: labels([]) })).rejects.toThrow();
  });
});
