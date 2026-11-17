import type { Pool } from "pg";
import { parsePaymentFeeCommand, PaymentFeeStatementError } from "@jobguard/core";
import { PaymentFeeRepository, PracticeAccessError } from "@jobguard/db";
import { z } from "zod";
import { PracticeAccess } from "./practice-access.js";
export function paymentFeeFailure(error:unknown):{status:number;body:{code:string}}|null {
 if(error instanceof PracticeAccessError)return {status:error.code==="UNAUTHENTICATED"?401:error.code==="NOT_FOUND"?404:403,body:{code:error.code}};
 if(error instanceof PaymentFeeStatementError)return {status:400,body:{code:error.code}};
 if(error instanceof Error){
  if(["FINAL_CHECK_FORBIDDEN","PAYMENT_FEE_FORBIDDEN"].includes(error.message))return {status:404,body:{code:"NOT_FOUND"}};
  if(error.message==="INVALID_PAYMENT_FEE_COMMAND")return {status:400,body:{code:error.message}};
  if(["PAYMENT_FEE_SOURCE_REQUIRED","PAYMENT_FEE_ATTRIBUTION_REQUIRED","PAYMENT_FEE_SOURCE_CHANGED","PAYMENT_FEE_PAUSED","PAYMENT_FEE_APPROVAL_CHANGED","PAYMENT_FEE_REASSESSMENT_REQUIRED","PAYMENT_FEE_IDEMPOTENCY_CONFLICT"].includes(error.message))return {status:409,body:{code:error.message}};
 }
 return null;
}
/** App authenticates; SQL rechecks the current owner and all bound sources. */
export class PaymentFeeApplication {
 private readonly access:PracticeAccess;
 private readonly repository:PaymentFeeRepository;
 constructor(pool:Pool,session?:string){this.access=new PracticeAccess(pool,session);this.repository=new PaymentFeeRepository(pool);}
 private check(query:unknown){
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
  if(!z.object({}).strict().safeParse(query).success)throw new PaymentFeeStatementError();
 }
 async get(jobId:string,query:unknown={}){
  this.check(query);const auth=await this.access.job(jobId);
  return this.repository.read(auth.context,jobId,auth.digest);
 }
 async command(jobId:string,raw:unknown,query:unknown={}){
  this.check(query);const auth=await this.access.job(jobId);
  return this.repository.command(auth.context,jobId,auth.digest,parsePaymentFeeCommand(raw));
 }
}
