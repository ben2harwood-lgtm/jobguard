import { z } from "zod";
import { workFactTimeV1 } from "./job-work-state.js";

export const jobWorkTimingV1 = Object.freeze({ version: "job-work-timing.v1" as const, zone: "Europe/London" as const, finishDays: 7, quietDays: 30, trialDays: 90, lockCanRestart: false as const });
export class WorkTimingError extends Error {
 constructor(readonly code: "INVALID_WORK_TIMING_INPUT" | "WORK_TIMING_CONVENTION_REQUIRED") { super(code); this.name = "WorkTimingError"; }
}
function parse<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
 const result=schema.safeParse(raw);
 if(!result.success) throw new WorkTimingError("INVALID_WORK_TIMING_INPUT");
 return result.data;
}
export const londonWorkDateV1 = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "longOffset",
});

/** Date construction always has an explicit validated input; never consults the current time. */
export function londonWorkDate(raw: unknown): string {
  const at = parse(workFactTimeV1.refine(value => !value.startsWith("0000-")), raw);
  const parts = dateFormatter.formatToParts(new Date(at));
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return parse(londonWorkDateV1, `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`);
}

export function addWorkCalendarDays(date: string, days: number): string {
  parse(londonWorkDateV1,date);
  if(!Number.isSafeInteger(days)) throw new WorkTimingError("INVALID_WORK_TIMING_INPUT");
  const supplied = new Date(`${date}T00:00:00.000Z`);
  supplied.setUTCDate(supplied.getUTCDate() + days);
  return parse(londonWorkDateV1, supplied.toISOString().slice(0, 10));
}

export const workDay31CandidateV1 = z.object({
  version: z.literal("job-work-day31-candidate.v1"), activatedAt: workFactTimeV1, date: londonWorkDateV1, at: workFactTimeV1,
}).strict().readonly();

export function workDay31Candidate(raw: unknown) {
  const activatedAt = parse(workFactTimeV1.refine(value => !value.startsWith("0000-")), raw);
  const date = addWorkCalendarDays(londonWorkDate(activatedAt), 30);
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  // Retain the full offset, including historical minutes/seconds, rather than a clock hour.
  const offsetName = dateFormatter.formatToParts(utcMidnight).find(part => part.type === "timeZoneName")!.value;
  const offset = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(offsetName);
  if (!offset) throw new WorkTimingError("INVALID_WORK_TIMING_INPUT");
  const seconds = (Number(offset[2] ?? 0) * 3600 + Number(offset[3] ?? 0) * 60 + Number(offset[4] ?? 0)) * (offset[1] === "-" ? -1 : 1);
  utcMidnight.setUTCSeconds(utcMidnight.getUTCSeconds() - seconds);
  return parse(workDay31CandidateV1, {
    version: "job-work-day31-candidate.v1", activatedAt, date, at: utcMidnight.toISOString().replace(".000Z", ".000000Z"),
  });
}


/** Dates only: conversion to a deadline instant needs the still-held endpoint/DST ruling. */
export function workDeadlineCandidate(kind: "finish" | "quiet" | "trial", rawOriginAt: unknown) {
 parse(z.enum(["finish","quiet","trial"]),kind);
 const originAt=parse(workFactTimeV1,rawOriginAt);
 const days=kind === "finish" ? jobWorkTimingV1.finishDays : kind === "quiet" ? jobWorkTimingV1.quietDays : jobWorkTimingV1.trialDays;
 return Object.freeze({version:jobWorkTimingV1.version,kind,originAt,days,date:addWorkCalendarDays(londonWorkDate(originAt),days),resolution:"convention_required" as const});
}
export function resolveWorkDeadline(_candidate: ReturnType<typeof workDeadlineCandidate>): never {
 throw new WorkTimingError("WORK_TIMING_CONVENTION_REQUIRED");
}
export function compareWorkFactTimes(a: unknown,b: unknown): -1 | 0 | 1 {
 const left=parse(workFactTimeV1,a),right=parse(workFactTimeV1,b);
 return left < right ? -1 : left > right ? 1 : 0;
}
const stoppedInterval=z.object({startAt:workFactTimeV1,stopAt:workFactTimeV1}).strict().refine(value=>value.startAt<=value.stopAt).readonly();
/** Cancellation copies supplied immutable history; it never reconstructs or extends past intervals. */
export function preserveStoppedIntervals(raw: unknown,cancelAt: unknown) {
 const at=parse(workFactTimeV1,cancelAt);
 return parse(z.array(stoppedInterval).refine(rows=>rows.every(row=>row.stopAt<at)).readonly(),raw);
}

const trialTimingFactsV1=z.object({switchedLiveAt:workFactTimeV1,lockedAt:workFactTimeV1.nullable(),closedAt:workFactTimeV1.nullable(),secondJobLiveAt:workFactTimeV1.nullable()}).strict();
/** MON-3 owns eligibility. These immutable facts preserve all earlier termination candidates. */
export function trialTimingFacts(raw: unknown) {
 const facts=parse(trialTimingFactsV1,raw);
 const earlierStops=[facts.lockedAt,facts.closedAt,facts.secondJobLiveAt].filter((at):at is string=>at!==null).sort();
 return Object.freeze({...facts,version:jobWorkTimingV1.version,deadline:workDeadlineCandidate("trial",facts.switchedLiveAt),earliestExplicitStopAt:earlierStops[0]??null});
}
