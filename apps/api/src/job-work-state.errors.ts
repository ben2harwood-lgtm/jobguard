import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { JobWorkStateError, LINKED_JOB_COPY, linkedJobOfferV1 } from "@jobguard/core";
export function jobWorkStateFailure(error:unknown):{status:number;body:Record<string,unknown>}|null {
 if(!(error instanceof JobWorkStateError))return null;
 if(error.code==="POST_LOCK_WORK_REQUIRES_LINKED_JOB"){
  const offer=linkedJobOfferV1.safeParse("offer" in error?error.offer:undefined);
  return {status:422,body:{...(offer.success?offer.data:{code:error.code,message:LINKED_JOB_COPY}),environment:"synthetic_demo",realExternalActions:0}};
 }
 return {status:error.code==="WORK_STATE_FORBIDDEN"?404:error.code==="SYNTHETIC_MODE_REQUIRED"?403:["JOB_NOT_LIVE","WORK_STATE_CONFLICT","WORK_STATE_STALE_REVISION","CAPACITY_ADMISSION_UNAVAILABLE","JOB_WORK_CLOSED"].includes(error.code)?409:400,body:{code:error.code==="WORK_STATE_FORBIDDEN"?"NOT_FOUND":["WORK_STATE_CONFLICT","WORK_STATE_STALE_REVISION","CAPACITY_ADMISSION_UNAVAILABLE","JOB_WORK_CLOSED"].includes(error.code)?"IDEMPOTENCY_CONFLICT":error.code,environment:"synthetic_demo",realExternalActions:0}};
}
@Catch(JobWorkStateError)
export class JobWorkStateExceptionFilter implements ExceptionFilter {
 catch(error:JobWorkStateError,host:ArgumentsHost){
  const failure=jobWorkStateFailure(error)!;
  host.switchToHttp().getResponse<{setHeader(name:string,value:string):void;status(code:number):{json(body:unknown):void}}>().setHeader("Cache-Control","no-store");
  host.switchToHttp().getResponse<{status(code:number):{json(body:unknown):void}}>().status(failure.status).json(failure.body);
 }
}
