import { describe, expect, it } from "vitest";
import { countMeterDays, projectMeterDays, projectMeterJobTimeline } from "./meter-lifecycle.js";

// MON-1 (BUILD_PLAN 10.1.5/10.1.6) under Ben's 28 Oct clock ruling: stops at 00:00 Europe/London at the start of the
// day N days after the trigger's London date; a midnight stop does not touch the new day; same-instant ties are stopped.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const approved = { version: "meter-lifecycle-policy.v1", revision: "london-midnight-stops.v1", clockStatus: "approved" };
type Fact = { kind: string; at: string };
function job(n: number, facts: Fact[] = [], o: { customer?: number; site?: number; small?: boolean; lock?: string; trip?: string; activatedAt?: string;
  asOf?: string; startDate?: string; endDateExclusive?: string } = {}) {
  return { version: "meter-lifecycle-input.v1", tenantId: id(1), jobId: id(100 + n), sourceRevision: 1,
    activation: { id: id(200 + n), at: o.activatedAt ?? "2026-01-01T12:00:00.000000Z", termsId: id(300 + n), termsRevision: 1, track: "small_builder",
      partyBindingId: id(400 + n), customerId: id(500 + (o.customer ?? n)), siteId: id(600 + (o.site ?? n)), small: o.small ?? false },
    events: facts.map((f, i) => {
      const site = f.kind === "first_site_evidence" || f.kind === "site_activity";
      // A cancel or reopen names the latest finish or close it reverses.
      const target = f.kind === "finished_cancelled" ? "finished_on_site" : f.kind === "reopened" ? "closed" : null;
      const predecessor = target ? facts.slice(0, i).map((g, j) => g.kind === target ? j : -1).filter(j => j >= 0).at(-1) : undefined;
      return { version: "job-work-state-event.v1", id: id(1000 * n + i + 1), jobId: id(100 + n), sequence: i + 1, kind: f.kind,
        factAt: f.at, recordedAt: f.at, sourceReceiptId: site ? id(3000 * n + i + 1) : null, commandId: site ? null : id(2000 * n + i + 1),
        predecessorId: predecessor === undefined ? null : id(1000 * n + predecessor + 1),
        closeReason: f.kind === "closed" ? "abandoned" : null, closeNote: f.kind === "closed" ? "Fictional close" : null };
    }),
    lock: o.lock ? { id: id(700 + n), at: o.lock } : null, trip: o.trip ? { id: id(800 + n), at: o.trip } : null,
    trial: { status: "unavailable" }, policy: approved,
    asOf: o.asOf ?? "2026-02-28T12:00:00.000000Z", startDate: o.startDate ?? "2026-01-01", endDateExclusive: o.endDateExclusive ?? "2026-03-01" };
}
const T = (date: string, time = "12:00:00") => `2026-${date}T${time}.000000Z`; // January–March: London = UTC
const intervals = (raw: ReturnType<typeof job>) => projectMeterJobTimeline(raw).intervals;
const counted = (plan: "Solo" | "Builder", jobs: ReturnType<typeof job>[]) => countMeterDays({ version: "meter-lifecycle-days-input.v1", plan, jobs }).days;
const datesCounted = (raw: ReturnType<typeof job>) => counted("Builder", [raw]).filter(d => d.rawPlaces === 1).map(d => d.date);
const span = (from: string, to: string) => { const out: string[] = []; for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };

describe("MON-1 replay fixtures: the pricing sentence and the code agree", () => {
  it("a start on day 31: an untouched job starts counting at 00:00 London on day 31", () => {
    expect(intervals(job(1))).toEqual([{ start: "2026-01-31T00:00:00.000000Z", startCause: "day31", end: null, endCause: null }]);
    expect(datesCounted(job(1))).toEqual(span("2026-01-31", "2026-02-28"));
  });
  it("a first photo on day 5 starts counting then, and 30 quiet days stop it at 00:00 London without touching that day", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: T("01-05") }]);
    expect(intervals(raw)).toEqual([{ start: T("01-05"), startCause: "first_site_evidence", end: "2026-02-04T00:00:00.000000Z", endCause: "quiet_30" }]);
    expect(datesCounted(raw)).toEqual(span("2026-01-05", "2026-02-03"));
  });
  it("site activity moves the quiet clock", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "site_activity", at: T("01-20", "23:59:59") }]);
    expect(intervals(raw)[0]).toMatchObject({ end: "2026-02-19T00:00:00.000000Z", endCause: "quiet_30" });
  });
  it("\"Finished on site\" plus 7 days stops at 00:00 London on the seventh day after the finish date", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "finished_on_site", at: T("01-10", "15:00:00") }]);
    expect(intervals(raw)).toEqual([{ start: T("01-05"), startCause: "first_site_evidence", end: "2026-01-17T00:00:00.000000Z", endCause: "finished_plus_7" }]);
    expect(datesCounted(raw)).toEqual(span("2026-01-05", "2026-01-16"));
  });
  it("site activity or an explicit cancel removes the finish marker (no weekly pausing)", () => {
    const viaActivity = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "finished_on_site", at: T("01-10") }, { kind: "site_activity", at: T("01-12") }]);
    expect(intervals(viaActivity)[0]).toMatchObject({ end: "2026-02-11T00:00:00.000000Z", endCause: "quiet_30" });
    const cancelled = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "finished_on_site", at: T("01-10") }, { kind: "finished_cancelled", at: T("01-12") }]);
    expect(intervals(cancelled)[0]).toMatchObject({ end: "2026-02-04T00:00:00.000000Z", endCause: "quiet_30" });
  });
  it("a restart: site activity after a pre-lock stop counts again from that event", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "site_activity", at: T("02-10") }]);
    expect(intervals(raw)).toEqual([
      { start: T("01-05"), startCause: "first_site_evidence", end: "2026-02-04T00:00:00.000000Z", endCause: "quiet_30" },
      { start: T("02-10"), startCause: "restart", end: null, endCause: null }]);
    expect(datesCounted(raw)).toEqual([...span("2026-01-05", "2026-02-03"), ...span("2026-02-10", "2026-02-28")]);
  });
  it("same-instant ties count as stopped: activity at the stop instant does not restart, and a stop at day 31 beats the day-31 start", () => {
    const atStop = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "site_activity", at: "2026-02-04T00:00:00.000000Z" }]);
    expect(intervals(atStop)).toHaveLength(1);
    const finishedBeforeStart = job(2, [{ kind: "finished_on_site", at: T("01-24") }]); // finish stop = 31 Jan 00:00 = day-31 start
    expect(intervals(finishedBeforeStart)).toEqual([]);
  });
  it("a lock stops counting for good; site work after the lock never restarts this job", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "site_activity", at: T("01-25") }], { lock: T("01-20", "15:00:00") });
    expect(intervals(raw)).toEqual([{ start: T("01-05"), startCause: "first_site_evidence", end: T("01-20", "15:00:00"), endCause: "lock" }]);
    expect(datesCounted(raw)).toEqual(span("2026-01-05", "2026-01-20"));
  });
  it("a closed job stops; activity while closed is ignored until it is reopened", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "closed", at: T("01-10") }, { kind: "site_activity", at: T("01-12") },
      { kind: "reopened", at: T("01-15") }, { kind: "site_activity", at: T("01-18") }]);
    expect(intervals(raw)).toEqual([
      { start: T("01-05"), startCause: "first_site_evidence", end: T("01-10"), endCause: "closed" },
      { start: T("01-18"), startCause: "restart", end: "2026-02-17T00:00:00.000000Z", endCause: "quiet_30" }]);
  });
  it("the same customer and site is one place; a second site is a second place", () => {
    const a = job(1, [{ kind: "first_site_evidence", at: T("01-05") }], { customer: 9, site: 9 });
    const b = job(2, [{ kind: "first_site_evidence", at: T("01-06") }], { customer: 9, site: 9 });
    const c = job(3, [{ kind: "first_site_evidence", at: T("01-06") }], { customer: 9, site: 10 });
    const day = counted("Builder", [a, b, c]).find(d => d.date === "2026-01-07")!;
    expect(day.rawPlaces).toBe(2);
    expect(day.places.find(p => p.jobIds.length === 2)?.jobIds).toEqual([id(101), id(102)]);
  });
  it("small allowances at 4 (Solo) and 7 (Builder); a place is small only if every job in it is small", () => {
    const small = (n: number) => job(n, [{ kind: "first_site_evidence", at: T("01-05") }], { small: true });
    const solo = counted("Solo", [1, 2, 3, 4, 5].map(small)).find(d => d.date === "2026-01-05")!;
    expect(solo).toMatchObject({ rawPlaces: 5, freeSmallPlaces: 4, countedPlaces: 1 });
    const builder = counted("Builder", [1, 2, 3, 4, 5, 6, 7, 8].map(small)).find(d => d.date === "2026-01-05")!;
    expect(builder).toMatchObject({ rawPlaces: 8, freeSmallPlaces: 7, countedPlaces: 1 });
    const mixed = counted("Solo", [small(1), job(2, [{ kind: "first_site_evidence", at: T("01-05") }], { customer: 1, site: 1, small: false })]).find(d => d.date === "2026-01-05")!;
    expect(mixed).toMatchObject({ rawPlaces: 1, freeSmallPlaces: 0, countedPlaces: 1 });
  });
  it("the £4,000 trip makes a small job take a place from its London date", () => {
    const small = (n: number, trip?: string) => job(n, [{ kind: "first_site_evidence", at: T("01-05") }], trip ? { small: true, trip } : { small: true });
    const days = counted("Solo", [small(1, T("01-20", "09:00:00")), small(2), small(3), small(4)]);
    expect(days.find(d => d.date === "2026-01-19")).toMatchObject({ countedPlaces: 0 });
    expect(days.find(d => d.date === "2026-01-20")).toMatchObject({ countedPlaces: 1 });
  });
  it("British Summer Time: a quiet stop on 1 October is 23:00 UTC on 30 September and does not touch 1 October", () => {
    const raw = job(1, [{ kind: "first_site_evidence", at: "2026-09-01T10:00:00.000000Z" }], { activatedAt: "2026-08-20T10:00:00.000000Z",
      asOf: "2026-10-31T12:00:00.000000Z", startDate: "2026-09-01", endDateExclusive: "2026-11-01" });
    expect(intervals(raw)[0]).toMatchObject({ end: "2026-09-30T23:00:00.000000Z", endCause: "quiet_30" });
    const dates = datesCounted(raw);
    expect(dates.at(-1)).toBe("2026-09-30");
  });
  it("replay is order-independent, and the held path is unchanged", () => {
    const facts = [{ kind: "first_site_evidence", at: T("01-05") }, { kind: "finished_on_site", at: T("01-10") }];
    const a = job(1, facts), b = { ...a, events: [...a.events].reverse() };
    expect(intervals(b)).toEqual(intervals(a));
    expect(() => projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [a] })).toThrow("INVALID_METER_LIFECYCLE_INPUT");
    expect(() => countMeterDays({ version: "meter-lifecycle-days-input.v1", plan: "Solo", jobs: [{ ...a, policy: { version: "meter-lifecycle-policy.v1", revision: "specified-foundation.v1", clockStatus: "held" } }] })).toThrow("INVALID_METER_LIFECYCLE_INPUT");
  });
});

it('SB-18: Cap bypass by resume, reopen or import; pause rotation; early lock; import grace', async () => {
 const { evaluateMeterPlaceAddition } = await import('./meter-place-admission.js');
 const input = (n: number, plan: "Solo" | "Builder" = "Solo") => {
  const place = (i: number) => ({tenantId:id(1),jobId:id(100+i),customerId:id(500+i),siteId:id(700+i),small:false});
  return {version:"meter-place-addition.v1",environment:"synthetic_demo",plan,planRevision:1,date:"2026-01-01",
   source:{kind:"switch_live",id:id(9999),expectedRevision:0},committedJobs:Array.from({length:n},(_,i)=>place(i)),prospective:place(n)};
 };
 const first = {kind:"first_site_evidence",at:T("01-05")};
 const finished = job(1,[first,{kind:"finished_on_site",at:T("01-10")}]);
 expect(datesCounted(finished)).toEqual(span("2026-01-05","2026-01-16"));
 // Continuing site activity cancels the finish marker, so weekly pause rotation cannot remove places.
 expect(intervals(job(1,[first,{kind:"finished_on_site",at:T("01-10")},{kind:"site_activity",at:T("01-12")}]))[0])
  .toMatchObject({end:"2026-02-11T00:00:00.000000Z",endCause:"quiet_30"});
 expect(datesCounted(job(1,[],{lock:T("01-02")}))).toEqual([]);
 expect(() => projectMeterJobTimeline({...job(1),events:[{...job(1,[first]).events[0],kind:"paused"}]})).toThrow();
 for (const kind of ["switch_live", "resume", "reopen", "live_import"] as const) {
  const grace = input(5), full = input(6);
  expect(evaluateMeterPlaceAddition({ ...grace, source: { ...grace.source, kind } }).decision).toBe("admit_upgrade_due");
  expect(evaluateMeterPlaceAddition({ ...full, source: { ...full.source, kind } }).decision).toBe("refuse_upgrade_required");
  const builder = input(13, "Builder");
  expect(evaluateMeterPlaceAddition({ ...builder, source: { ...builder.source, kind } }))
   .toMatchObject({ decision: "admit_track_review_due", maximumPence: 16900 });
 }
 const full = input(6), linked = full.committedJobs[0]!;
 expect(evaluateMeterPlaceAddition({ ...full, prospective: { ...full.prospective, customerId: linked.customerId, siteId: linked.siteId } }))
  .toMatchObject({ decision: "admit", before: 6, after: 6 });
 expect(() => evaluateMeterPlaceAddition({ ...full, countedToday: 0, earlyLock: true })).toThrow();
});
