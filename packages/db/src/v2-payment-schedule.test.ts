import { describe, expect, it } from "vitest";
import { initialStageAmounts, paymentScheduleSetV1, projectPaymentSchedule, replayPaymentSchedule, type PaymentStage } from "./v2-payment-schedule.js";
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

it.each([true, false])("orders an extra and task within one millisecond (extra first: %s)", extraFirst => {
  const early = "2026-11-24T13:00:00.123100Z", late = "2026-11-24T13:00:00.123900Z";
  const result = projectPaymentSchedule(10000, stages, [due(0), due(2),
    extra(700, extraFirst ? early : late), due(1, extraFirst ? late : early)], now);
  expect(result.stages.map(stage => stage.amount)).toEqual(["30.00", extraFirst ? "47.00" : "40.00", "30.00"]);
  expect(result.unscheduledExtras).toBe(extraFirst ? "0.00" : "7.00");
});
it("keeps extras from before the schedule separate without folding them into stages", () => {
  const result = projectPaymentSchedule(10000, stages, [
    { ...extra(700, "2026-11-24T11:00:00.123100Z"), kind: "prior_extra" },
    { ...extra(800, "2026-11-24T11:00:00.123900Z"), kind: "prior_extra" },
    extra(200),
  ], now);
  expect(result.extrasBeforeSchedule).toBe("8.00");
  expect(result.extrasSinceSchedule).toBe("2.00");
  expect(result.stages.map(stage => stage.amount)).toEqual(["30.60", "40.80", "30.60"]);
});

// V2-K5A-2: frozen due rows decide where an approval goes; created_at only orders approvals no frozen row counts.
describe("K5A-2 frozen due stages", () => {
  const quarters: PaymentStage[] = ["25", "25", "25", "25"].map((value, index) => ({ label: `Stage ${index}`,
    split: { kind: "percentage", value }, trigger: { kind: "acceptance" } }));
  const t = (minute: number) => `2026-11-24T12:${String(minute).padStart(2, "0")}:00.000000Z`;
  const approval = (approvalId: string, pence: number, at: string) =>
    ({ kind: "extra" as const, variationId: approvalId, approvalId, pence, at });
  const sum = (result: ReturnType<typeof projectPaymentSchedule>) => [...result.stages.map(stage => stage.amount),
    result.extrasBeforeSchedule, result.unscheduledExtras].reduce((total, amount) => total + Math.round(Number(amount) * 100), 0);
  const frozen = (index: number, minute: number, counted: string[], amountPence?: number) =>
    ({ index, at: t(minute), countedApprovalIds: counted, amountPence });

  it("an approval in row k's set but not row k-1's lands between due facts k-1 and k (three frozen rows)", () => {
    // "a" started before stage 1 froze but committed after it; stage 2's freeze counted it.
    const facts = [approval("a", 700, t(4)), approval("b", 300, t(5))];
    const rows = [frozen(0, 1, []), frozen(1, 5, []), frozen(2, 9, ["a"])];
    const pending = replayPaymentSchedule(10000, quarters, facts.slice(0, 1), t(9), rows);
    expect(pending.amounts).toEqual([2500, 2500, 2850, 2850]);
    const stored = rows.map((row, index) => ({ ...row, amountPence: pending.amounts[index] }));
    const result = projectPaymentSchedule(10000, quarters, facts, t(30), stored);
    // b is counted by no frozen row, so it goes after every frozen due fact, although its created_at is earlier.
    expect(result.stages.map(stage => stage.amount)).toEqual(["25.00", "25.00", "28.50", "31.50"]);
    expect(result.stages.map(stage => stage.frozen)).toEqual([true, true, true, false]);
    expect(sum(result)).toBe(10000 + 700 + 300);
    // Ordered only by created_at, a would have changed stage 1, which the builder had already been shown as due.
    expect(projectPaymentSchedule(10000, quarters, [...facts, ...[0, 1, 2].map(index => ({ kind: "due" as const, index,
      at: t([1, 5, 9][index]!) }))], t(30)).stages[1]!.amount).not.toBe("25.00");
  });

  it("the race: B's frozen stage keeps its amount, A goes to the next stage, then to the final account", () => {
    const facts = [approval("a", 700, t(4))];
    const twoStages = quarters.slice(0, 2).map(stage => ({ ...stage, split: { kind: "percentage" as const, value: "50" } }));
    const next = projectPaymentSchedule(10000, twoStages, facts, t(30), [frozen(0, 5, [], 5000)]);
    expect(next.stages.map(stage => stage.amount)).toEqual(["50.00", "57.00"]);
    expect(sum(next)).toBe(10700);
    const last = projectPaymentSchedule(10000, twoStages, facts, t(30), [frozen(0, 1, [], 5000), frozen(1, 5, [], 5000)]);
    expect(last.stages.map(stage => stage.amount)).toEqual(["50.00", "50.00"]);
    expect(last.unscheduledExtras).toBe("7.00");
    expect(sum(last)).toBe(10700);
  });

  it("a frozen stage shows its stored amount exactly and the job total still adds up", () => {
    const result = projectPaymentSchedule(10000, quarters, [approval("a", 700, t(2))], t(30), [frozen(0, 5, ["a"], 2600)]);
    expect(result.stages[0]!.amount).toBe("26.00");
    expect(sum(result)).toBe(10700);
  });

  it("D3 midnight: an approval created 23:59:59 before a date stage changes that stage once it commits (known gap, K5B freezes)", () => {
    const halves = quarters.slice(0, 2).map((stage, index) => ({ ...stage, split: { kind: "percentage" as const, value: "50" },
      trigger: index ? { kind: "date" as const, date: "2026-11-27" } : stage.trigger }));
    const midnight = { kind: "due" as const, index: 1, at: "2026-11-27T00:00:00.000000Z" };
    const accepted = [frozen(0, 1, [], 5000)];
    const late = approval("a", 700, "2026-11-26T23:59:59.000000Z");
    // Read at 00:00:01 while the approval transaction is still open: it is not visible yet.
    const open = projectPaymentSchedule(10000, halves, [midnight], "2026-11-27T00:00:01.000000Z", accepted);
    expect(open.stages.map(stage => [stage.amount, stage.status])).toEqual([["50.00", "due"], ["50.00", "due"]]);
    expect(open.unscheduledExtras).toBe("0.00");
    // After commit its created_at is before midnight, so the date stage's shown amount changes.
    const committed = projectPaymentSchedule(10000, halves, [midnight, late], "2026-11-27T00:00:02.000000Z", accepted);
    expect(committed.stages.map(stage => stage.amount)).toEqual(["50.00", "57.00"]);
    expect(committed.stages[1]!.frozen).toBe(false);
    expect(sum(committed)).toBe(10700);
  });
});
