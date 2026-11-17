import { expect, it } from "vitest";
import { jobWorkTimingV1, workDeadlineCandidate, workDay31Candidate, compareWorkFactTimes, resolveWorkDeadline, preserveStoppedIntervals, trialTimingFacts } from "./job-work-timing.js";
const origin = "2026-01-01T12:34:56.123456Z";
it("trial uses switch-live plus 90 London days", () => {
 expect(workDeadlineCandidate("trial", origin)).toMatchObject({originAt: origin, date: "2026-04-01", days: 90});
});
it("day31 counts activation date as day one", () => {
 expect(workDay31Candidate(origin)).toMatchObject({date:"2026-01-31",at:"2026-01-31T00:00:00.000000Z"});
});
it("seven/thirty/ninety share one version", () => {
 for (const kind of ["finish", "quiet", "trial"] as const) expect(workDeadlineCandidate(kind,origin).version).toBe(jobWorkTimingV1.version);
});
it("spring gap and autumn fold", () => {
 expect(workDeadlineCandidate("finish","2026-03-22T01:30:00.123456Z").date).toBe("2026-03-29");
 expect(workDeadlineCandidate("finish","2026-10-18T00:30:00.123456Z").date).toBe("2026-10-25");
 for(const at of ["2026-03-22T01:30:00.123456Z","2026-10-18T00:30:00.123456Z"]) expect(()=>resolveWorkDeadline(workDeadlineCandidate("finish",at))).toThrow("WORK_TIMING_CONVENTION_REQUIRED");
});
it("exact boundary and microsecond neighbours", () => {
 expect(compareWorkFactTimes(origin,origin)).toBe(0);
 expect(compareWorkFactTimes(origin,"2026-01-01T12:34:56.123457Z")).toBe(-1);
 expect(compareWorkFactTimes(origin,"2026-01-01T12:34:56.123455Z")).toBe(1);
});
it("late processing preserves fact time", () => { expect(workDeadlineCandidate("quiet",origin).originAt).toBe(origin); });
it("cancel never rewrites a past stop", () => {
 const history=[{startAt:origin,stopAt:"2026-01-02T12:34:56.123456Z"}];
 expect(preserveStoppedIntervals(history,"2026-01-03T12:34:56.123456Z")).toEqual(history);
 expect(history[0]?.stopAt).toBe("2026-01-02T12:34:56.123456Z");
});
it("lock never restarts", () => { expect(jobWorkTimingV1.lockCanRestart).toBe(false); });

it("trial preserves lock close and second-live termination facts",()=>{
 const facts={switchedLiveAt:origin,lockedAt:"2026-02-01T00:00:00.000001Z",closedAt:"2026-03-01T00:00:00.000001Z",secondJobLiveAt:"2026-01-02T00:00:00.000001Z"};
 expect(trialTimingFacts(facts)).toMatchObject({...facts,earliestExplicitStopAt:facts.secondJobLiveAt,deadline:{originAt:origin}});
 expect(()=>trialTimingFacts({...facts,reopenedAt:origin})).toThrow();
});
