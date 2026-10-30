import type { Pool } from "pg";
import { z } from "zod";
import { parseSuccessFeeCommand, SuccessFeeError, successFeeAvailabilityV1 } from "@jobguard/core";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
function mapError(error:unknown):never {
 // Match both PostgreSQL error identity and bounded public message. Never expose SQL.
 if(error instanceof Error && "code" in error){
  if(error.code==="0A000" && error.message==="SUCCESS_FEE_DEPENDENCY_BOUND")throw new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND");
  if(error.code==="42501")throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
 }
 throw error;
}
/** Controlled, closed boundary. No business source reconstruction or direct writes. */
export class SuccessFeeRepository {
 constructor(private readonly pool:Pool){}
 async view(context:VerifiedTenantContext,jobId:string,digest:string){
  const job=z.string().uuid().parse(jobId);
  try{return await withTenant(practiceMaterialPool(this.pool,digest),context,async db=>{
   const row=(await db.$client.query<{result:unknown}>("SELECT app.read_success_fee_v3($1,$2) result",[job,digest])).rows[0];
   const result=successFeeAvailabilityV1.parse(row?.result);
   if(result.jobId!==job)throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
   return result;
  });}catch(error){return mapError(error);}
 }
 async command(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown):Promise<never>{
  const command=parseSuccessFeeCommand(raw),job=z.string().uuid().parse(jobId);
  try{await withTenant(practiceMaterialPool(this.pool,digest),context,async db=>{
   await db.$client.query("SELECT app.write_success_fee_v3($1,$2,$3::jsonb,NULL::jsonb)",[job,digest,command]);
   // Defensive stop if a future incompatible routine unexpectedly returns.
   throw new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND");
  });}catch(error){return mapError(error);}
  throw new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND");
 }
}
