import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { JobWorkStateError } from "@jobguard/core";
import { jobWorkStateFailure } from "./job-work-state.failure.js";
export { jobWorkStateFailure } from "./job-work-state.failure.js";
@Catch(JobWorkStateError)
export class JobWorkStateExceptionFilter implements ExceptionFilter {
 catch(error:JobWorkStateError,host:ArgumentsHost){
  const failure=jobWorkStateFailure(error)!;
  host.switchToHttp().getResponse<{setHeader(name:string,value:string):void;status(code:number):{json(body:unknown):void}}>().setHeader("Cache-Control","no-store");
  host.switchToHttp().getResponse<{status(code:number):{json(body:unknown):void}}>().status(failure.status).json(failure.body);
 }
}
