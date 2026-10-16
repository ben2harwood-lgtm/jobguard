import type { Pool } from "pg";
import { z } from "zod";
import { computeSuppliedMeterPeriod,suppliedMeterPeriodResultV1 } from "@jobguard/core";
import { withTenant,type VerifiedTenantContext } from "./tenant-context.js";
import { MeterPersistenceError,meterLondonDateV1 } from "./meter-persistence.js";
const uuid=z.string().uuid();
export const meterReadRequestV1=z.object({version:z.literal("meter-read.v1"),computationId:uuid}).strict();
export const meterRebuildRequestV1=z.object({version:z.literal("meter-rebuild.v1"),startDate:meterLondonDateV1}).strict();
const parentResult=z.unknown().transform((raw,ctx)=>{
 const parsed=suppliedMeterPeriodResultV1.safeParse(raw);
 if(!parsed.success||parsed.data.environment!=="synthetic_demo"){
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Invalid synthetic meter result"});return z.NEVER;
 }
 return parsed.data;
});
const correctionMoney=z.object({pence:z.number().int().safe().min(-16900).max(16900),currency:z.literal("GBP")}).strict();
export const persistedMeterReadV1=z.object({
 version:z.literal("meter-persisted-read.v1"),hypothetical:z.literal(true),computationId:uuid,sourceId:uuid,
 sourceHash:z.string().regex(/^[a-f0-9]{64}$/u),resultHash:z.string().regex(/^[a-f0-9]{64}$/u),result:parentResult,
 corrections:z.array(z.object({id:uuid,sourcePeriod:meterLondonDateV1,applyStart:meterLondonDateV1,delta:correctionMoney}).strict()),
 alerts:z.array(z.literal("METER_CACHE_MISMATCH")),
}).strict();
export type PersistedMeterRead=z.infer<typeof persistedMeterReadV1>;
function checkedRead(raw:unknown):PersistedMeterRead {
 const parsed=persistedMeterReadV1.safeParse(raw);
 if(!parsed.success)throw new MeterPersistenceError("METER_PROJECTION_MISMATCH");
 const {result}=parsed.data;
 const expected=computeSuppliedMeterPeriod({version:"meter-supplied-period.v1",environment:result.environment,policy:result.policy,startDate:result.startDate,endDateExclusive:result.endDateExclusive,
  days:result.days.map(({date,plan,annualPrepaid,trial,countedPlaces})=>({date,plan,annualPrepaid,trial,countedPlaces}))});
 // Both values are parsed through the parent's ordered result schema first.
 if(JSON.stringify(expected)!==JSON.stringify(result))throw new MeterPersistenceError("METER_PROJECTION_MISMATCH");
 return parsed.data;
}
/** No HTTP route or saved context. Reads normal companies only; shared practice is held. */
export class MeterRepository {
 constructor(private readonly pool:Pool){}
 async read(context:VerifiedTenantContext,digest:string,raw:unknown):Promise<PersistedMeterRead>{
  const input=meterReadRequestV1.safeParse(raw);
  if(!input.success||!validDigest(digest))throw new MeterPersistenceError("INVALID_METER_INPUT");
  return this.run(context,async db=>checkedRead((await db.query("SELECT app.mon1_read($1,$2,$3) result",[context.tenantId,digest,input.data.computationId])).rows[0]?.result));
 }
 async rebuild(context:VerifiedTenantContext,digest:string,raw:unknown):Promise<PersistedMeterRead>{
  const input=meterRebuildRequestV1.safeParse(raw);
  if(!input.success||!validDigest(digest))throw new MeterPersistenceError("INVALID_METER_INPUT");
  return this.run(context,async db=>{
   const id=(await db.query("SELECT app.mon1_rebuild($1,$2,$3::date) id",[context.tenantId,digest,input.data.startDate])).rows[0]?.id;
   return checkedRead((await db.query("SELECT app.mon1_read($1,$2,$3) result",[context.tenantId,digest,id])).rows[0]?.result);
  });
 }
 private async run<T>(context:VerifiedTenantContext,fn:(db:import("pg").PoolClient)=>Promise<T>):Promise<T>{
  try{return await withTenant(this.pool,context,db=>fn(db.$client));}
  catch(error){
   if(error instanceof MeterPersistenceError)throw error;
   if(error instanceof Error&&(error.message==="METER_FORBIDDEN"||error.message==="METER_CORRECTION_PERIOD_CLOSED"))throw new MeterPersistenceError(error.message);
   throw new MeterPersistenceError("METER_UNAVAILABLE");
  }
 }
}
function validDigest(value:unknown):value is string{return typeof value==="string"&&/^[a-f0-9]{64}$/u.test(value);}
