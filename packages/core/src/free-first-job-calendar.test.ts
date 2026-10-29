import { describe, expect, it } from "vitest";
import { approvedTrialClockV1, reduceTrialEndsV1, trialDeadlineV1, TrialCalendarError,
  type TrialClockPolicyV1, type TrialEndInputV1 } from "./free-first-job-calendar.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const otherJob = "10000000-0000-4000-8000-000000000003";
const trialId = "10000000-0000-4000-8000-000000000004";
const sourceId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const startedAt = "2026-01-01T12:34:56.123456Z";
const at = "2026-01-02T12:34:56.123456Z";
const later = "2026-01-03T12:34:56.123456Z";
function input(events: TrialEndInputV1["events"] = [], asOf = later): TrialEndInputV1 {
  return { version: "trial-end-input.v1", trialId, tenantId, jobId, startedAt,
    deadline: trialDeadlineV1(startedAt, approvedTrialClockV1), asOf, events };
}
function event(n: number, kind: "lock" | "close" | "second_activation" = "lock", effectiveAt = at) {
  return { sourceId: sourceId(n), tenantId, jobId: kind === "second_activation" ? otherJob : jobId,
    kind, effectiveAt, recordedAt: effectiveAt };
}
function errorCode(run: () => unknown, code = "INVALID_TRIAL_CALENDAR_INPUT") {
  expect(run).toThrow(TrialCalendarError);
  try { run(); } catch (error) { expect((error as TrialCalendarError).code).toBe(code); }
}

describe("MON-3C-CAL London clock (C279, synthetic only)", () => {
  it.each([
    ["2025-12-29T12:00:00.000000Z", "2025-12-29", "2026-03-29T00:00:00.000000Z"],
    ["2026-07-27T12:00:00.000000Z", "2026-07-27", "2026-10-24T23:00:00.000000Z"],
    ["2023-12-01T12:00:00.000000Z", "2023-12-01", "2024-02-29T00:00:00.000000Z"],
    [startedAt, "2026-01-01", "2026-03-31T23:00:00.000000Z"],
    ["2026-08-01T23:30:00.123456Z", "2026-08-02", "2026-10-31T00:00:00.000000Z"],
    ["2024-01-01T00:00:00.000000Z", "2024-01-01", "2024-03-31T00:00:00.000000Z"],
    ["2026-11-30T23:59:59.999999Z", "2026-11-30", "2027-02-28T00:00:00.000000Z"],
    ["2026-03-28T23:59:59.999999Z", "2026-03-28", "2026-06-25T23:00:00.000000Z"],
    ["2026-10-24T23:59:59.999999Z", "2026-10-25", "2027-01-23T00:00:00.000000Z"],
    ["2026-12-31T23:59:59.999999Z", "2026-12-31", "2027-03-30T23:00:00.000000Z"],
  ])("CAL-01 calendar +90: %s", (start, localDate, deadlineAt) => {
    const result = trialDeadlineV1(start, approvedTrialClockV1);
    expect(result.startLondonDate).toBe(localDate);
    expect(result.startedAt).toBe(start);
    expect(result.startLondonClock.slice(-6)).toBe(start.slice(20, 26));
    expect(result.deadlineAt).toBe(deadlineAt);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([
    ["2026-03-31T22:59:59.999999Z", true],
    ["2026-03-31T23:00:00.000000Z", false],
    ["2026-03-31T23:00:00.000001Z", false],
  ])("CAL-02 exclusive boundary %s", (asOf, active) => {
    const result = reduceTrialEndsV1(input([], asOf));
    expect(result.active).toBe(active);
    expect(result.endedAt).toBe(active ? null : input().deadline.deadlineAt);
    expect(result.deadlineReachedAtEnd).toBe(!active);
  });
  it.each([
    ["2026-03-29T00:59:59.999999Z", "00:59:59.999999"],
    ["2026-03-29T01:00:00.000000Z", "02:00:00.000000"],
    ["2026-10-25T00:30:00.123456Z", "01:30:00.123456"],
    ["2026-10-25T01:30:00.123456Z", "01:30:00.123456"],
  ])("CAL-03 UTC source is unambiguous %s", (start, localClock) => {
    expect(trialDeadlineV1(start, approvedTrialClockV1).startLondonClock).toBe(localClock);
  });
  it.each(["2026-03-29T01:30:00.000000", "2026-10-25T01:30:00.000000"])(
    "CAL-03 gap/overlap wall-clock policy refuses: %s", wallClock => {
      const unsupported = { ...approvedTrialClockV1, convention: "wall-clock-plus-90-days", deadlineLocalTime: wallClock };
      errorCode(() => trialDeadlineV1(startedAt, unsupported as unknown as TrialClockPolicyV1), "TRIAL_CLOCK_POLICY_HOLD");
    });
  it("strict clock rejects unknown version, extra fields, zone, endpoint and unapproved day counts", () => {
    for (const patch of [{ version: "v2" }, { zone: "UTC" }, { endpoint: "inclusive" }, { calendarDays: 89 }, { success: true }]) {
      errorCode(() => trialDeadlineV1(startedAt, { ...approvedTrialClockV1, ...patch } as TrialClockPolicyV1), "TRIAL_CLOCK_POLICY_HOLD");
    }
    expect(Object.isFrozen(approvedTrialClockV1)).toBe(true);
  });
  it.each(["2026-02-30T00:00:00.000000Z", "2026-01-01T00:00:00.000Z", "0000-01-01T00:00:00.000000Z", "0001-01-01T00:00:00.000000Z",
    "2026-01-01T00:00:00.000000+00:00", "9999-12-31T00:00:00.000000Z"])("invalid or overflowing start %s", start => {
    errorCode(() => trialDeadlineV1(start, approvedTrialClockV1));
  });
});

describe("MON-3C-CAL end-source reducer", () => {
  it("CAL-04 all permutations and identical duplicates preserve every co-earliest ID", () => {
    const a = event(2), b = event(1, "close"), c = event(3, "second_activation");
    const permutations = [[a,b,c], [a,c,b], [b,a,c], [b,c,a], [c,a,b], [c,b,a]];
    const expected = reduceTrialEndsV1(input([a,b,c]));
    expect(expected.sourceIds).toEqual([sourceId(1),sourceId(2),sourceId(3)]);
    for (const events of permutations) expect(reduceTrialEndsV1(input([...events, ...events]))).toEqual(expected);
    expect(Object.isFrozen(expected.sourceIds)).toBe(true);
  });
  it("CAL-04 conflicting duplicate identity fails, even a future source", () => {
    for (const patch of [{ kind: "close" }, { jobId: otherJob }, { effectiveAt: later, recordedAt: later }, { recordedAt: later }]) {
      errorCode(() => reduceTrialEndsV1(input([event(1), { ...event(1), ...patch }] as TrialEndInputV1["events"])), "TRIAL_SOURCE_CONFLICT");
    }
  });
  it.each(["lock", "close", "second_activation"] as const)("CAL-05 earlier %s wins", kind => {
    const result = reduceTrialEndsV1(input([event(1, kind), event(2, "lock", later)]));
    expect(result.endedAt).toBe(at);
    expect(result.sourceIds).toEqual([sourceId(1)]);
  });
  it("CAL-02/05 microsecond order is exact and ties with deadline retain sources", () => {
    const a = event(1, "close", "2026-01-02T12:34:56.123455Z");
    expect(reduceTrialEndsV1(input([event(2), a])).sourceIds).toEqual([a.sourceId]);
    const deadline = input().deadline.deadlineAt;
    const result = reduceTrialEndsV1(input([event(1, "lock", deadline)], deadline));
    expect(result.deadlineReachedAtEnd).toBe(true);
    expect(result.sourceIds).toEqual([sourceId(1)]);
  });
  it("CAL-05 another job lock/close is no end; same-job second activation refuses", () => {
    expect(reduceTrialEndsV1(input([{ ...event(1), jobId: otherJob }, { ...event(2, "close"), jobId: otherJob }])).active).toBe(true);
    errorCode(() => reduceTrialEndsV1(input([{ ...event(1, "second_activation"), jobId }])));
  });
  it("CAL-05 rejects foreign tenant, pre-start, recording before effective time and as-of before start", () => {
    for (const patch of [{ tenantId: otherJob }, { effectiveAt: "2026-01-01T00:00:00.000000Z" }, { recordedAt: startedAt }]) {
      errorCode(() => reduceTrialEndsV1(input([{ ...event(1), ...patch }])));
    }
    errorCode(() => reduceTrialEndsV1(input([], "2026-01-01T00:00:00.000000Z")));
  });
  it("future effective or recorded facts are ignored until as-of; delayed earlier source shortens only", () => {
    const delayed = { ...event(1), recordedAt: "2026-01-04T00:00:00.000000Z" };
    expect(reduceTrialEndsV1(input([event(2, "close", later)], at)).active).toBe(true);
    expect(reduceTrialEndsV1(input([delayed, event(2, "close", later)])).endedAt).toBe(later);
    expect(reduceTrialEndsV1(input([delayed, event(2, "close", later)], delayed.recordedAt)).endedAt).toBe(at);
  });
  it.each(["failed_close", "failed_activation", "finish", "quiet", "card_redirect", "reopen", "reset"])(
    "CAL-06/07 unsupported %s is rejected", kind => {
      errorCode(() => reduceTrialEndsV1(input([{ ...event(1), kind }] as unknown as TrialEndInputV1["events"])));
    });
  it("CAL-06 success flags cannot confer source authority", () => {
    errorCode(() => reduceTrialEndsV1(input([{ ...event(1), success: true }] as unknown as TrialEndInputV1["events"])));
  });
  it("CAL-07 no restart input; immutable start and retained end survive later projection", () => {
    const before = input([event(1)]);
    const old = reduceTrialEndsV1(before);
    const after = reduceTrialEndsV1({ ...before, asOf: "2026-02-01T00:00:00.000000Z" });
    expect(after.endedAt).toBe(old.endedAt);
    expect(after.startedAt).toBe(old.startedAt);
    errorCode(() => reduceTrialEndsV1({ ...before, startedAt: later }));
    errorCode(() => reduceTrialEndsV1({ ...before, reopenedAt: later } as TrialEndInputV1));
    errorCode(() => reduceTrialEndsV1({ ...before, deadline: { ...before.deadline, deadlineAt: later } }));
  });
});
// CAL-08 is exercised by the dispatched command running the unchanged v1 preview/period suites.
