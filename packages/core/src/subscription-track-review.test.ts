import { describe, expect, it } from "vitest";
import { detectSubscriptionTrackReview, routeSubscriptionOnboarding } from "./subscription-track-review.js";
const periods = [
  { id: "fictional-jan", startDate: "2026-01-01", endDateExclusive: "2026-02-01", countedPlaces: Array(31).fill(7) as number[] },
  { id: "fictional-feb", startDate: "2026-02-01", endDateExclusive: "2026-03-01", countedPlaces: Array(28).fill(7) as number[] },
  { id: "fictional-mar", startDate: "2026-03-01", endDateExclusive: "2026-04-01", countedPlaces: Array(31).fill(7) as number[] },
];
function history(first = 0, second = 0, third = 0) { return periods.map((p, i) => ({ ...p, countedPlaces: p.countedPlaces.map((_, d) => d < [first,second,third][i]! ? 8 : 7) })); }
const input = (committedPlaces: number, supplied = history()) => ({ version: "subscription-track-review-input.v1", plan: "Builder", committedPlaces, periods: supplied });
describe("MON-2A pure review and onboarding", () => {
  it("M2A-17 Builder fourteen triggers immediately; thirteen alone does not", () => {
    expect(detectSubscriptionTrackReview(input(13)).immediate).toBe(false);
    for (const n of [14,15,16,17]) expect(detectSubscriptionTrackReview(input(n)).immediate).toBe(true);
    expect(detectSubscriptionTrackReview({ ...input(14), plan: "Solo" }).immediate).toBe(false);
  });
  it("M2A-17 nine busy days fail, ten succeed, two of three qualify, seven places never busy", () => {
    expect(detectSubscriptionTrackReview(input(7,history(9,9,0))).sustained).toBe(false);
    expect(detectSubscriptionTrackReview(input(7,history(10,9,0))).sustained).toBe(false);
    expect(detectSubscriptionTrackReview(input(7,history(10,0,10)))).toMatchObject({ sustained: true, busyDays: [10,0,10] });
    expect(detectSubscriptionTrackReview(input(7)).busyDays).toEqual([0,0,0]);
    expect(detectSubscriptionTrackReview(input(7,history(10,10,0).slice(0,2))).sustained).toBe(false);
  });
  it("M2A-17 nonconsecutive, overlapping, duplicate or incomplete history cannot masquerade as the last three", () => {
    const a = history(10,10,10);
    for (const invalid of [[a[0],a[2]], [a[1],a[0],a[2]], [a[0],a[0],a[2]], [...a,a[2]], [{ ...a[0], countedPlaces: [8] },a[1],a[2]]]) expect(() => detectSubscriptionTrackReview(input(7,invalid as typeof a))).toThrow();
  });
  it("M2A-18 M2A-30 repeated pure detection changes no track, approval or caller state", () => {
    const data = input(17,history(10,10,10)); const before = JSON.stringify(data);
    const result = detectSubscriptionTrackReview(data); expect(result).toEqual(detectSubscriptionTrackReview(data)); expect(JSON.stringify(data)).toBe(before);
    expect(Object.keys(result).sort()).toEqual(["busyDays","hypothetical","immediate","sustained","trackReviewDue","version"].sort());
  });
  it.each([[7,false,"small_builder"],[8,false,"contractor"],[0,true,"contractor"],[7,true,"contractor"]] as const)("M2A-19 %i jobs, site staff %s routes %s", (usualJobs, siteStaffCapture, track) => {
    expect(routeSubscriptionOnboarding({ version: "subscription-onboarding-input.v1", usualJobs, siteStaffCapture }).recommendedTrack).toBe(track);
  });
  it("M2A-19 missing and invalid answers refuse", () => {
    for (const bad of [{}, { usualJobs: -1, siteStaffCapture: false }, { usualJobs: 1.5, siteStaffCapture: true }, { usualJobs: 1, siteStaffCapture: "yes" }, { usualJobs: 1, siteStaffCapture: true, tenantId: "fake" }]) expect(() => routeSubscriptionOnboarding({ version: "subscription-onboarding-input.v1", ...bad })).toThrow();
  });
});
