import { z } from "zod";
import { workFactTimeV1 } from "./job-work-state.js";
import { addWorkCalendarDays } from "./job-work-timing.js";

export type WorkFactTime = z.infer<typeof workFactTimeV1>;
export class TrialCalendarError extends Error {
  constructor(readonly code: "INVALID_TRIAL_CALENDAR_INPUT" | "TRIAL_CLOCK_POLICY_HOLD" | "TRIAL_SOURCE_CONFLICT") {
    super(code); this.name = "TrialCalendarError";
  }
}
function parse<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new TrialCalendarError("INVALID_TRIAL_CALENDAR_INPUT");
  return result.data;
}

/** C279: internal synthetic-only policy. Never accept this object from a browser. */
export const trialClockPolicyV1 = z.object({
  version: z.literal("trial-clock-policy.v1"),
  convention: z.literal("london-midnight-day-90-exclusive-v1"),
  environment: z.literal("synthetic_demo"), zone: z.literal("Europe/London"),
  startDateIsDay: z.literal(1), calendarDays: z.literal(90),
  deadlineLocalTime: z.literal("00:00:00.000000"), endpoint: z.literal("exclusive"),
}).strict().readonly();
export type TrialClockPolicyV1 = z.infer<typeof trialClockPolicyV1>;
export const approvedTrialClockV1: TrialClockPolicyV1 = trialClockPolicyV1.parse({
  version: "trial-clock-policy.v1", convention: "london-midnight-day-90-exclusive-v1",
  environment: "synthetic_demo", zone: "Europe/London", startDateIsDay: 1,
  calendarDays: 90, deadlineLocalTime: "00:00:00.000000", endpoint: "exclusive",
});
const time = workFactTimeV1.refine(value => !value.startsWith("0000-"));
const date = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const clock = z.string().regex(/^\d{2}:\d{2}:\d{2}\.\d{6}$/u);
export const trialDeadlineSchemaV1 = z.object({
  version: z.literal("trial-deadline.v1"), policy: trialClockPolicyV1,
  startedAt: time, startLondonDate: date, startLondonClock: clock,
  deadlineLondonDate: date, deadlineAt: time,
}).strict().readonly();
export type TrialDeadlineV1 = z.infer<typeof trialDeadlineSchemaV1>;
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  era: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
});
function localParts(at: string) {
  const parts = formatter.formatToParts(new Date(at));
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  if (part("era") !== "AD") throw new TrialCalendarError("INVALID_TRIAL_CALENDAR_INPUT");
  return { date: `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`,
    clock: `${part("hour")}:${part("minute")}:${part("second")}`, offset: part("timeZoneName") };
}

/** Calendar conversion uses Date only on whole seconds; source comparisons retain all six digits. */
export function trialDeadlineV1(startedAt: WorkFactTime, approvedClock: TrialClockPolicyV1): TrialDeadlineV1 {
  if (!trialClockPolicyV1.safeParse(approvedClock).success) throw new TrialCalendarError("TRIAL_CLOCK_POLICY_HOLD");
  const start = parse(time, startedAt);
  const startLocal = localParts(start);
  const startDate = parse(date, startLocal.date);
  let target: string;
  try { target = addWorkCalendarDays(startDate, 90); }
  catch { throw new TrialCalendarError("INVALID_TRIAL_CALENDAR_INPUT"); }
  const utcMidnight = `${target}T00:00:00.000000Z`;
  const offset = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(localParts(utcMidnight).offset);
  if (!offset) throw new TrialCalendarError("TRIAL_CLOCK_POLICY_HOLD");
  const seconds = (Number(offset[2] ?? 0) * 3600 + Number(offset[3] ?? 0) * 60 + Number(offset[4] ?? 0)) * (offset[1] === "-" ? -1 : 1);
  const deadlineAt = new Date(Date.parse(utcMidnight) - seconds * 1000).toISOString().replace(".000Z", ".000000Z");
  const local = localParts(deadlineAt);
  if (local.date !== target || local.clock !== "00:00:00") throw new TrialCalendarError("TRIAL_CLOCK_POLICY_HOLD");
  return parse(trialDeadlineSchemaV1, {
    version: "trial-deadline.v1", policy: approvedTrialClockV1, startedAt: start,
    startLondonDate: startDate, startLondonClock: `${startLocal.clock}.${start.slice(20, 26)}`,
    deadlineLondonDate: target, deadlineAt,
  });
}

const id = z.guid({ error: "Invalid uuid" });
/** Checked server source facts only. Shape validation cannot prove a source's authority. */
export const trialEndSourceV1 = z.object({
  sourceId: id, kind: z.enum(["lock", "close", "second_activation"]),
  tenantId: id, jobId: id, effectiveAt: time, recordedAt: time,
}).strict().readonly();
export const trialEndInputV1 = z.object({
  version: z.literal("trial-end-input.v1"), trialId: id, tenantId: id, jobId: id,
  startedAt: time, deadline: trialDeadlineSchemaV1, asOf: time,
  events: z.array(trialEndSourceV1).max(10000).readonly(),
}).strict().readonly();
export type TrialEndInputV1 = z.infer<typeof trialEndInputV1>;
export const trialEndProjectionV1 = z.object({
  version: z.literal("trial-end-projection.v1"), environment: z.literal("synthetic_demo"),
  trialId: id, tenantId: id, jobId: id, startedAt: time, asOf: time, deadlineAt: time,
  active: z.boolean(), endedAt: time.nullable(), deadlineReachedAtEnd: z.boolean(),
  sourceIds: z.array(id).readonly(),
}).strict().readonly();
export type TrialEndProjectionV1 = z.infer<typeof trialEndProjectionV1>;

/** Pure as-of projection, not a persisted end or entitlement. Replays retain the original start and sources.
 * Co-earliest IDs are lexically ordered for display only; this supplies no financial precedence.
 */
export function reduceTrialEndsV1(raw: TrialEndInputV1): TrialEndProjectionV1 {
  const input = parse(trialEndInputV1, raw);
  const expected = trialDeadlineV1(input.startedAt, input.deadline.policy);
  if (JSON.stringify(input.deadline) !== JSON.stringify(expected) || input.asOf < input.startedAt)
    throw new TrialCalendarError("INVALID_TRIAL_CALENDAR_INPUT");
  const sources = new Map<string, z.infer<typeof trialEndSourceV1>>();
  for (const event of input.events) {
    if (event.tenantId !== input.tenantId || event.effectiveAt < input.startedAt ||
        event.recordedAt < event.effectiveAt || (event.kind === "second_activation" && event.jobId === input.jobId))
      throw new TrialCalendarError("INVALID_TRIAL_CALENDAR_INPUT");
    const prior = sources.get(event.sourceId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(event)) throw new TrialCalendarError("TRIAL_SOURCE_CONFLICT");
    sources.set(event.sourceId, event);
  }
  const candidates = [...sources.values()].filter(event => event.effectiveAt <= input.asOf && event.recordedAt <= input.asOf &&
    (event.kind === "second_activation" || event.jobId === input.jobId));
  let end = input.deadline.deadlineAt;
  for (const event of candidates) if (event.effectiveAt < end) end = event.effectiveAt;
  const active = input.asOf < end;
  return parse(trialEndProjectionV1, {
    version: "trial-end-projection.v1", environment: "synthetic_demo",
    trialId: input.trialId, tenantId: input.tenantId, jobId: input.jobId,
    startedAt: input.startedAt, asOf: input.asOf, deadlineAt: input.deadline.deadlineAt,
    active, endedAt: active ? null : end,
    deadlineReachedAtEnd: !active && end === input.deadline.deadlineAt,
    sourceIds: active ? [] : candidates.filter(event => event.effectiveAt === end).map(event => event.sourceId).sort(),
  });
}
