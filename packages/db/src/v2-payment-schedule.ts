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
  { at: string; kind: "extra" | "prior_extra"; variationId: string; pence: number; approvalId?: string };
/** K5A-2: a stage frozen when it became due. Without amountPence it is being frozen now and takes the replayed amount. */
export type FrozenStage = { index: number; at: string; countedApprovalIds: readonly string[]; amountPence?: number | undefined };

type Placed = { slot: number; frozenEvent: boolean; fact: ScheduleFact | { kind: "frozen"; at: string; index: number; amountPence?: number | undefined } };

/**
 * Order the facts. Frozen rows come first: each approval goes just before the first frozen row that counted it
 * (condition 2), and an approval no frozen row counted goes after every frozen due fact, whatever its created_at.
 * Only approvals no frozen row counts, and unfrozen due facts (date stages, or K5A rows from before 2046), use time.
 */
function orderFacts(facts: ScheduleFact[], frozen: FrozenStage[], now: string) {
  const rows = [...frozen].sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index);
  const frozenIndexes = new Set(rows.map(row => row.index));
  const placed: Placed[] = rows.map((row, slot) => ({ slot, frozenEvent: true,
    fact: { kind: "frozen", at: row.at, index: row.index, amountPence: row.amountPence } }));
  for (const fact of facts) {
    if (fact.at > now) continue;
    if (fact.kind === "due" && frozenIndexes.has(fact.index)) continue;
    let slot: number;
    if (fact.kind === "extra" && fact.approvalId) {
      const first = rows.findIndex(row => row.countedApprovalIds.includes(fact.approvalId!));
      slot = first >= 0 ? first : rows.length;
    } else {
      // Unfrozen facts fall between frozen rows by time.
      slot = rows.filter(row => row.at <= fact.at).length;
    }
    placed.push({ slot, frozenEvent: false, fact });
  }
  return placed.sort((a, b) => a.slot - b.slot || Number(a.frozenEvent) - Number(b.frozenEvent) ||
    a.fact.at.localeCompare(b.fact.at) || (a.fact.kind === b.fact.kind ? 0 : a.fact.kind === "due" ? -1 : 1))
    .map(item => item.fact);
}

/** Replay server facts in order. Due stages are fixed even if nobody opened the page; frozen stages keep their stored amount. */
export function replayPaymentSchedule(total: number, stages: PaymentStage[], facts: ScheduleFact[], now: string,
  frozen: FrozenStage[] = []) {
  const amounts = initialStageAmounts(total, stages);
  const due = stages.map(() => false);
  const variations = new Map<string, number>();
  const priorVariations = new Map<string, number>();
  let extras = 0;
  let unallocated = 0;
  // Share a change across the planned stages; an omission cannot reduce a stage already due.
  const share = (delta: number) => {
    const planned = amounts.map((_, index) => index).filter(index => !due[index]);
    const weight = planned.reduce((sum, index) => sum + amounts[index]!, 0);
    const target = money(weight + delta).pence;
    if (!planned.length || target < 0) { unallocated = money(unallocated + delta).pence; return; }
    let prefix = 0n;
    let assigned = 0;
    planned.forEach((index, position) => {
      prefix += BigInt(amounts[index]!);
      const cumulative = position === planned.length - 1 ? target : weight === 0 ? 0 :
        Number(multiplyRatio(BigInt(target), prefix, BigInt(weight), "half_even"));
      amounts[index] = cumulative - assigned;
      assigned = cumulative;
    });
  };
  for (const fact of orderFacts(facts, frozen, now)) {
    if (fact.kind === "due") { due[fact.index] = true; continue; }
    if (fact.kind === "frozen") {
      due[fact.index] = true;
      // The stored amount is final. Any difference stays in the job total through the remaining stages.
      if (fact.amountPence !== undefined && fact.amountPence !== amounts[fact.index]) {
        const difference = money(amounts[fact.index]! - fact.amountPence).pence;
        amounts[fact.index] = fact.amountPence;
        share(difference);
      }
      continue;
    }
    if (fact.kind === "prior_extra") { priorVariations.set(fact.variationId, fact.pence); continue; }
    const delta = money(fact.pence).pence - (variations.get(fact.variationId) ?? 0);
    variations.set(fact.variationId, fact.pence);
    extras = money(extras + delta).pence;
    share(delta);
  }
  const before = [...priorVariations.values()].reduce((sum, pence) => money(sum + pence).pence, 0);
  return { amounts, due, extrasBeforeSchedule: before, extrasSinceSchedule: extras, unscheduledExtras: unallocated };
}

export function projectPaymentSchedule(total: number, stages: PaymentStage[], facts: ScheduleFact[], now: string,
  frozen: FrozenStage[] = []) {
  const result = replayPaymentSchedule(total, stages, facts, now, frozen);
  const frozenIndexes = new Set(frozen.map(row => row.index));
  return { stages: stages.map((stage, index) => ({ ...stage, amount: pounds(result.amounts[index]!),
    status: result.due[index] ? "due" as const : "planned" as const, frozen: frozenIndexes.has(index) })),
  extrasBeforeSchedule: pounds(result.extrasBeforeSchedule),
  extrasSinceSchedule: pounds(result.extrasSinceSchedule), unscheduledExtras: pounds(result.unscheduledExtras) };
}
