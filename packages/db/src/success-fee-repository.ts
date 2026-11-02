import type { Pool } from "pg";
import { z } from "zod";
import { parseSuccessFeeCommand, SuccessFeeError, successFeeAvailabilityV1, successFeeResultV1, type SuccessFeeResult } from "@jobguard/core";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
function mapError(error:unknown):never {
 // Match both PostgreSQL error identity and bounded public message. Never expose SQL.
 if(error instanceof Error && "code" in error){
  if(error.code==="0A000" && error.message==="SUCCESS_FEE_DEPENDENCY_BOUND")throw new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND");
  if(["23514","40001"].includes(String(error.code)) && ["INVALID_SUCCESS_FEE_COMMAND","SUCCESS_FEE_REVIEW_REQUIRED","SUCCESS_FEE_SOURCE_CHANGED","SUCCESS_FEE_STALE","SUCCESS_FEE_IDEMPOTENCY_CONFLICT"].includes(error.message))
   throw new SuccessFeeError(error.message as import("@jobguard/core").SuccessFeeErrorCode);
  if(error.code==="42501")throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
 }
 throw error;
}
/** Controlled SQL source derivation; strict outputs recheck the shared arithmetic. */
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
 async command(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown):Promise<SuccessFeeResult>{
  const command=parseSuccessFeeCommand(raw),job=z.string().uuid().parse(jobId);
  try{return await withTenant(practiceMaterialPool(this.pool,digest),context,async db=>{
   const row=(await db.$client.query<{result:unknown}>("SELECT app.write_success_fee_v3($1,$2,$3::jsonb,NULL::jsonb) result",[job,digest,command])).rows[0];
   // Unknown/incomplete returns still roll back inside the transaction.
   if(!row)throw new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND");
   const result=successFeeResultV1.parse(row.result);
   if(result.jobId!==job || result.commandId!==command.commandId || result.action!==command.action
    || result.statement.expectedPostingRevision!==command.expectedPostingRevision
    || (command.action==="approve" && (result.reviewId!==command.reviewId || result.statementHash!==command.statementHash)))
    throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
   return result;
  });}catch(error){return mapError(error);}
 }
}
