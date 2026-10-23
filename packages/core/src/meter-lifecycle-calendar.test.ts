import { describe, expect, it } from "vitest";
import { projectMeterDays, projectMeterJobTimeline } from "./meter-lifecycle.js";
import { classifyMeterActivation } from "./jobs-on-the-go.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function job(n = 1, activatedAt = "2026-01-01T12:00:00.000001Z", startDate = "2026-01-01", endDateExclusive = "2026-02-01") {
  return { version: "meter-lifecycle-input.v1", tenantId: id(1000), jobId: id(n), sourceRevision: 1,
    activation: { id: id(n + 100), at: activatedAt, termsId: id(n + 200), termsRevision: 1,
      track: "small_builder", partyBindingId: id(n + 300), customerId: id(n + 400), siteId: id(n + 500), small: true },
    events: [], lock: null, trip: null, trial: { status: "unavailable" },
    policy: { version: "meter-lifecycle-policy.v1", revision: "specified-foundation.v1", clockStatus: "held" },
    asOf: `${endDateExclusive}T12:00:00.000001Z`, startDate, endDateExclusive };
}
describe("MON1-L calendar and candidate classification (not counted days)", () => {
  it.each([
    ["2026-03-01T12:00:00.123456Z", "2026-03-31", "2026-03-30T23:00:00.000000Z"],
    ["2026-10-01T12:00:00.123456Z", "2026-10-31", "2026-10-31T00:00:00.000000Z"],
    ["2028-02-01T12:00:00.123456Z", "2028-03-02", "2028-03-02T00:00:00.000000Z"],
    ["2026-12-15T12:00:00.123456Z", "2027-01-14", "2027-01-14T00:00:00.000000Z"],
  ])("M1L-01/02 specified London day31 %s", (activatedAt, date, at) => {
    const raw = job(1, activatedAt, activatedAt.slice(0, 10), date);
    expect(projectMeterJobTimeline(raw).day31Candidate).toMatchObject({ activatedAt, date, at });
  });
  it.each([
    ["2026-03-28", "2026-03-31", 3], ["2026-10-24", "2026-10-27", 3], ["2028-02-28", "2028-03-02", 3],
  ])("enumerates London calendar labels across %s without elapsed-day arithmetic", (start, end, length) => {
    const result = projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [job(1, `${start}T00:00:00.000001Z`, start, end)] });
    expect(result.days).toHaveLength(length);
    expect(result.days[0]?.date).toBe(start);
    expect(result.days.every(day => day.countedPlaces === null && day.status === "held")).toBe(true);
  });
  it("M1L-05 same customer/site deduplication, different customer separation and mixed small group", () => {
    const a = job(1), b = job(2), c = job(3);
    b.activation.customerId = a.activation.customerId; b.activation.siteId = a.activation.siteId; b.activation.small = false;
    c.activation.siteId = a.activation.siteId;
    const result = projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [c, b, a] });
    expect(result.days[0]?.candidatePlaces).toHaveLength(2);
    expect(result.days[0]?.candidatePlaces.find(place => place.jobIds.includes(a.jobId))).toMatchObject({ jobIds: [a.jobId, b.jobId], small: false });
    expect(result).toEqual(projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [a, b, c] }));
  });
  it.each(["Solo", "Builder"])("M1L-05 holds every allowance field for %s", plan => {
    const result = projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan, jobs: Array.from({ length: 8 }, (_, i) => job(i + 1)) });
    expect(result.days[0]?.candidateAllowance).toMatchObject({ rawPlaces: null, freeSmallPlaces: null, countedPlaces: null });
    expect(result.days[0]?.countedPlaces).toBeNull();
  });
  it("M1L-05 never supplies an allowance count before activation or after lock", () => {
    const raw = job(1, "2026-01-10T12:00:00.000001Z");
    const locked = { ...raw, lock: { id: id(900), at: "2026-01-20T12:00:00.000001Z" } };
    const { days } = projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [locked] });
    expect(days).toHaveLength(31);
    for (const day of days) {
      const count: null = day.candidateAllowance.countedPlaces;
      const rawCount: null = day.candidateAllowance.rawPlaces;
      const freeCount: null = day.candidateAllowance.freeSmallPlaces;
      expect([rawCount, freeCount, count]).toEqual([null, null, null]);
    }
  });
  it("M1L-05 immutable activation smallness must originate from the strict threshold helper", () => {
    for (const [pence, expected] of [[199999, true], [200000, false], [200001, false]] as const) {
      expect(classifyMeterActivation({ version: "meter-activation-classification.v1", acceptedNet: { pence, currency: "GBP" }, highestSentNet: { pence, currency: "GBP" } })).toBe(expected);
    }
  });
});
