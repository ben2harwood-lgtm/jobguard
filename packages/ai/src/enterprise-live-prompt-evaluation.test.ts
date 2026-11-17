import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { formatCompletionWorkEvaluation, predictCompletionWorkCorpus, runCompletionWorkEvaluation, scoreCompletionWorkPredictions } from "./enterprise-live-prompt-evaluation.js";

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`../../../docs/fixtures/enterprise-live-prompts/${name}.v1.json`, import.meta.url), "utf8"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("ENT-8a deterministic evaluation", () => {
  it("A-21: held-out rule (a) report prints false prompts and missed extras separately without network calls", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Unexpected network call"); });
    try {
      const report = await runCompletionWorkEvaluation();
      expect(report).toMatchObject({ version: "enterprise-completion-evaluation.v1", rulesEvaluated: ["a"], caseCount: 8,
        truePromptCount: 2, falsePromptCount: 0, missedExtraCount: 0, predictedCount: 2, expectedCount: 2,
        falsePromptRate: 0, missedExtraRate: 0 });
      const text = formatCompletionWorkEvaluation(report); process.stdout.write(text);
      expect(text).toContain("false prompts: 0 / 2"); expect(text).toContain("missed extras: 0 / 2");
      expect(text).toContain("rules (b), (c), (d): HELD"); expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it("A-21: wrong identities with equal counts are separately false and missed", () => {
    const report = scoreCompletionWorkPredictions([{ caseId: "case", observationIds: [id(1), id(2)] }], {
      version: "enterprise-completion-labels.v1", cases: [{ id: "case", expectedObservationIds: [id(2), id(3), id(4)] }],
    });
    expect(report).toMatchObject({ truePromptCount: 1, falsePromptCount: 1, missedExtraCount: 2,
      predictedCount: 2, expectedCount: 3, falsePromptRate: 0.5, missedExtraRate: 2 / 3 });
  });
  it("A-21: zero denominators report null and remain distinguishable from measured zero", () => {
    const labels = { version: "enterprise-completion-labels.v1", cases: [{ id: "empty", expectedObservationIds: [] }] };
    const empty = scoreCompletionWorkPredictions([{ caseId: "empty", observationIds: [] }], labels);
    expect(empty).toMatchObject({ falsePromptCount: 0, missedExtraCount: 0, falsePromptRate: null, missedExtraRate: null });
    expect(formatCompletionWorkEvaluation(empty)).toContain("n/a");
    expect(scoreCompletionWorkPredictions([{ caseId: "empty", observationIds: [id(1)] }], labels))
      .toMatchObject({ falsePromptCount: 1, missedExtraCount: 0, falsePromptRate: 1, missedExtraRate: null });
    expect(scoreCompletionWorkPredictions([{ caseId: "empty", observationIds: [] }], { ...labels, cases: [{ id: "empty", expectedObservationIds: [id(1)] }] }))
      .toMatchObject({ falsePromptCount: 0, missedExtraCount: 1, falsePromptRate: null, missedExtraRate: 1 });
  });
  it("A-21: changing labels cannot change predictions; labels and development fixtures stay separate", async () => {
    const inputs = await fixture("held-out-inputs"), labels = await fixture("held-out-labels"), development = await fixture("development");
    const predictions = predictCompletionWorkCorpus(inputs), saved = structuredClone(predictions);
    scoreCompletionWorkPredictions(predictions, labels);
    const changed = { ...labels, cases: labels.cases.map((row: { id: string }) => ({ id: row.id, expectedObservationIds: [] })) };
    expect(scoreCompletionWorkPredictions(predictions, changed).falsePromptCount).toBe(2);
    expect(predictions).toEqual(saved); expect(predictCompletionWorkCorpus(inputs)).toEqual(saved);
    expect(inputs.cases.every((row: { id: string }) => !development.cases.some((dev: { id: string }) => dev.id === row.id))).toBe(true);
    expect(() => predictCompletionWorkCorpus({ ...inputs, labels })).toThrow();
    expect(() => predictCompletionWorkCorpus({ ...inputs, cases: [{ ...inputs.cases[0], expectedObservationIds: [] }] })).toThrow();
  });
  it("A-21: duplicate cases/observations and unmatched labels refuse instead of skewing metrics", () => {
    const row = { caseId: "one", observationIds: [id(1)] }, label = { id: "one", expectedObservationIds: [id(1)] };
    const labels = { version: "enterprise-completion-labels.v1", cases: [label] };
    for (const predictions of [[row, row], [{ ...row, observationIds: [id(1), id(1)] }]]) expect(() => scoreCompletionWorkPredictions(predictions, labels)).toThrow();
    for (const cases of [[label, label], [{ ...label, expectedObservationIds: [id(1), id(1)] }], [], [{ ...label, id: "other" }]]) {
      expect(() => scoreCompletionWorkPredictions([row], { ...labels, cases })).toThrow();
    }
  });
});
