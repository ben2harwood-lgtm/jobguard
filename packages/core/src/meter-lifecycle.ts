import { z } from "zod";
import { jobWorkStateEventV1, orderWorkFacts, projectWorkFacts, workFactTimeV1 } from "./job-work-state.js";
import { computeSmallPlaceAllowance, groupSuppliedMeterPlaces, londonMeterDate, londonMeterDateV1, meterDay31Candidate } from "./jobs-on-the-go.js";
import { addWorkCalendarDays, londonMidnight, londonWorkDate } from "./job-work-timing.js";

const uuid = z.string().uuid().transform(value => value.toLowerCase());
// Normalize locally before CH-4 replay compares identities and canonical content.
const eventV1 = jobWorkStateEventV1.transform(event => ({ ...event,
  id: event.id.toLowerCase(), jobId: event.jobId.toLowerCase(),
  sourceReceiptId: event.sourceReceiptId?.toLowerCase() ?? null,
  commandId: event.commandId?.toLowerCase() ?? null, predecessorId: event.predecessorId?.toLowerCase() ?? null,
}));
const revision = z.number().int().positive().safe();
const time = workFactTimeV1.refine(value => !value.startsWith("0000-"));
const source = z.object({ id: uuid, at: time }).strict();
/** This revision describes only specified foundation facts. It is never clock approval. */
export const meterLifecycleInputV1 = z.object({
  version: z.literal("meter-lifecycle-input.v1"), tenantId: uuid, jobId: uuid, sourceRevision: revision,
  activation: z.object({ id: uuid, at: time, termsId: uuid, termsRevision: revision,
    track: z.literal("small_builder"), partyBindingId: uuid, customerId: uuid, siteId: uuid, small: z.boolean() }).strict(),
  events: z.array(eventV1), lock: source.nullable(), trip: source.nullable(),
  // Authoritative trial facts need the separately accepted lifecycle contract; no Boolean fallback.
  trial: z.object({ status: z.literal("unavailable") }).strict(),
  policy: z.union([
    z.object({ version: z.literal("meter-lifecycle-policy.v1"), revision: z.literal("specified-foundation.v1"), clockStatus: z.literal("held") }).strict(),
    // Ben, 28 Oct 2026 (meter card): each 7/30-day stop falls at 00:00 Europe/London at the start of the day that many
    // days after the trigger's London date; a midnight stop does not touch the new day; same-instant ties count as stopped.
    z.object({ version: z.literal("meter-lifecycle-policy.v1"), revision: z.literal("london-midnight-stops.v1"), clockStatus: z.literal("approved") }).strict(),
  ]),
  asOf: time, startDate: londonMeterDateV1, endDateExclusive: londonMeterDateV1,
}).strict().superRefine((input, ctx) => {
  const invalid = () => ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid lifecycle binding" });
  if (input.startDate >= input.endDateExclusive || input.asOf < input.activation.at) invalid();
  if (input.events.some(event => event.jobId !== input.jobId || event.factAt < input.activation.at || event.recordedAt < event.factAt)) invalid();
  if ([input.lock, input.trip].some(fact => fact !== null && fact.at < input.activation.at)) invalid();
  // Identity namespaces may not alias one another. Identical event replay is handled by orderWorkFacts.
  const ids = [input.activation.id, input.activation.termsId, input.activation.partyBindingId, ...new Set(input.events.map(e => e.id)),
    ...(input.lock ? [input.lock.id] : []), ...(input.trip ? [input.trip.id] : [])];
  if (new Set(ids).size !== ids.length) invalid();
  if (input.lock && input.trip && input.trip.at >= input.lock.at) invalid();
});
type Input = z.infer<typeof meterLifecycleInputV1>;
export class MeterLifecycleError extends Error {
  constructor(readonly code: "INVALID_METER_LIFECYCLE_INPUT") { super(code); this.name = "MeterLifecycleError"; }
}
function parse<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new MeterLifecycleError("INVALID_METER_LIFECYCLE_INPUT");
  return result.data;
}
type Boundary = { at: string; cause: "day31" | "first_site_evidence" | "closed" | "lock"; sourceIds: string[] };
type Event = ReturnType<typeof orderWorkFacts>[number];
export type MeterInterval = { start: string; startCause: "day31" | "first_site_evidence" | "restart"; end: string | null;
  endCause: "lock" | "closed" | "finished_plus_7" | "quiet_30" | null };
const stopAt = (originAt: string, days: number) => londonMidnight(addWorkCalendarDays(londonWorkDate(originAt), days));
/**
 * BUILD_PLAN 10.1.5 counting intervals for one job, from its own commands and server times only.
 * Start: first site evidence, or 00:00 London on day 31. Stop: lock; closing; 00:00 London 7 days after the
 * "Finished on site" date (cancelled by site activity or explicitly); 00:00 London 30 days after the last site activity
 * (or the start). Site activity restarts a job stopped before lock; a closed job needs reopening first; a locked job never
 * restarts. At one instant a stop wins over a start. Facts at or after the lock are ignored here (they belong to a linked job).
 */
function countIntervals(input: Input, events: Event[], day31At: string): MeterInterval[] {
  const lockAt = input.lock && input.lock.at <= input.asOf ? input.lock.at : null;
  const out: MeterInterval[] = [];
  let state = "pre" as "pre" | "counting" | "stopped" | "closed", cur = null as MeterInterval | null;
  const is = (value: typeof state) => state === value;
  let anchor: string | null = null, finishedAt: string | null = null, lastStop: string | null = null, day31Done = false;
  const begin = (t: string, cause: MeterInterval["startCause"]) => {
    if (lastStop !== null && t <= lastStop) return; // same instant as a stop: counts as stopped
    cur = { start: t, startCause: cause, end: null, endCause: null }; anchor = t; finishedAt = null; state = "counting";
  };
  const end = (t: string, cause: NonNullable<MeterInterval["endCause"]>, next: "stopped" | "closed") => {
    if (cur && t > cur.start) out.push({ ...cur, end: t, endCause: cause });
    cur = null; lastStop = lastStop !== null && lastStop > t ? lastStop : t; state = next;
  };
  const deadline = (): { at: string; apply: () => void } | null => {
    const due: { at: string; stop: boolean; apply: () => void }[] = [];
    if (state === "pre" && !day31Done) due.push({ at: day31At, stop: false, apply: () => { day31Done = true; begin(day31At, "day31"); } });
    if (state === "pre" && finishedAt) { const at = stopAt(finishedAt, 7); due.push({ at, stop: true, apply: () => { finishedAt = null; day31Done = true; lastStop = at; state = "stopped"; } }); }
    if (state === "counting") {
      const quiet = stopAt(anchor!, 30); due.push({ at: quiet, stop: true, apply: () => end(quiet, "quiet_30", "stopped") });
      if (finishedAt) { const at = stopAt(finishedAt, 7); due.push({ at, stop: true, apply: () => end(at, "finished_plus_7", "stopped") }); }
    }
    due.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : Number(b.stop) - Number(a.stop));
    return due[0] ?? null;
  };
  const visible = events.filter(e => e.factAt <= input.asOf && e.recordedAt <= input.asOf && (lockAt === null || e.factAt < lockAt));
  for (let i = 0; ;) {
    const next = visible[i], fixed = [next?.factAt, lockAt, input.asOf].filter((v): v is string => v != null).sort()[0]!;
    const due = deadline();
    if (due && due.at <= fixed) { due.apply(); continue; }
    if (!next || fixed < next.factAt) break;
    i++;
    const t = next.factAt;
    if (next.kind === "first_site_evidence" || next.kind === "site_activity" || next.kind === "resumed") {
      if (is("pre") && next.kind === "first_site_evidence") begin(t, "first_site_evidence");
      else if (is("counting")) { anchor = t; finishedAt = null; }
      else if (is("stopped")) begin(t, "restart");
    } else if (next.kind === "finished_on_site") { if (is("pre") || is("counting")) finishedAt = t; }
    else if (next.kind === "finished_cancelled") finishedAt = null;
    else if (next.kind === "closed") { end(t, "closed", "closed"); finishedAt = null; }
    else if (next.kind === "reopened" && is("closed")) state = "stopped";
  }
  if (lockAt !== null) end(lockAt, "lock", "closed");
  if (cur) out.push(cur);
  return out;
}
/** London dates an interval touches; a stop exactly at London midnight does not touch the new day. */
function touchedDates(interval: MeterInterval, asOf: string): [string, string] {
  const first = londonWorkDate(interval.start), endAt = interval.end ?? asOf, endDate = londonWorkDate(endAt);
  const last = interval.end !== null && londonMidnight(endDate) === endAt ? addWorkCalendarDays(endDate, -1) : endDate;
  return [first, last];
}
function earliest(values: Boundary[]): Boundary | null {
  values.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : 0);
  const first = values[0];
  return first ? { ...first, sourceIds: [...new Set(values.filter(v => v.at === first.at).flatMap(v => v.sourceIds))].sort() } : null;
}
function project(input: Input) {
  const events = orderWorkFacts(input.events);
  // Validate predecessor relationships too; ordering alone does not validate cancellation/reopening.
  projectWorkFacts(events, input.lock ? { id: input.lock.id, lockedAt: input.lock.at } : null);
  const visible = events.filter(event => event.factAt <= input.asOf && event.recordedAt <= input.asOf);
  const candidate = meterDay31Candidate(input.activation.at);
  const stops: Boundary[] = visible.filter(event => event.kind === "closed").map(event => ({ at: event.factAt, cause: "closed", sourceIds: [event.id] }));
  if (input.lock && input.lock.at <= input.asOf) stops.push({ at: input.lock.at, cause: "lock", sourceIds: [input.lock.id] });
  const stop = earliest(stops);
  const starts: Boundary[] = visible.filter(event => event.kind === "first_site_evidence" && (!stop || event.factAt < stop.at))
    .map(event => ({ at: event.factAt, cause: "first_site_evidence", sourceIds: [event.id] }));
  if (candidate.at <= input.asOf && (!stop || candidate.at < stop.at)) starts.push({ at: candidate.at, cause: "day31", sourceIds: [input.activation.id] });
  const approved = input.policy.clockStatus === "approved";
  const holds = approved ? [] : ["H-METER-CLOCK"];
  if (input.lock && visible.some(event => ["site_activity", "first_site_evidence", "resumed", "reopened"].includes(event.kind) && event.factAt >= input.lock!.at)) holds.push("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  if (!approved && visible.some(event => ["reopened", "resumed", "finished_cancelled"].includes(event.kind))) holds.push("H-CH4");
  const sourceRefs = [
    { kind: "activation", id: input.activation.id, at: input.activation.at },
    { kind: "terms", id: input.activation.termsId, revision: input.activation.termsRevision },
    { kind: "party_binding", id: input.activation.partyBindingId },
    ...events.map(event => ({ kind: event.kind, id: event.id, at: event.factAt, recordedAt: event.recordedAt })),
    ...(input.lock ? [{ kind: "lock", ...input.lock }] : []), ...(input.trip ? [{ kind: "trip", ...input.trip }] : []),
  ];
  return { version: "meter-job-timeline.v1" as const, tenantId: input.tenantId, jobId: input.jobId, sourceRevision: input.sourceRevision,
    policy: input.policy, asOf: input.asOf, status: approved ? "counted" as const : "held" as const, holds: holds.sort(),
    start: earliest(starts), stop, day31Candidate: candidate, events, sourceRefs,
    // Not an admission result: quiet/finish/resume and current runtime authority remain unresolved.
    commitment: { status: stop ? "stopped_candidate" as const : "candidate" as const, sourceIds: stop ? stop.sourceIds : [input.activation.id] },
    intervals: approved ? countIntervals(input, events, candidate.at) : [] as MeterInterval[], trial: input.trial };
}
/** Caller supplies all known facts. Source references describe identity, never prove authority. */
export function projectMeterJobTimeline(raw: unknown): MeterJobTimelineV1 {
  return project(parse(meterLifecycleInputV1, raw));
}
export type MeterJobTimelineV1 = ReturnType<typeof project>;
const daysInput = z.object({ version: z.literal("meter-lifecycle-days-input.v1"), plan: z.enum(["Solo", "Builder"]),
  jobs: z.array(meterLifecycleInputV1).min(1) }).strict().superRefine((input, ctx) => {
  const first = input.jobs[0]!;
  if (new Set(input.jobs.map(job => job.jobId.toLowerCase())).size !== input.jobs.length || input.jobs.some(job =>
    job.tenantId !== first.tenantId || job.startDate !== first.startDate || job.endDateExclusive !== first.endDateExclusive || job.asOf !== first.asOf)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "One tenant, cutoff and date range required" });
  }
});
/** Candidate classification/grouping is exposed separately from unavailable counted membership. */
export function projectMeterDays(raw: unknown): MeterLifecycleDaysV1 {
  const input = parse(daysInput, raw);
  if (input.jobs.some(job => job.policy.clockStatus !== "held")) throw new MeterLifecycleError("INVALID_METER_LIFECYCLE_INPUT");
  const jobs = [...input.jobs].sort((a, b) => a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0);
  const timelines = jobs.map(project);
  const first = jobs[0]!;
  const days = [];
  for (let date = first.startDate; date < first.endDateExclusive;) {
    const classifications = jobs.map(job => ({ tenantId: job.tenantId, jobId: job.jobId,
      customerId: job.activation.customerId, siteId: job.activation.siteId,
      small: job.activation.small && !(job.trip && job.trip.at <= job.asOf && londonMeterDate(job.trip.at) <= date) }));
    // All supplied jobs grouped for diagnostics only. No assertion they count on this date.
    const candidatePlaces = groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date, jobs: classifications }).places;
    days.push({ date, status: "held" as const, holds: ["H-METER-CLOCK"], places: null, countedPlaces: null,
      classifications, candidatePlaces, candidateAllowance: { version: "meter-small-allowance-result.v1" as const, rawPlaces: null, freeSmallPlaces: null, countedPlaces: null } });
    const calendar = new Date(`${date}T00:00:00.000Z`);
    calendar.setUTCDate(calendar.getUTCDate() + 1);
    date = calendar.toISOString().slice(0, 10);
  }
  return { version: "meter-lifecycle-days.v1", tenantId: first.tenantId, startDate: first.startDate,
    endDateExclusive: first.endDateExclusive, asOf: first.asOf, status: "held", timelines, days };
}
export type MeterLifecycleDaysV1 = {
  version: "meter-lifecycle-days.v1"; tenantId: string; startDate: string; endDateExclusive: string; asOf: string; status: "held";
  timelines: MeterJobTimelineV1[];
  days: { date: string; status: "held"; holds: string[]; places: null; countedPlaces: null;
    classifications: { tenantId: string; jobId: string; customerId: string; siteId: string; small: boolean }[];
    candidatePlaces: ReturnType<typeof groupSuppliedMeterPlaces>["places"];
    candidateAllowance: { version: "meter-small-allowance-result.v1"; rawPlaces: null; freeSmallPlaces: null; countedPlaces: null } }[];
};

/**
 * BUILD_PLAN 10.1.5/10.1.6 under the approved clock: on each London date, the jobs whose counting interval touches it,
 * grouped into places (same customer and site is one place, small only if every job in it is small, the trip making a
 * job non-small from its London date), less the free small places allowed by the plan (4 on Solo, 7 on Builder).
 */
export function countMeterDays(raw: unknown): MeterCountedDaysV1 {
  const input = parse(daysInput, raw);
  if (input.jobs.some(job => job.policy.clockStatus !== "approved")) throw new MeterLifecycleError("INVALID_METER_LIFECYCLE_INPUT");
  const jobs = [...input.jobs].sort((a, b) => a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0);
  const timelines = jobs.map(project), first = jobs[0]!;
  const touched = timelines.map(t => t.intervals.map(interval => touchedDates(interval, first.asOf)));
  const days: MeterCountedDaysV1["days"] = [];
  for (let date = first.startDate; date < first.endDateExclusive; date = addWorkCalendarDays(date, 1)) {
    const counting = jobs.filter((_, i) => touched[i]!.some(([from, to]) => from <= date && date <= to));
    const classifications = counting.map(job => ({ tenantId: job.tenantId, jobId: job.jobId, customerId: job.activation.customerId, siteId: job.activation.siteId,
      small: job.activation.small && !(job.trip && job.trip.at <= job.asOf && londonMeterDate(job.trip.at) <= date) }));
    const places = groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date, jobs: classifications }).places;
    const allowance = computeSmallPlaceAllowance({ version: "meter-small-allowance.v1", plan: input.plan,
      rawPlaces: places.length, smallPlaces: places.filter(place => place.small).length });
    days.push({ date, places, rawPlaces: allowance.rawPlaces, freeSmallPlaces: allowance.freeSmallPlaces, countedPlaces: allowance.countedPlaces });
  }
  return { version: "meter-counted-days.v1", tenantId: first.tenantId, plan: input.plan, startDate: first.startDate,
    endDateExclusive: first.endDateExclusive, asOf: first.asOf, timelines, days };
}
export type MeterCountedDaysV1 = {
  version: "meter-counted-days.v1"; tenantId: string; plan: "Solo" | "Builder"; startDate: string; endDateExclusive: string; asOf: string;
  timelines: MeterJobTimelineV1[];
  days: { date: string; places: ReturnType<typeof groupSuppliedMeterPlaces>["places"]; rawPlaces: number; freeSmallPlaces: number; countedPlaces: number }[];
};
