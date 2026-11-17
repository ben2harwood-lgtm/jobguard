import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { formatShadowEvaluation, runShadowEvaluation, shadowEvaluationClasses } from "./shadow-evaluation.js";
import { FixtureAiProvider } from "./fixture-provider.js";
import { evaluationMain } from "./evaluation-cli.js";
describe("SV-3 held-out fixture evaluation", () => {
  it("DW1: covers every class and pins TP, FP and FN independently", async () => {
    const report = await runShadowEvaluation();
    expect([...report.results.fixture.classes].sort()).toEqual([...shadowEvaluationClasses].sort());
    expect(report.results.fixture).toMatchObject({ cases: 11, truePositive: 3, falsePositive: 0, falseNegative: 0, recall: 1, falsePositivePrecision: 1, droppedCitations: 0 });
    console.info(formatShadowEvaluation(report));
    expect(formatShadowEvaluation(report)).toContain("recall: 1 (TP 3, FN 0)");
    expect(formatShadowEvaluation(report)).toContain("false-positive precision: 1 (TP 3, FP 0)");
  });
  it("DW2: live-model is a distinct not-run entry and fixture constructs no network client", async () => {
    const network=vi.spyOn(globalThis,"fetch"),provider=vi.spyOn(FixtureAiProvider.prototype,"execute");
    const report = await runShadowEvaluation();expect(network).not.toHaveBeenCalled();expect(provider).toHaveBeenCalled();network.mockRestore();provider.mockRestore();expect(Object.keys(report.results)).toEqual(["fixture", "live_model"]);
    expect(report.results.live_model).toEqual({ status: "not_run", reason: "separate release item" }); expect(report.results.fixture.networkClientsConstructed).toBe(0);
  });
  it("labels are absent from detector/provider inputs and loaded after predictions", async () => {
    const corpus = JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-observations.v1.json", import.meta.url), "utf8"));
    expect(corpus.cases.every((c: Record<string, unknown>) => !("class" in c) && !("expectedExtras" in c))).toBe(true);
    for (const file of ["./shadow-proposal.ts", "../../core/src/shadow-detection.ts"]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8"); expect(source).not.toMatch(/shadow-labels|expectedExtras/u);
    }
  });
  it("pnpm eval's CLI entry emits both metrics and the live run status", async () => {
    const out: string[] = []; expect(await evaluationMain([], value => out.push(value))).toBe(0);
    expect(JSON.parse(out.join("")).status).toBe("PASS");
    expect(out.join("")).toContain("false-positive precision:"); expect(out.join("")).toContain("live-model: NOT RUN (separate release item)");
  });
});
