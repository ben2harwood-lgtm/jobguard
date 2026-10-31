import { describe, it, expect } from "vitest";
import { trialPeriodAuthority, type TrialConversionInputV1 } from "./free-first-job-conversion.js";
import { approvedTrialClockV1, trialDeadlineV1 } from "./free-first-job-calendar.js";
import { computeSubscriptionPeriod } from "./subscription-period.js";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";
const tenant = "11111111-1111-4111-8111-111111111111", job = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
function input(month = "2026-04", length = 30): TrialConversionInputV1 {
 const startedAt = `${month}-01T00:00:00.000000Z`;
 return { version: "trial-conversion-input.v1", environment: "synthetic_demo", sourceId: source,
  timeline: { version: "trial-end-input.v1", trialId: source, tenantId: tenant, jobId: job, startedAt,
   deadline: trialDeadlineV1(startedAt, approvedTrialClockV1), asOf: `${month}-${length}T23:59:59.999999Z`,
   events: [{sourceId: source, tenantId: tenant, jobId: other, kind: "second_activation",
    effectiveAt: `${month}-11T12:00:00.000000Z`, recordedAt: `${month}-11T12:00:00.000000Z`}] },
  periodStart: `${month}-01`, periodEndExclusive: new Date(Date.parse(`${month}-01T00:00:00Z`) + length * 86400000).toISOString().slice(0,10),
  anchorDay: 1, terms: [{id: source, revision: 1, effectiveDate: `${month}-01`, plan: "Solo", cadence: "monthly"}] };
}
function price(raw: TrialConversionInputV1) {
 const authority = trialPeriodAuthority(raw);
 return computeSubscriptionPeriod({version: "subscription-period-preview.v1", meter: {
  version: "meter-supplied-period.v1", environment: "synthetic_demo", policy: syntheticMeterPolicyV1,
  startDate: raw.periodStart, endDateExclusive: raw.periodEndExclusive,
  days: authority.days.map(day => ({date: day.date, plan: day.plan, trial: day.trial, annualPrepaid: false, countedPlaces: 1})) }});
}
describe("MON-3 safest synthetic conversion", () => {
 it("starts on the successful second activation date, rounds once using the actual month", () => {
  for (const [month, length] of [["2026-02",28],["2028-02",29],["2026-04",30],["2026-03",31]] as const) {
   const raw = input(month,length), authority = trialPeriodAuthority(raw);
   expect(authority.days.filter(day=>day.trial)).toHaveLength(10);
   expect(price(raw).principal.pence).toBe(Math.round(2900*(length-10)/length));
  }
 });
 it("keeps lock and close day free and preserves all co-earliest source IDs", () => {
  for(const kind of ["lock","close"] as const) {
   const base = input();
   const raw = {...base, timeline: {...base.timeline, events: [{...base.timeline.events[0]!, kind, jobId: job}]}};
   expect(trialPeriodAuthority(raw).conversionDate).toBe("2026-04-12");
   const duplicate = {...raw, timeline: {...raw.timeline, events: [...raw.timeline.events, {...raw.timeline.events[0]!, sourceId: other}]}};
   expect(trialPeriodAuthority(duplicate).endSourceIds).toEqual([source,other]);
  }
 });
 it("active trial suppresses base and extras; repeats and exact duplicates are stable", () => {
  const base=input(), raw={...base,timeline:{...base.timeline,events:[]}};
  expect(price(raw).principal.pence).toBe(0);
  const original=input(), duplicate={...original,timeline:{...original.timeline,events:[...original.timeline.events,...original.timeline.events]}};
  expect(trialPeriodAuthority(duplicate)).toEqual(trialPeriodAuthority(input()));
 });
 it("rejects cross-company facts, conflicting replays, future periods and unsupported anchors", () => {
  const raw=input();
  expect(()=>trialPeriodAuthority({...raw,timeline:{...raw.timeline,events:[{...raw.timeline.events[0]!,tenantId:other}]}})).toThrow();
  expect(()=>trialPeriodAuthority({...raw,timeline:{...raw.timeline,events:[...raw.timeline.events,{...raw.timeline.events[0]!,kind:'lock',jobId:job}]}})).toThrow("TRIAL_SOURCE_CONFLICT");
  expect(()=>trialPeriodAuthority({...raw,anchorDay:31})).toThrow("TRIAL_PERIOD_BOUNDARY_MISMATCH");
  expect(()=>trialPeriodAuthority({...raw,timeline:{...raw.timeline,asOf:"2026-04-20T00:00:00.000000Z"}})).toThrow("TRIAL_FUTURE_PERIOD_UNAVAILABLE");
 });
 it("binds effective upgrade/downgrade revisions and rejects duplicate revision authority", () => {
  const base=input();const raw: TrialConversionInputV1={...base,terms:[...base.terms,{id:other,revision:2,effectiveDate:"2026-04-15",plan:"Builder",cadence:"monthly"},
   {id:job,revision:3,effectiveDate:"2026-05-01",plan:"Solo",cadence:"monthly"}]};
  const authority=trialPeriodAuthority(raw);
  expect(authority.days[13]!.plan).toBe("Solo");expect(authority.days[14]!.plan).toBe("Builder");expect(authority.days[29]!.plan).toBe("Builder");
  expect(()=>trialPeriodAuthority({...raw,terms:[...raw.terms,raw.terms[0]!]})).toThrow("TRIAL_TERMS_CONFLICT");
 });
 it("uses London day boundaries and never treats an unrecorded second activation as an end", () => {
  const raw=input("2026-03",31), original=raw.timeline.events[0]!;
  const event={...original,effectiveAt:"2026-03-29T23:30:00.000001Z",recordedAt:"2026-03-29T23:30:00.000001Z"};
  const shifted={...raw,timeline:{...raw.timeline,events:[event]}};
  expect(trialPeriodAuthority(shifted).conversionDate).toBe("2026-03-30");
  const delayed={...raw,timeline:{...raw.timeline,events:[{...event,recordedAt:"2026-04-01T00:00:00.000000Z"}]}};
  expect(trialPeriodAuthority(delayed).conversionDate).toBeNull();
 });
 it("starts on the exclusive day-90 deadline and keeps initial stub dates free", () => {
  const raw=input(), startedAt="2026-01-01T13:00:00.123456Z";
  const expired={...raw,timeline:{...raw.timeline,startedAt,deadline:trialDeadlineV1(startedAt,approvedTrialClockV1),events:[]}};
  expect(trialPeriodAuthority(expired).conversionDate).toBe("2026-04-01");
  const later="2026-04-02T00:00:00.000000Z";
  expect(trialPeriodAuthority({...raw,timeline:{...raw.timeline,startedAt:later,deadline:trialDeadlineV1(later,approvedTrialClockV1)}}).days[0]!.trial).toBe(true);
  expect(()=>trialPeriodAuthority({...raw,terms:[{...raw.terms[0]!,effectiveDate:"2026-04-02"}]})).toThrow("TRIAL_TERMS_UNAVAILABLE");
 });

});
