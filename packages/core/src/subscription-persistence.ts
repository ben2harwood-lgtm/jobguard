import { z } from "zod";
import { londonMeterDateV1 } from "./jobs-on-the-go.js";
import { parseSubscription, subscriptionPlanV1, SubscriptionError } from "./subscription.js";

export const subscriptionCalendarRequestV1 = z.object({
  anchorDay: z.number().int().min(1).max(31),
  startMonth: z.string().regex(/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/u),
}).strict();

/** Each boundary clamps the ORIGINAL anchor independently. Dates denote London civil days;
 * UTC is used solely as a Gregorian calendar calculator, never to count elapsed local hours. */
export function subscriptionCalendarPeriod(raw: unknown) {
  const input = parseSubscription(subscriptionCalendarRequestV1, raw);
  const [year, month] = input.startMonth.split("-").map(Number) as [number, number];
  if (year === 9999 && month === 12) throw new SubscriptionError("INVALID_SUBSCRIPTION_INPUT");
  function boundary(y: number, m: number) {
    const first = new Date("2000-01-01T00:00:00.000Z");
    first.setUTCFullYear(y, m, 0);
    const day = Math.min(input.anchorDay, first.getUTCDate());
    return londonMeterDateV1.parse(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  const startDate = boundary(year, month);
  const endDateExclusive = boundary(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const dates: string[] = [];
  while (cursor.toISOString().slice(0, 10) < endDateExclusive) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { startDate, endDateExclusive, dates };
}

export const subscriptionEffectiveRevisionV1 = z.object({
  revision: z.number().int().safe().positive(), effectiveDate: londonMeterDateV1, plan: subscriptionPlanV1,
}).strict().readonly();
export const subscriptionEffectivePlanRequestV1 = z.object({
  date: londonMeterDateV1, revisions: z.array(subscriptionEffectiveRevisionV1).min(1),
}).strict().refine(v => new Set(v.revisions.map(r => r.revision)).size === v.revisions.length);

/** Input is accepted AND applied revisions, loaded under current company authority.
 * Pending intents must never be passed here. This helper itself grants no authority. */
export function effectiveSubscriptionPlan(raw: unknown) {
  const input = parseSubscription(subscriptionEffectivePlanRequestV1, raw);
  const effective = input.revisions.filter(r => r.effectiveDate <= input.date)
    .sort((a, b) => a.effectiveDate < b.effectiveDate ? 1 : a.effectiveDate > b.effectiveDate ? -1 : b.revision - a.revision)[0];
  if (!effective) throw new SubscriptionError("INVALID_SUBSCRIPTION_INPUT");
  return effective;
}

export const subscriptionExecutionCadenceV1 = z.object({
  cadence: z.enum(["monthly", "annual"]), annualEnabled: z.literal(false),
}).strict();
export function assertMonthlySubscriptionExecution(raw: unknown): void {
  const input = parseSubscription(subscriptionExecutionCadenceV1, raw);
  if (input.cadence !== "monthly") throw new SubscriptionError("ANNUAL_SUBSCRIPTION_UNAVAILABLE");
}
