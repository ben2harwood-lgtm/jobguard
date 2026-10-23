import { describe, expect, it } from "vitest";
import { meterLifecycleInputV1, projectMeterDays, projectMeterJobTimeline } from "./meter-lifecycle.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (day: string, fraction = "000001") => `2026-01-${day}T12:00:00.${fraction}Z`;
function input() {
  return { version: "meter-lifecycle-input.v1", tenantId: id(1), jobId: id(2), sourceRevision: 1,
    activation: { id: id(3), at: at("01"), termsId: id(4), termsRevision: 1,
      track: "small_builder", partyBindingId: id(5), customerId: id(6), siteId: id(7), small: true },
    events: [] as unknown[], lock: null as null | { id: string; at: string }, trip: null as null | { id: string; at: string },
    trial: { status: "unavailable" }, policy: { version: "meter-lifecycle-policy.v1", revision: "specified-foundation.v1", clockStatus: "held" },
    asOf: "2026-01-31T12:00:00.000001Z", startDate: "2026-01-01", endDateExclusive: "2026-02-01" };
}
function event(n: number, kind = "first_site_evidence", factAt = at("05")) {
  return { version: "job-work-state-event.v1", id: id(n), jobId: id(2), sequence: n, kind, factAt,
    recordedAt: at("31"), sourceReceiptId: id(n + 100), commandId: null,
    predecessorId: null, closeReason: null, closeNote: null };
}

describe("MON1-L specified foundation; clock-dependent intervals remain held", () => {
  it("M1L-01 preserves the day31 candidate and separate capacity commitment", () => {
    const result = projectMeterJobTimeline(input());
    expect(result.start).toEqual({ at: "2026-01-31T00:00:00.000000Z", cause: "day31", sourceIds: [id(3)] });
    expect(result.commitment).toEqual({ status: "candidate", sourceIds: [id(3)] });
    expect(result.status).toBe("held");
    expect(result.intervals).toEqual([]);
  });
  it("M1L-01 first photo day5 wins without changing its original microseconds", () => {
    const raw = input(); raw.events = [event(10)];
    expect(projectMeterJobTimeline(raw).start).toEqual({ at: at("05"), cause: "first_site_evidence", sourceIds: [id(10)] });
  });
  it("M1L-04 canonical replay, property ordering, delayed earlier source and conflict", () => {
    const raw = input(); const first = event(10), later = event(11, "first_site_evidence", at("05", "000002"));
    raw.events = [later, first, { ...first }]; const before = JSON.stringify(raw);
    const a = projectMeterJobTimeline(raw);
    expect(a).toEqual(projectMeterJobTimeline({ ...raw, events: [first, later] }));
    expect(a.events.map(e => e.id)).toEqual([id(10), id(11)]);
    expect(a.start?.at).toBe(at("05")); expect(JSON.stringify(raw)).toBe(before);
    expect(() => projectMeterJobTimeline({ ...raw, events: [first, { ...first, recordedAt: at("30") }] })).toThrow("WORK_FACT_IDENTITY_CONFLICT");
  });
  it("M1L-06 exact close/lock terminal candidates and no post-lock restart", () => {
    const raw = input(); raw.events = [event(10), { ...event(11, "closed", at("06")), sourceReceiptId: null, commandId: id(211), closeReason: "other", closeNote: "Stopped" }];
    raw.lock = { id: id(30), at: at("07") };
    expect(projectMeterJobTimeline(raw).stop).toEqual({ at: at("06"), cause: "closed", sourceIds: [id(11)] });
    raw.events.push(event(12, "site_activity", at("08")));
    expect(projectMeterJobTimeline(raw).holds).toContain("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
    expect(projectMeterJobTimeline(raw).intervals).toEqual([]);
  });
  it("M1L-02/03 unresolved timer, cancellation and restart rules produce holds", () => {
    const raw = input(); raw.events = [{ ...event(10, "finished_on_site"), commandId: id(210), sourceReceiptId: null },
      { ...event(11, "finished_cancelled", at("20")), predecessorId: id(10), commandId: id(211), sourceReceiptId: null }];
    expect(projectMeterJobTimeline(raw).holds).toContain("H-METER-CLOCK");
    expect(projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [raw] }).days.every(d => d.status === "held" && d.places === null)).toBe(true);
  });
  it("M1L-07 original trip latches non-smallness without an omission input", () => {
    const raw = input(); raw.trip = { id: id(50), at: at("10") };
    const days = projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [raw] }).days;
    expect(days.find(d => d.date === "2026-01-09")?.classifications[0]?.small).toBe(true);
    expect(days.find(d => d.date === "2026-01-10")?.classifications[0]?.small).toBe(false);
    expect(days.at(-1)?.classifications[0]?.small).toBe(false);
  });
  it("M1L-08 strict untrusted envelope rejects overrides and invalid sources", () => {
    const raw = input();
    for (const field of ["clientTime", "count", "policyOverride", "hiddenSignals", "small", "tenant", "now"]) {
      expect(() => projectMeterJobTimeline({ ...raw, [field]: true })).toThrow("INVALID_METER_LIFECYCLE_INPUT");
    }
    for (const change of [{ sourceRevision: 0 }, { sourceRevision: undefined }, { policy: { ...raw.policy, revision: "approved-by-client" } },
      { events: [event(10, "payment")] }, { events: [{ ...event(10), jobId: id(999) }] },
      { events: [event(10, "first_site_evidence", "2025-01-01T00:00:00.000001Z")] },
      { trip: { id: id(50), at: "2025-01-01T00:00:00.000001Z" } }, { trial: { status: "accepted", active: true } }]) {
      expect(() => projectMeterJobTimeline({ ...raw, ...change })).toThrow("INVALID_METER_LIFECYCLE_INPUT");
    }
    expect(meterLifecycleInputV1.safeParse(raw).success).toBe(true);
  });
  it("future facts remain source-bound but cannot change as-of projection", () => {
    const raw = input(); raw.asOf = at("04"); raw.events = [event(10)];
    expect(projectMeterJobTimeline(raw).start).toBeNull();
    expect(projectMeterJobTimeline(raw).sourceRefs.some(r => r.id === id(10))).toBe(true);
  });
  it("rejects conflicting duplicate jobs or mixed scope/date bounds in a day projection", () => {
    const raw = input();
    for (const other of [raw, { ...raw, jobId: id(20), tenantId: id(99) }, { ...raw, jobId: id(20), startDate: "2026-01-02" }]) {
      expect(() => projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [raw, other] })).toThrow("INVALID_METER_LIFECYCLE_INPUT");
    }
  });
});
