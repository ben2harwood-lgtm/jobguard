import { expect, it } from "vitest";
import { runPersistedPromptEvaluation, scorePersistedPromptCases } from "./enterprise-live-prompt-persisted-evaluation.js";
it("reports false prompts and missed extras separately for four held-out rules without network calls", async () => {
  const results = await runPersistedPromptEvaluation();
  console.info("ENT-8A-P synthetic fixture evaluation", JSON.stringify(results));
  expect(results.map(r => r.rule)).toEqual(["a", "b", "c", "d"]);
  for (const result of results) { expect(result.caseCount).toBeGreaterThan(0); expect(result.falsePrompts).toBe(0); expect(result.missedExtras).toBe(0); }
});
it("counts false prompts and missed extras independently and refuses mismatched labels", () => {
  const predictions = [{ id: "false", rule: "a" as const, count: 1 }, { id: "missed", rule: "a" as const, count: 0 }];
  expect(scorePersistedPromptCases(predictions, { version: "persisted-prompt-labels.v1", cases: [{ id: "false", expectedCount: 0 }, { id: "missed", expectedCount: 1 }] })[0]).toEqual({ rule: "a", caseCount: 2, falsePrompts: 1, missedExtras: 1 });
  expect(() => scorePersistedPromptCases(predictions, { version: "persisted-prompt-labels.v1", cases: [] })).toThrow("EVALUATION_CORPUS_MISMATCH");
});
