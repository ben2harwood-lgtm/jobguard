import { z } from "zod";
import { formatRecoveryMessagePounds } from "@jobguard/core";

export const chaseCommand = z.discriminatedUnion("action", [
  z.object({ version: z.literal("v2-chase-command.v1"), commandId: z.guid(), expectedVersion: z.number().int().nonnegative(),
    action: z.literal("setting"), enabled: z.boolean() }).strict(),
  z.object({ version: z.literal("v2-chase-command.v1"), commandId: z.guid(), expectedVersion: z.number().int().nonnegative(),
    action: z.literal("stop"), itemId: z.guid(), kind: z.enum(["quote", "invoice"]),
    reason: z.enum(["builder_stop", "reply", "dispute"]) }).strict(),
  z.object({ version: z.literal("v2-chase-command.v1"), commandId: z.guid(), expectedVersion: z.number().int().nonnegative(),
    action: z.literal("run") }).strict(),
]);
export type ChaseCommand = z.infer<typeof chaseCommand>;
export interface ChaseItem {
  id: string; kind: "quote" | "invoice"; reference: string; amountPence: number;
  anchor: number; stoppedReason: string | null; recipient: string;
}
export function nextChase(item: ChaseItem, sent: readonly number[]) {
  if (item.stoppedReason || !Number.isSafeInteger(item.amountPence) || item.amountPence <= 0 ||
    item.amountPence > 1_000_000_000_000 || !Number.isSafeInteger(item.anchor) || item.anchor < 0) return null;
  const days = item.kind === "quote" ? [3, 7] : [3, 10];
  const step = days.findIndex((_, index) => !sent.includes(index + 1));
  return step < 0 ? null : { step: step + 1, due: new Date(item.anchor + days[step]! * 86_400_000).toISOString() };
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
