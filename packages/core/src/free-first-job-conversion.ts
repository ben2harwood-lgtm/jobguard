import { z } from "zod";
import { trialEndInputV1, reduceTrialEndsV1 } from "./free-first-job-calendar.js";
import { addWorkCalendarDays } from "./job-work-timing.js";
import { subscriptionCalendarPeriod } from "./subscription-persistence.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
 const parsed = new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const london = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
function londonDate(at: string): string {
 const parts = london.formatToParts(new Date(at));
 return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}
export const trialConversionInputV1 = z.object({
 version: z.literal("trial-conversion-input.v1"), environment: z.literal("synthetic_demo"),
 sourceId: z.uuid(), timeline: trialEndInputV1,
 periodStart: date, periodEndExclusive: date, anchorDay: z.number().int().min(1).max(31),
 // These are checked persisted agreement facts; never browser choices.
 terms: z.array(z.object({ id: z.uuid(), revision: z.number().int().positive(), effectiveDate: date,
  plan: z.enum(["Solo", "Builder"]), cadence: z.literal("monthly") }).strict()).min(1),
}).strict().readonly();
export type TrialConversionInputV1 = z.infer<typeof trialConversionInputV1>;

/** Server source projection only. Keeps the original billing anchor and existing money calculator.
 * Lock/close gives the builder the whole end day free. A second activation starts that day;
 * an expired deadline starts on its London midnight. No early or retrospective collection.
 */
export function trialPeriodAuthority(raw: TrialConversionInputV1) {
 const input = trialConversionInputV1.parse(raw);
 const period = subscriptionCalendarPeriod({ anchorDay: input.anchorDay, startMonth: input.periodStart.slice(0, 7) });
 if (period.startDate !== input.periodStart || period.endDateExclusive !== input.periodEndExclusive)
  throw new Error("TRIAL_PERIOD_BOUNDARY_MISMATCH");
 const end = reduceTrialEndsV1(input.timeline);
 const second = input.timeline.events.filter(event => end.sourceIds.includes(event.sourceId) && event.kind === "second_activation");
 let conversionDate: string | null = null;
 if (end.endedAt !== null) {
  conversionDate = londonDate(end.endedAt);
  if (!end.deadlineReachedAtEnd && second.length === 0) conversionDate = addWorkCalendarDays(conversionDate, 1);
 }
 const revisions = new Set<number>();
 for (const terms of input.terms) {
  if (revisions.has(terms.revision)) throw new Error("TRIAL_TERMS_CONFLICT");
  revisions.add(terms.revision);
 }
 const terms = [...input.terms].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.revision - b.revision);
 if (input.periodEndExclusive <= londonDate(input.timeline.startedAt)) throw new Error("TRIAL_PRE_START_PERIOD_UNAVAILABLE");
 const days = period.dates.map(day => {
  const agreement = terms.filter(term => term.effectiveDate <= day).at(-1) ?? (day < londonDate(input.timeline.startedAt) ? terms[0] : undefined);
  if (!agreement) throw new Error("TRIAL_TERMS_UNAVAILABLE");
  // Pre-start dates in the initial unissued stub are free; prior issued periods are not rewritten.
  // A current read cannot authorize charges for unobserved future dates.
  if (day > londonDate(input.timeline.asOf)) throw new Error("TRIAL_FUTURE_PERIOD_UNAVAILABLE");
  return Object.freeze({ date: day, plan: agreement.plan, agreementId: agreement.id,
   agreementRevision: agreement.revision, trial: conversionDate === null || day < conversionDate, annualPrepaid: false as const });
 });
 return Object.freeze({ version: "trial-period-authority.v1" as const, environment: "synthetic_demo" as const,
  hypothetical: true as const, sourceId: input.sourceId, trialId: end.trialId, tenantId: end.tenantId,
  periodStart: input.periodStart, periodEndExclusive: input.periodEndExclusive, conversionDate,
  endSourceIds: end.sourceIds, days: Object.freeze(days), realExternalActions: 0 as const });
}
