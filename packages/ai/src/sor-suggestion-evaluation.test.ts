import { describe, expect, it, vi } from "vitest";
import { FixtureAiProvider } from "./fixture-provider.js";
import { runSorSuggestionEvaluation, scoreSorSuggestions } from "./sor-suggestion-evaluation.js";

describe("ENT-8B-SOR fictional evaluation", () => {
  it("SOR-4 / Golden set: reports correct-item and wrong-suggestion rates separately", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const report = await runSorSuggestionEvaluation();
    expect(report).toMatchObject({ version: "sor-suggestion-evaluation.v1", caseCount: 6, correctItems: 4, missedItems: 0,
      wrongSuggestions: 0, expectedItems: 4, suggestedItems: 4, correctItemRate: 1, wrongSuggestionRate: 0,
      citationValidity: 1, ambiguousCases: 1, ambiguityAbstentions: 1,
      liveModel: "NOT RUN — M0-12a/D04/G2 and DPA held", releaseDecision: "NOT_AUTHORIZED" });
    console.info(JSON.stringify(report, null, 2));
    expect(network).not.toHaveBeenCalled(); network.mockRestore();
  });
  it("SOR-4: scorer distinguishes omissions and wrong suggestions and accepts valid alternatives", () => {
    const report = scoreSorSuggestions([
      { id: "one", codes: ["A", "WRONG"] }, { id: "two", codes: [] }, { id: "three", codes: ["ALT"] },
    ], [
      { id: "one", acceptableCodes: ["A"], ambiguous: false },
      { id: "two", acceptableCodes: ["B"], ambiguous: false },
      { id: "three", acceptableCodes: ["C", "ALT"], ambiguous: false },
    ]);
    expect(report).toMatchObject({ correctItems: 2, wrongSuggestions: 1, missedItems: 1, expectedItems: 3,
      suggestedItems: 3, correctItemRate: 2 / 3, wrongSuggestionRate: 1 / 3 });
  });
  it("SOR-4: ambiguous and no-match cases penalize any suggestion; empty denominators are unknown", () => {
    expect(scoreSorSuggestions([{ id: "a", codes: ["A"] }], [{ id: "a", acceptableCodes: [], ambiguous: true }]))
      .toMatchObject({ wrongSuggestions: 1, wrongSuggestionRate: 1, correctItemRate: null, ambiguityAbstentions: 0 });
    expect(scoreSorSuggestions([{ id: "a", codes: [] }], [{ id: "a", acceptableCodes: [], ambiguous: false }]))
      .toMatchObject({ correctItemRate: null, wrongSuggestionRate: null });
  });
  it("SOR-4: rejects missing, extra and duplicate evaluation identities and duplicate codes", () => {
    const label = { id: "a", acceptableCodes: ["A"], ambiguous: false };
    for (const predictions of [[], [{ id: "b", codes: [] }], [{ id: "a", codes: [] }, { id: "a", codes: [] }], [{ id: "a", codes: ["A", "A"] }]])
      expect(() => scoreSorSuggestions(predictions, [label])).toThrow();
    expect(() => scoreSorSuggestions([{ id: "a", codes: [] }], [label, label])).toThrow();
  });
  it("SOR-4 / SOR-5: expectations never enter gateway sources; fixture results cannot authorize live use", async () => {
    const execute = vi.spyOn(FixtureAiProvider.prototype, "execute");
    const report = await runSorSuggestionEvaluation();
    expect(execute).toHaveBeenCalledTimes(6);
    for (const [request] of execute.mock.calls) {
      expect(request.operation).toBe("sor_candidate_suggestions");
      expect(JSON.stringify(request)).not.toMatch(/acceptableCodes|ambiguousCases|releaseDecision/u);
    }
    expect(report.releaseDecision).toBe("NOT_AUTHORIZED"); execute.mockRestore();
  });
});
