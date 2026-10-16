import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runEnterpriseAiEvaluation, scoreEnterpriseAiPredictions } from "./enterprise-ai-evaluation.js";

const labels = { version: "enterprise-ai-labels.v1", cases: [{ id: "one", expected: ["a", "b"], ambiguous: ["b"] }] };
const prediction = { caseId: "one", items: [{ identity: "a", ambiguity: "clear", citationValid: true }, { identity: "c", ambiguity: "review", citationValid: false }] };
describe("ENT-8B golden evaluation", () => {
  it("ENT-8B-4 Golden set: held-out report prints omission, unsupported additions, citation validity, ambiguity, recall and false-prompt precision separately", async () => {
    const report = await runEnterpriseAiEvaluation(); process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    expect(report).toMatchObject({ version: "enterprise-ai-evaluation.v1", split: "held-out", provider: "recorded-fixture", liveModelEvaluated: false,
      caseCount: 8, missedExtraCount: 0, unsupportedAdditionCount: 0, citationValidity: 1, ambiguityErrorCount: 0, recall: 1, falsePromptPrecision: 1, status: "PASS" });
  });
  it("ENT-8B-4 wrong identities with equal counts are independently missed and unsupported", () => {
    expect(scoreEnterpriseAiPredictions([prediction], labels)).toMatchObject({ missedExtraCount: 1, unsupportedAdditionCount: 1,
      validCitationCount: 1, invalidCitationCount: 1, citationValidity: 0.5, ambiguityErrorCount: 1, recall: 0.5, falsePromptPrecision: 0.5, status: "FAIL" });
  });
  it("ENT-8B-4 held-out labels are separate, development IDs disjoint, and scoring never modifies predictions", async () => {
    const load = async (name: string) => JSON.parse(await readFile(new URL(`../../../docs/fixtures/enterprise-ai-prompts/${name}.v1.json`, import.meta.url), "utf8"));
    const held = await load("held-out-inputs"), dev = await load("development"), saved = structuredClone(prediction);
    expect(held.cases.every((row: { id: string }) => !dev.cases.some((other: { id: string }) => other.id === row.id))).toBe(true);
    expect(held.cases.every((row: object) => !("expected" in row))).toBe(true);
    scoreEnterpriseAiPredictions([prediction], labels); expect(prediction).toEqual(saved);
    expect(scoreEnterpriseAiPredictions([prediction], { ...labels, cases: [{ id: "one", expected: [], ambiguous: [] }] }).unsupportedAdditionCount).toBe(2);
  });
  it("ENT-8B-4 empty denominators remain unknown and invalid identities cannot skew metrics", () => {
    const empty = { version: "enterprise-ai-labels.v1", cases: [{ id: "one", expected: [], ambiguous: [] }] };
    expect(scoreEnterpriseAiPredictions([{ caseId: "one", items: [] }], empty)).toMatchObject({ recall: null, falsePromptPrecision: null, citationValidity: null });
    for (const rows of [[], [prediction, prediction], [{ ...prediction, items: [prediction.items[0]!, prediction.items[0]!] }], [{ ...prediction, caseId: "other" }]]) {
      expect(() => scoreEnterpriseAiPredictions(rows, labels)).toThrow();
    }
    expect(() => scoreEnterpriseAiPredictions([prediction], { ...labels, cases: [labels.cases[0], labels.cases[0]] })).toThrow();
  });
});
