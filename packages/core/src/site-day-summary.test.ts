import { describe, expect, it } from "vitest";
import { buildSiteDaySummaryV1, siteDayOfV1, siteDayWindowV1, SiteDaySummaryError, type SiteDaySources } from "./site-day-summary.js";

const job = "11111111-1111-4111-8111-111111111111";
const empty: SiteDaySources = { workDone: [], issues: [], deliveries: [], photos: [], notes: [] };
const note = (entryId: string, at: string, text = "Fictional note") => ({ entryId, text, onSite: true, at });

describe("site day window (UK time, closes 18:00)", () => {
  it("runs 18:00 to 18:00 in winter (GMT) and summer (BST)", () => {
    expect(siteDayWindowV1("2026-11-24")).toEqual({ date: "2026-11-24", startsAt: "2026-11-23T18:00:00.000Z", closesAt: "2026-11-24T18:00:00.000Z" });
    expect(siteDayWindowV1("2026-07-01")).toEqual({ date: "2026-07-01", startsAt: "2026-06-30T17:00:00.000Z", closesAt: "2026-07-01T17:00:00.000Z" });
  });
  it("spans the clock changes: 23 hours in March, 25 in October", () => {
    const march = siteDayWindowV1("2026-03-29"), october = siteDayWindowV1("2026-10-25");
    expect(march).toMatchObject({ startsAt: "2026-03-28T18:00:00.000Z", closesAt: "2026-03-29T17:00:00.000Z" });
    expect(october).toMatchObject({ startsAt: "2026-10-24T17:00:00.000Z", closesAt: "2026-10-25T18:00:00.000Z" });
  });
  it("puts activity from 18:00 UK time into the next day", () => {
    expect(siteDayOfV1(new Date("2026-11-24T17:59:59.999Z"))).toBe("2026-11-24");
    expect(siteDayOfV1(new Date("2026-11-24T18:00:00.000Z"))).toBe("2026-11-25");
    expect(siteDayOfV1(new Date("2026-07-01T16:59:59.999Z"))).toBe("2026-07-01");
    expect(siteDayOfV1(new Date("2026-07-01T17:00:00.000Z"))).toBe("2026-07-02");
    expect(siteDayOfV1(new Date("2026-12-31T19:00:00.000Z"))).toBe("2027-01-01");
  });
  it("refuses malformed dates", () => {
    for (const date of ["2026-02-30", "2026-1-01", "0000-01-01", "today"]) expect(() => siteDayWindowV1(date)).toThrow(SiteDaySummaryError);
  });
});

describe("site day summary", () => {
  const sources: SiteDaySources = { ...empty, notes: [
    note("33333333-3333-4333-8333-333333333333", "2026-11-24T09:00:00.000Z", "Second"),
    note("22222222-2222-4222-8222-222222222222", "2026-11-24T08:00:00.000Z", "First"),
    note("44444444-4444-4444-8444-444444444444", "2026-11-24T18:00:00.000Z", "After six: tomorrow"),
    note("55555555-5555-4555-8555-555555555555", "2026-11-23T17:59:59.999Z", "Before the window"),
  ] };
  it("is 'so far' before 18:00 and 'after_cutoff' from 18:00; the read hash is stable under reordering and changes on edit", () => {
    const sofar = buildSiteDaySummaryV1(job, "2026-11-24", new Date("2026-11-24T12:00:00.000Z"), sources);
    expect(sofar.state).toBe("so_far"); expect(sofar.readHash).toMatch(/^[a-f0-9]{64}$/u); expect(sofar.readAt).toBe("2026-11-24T12:00:00.000Z");
    expect(sofar.notes.map(n => n.text)).toEqual(["First", "Second"]);
    const closed = buildSiteDaySummaryV1(job, "2026-11-24", new Date("2026-11-24T18:00:00.000Z"), sources);
    expect(closed.state).toBe("after_cutoff"); expect(closed.readHash).toBe(sofar.readHash);
    const reordered = buildSiteDaySummaryV1(job, "2026-11-24", new Date("2026-12-01T00:00:00.000Z"), { ...sources, notes: [...sources.notes].reverse() });
    expect(reordered.readHash).toBe(closed.readHash);
    const changed = buildSiteDaySummaryV1(job, "2026-11-24", new Date("2026-12-01T00:00:00.000Z"), { ...sources, notes: [note("22222222-2222-4222-8222-222222222222", "2026-11-24T08:00:00.000Z", "Edited")] });
    expect(changed.readHash).not.toBe(closed.readHash);
  });
  it("refuses a day that has not started, and allows an empty day", () => {
    expect(() => buildSiteDaySummaryV1(job, "2026-11-25", new Date("2026-11-24T12:00:00.000Z"), empty)).toThrow("SITE_DAY_NOT_STARTED");
    expect(buildSiteDaySummaryV1(job, "2026-11-25", new Date("2026-11-24T18:30:00.000Z"), empty)).toMatchObject({ state: "so_far", notes: [] });
  });
  it("rejects malformed source rows", () => {
    expect(() => buildSiteDaySummaryV1(job, "2026-11-24", new Date("2026-11-25T00:00:00.000Z"), { ...empty, photos: [{ evidenceId: "x", evidenceType: "completion_photo", scopeItemId: null, at: "2026-11-24T08:00:00.000Z" }] })).toThrow();
  });
});
