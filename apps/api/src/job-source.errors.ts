import {JobSourceError,JobWorkStateError} from "@jobguard/core";
import {PracticeAccessError,WatchdogError} from "@jobguard/db";
import {jobWorkStateFailure} from "./job-work-state.errors.js";
export function jobSourceFailure(error:unknown):{status:number;body:Record<string,unknown>} {
 // Intake shares the watchdog 409 and the post-lock linked-job 422 with other live-only commands.
 if(error instanceof WatchdogError&&error.code!=="JOB_NOT_FOUND")return {status:409,body:{code:error.code}};
 if(error instanceof JobWorkStateError)return jobWorkStateFailure(error)!;
 const code=error instanceof PracticeAccessError?error.code:error instanceof JobSourceError?error.code:"JOB_SOURCE_UNAVAILABLE";
 const mapped=code==="JOB_SOURCE_FORBIDDEN"?"NOT_FOUND":code;
 const status=mapped==="NOT_FOUND"?404:mapped==="UNAUTHENTICATED"?401:mapped==="SYNTHETIC_MODE_REQUIRED"?403:mapped==="INVALID_JOB_SOURCE_INPUT"?400:503;
 return {status,body:{version:"job-source-error.v1",code:mapped,environment:"synthetic_demo",realExternalActions:0}};
}
