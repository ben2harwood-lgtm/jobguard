import type { Pool } from "pg";
import { parseSuccessFeeCommand, SuccessFeeError } from "@jobguard/core";
import { PracticeAccessError, SuccessFeeRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { successFeeQueryV1 } from "./success-fee.contracts.js";
export function successFeeFailure(error:unknown):{status:number;body:{code:string}}|null {
 if(error instanceof PracticeAccessError)return {status:error.code==="NOT_FOUND"?404:error.code==="UNAUTHENTICATED"?401:403,body:{code:error.code}};
 if(error instanceof SuccessFeeError)return {status:error.code==="SUCCESS_FEE_DEPENDENCY_BOUND"?503:error.code==="SUCCESS_FEE_FORBIDDEN"?403:["SUCCESS_FEE_STALE","SUCCESS_FEE_SOURCE_CHANGED","SUCCESS_FEE_IDEMPOTENCY_CONFLICT","SUCCESS_FEE_REVIEW_REQUIRED"].includes(error.code)?409:400,body:{code:error.code}};
 return null;
}
export class SuccessFeeApplication {
 private readonly access:PracticeAccess;
 private readonly repository:SuccessFeeRepository;
 constructor(pool:Pool,sessionId?:string){this.access=new PracticeAccess(pool,sessionId);this.repository=new SuccessFeeRepository(pool);}
 private async authorize(jobId:string,query:unknown,tenantSelection:boolean){
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
  const auth=await this.access.job(jobId);
  if(tenantSelection || !successFeeQueryV1.safeParse(query).success)throw new SuccessFeeError();
  return auth;
 }
 async view(jobId:string,query:unknown={},tenantSelection=false){
  const auth=await this.authorize(jobId,query,tenantSelection);
  return this.repository.view(auth.context,jobId,auth.digest);
 }
 /** Next defers body reading until current session/job access has succeeded. */
 async command(jobId:string,raw:unknown|(()=>Promise<unknown>),query:unknown={},tenantSelection=false){
  const auth=await this.authorize(jobId,query,tenantSelection);
  let body:unknown;
  try{body=typeof raw==="function"?await (raw as ()=>Promise<unknown>)():raw;}
  catch(error){if(error instanceof SyntaxError)throw new SuccessFeeError();throw error;}
  const command=parseSuccessFeeCommand(body);
  return this.repository.command(auth.context,jobId,auth.digest,command);
 }
}
