import { z } from "zod";
import { computeSmallPlaceAllowance, computeSuppliedMeterPeriod, groupSuppliedMeterPlaces, londonMeterDateV1, syntheticMeterPolicyV1 } from "@jobguard/core";

export class MeterPersistenceError extends Error {
 constructor(readonly code: "INVALID_METER_INPUT" | "METER_FORBIDDEN" | "METER_UNAVAILABLE" | "METER_PROJECTION_MISMATCH" | "METER_CORRECTION_PERIOD_CLOSED") { super(code); this.name = "MeterPersistenceError"; }
}
// The parent and db currently pin different Zod patch releases. Cross the
// boundary through safeParse, rather than nesting foreign Zod implementation types.
export const meterLondonDateV1=z.string().refine(value=>londonMeterDateV1.safeParse(value).success);
const fixtureId=z.string().uuid().transform(value=>value.toLowerCase());
const fixtureJob=z.object({tenantId:fixtureId,jobId:fixtureId,customerId:fixtureId,siteId:fixtureId,small:z.boolean()}).strict();
/** Explicit synthetic facts only; this schema does not decide held lifecycle/trial endpoints. */
export const meterFixtureV1 = z.object({
 version: z.literal("meter-persisted-fixture.v1"), environment: z.literal("synthetic_demo"),
 startDate: meterLondonDateV1, endDateExclusive: meterLondonDateV1,
 days: z.array(z.object({ date: meterLondonDateV1, plan: z.enum(["Solo", "Builder"]), annualPrepaid: z.boolean(), trial: z.boolean(), jobs: z.array(fixtureJob) }).strict()).min(28).max(31),
}).strict();

export function projectMeterFixture(tenantId: string, raw: unknown) {
 try {
  tenantId = z.string().uuid().parse(tenantId).toLowerCase();
  const supplied = meterFixtureV1.parse(raw);
  const input = { ...supplied, days: supplied.days.map(day => ({ ...day, jobs: [...day.jobs].sort((a,b)=>a.jobId.localeCompare(b.jobId)) })).sort((a,b)=>a.date.localeCompare(b.date)) };
  const ledger = input.days.map(day => {
   if (day.jobs.some(job => job.tenantId !== tenantId)) throw new MeterPersistenceError("INVALID_METER_INPUT");
   const grouped = groupSuppliedMeterPlaces({version:"meter-fixed-places.v1",date:day.date,jobs:day.jobs});
   const allowance = computeSmallPlaceAllowance({version:"meter-small-allowance.v1",plan:day.plan,rawPlaces:grouped.places.length,smallPlaces:grouped.places.filter(place=>place.small).length});
   return {date:day.date,places:grouped.places,...allowance};
  });
  const result = computeSuppliedMeterPeriod({version:"meter-supplied-period.v1",environment:input.environment,policy:syntheticMeterPolicyV1,startDate:input.startDate,endDateExclusive:input.endDateExclusive,days:input.days.map((day,i)=>({date:day.date,plan:day.plan,annualPrepaid:day.annualPrepaid,trial:day.trial,countedPlaces:ledger[i]!.countedPlaces}))});
  return {input,result,ledger};
 } catch(error) { if(error instanceof MeterPersistenceError) throw error; throw new MeterPersistenceError("INVALID_METER_INPUT"); }
}
