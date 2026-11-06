import { describe, expect, it } from "vitest";
import { evaluateDiscrepancyPredictions } from "./discrepancy-evaluation.js";
import { evaluateLineDiscrepancies } from "./line-discrepancy.js";
import { discrepancyDevelopmentCases, discrepancyDevelopmentNotice, developmentSnapshotId } from "./discrepancy-development-fixtures.js";

const evaluate = (cases: unknown[], stage = "confirmed_source_facts") => evaluateDiscrepancyPredictions({
  version: "discrepancy-evaluation.v1", dataset: "development", stage, cases });
const row = (id: string, label: "discrepancy" | "match" | "ambiguous", predictedNetPence: number) => ({
  id, label, predictedNetPence, labelledNetPence: label === "discrepancy" ? 2500 : 0 });
describe("M2-5 pure discrepancy DEVELOPMENT evaluation", () => {
  it("runs fictional confirmed facts through the actual check, without claiming held-out performance", () => {
    const cases = discrepancyDevelopmentCases().map(({ facts, ...label }) => ({ ...label,
      predictedNetPence: evaluateLineDiscrepancies({ version: "line-discrepancy-input.v1", snapshotId: developmentSnapshotId,
        correctionRevision: 0, facts }).decisions.reduce((sum, d) => sum + d.amount.pence, 0) }));
    const report = evaluate(cases);
    expect(discrepancyDevelopmentNotice).toContain("DEVELOPMENT");
    expect(report).toMatchObject({ dataset: "development", stage: "confirmed_source_facts", releaseEvidence: false,
      classCounts: { discrepancy: 3, match: 1, ambiguous: 1 }, confusionMatrix: { tp: 3, fp: 0, tn: 2, fn: 0 },
      falseDiscoveryProportion: 0, precision: 1, recall: 1, errorExamples: [] });
    expect(report.notice).toContain("not the frozen held-out benchmark"); expect(report.uncertainty).toContain("not representative");
  });
  it("reports every confusion class, FP/(TP+FP), precision, recall and error examples", () => {
    const report = evaluate([row("tp", "discrepancy", 2500), row("fp", "ambiguous", 1), row("tn", "match", 0), row("fn", "discrepancy", 0)]);
    expect(report).toMatchObject({ confusionMatrix: { tp: 1, fp: 1, tn: 1, fn: 1 },
      falseDiscoveryProportion: 0.5, precision: 0.5, recall: 0.5, diagnosticTargetsMet: false });
    expect(report.errorExamples).toEqual([expect.objectContaining({ id: "fp", error: "false_positive" }),
      expect.objectContaining({ id: "fn", error: "false_negative" })]);
  });
  it("empty predictions fail, even with no labelled positives", () => {
    expect(evaluate([row("missed", "discrepancy", 0)])).toMatchObject({ precision: null, falseDiscoveryProportion: null, recall: 0, diagnosticTargetsMet: false });
    expect(evaluate([])).toMatchObject({ recall: null, diagnosticTargetsMet: false });
    expect(evaluate([row("negative", "match", 0)])).toMatchObject({ diagnosticTargetsMet: false });
  });
  it("separates confirmed-fact and end-to-end scores so extraction misses stay visible", () => {
    const confirmed = evaluate([row("source", "discrepancy", 2500)]);
    const endToEnd = evaluate([row("source", "discrepancy", 0)], "end_to_end");
    expect(confirmed.recall).toBe(1); expect(endToEnd.recall).toBe(0); expect(endToEnd.stage).toBe("end_to_end");
  });
  it("rejects duplicate labels, sub-threshold discrepancies and unsupported benchmark claims", () => {
    expect(() => evaluate([row("same", "match", 0), row("same", "discrepancy", 1)])).toThrow();
    expect(() => evaluate([{ ...row("small", "discrepancy", 1), labelledNetPence: 2499 }])).toThrow();
    expect(() => evaluateDiscrepancyPredictions({ version: "discrepancy-evaluation.v1", dataset: "held_out", stage: "confirmed_source_facts", cases: [] })).toThrow();
    expect(() => evaluate([row("x", "match", -1)])).toThrow();
  });
});
