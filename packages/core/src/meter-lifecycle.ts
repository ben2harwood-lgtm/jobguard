import { z } from "zod";
import { jobWorkStateEventV1, orderWorkFacts, projectWorkFacts, workFactTimeV1 } from "./job-work-state.js";
import { computeSmallPlaceAllowance, groupSuppliedMeterPlaces, londonMeterDate, londonMeterDateV1, meterDay31Candidate } from "./jobs-on-the-go.js";

const uuid = z.string().uuid();
const revision = z.number().int().positive().safe();
const time = workFactTimeV1.refine(value => !value.startsWith("0000-"));
const source = z.object({ id: uuid, at: time }).strict();
/** This revision describes only specified foundation facts. It is never clock approval. */
export const meterLifecycleInputV1 = z.object({
  version: z.literal("meter-lifecycle-input.v1"), tenantId: uuid, jobId: uuid, sourceRevision: revision,
  activation: z.object({ id: uuid, at: time, termsId: uuid, termsRevision: revision,
    track: z.literal("small_builder"), partyBindingId: uuid, customerId: uuid, siteId: uuid, small: z.boolean() }).strict(),
  events: z.array(jobWorkStateEventV1), lock: source.nullable(), trip: source.nullable(),
  // Authoritative trial facts need the separately accepted lifecycle contract; no Boolean fallback.
  trial: z.object({ status: z.literal("unavailable") }).strict(),
  policy: z.object({ version: z.literal("meter-lifecycle-policy.v1"), revision: z.literal("specified-foundation.v1"), clockStatus: z.literal("held") }).strict(),
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
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new MeterLifecycleError("INVALID_METER_LIFECYCLE_INPUT");
  return result.data;
}
type Boundary = { at: string; cause: "day31" | "first_site_evidence" | "closed" | "lock"; sourceIds: string[] };
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
  const holds = ["H-METER-CLOCK"];
  if (input.lock && visible.some(event => ["site_activity", "first_site_evidence", "resumed", "reopened"].includes(event.kind) && event.factAt >= input.lock!.at)) holds.push("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  if (visible.some(event => ["reopened", "resumed", "finished_cancelled"].includes(event.kind))) holds.push("H-CH4");
  const sourceRefs = [
    { kind: "activation", id: input.activation.id, at: input.activation.at },
    { kind: "terms", id: input.activation.termsId, revision: input.activation.termsRevision },
    { kind: "party_binding", id: input.activation.partyBindingId },
    ...events.map(event => ({ kind: event.kind, id: event.id, at: event.factAt, recordedAt: event.recordedAt })),
    ...(input.lock ? [{ kind: "lock", ...input.lock }] : []), ...(input.trip ? [{ kind: "trip", ...input.trip }] : []),
  ];
  return { version: "meter-job-timeline.v1" as const, tenantId: input.tenantId, jobId: input.jobId, sourceRevision: input.sourceRevision,
    policy: input.policy, asOf: input.asOf, status: "held" as const, holds: holds.sort(),
    start: earliest(starts), stop, day31Candidate: candidate, events, sourceRefs,
    // Not an admission result: quiet/finish/resume and current runtime authority remain unresolved.
    commitment: { status: stop ? "stopped_candidate" as const : "candidate" as const, sourceIds: stop ? stop.sourceIds : [input.activation.id] },
    intervals: [] as never[], trial: input.trial };
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
    const candidateAllowance = computeSmallPlaceAllowance({ version: "meter-small-allowance.v1", plan: input.plan,
      rawPlaces: candidatePlaces.length, smallPlaces: candidatePlaces.filter(place => place.small).length });
    days.push({ date, status: "held" as const, holds: ["H-METER-CLOCK"], places: null, countedPlaces: null,
      classifications, candidatePlaces, candidateAllowance });
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
    candidateAllowance: ReturnType<typeof computeSmallPlaceAllowance> }[];
};
