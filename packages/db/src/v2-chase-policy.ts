import { z } from "zod";
import { formatRecoveryMessagePounds } from "@jobguard/core";

export const chaseCommand = z.discriminatedUnion("action", [
  z.object({ version: z.literal("v2-chase-command.v1"), commandId: z.guid(), expectedVersion: z.number().int().nonnegative(),
    action: z.literal("setting"), enabled: z.boolean() }).strict(),
  z.object({ version: z.literal("v2-chase-command.v1"), commandId: z.guid(), expectedVersion: z.number().int().nonnegative(),
    action: z.literal("stop"), itemId: z.guid(), kind: z.enum(["quote", "invoice"]),
    reason: z.enum(["builder_stop", "reply", "dispute", "decision"]) }).strict(),
  z.object({ version: z.literal("v2-chase-command.v1"), commandId: z.guid(), expectedVersion: z.number().int().nonnegative(),
    action: z.literal("run") }).strict(),
]);
export type ChaseCommand = z.infer<typeof chaseCommand>;
export interface ChaseItem {
  id: string; kind: "quote" | "invoice"; reference: string; amountPence: number;
  anchor: number; stoppedReason: string | null; recipient: string;
}
const dayMs = 86_400_000;
type ChaseStep = { step: number; due: string };

export function chaseSchedule(item: ChaseItem, recordedSteps: readonly number[], now: number) {
  const result: { next: ChaseStep | null; skipped: ChaseStep[] } = { next: null, skipped: [] };
  if (item.stoppedReason || !Number.isSafeInteger(item.amountPence) || item.amountPence <= 0 ||
    item.amountPence > 1_000_000_000_000 || !Number.isSafeInteger(item.anchor) || item.anchor < 0 ||
    !Number.isSafeInteger(now) || now < 0) return result;

  const days = item.kind === "quote" ? [3, 7] : [3, 10];
  const dates = days.map(day => new Date(item.anchor + day * dayMs));
  if (dates.some(date => !Number.isFinite(date.getTime()))) return result;

  // The two dates are further apart than the inclusive two-day send window.
  // A later terminal step also prevents an earlier send after a clock rollback.
  for (const [index, date] of dates.entries()) {
    const step = index + 1;
    if (recordedSteps.includes(step)) continue;
    const entry = { step, due: date.toISOString() };
    const hasLaterRecord = recordedSteps.some(recorded => recorded > step);
    if (now - date.getTime() > 2 * dayMs || (hasLaterRecord && now >= date.getTime())) {
      result.skipped.push(entry);
    } else if (!hasLaterRecord && !result.next) {
      result.next = entry;
    }
  }
  return result;
}
export function chaseMessage(firm: string, item: ChaseItem) {
  const amount = formatRecoveryMessagePounds(item.amountPence);
  return item.kind === "quote"
    ? `${firm}: Just checking whether you have had a chance to look at quote ${item.reference} for £${amount}. Please let us know if you have any questions. Thank you.`
    : `${firm}: A polite reminder that invoice ${item.reference} has £${amount} outstanding. Please let us know if you have already paid or have any questions. Thank you.`;
}
export class V2ChaseError extends Error {
  constructor(readonly code: "CHASE_DARK" | "CHASE_INVALID" | "CHASE_CONFLICT" | "CHASE_UNAVAILABLE") { super(code); }
}
export function requireV2Chasing() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new V2ChaseError("CHASE_DARK");
}
