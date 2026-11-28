import { z } from "zod";
import { money, multiplyRatio, parsePoundsToPence } from "@jobguard/core";

const decimal = z.string().max(20).regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u);
export const paymentStageV1 = z.strictObject({
  label: z.string().trim().min(1).max(100),
  split: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("percentage"), value: decimal }),
    z.strictObject({ kind: z.literal("fixed"), value: decimal }),
  ]),
  trigger: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("acceptance") }),
    z.strictObject({ kind: z.literal("date"), date: z.iso.date() }),
    z.strictObject({ kind: z.literal("task"), scopeItemId: z.uuid(), taskKey: z.string().min(1).max(40) }),
  ]),
});
export const paymentScheduleSetV1 = z.strictObject({
  version: z.literal("payment-schedule-set.v1"), commandId: z.uuid(), jobId: z.uuid(),
  quoteRevisionId: z.uuid(), expectedVersion: z.number().int().min(0).max(2_147_483_647),
  stages: z.array(paymentStageV1).min(1).max(20),
});
export const paymentScheduleTaskDoneV1 = z.strictObject({
  version: z.literal("payment-schedule-task-done.v1"), commandId: z.uuid(), jobId: z.uuid(),
  quoteRevisionId: z.uuid(), expectedVersion: z.number().int().min(1).max(2_147_483_647),
  scopeItemId: z.uuid(), taskKey: z.string().min(1).max(40),
});
export type PaymentStage = z.infer<typeof paymentStageV1>;
export type PaymentScheduleSet = z.infer<typeof paymentScheduleSetV1>;
export class PaymentScheduleError extends Error {
  constructor(readonly code: "SCHEDULE_INVALID" | "SCHEDULE_STALE" | "SCHEDULE_REPLAY_CONFLICT" |
    "SCHEDULE_ACCEPTANCE_REQUIRED" | "SCHEDULE_BUILDER_REQUIRED") { super(code); }
}
export const pounds = (pence: number) => {
  const exact = BigInt(money(pence).pence);
  const absolute = exact < 0n ? -exact : exact;
  return `${exact < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};

/** The last stage is the explicit remainder; the existing half-even kernel owns rounding. */
export function initialStageAmounts(total: number, stages: PaymentStage[]): number[] {
  money(total);
  if (total < 0 || !stages.length) throw new PaymentScheduleError("SCHEDULE_INVALID");
  const percentageOnly = stages.every(stage => stage.split.kind === "percentage");
  if (percentageOnly && stages.reduce((sum, stage) => sum + parsePoundsToPence(stage.split.value), 0) !== 10000) {
    throw new PaymentScheduleError("SCHEDULE_INVALID");
  }
  let remaining = total;
  return stages.map((stage, index) => {
    const value = parsePoundsToPence(stage.split.value);
    if (stage.split.kind === "percentage" && value > 10000) throw new PaymentScheduleError("SCHEDULE_INVALID");
    const amount = index === stages.length - 1 ? remaining : stage.split.kind === "fixed" ? value :
      Math.min(remaining, Number(multiplyRatio(BigInt(total), BigInt(value), 10000n, "half_even")));
    if (amount < 0 || amount > remaining) throw new PaymentScheduleError("SCHEDULE_INVALID");
    remaining -= amount;
    return amount;
  });
}
export type ScheduleFact = { at: string; kind: "due"; index: number } |
  { at: string; kind: "extra" | "prior_extra"; variationId: string; pence: number };

/** Replay server facts in time order. Due stages are frozen even if nobody opened the page. */
export function projectPaymentSchedule(total: number, stages: PaymentStage[], facts: ScheduleFact[], now: string) {
  const amounts = initialStageAmounts(total, stages);
  const due = stages.map(() => false);
  const variations = new Map<string, number>();
  const priorVariations = new Map<string, number>();
  let extras = 0;
  let unallocated = 0;
  const ordered = facts.filter(fact => fact.at <= now).sort((a, b) =>
    a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === "due" ? -1 : 1));
  for (const fact of ordered) {
    if (fact.kind === "due") { due[fact.index] = true; continue; }
    if (fact.kind === "prior_extra") { priorVariations.set(fact.variationId, fact.pence); continue; }
    const delta = money(fact.pence).pence - (variations.get(fact.variationId) ?? 0);
    variations.set(fact.variationId, fact.pence);
    extras = money(extras + delta).pence;
    const planned = amounts.map((_, index) => index).filter(index => !due[index]);
    const weight = planned.reduce((sum, index) => sum + amounts[index]!, 0);
    const target = money(weight + delta).pence;
    // An omission cannot reduce a stage already due. Keep the outstanding adjustment separate.
    if (!planned.length || target < 0) { unallocated = money(unallocated + delta).pence; continue; }
    let prefix = 0n;
    let assigned = 0;
    planned.forEach((index, position) => {
      prefix += BigInt(amounts[index]!);
      const cumulative = position === planned.length - 1 ? target : weight === 0 ? 0 :
        Number(multiplyRatio(BigInt(target), prefix, BigInt(weight), "half_even"));
      amounts[index] = cumulative - assigned;
      assigned = cumulative;
    });
  }
  return { stages: stages.map((stage, index) => ({ ...stage, amount: pounds(amounts[index]!),
    status: due[index] ? "due" as const : "planned" as const })),
  extrasBeforeSchedule: pounds([...priorVariations.values()].reduce((sum, pence) => money(sum + pence).pence, 0)),
  extrasSinceSchedule: pounds(extras), unscheduledExtras: pounds(unallocated) };
}
