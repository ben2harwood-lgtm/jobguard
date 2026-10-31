import { z } from "zod";
import { countMeterDays, meterLifecycleInputV1 } from "./meter-lifecycle.js";
import { addWorkCalendarDays, londonMidnight } from "./job-work-timing.js";
import { computeSubscriptionPeriod } from "./subscription-period.js";
import { detectSubscriptionTrackReview } from "./subscription-track-review.js";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";

const bindingV1 = z.object({ tenantId: z.string().uuid(), runId: z.string().uuid() }).strict();
type Binding = z.infer<typeof bindingV1>;
type Plan = "Solo" | "Builder";
const pence = z.number().int().min(0).max(16900);
export const demoMeterPreviewV1 = z.object({
 version: z.literal("demo-meter-preview.v1"), tenantId: z.string().uuid(), runId: z.string().uuid(),
 hypothetical: z.literal(true), persistence: z.literal("run-bound-reference-projection"),
 clock: z.literal("london-midnight-stops.v1"),
 profiles: z.array(z.object({ id: z.string(), principalPence: z.number().int().min(0).max(82800),
  periods: z.array(z.object({ startDate: z.string(), endDateExclusive: z.string(), principalPence: pence,
   countedPlaces: z.array(z.number().int().min(0).max(17)).min(28).max(31),
   sourceJobIds: z.array(z.string().uuid()),
  }).strict()).min(1).max(12),
 }).strict()).length(10),
 crossings: z.array(z.object({ date: z.string(), committedPlaces: z.number().int().min(13).max(17),
  immediate: z.boolean(), trackReviewDue: z.boolean(), trackChanged: z.literal(false),
 }).strict()).length(5),
 unavailable: z.array(z.object({ step: z.string(), reason: z.string() }).strict()),
}).strict();
export type DemoMeterPreview = z.infer<typeof demoMeterPreviewV1>;

// Namespaced fictional source identities are reproducible from the owned, persisted run.
// They identify reference inputs, never existing commercial jobs or approvals.
function sourceId(runId: string, period: number, job: number, kind: number) {
 const suffix = (BigInt(`0x${runId.slice(24)}`) ^ BigInt(period * 10000 + job * 10 + kind)).toString(16).padStart(12, "0");
 return `${runId.slice(0, 24)}${suffix}`;
}
export function demoMeterJob(binding: Binding, period: number, job: number, startDate: string, endDateExclusive: string, from = 0, until?: number) {
 binding = bindingV1.parse(binding);
 const at = londonMidnight(addWorkCalendarDays(startDate, from));
 const jobId = sourceId(binding.runId, period, job, 1);
 const event = (kind: "first_site_evidence" | "site_activity", day: number, sequence: number) => ({
  version: "job-work-state-event.v1", id: sourceId(binding.runId, period, job, sequence + 4), jobId, sequence, kind,
  factAt: londonMidnight(addWorkCalendarDays(startDate, day)), recordedAt: londonMidnight(addWorkCalendarDays(startDate, day)),
  sourceReceiptId: sourceId(binding.runId, period, job + 100, sequence), commandId: null, predecessorId: null, closeReason: null, closeNote: null,
 });
 return meterLifecycleInputV1.parse({ version: "meter-lifecycle-input.v1", tenantId: binding.tenantId, jobId, sourceRevision: 1,
  activation: { id: sourceId(binding.runId, period, job, 2), at, termsId: sourceId(binding.runId, period, job, 3), termsRevision: 1,
   track: "small_builder", partyBindingId: sourceId(binding.runId, period, job, 4),
   customerId: sourceId(binding.runId, period, job + 200, 1), siteId: sourceId(binding.runId, period, job + 300, 1), small: false },
  events: [event("first_site_evidence", from, 1), ...(until === undefined ? [event("site_activity", 20, 2)] : [])],
  lock: until === undefined ? null : { id: sourceId(binding.runId, period, job, 8), at: londonMidnight(addWorkCalendarDays(startDate, until)) },
  trip: null, trial: { status: "unavailable" }, policy: { version: "meter-lifecycle-policy.v1", revision: "london-midnight-stops.v1", clockStatus: "approved" },
  asOf: londonMidnight(endDateExclusive), startDate, endDateExclusive,
 });
}

function profilePeriod(binding: Binding, period: number, start: string, end: string, places: number, plan: Plan,
 mode?: "half" | "upgrade" | "one-day" | "crossing") {
 const jobs = Array.from({ length: places }, (_, n) => demoMeterJob(binding, period, n + 1, start, end,
  mode === "half" && n === 7 ? 15 : mode === "crossing" && n >= 13 ? n - 12 : 0,
  mode === "one-day" && n === 7 ? 1 : undefined));
 const ledger = countMeterDays({ version: "meter-lifecycle-days-input.v1", plan, jobs });
 const result = computeSubscriptionPeriod({ version: "subscription-period-preview.v1", meter: {
  version: "meter-supplied-period.v1", environment: "synthetic_demo", policy: syntheticMeterPolicyV1,
  startDate: start, endDateExclusive: end,
  days: ledger.days.map((day, n) => ({ date: day.date, countedPlaces: day.countedPlaces,
   plan: mode === "upgrade" && n >= 10 ? "Builder" : plan, annualPrepaid: false, trial: false })),
 } });
 return { startDate: start, endDateExclusive: end, principalPence: result.principal.pence,
  countedPlaces: ledger.days.map(day => day.countedPlaces), sourceJobIds: jobs.map(job => job.jobId) };
}

/** Calls the existing MON-1 and MON-2A producers. No billing, settlement or admission is asserted. */
export function previewDemoMeter(raw: unknown): DemoMeterPreview {
 const binding = bindingV1.parse(raw);
 let period = 0;
 const annual = (id: string, places: number[], plan: Plan) => {
  const periods = places.map((count, month) => {
   const start = `2026-${String(month + 1).padStart(2, "0")}-01`;
   const end = month === 11 ? "2027-01-01" : `2026-${String(month + 2).padStart(2, "0")}-01`;
   return profilePeriod(binding, ++period, start, end, count, plan);
  });
  return { id, principalPence: periods.reduce((sum, item) => sum + item.principalPence, 0), periods };
 };
 const single = (id: string, count: number, plan: Plan, mode?: Parameters<typeof profilePeriod>[6]) => {
  const item = profilePeriod(binding, ++period, mode === "one-day" ? "2026-03-01" : "2026-04-01",
   mode === "one-day" ? "2026-04-01" : "2026-05-01", count, plan, mode);
  return { id, principalPence: item.principalPence, periods: [item] };
 };
 const profiles = [annual("DM-01", [1,1,1,2,2,2,2,2,2,3,3,4], "Solo"),
  annual("DM-02", [3,4,4,4,4,5,5,5,5,6,6,7], "Builder"),
  single("DM-03", 8, "Builder"), single("DM-04", 8, "Builder", "half"), single("DM-05", 12, "Builder"),
  single("DM-06", 5, "Solo"), single("DM-07", 6, "Solo"), single("DM-08", 6, "Solo", "upgrade"),
  single("DM-09", 8, "Builder", "one-day"), single("DM-10", 17, "Builder", "crossing")];
 const crossings = profiles[9]!.periods[0]!.countedPlaces.slice(0, 5).map((committedPlaces, n) => {
  const result = detectSubscriptionTrackReview({ version: "subscription-track-review-input.v1", plan: "Builder", committedPlaces, periods: [] });
  return { date: addWorkCalendarDays("2026-04-01", n), committedPlaces, immediate: result.immediate,
   trackReviewDue: result.trackReviewDue, trackChanged: false as const };
 });
 return demoMeterPreviewV1.parse({ version: "demo-meter-preview.v1", ...binding, hypothetical: true,
  persistence: "run-bound-reference-projection", clock: "london-midnight-stops.v1", profiles, crossings,
  unavailable: [{ step: "MON-3 trial prelude", reason: "Not ready yet: the trial producer is not on main." },
   { step: "Persisted admissions, statements and simulated settlement", reason: "Not ready yet: isolated run-to-company execution and reference-period command bindings are unavailable. These are producer previews, not issued or settled bills." },
   { step: "DM-11–DM-13", reason: "Not ready yet: sustained-use, lifecycle attack and concurrent admission journeys are not connected to this run." }],
 });
}
