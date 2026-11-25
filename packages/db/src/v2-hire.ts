import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const hireTaskV1 = z.strictObject({ quoteRevisionId: uuid, scopeItemId: uuid,
  templateTaskKey: z.string().min(1).max(100) });
export const hireDetailsV1 = z.strictObject({
  kind: z.enum(["scaffold", "skip", "plant", "other"]),
  supplier: z.string().trim().min(1).max(200),
  bookedFrom: z.iso.date(),
  weeklyCost: z.string().regex(/^(0|[1-9][0-9]{0,8})\.[0-9]{2}$/u),
  neededUntil: z.iso.date().nullable(),
}).refine(value => value.neededUntil === null || value.neededUntil >= value.bookedFrom);
export const hireCommandV1 = z.strictObject({
  version: z.literal("hire-command.v1"), commandId: uuid, hireId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  action: z.enum(["add", "edit", "link", "request_off_hire", "off_hire"]),
  details: hireDetailsV1.optional(), tasks: z.array(hireTaskV1).max(100).optional(),
}).superRefine((value, ctx) => {
  const details = value.action === "add" || value.action === "edit";
  const links = value.action === "link";
  if (details !== (value.details !== undefined) || links !== (value.tasks !== undefined) ||
      (value.action === "add" && value.expectedVersion !== 0)) {
    ctx.addIssue({ code: "custom", message: "Fields do not match hire action" });
  }
  if (value.tasks && new Set(value.tasks.map(task => JSON.stringify(task))).size !== value.tasks.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate task link" });
  }
});
export type HireCommand = z.infer<typeof hireCommandV1>;
export type HireTask = z.infer<typeof hireTaskV1>;
export type HireState = z.infer<typeof hireDetailsV1> & {
  tasks: HireTask[]; status: "on_hire" | "off_hire_requested" | "off_hire"; offHireDate: string | null;
};
export type HireItem = HireState & { hireId: string; itemVersion: number;
  actorMembershipId: string; recordedAt: string; reminder: boolean; neededAfter: string | null; approximateCost: string };
export class HireError extends Error {
  constructor(readonly code: "HIRE_INVALID" | "HIRE_VERSION_CONFLICT" | "HIRE_COMMAND_CONFLICT" |
    "HIRE_EDITOR_REQUIRED" | "HIRE_TASK_NOT_FOUND" | "HIRE_NOT_FOUND") { super(code); }
}

/** Date-only, London calendar days. An undated or missing linked task never fires. */
export function hireNeededAfter(item: HireState, dates: (string | null)[], today: string): string | null {
  if (item.status !== "on_hire") return null;
  if (item.neededUntil !== null && item.neededUntil < today) return item.neededUntil;
  if (!item.tasks.length || dates.length !== item.tasks.length || dates.some(date => date === null || date >= today)) return null;
  return dates.reduce<string>((last, date) => date! > last ? date! : last, "");
}
export function londonHireDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** Elapsed calendar days, prorated weekly, rounded once half-even to pence. Estimate, not supplier billing. */
export function approximateHireCost(item: HireState, today: string): string {
  const end = item.offHireDate ?? today;
  const days = Math.max(0, Math.floor((Date.parse(end) - Date.parse(item.bookedFrom)) / 86_400_000));
  const numerator = BigInt(item.weeklyCost.replace(".", "")) * BigInt(days);
  let pence = numerator / 7n;
  const rest = numerator % 7n;
  if (rest * 2n > 7n || (rest * 2n === 7n && pence % 2n !== 0n)) pence++;
  return `${pence / 100n}.${String(pence % 100n).padStart(2, "0")}`;
}
