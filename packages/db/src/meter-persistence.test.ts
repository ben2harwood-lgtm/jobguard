import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSuppliedMeterPeriod, syntheticMeterPolicyV1 } from "@jobguard/core";
import { meterFixtureV1, projectMeterFixture, MeterPersistenceError } from "./meter-persistence.js";
const tenantId = randomUUID(), customerId = randomUUID(), siteId = randomUUID();
const jobs = Array.from({ length: 8 }, () => ({ tenantId, jobId: randomUUID(), customerId: randomUUID(), siteId, small: false }));
const fixture = (places = 8) => ({ version: "meter-persisted-fixture.v1", environment: "synthetic_demo", startDate: "2026-09-01", endDateExclusive: "2026-10-01", days: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, plan: "Builder", annualPrepaid: false, trial: false, jobs: jobs.slice(0, places) })) });
describe("MON-1B persisted synthetic projection", () => {
 it("MON1-A07 MON1-A08 MON1-A21 supplied daily facts project through the unchanged parent formula", () => {
  const projected = projectMeterFixture(tenantId, fixture());
  expect(projected.result.principal.pence).toBe(8900);
  expect(projected.result).toEqual(computeSuppliedMeterPeriod({version:"meter-supplied-period.v1", environment:"synthetic_demo", policy:syntheticMeterPolicyV1, startDate:"2026-09-01",endDateExclusive:"2026-10-01",days:projected.result.days.map(({date,plan,annualPrepaid,trial,countedPlaces})=>({date,plan,annualPrepaid,trial,countedPlaces}))}));
  const same = fixture(); same.days[0]!.jobs = jobs.map(job => ({...job,customerId}));
  expect(projectMeterFixture(tenantId,same).result.days[0]!.countedPlaces).toBe(1);
  const small = fixture(); small.days[0]!.jobs = jobs.map(job=>({...job,small:true}));
  expect(projectMeterFixture(tenantId,small).result.days[0]!.countedPlaces).toBe(1);
 });
 it.each([["Solo",5,4900],["Solo",6,4900],["Builder",8,8900],["Builder",12,16900]])("MON1-A21 parent fixture %s / %i persists %i principal",(plan,places,expected)=>{
  const input=fixture(); const extended=Array.from({length:places},()=>({...jobs[0]!,jobId:randomUUID(),customerId:randomUUID()}));
  const raw={...input,days:input.days.map(day=>({...day,plan,jobs:extended}))};
  expect(projectMeterFixture(tenantId,raw).result.principal.pence).toBe(expected);
 });
 it("MON1-A33 rejects unknown versions, client prices/counts/actors, missing dates and foreign tenants", () => {
  for(const extra of [{version:"v2"},{countedPlaces:2},{principal:1},{actorId:randomUUID()},{policy:{}}]) expect(()=>projectMeterFixture(tenantId,{...fixture(),...extra})).toThrow(MeterPersistenceError);
  expect(()=>projectMeterFixture(tenantId,{...fixture(),days:fixture().days.slice(1)})).toThrow(MeterPersistenceError);
  const foreign=fixture();foreign.days[0]!.jobs=[{...jobs[0]!,tenantId:randomUUID()}];
  expect(()=>projectMeterFixture(tenantId,foreign)).toThrow(MeterPersistenceError);
  expect(meterFixtureV1.safeParse({...fixture(),environment:"production"}).success).toBe(false);
 });
 it("MON1-A33 rejects malformed tenant authority even on empty fixture days",()=>{
  const input=fixture();input.days.forEach(day=>day.jobs=[]);
  expect(()=>projectMeterFixture("invalid",input)).toThrow(MeterPersistenceError);
 });
 it("MON1-A23 MON1-A27 supplied input order is canonical and there is no cached or shadow input",()=>{
  const input=fixture(), reverse={...input,days:[...input.days].reverse().map(day=>({...day,jobs:[...day.jobs].reverse()}))};
  expect(projectMeterFixture(tenantId,reverse)).toEqual(projectMeterFixture(tenantId,input));
  expect(()=>projectMeterFixture(tenantId,{...input,signals:[]})).toThrow(MeterPersistenceError);
 });
});
