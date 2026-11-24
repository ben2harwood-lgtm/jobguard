import { describe, expect, it } from "vitest";
import { initialStageAmounts, paymentScheduleSetV1, projectPaymentSchedule, type PaymentStage } from "./v2-payment-schedule.js";
const stages: PaymentStage[] = ["30", "40", "30"].map((value, index) => ({ label: `Stage ${index}`, split: { kind: "percentage", value }, trigger: { kind: "acceptance" } }));
const due = (index: number, at = "2026-11-24T12:00:00.000Z") => ({ kind: "due" as const, index, at });
const extra = (pence: number, at = "2026-11-24T13:00:00.000Z") => ({ kind: "extra" as const, variationId: "extra", pence, at });
const now = "2026-11-24T15:00:00.000Z";
describe("K5A payment schedule", () => {
  it("30/40/30 sums exactly including penny remainders and half-even ties", () => {
    expect(initialStageAmounts(10001, stages)).toEqual([3000, 4000, 3001]);
    expect(initialStageAmounts(5, stages)).toEqual([2, 2, 1]);
    expect(initialStageAmounts(3, ["50","50","0"].map(value => ({...stages[0]!,split:{kind:"percentage",value}})))).toEqual([2,1,0]);
    for (let total = 0; total < 1000; total++) expect(initialStageAmounts(total, stages).reduce((a,b) => a+b, 0)).toBe(total);
  });
  it("a fixed deposit leaves an exact remainder", () => {
    expect(initialStageAmounts(10001, [{ ...stages[0]!, split: { kind: "fixed", value: "10.01" } },
      { ...stages[1]!, split: { kind: "percentage", value: "100" } }])).toEqual([1001,9000]);
    expect(() => initialStageAmounts(100, [{ ...stages[0]!, split: { kind: "fixed", value: "2.00" } }, stages[1]!])).toThrow();
  });
  it("freezes due amounts and re-splits only planned stages", () => {
    const result = projectPaymentSchedule(10000, stages, [due(0), extra(700)], now);
    expect(result.stages.map(stage => stage.amount)).toEqual(["30.00", "44.00", "33.00"]);
    expect(result.stages.map(stage => stage.status)).toEqual(["due", "planned", "planned"]);
    expect(result.extrasSinceSchedule).toBe("7.00");
  });
  it("all stages due before an extra: no stage changes, extra stays separate", () => {
    const result = projectPaymentSchedule(10000, stages, [extra(700), due(0), due(1), due(2)], now);
    expect(result.stages.map(stage => stage.amount)).toEqual(["30.00", "40.00", "30.00"]);
    expect(result.unscheduledExtras).toBe("7.00");
  });
  it("applies a revised approval once and ignores future facts", () => {
    const result = projectPaymentSchedule(10000, stages, [extra(700), extra(800, "2026-11-24T14:00:00.000Z"),
      due(1, "2026-11-25T00:00:00.000Z")], now);
    expect(result.extrasSinceSchedule).toBe("8.00");
    expect(result.stages.every(stage => stage.status === "planned")).toBe(true);
    expect(result.stages.map(stage => stage.amount)).toEqual(["32.40", "43.20", "32.40"]);
  });
  it("rejects non-exact amounts, unknown fields, invalid percentages and stale-shaped inputs", () => {
    expect(() => initialStageAmounts(100, stages.map(stage => ({ ...stage, split: {kind:"percentage",value:"40"} })))).toThrow();
    expect(paymentScheduleSetV1.safeParse({ version: "payment-schedule-set.v1", stages, expectedVersion: -1 }).success).toBe(false);
  });
});
