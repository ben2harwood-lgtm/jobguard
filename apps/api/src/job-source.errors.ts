import {JobSourceError} from "@jobguard/core";
import {PracticeAccessError} from "@jobguard/db";
export function jobSourceFailure(error:unknown):{status:number;body:Record<string,unknown>} {
 const code=error instanceof PracticeAccessError?error.code:error instanceof JobSourceError?error.code:"JOB_SOURCE_UNAVAILABLE";
 const mapped=code==="JOB_SOURCE_FORBIDDEN"?"NOT_FOUND":code;
 const status=mapped==="NOT_FOUND"?404:mapped==="UNAUTHENTICATED"?401:mapped==="SYNTHETIC_MODE_REQUIRED"?403:mapped==="INVALID_JOB_SOURCE_INPUT"?400:503;
 return {status,body:{version:"job-source-error.v1",code:mapped,environment:"synthetic_demo",realExternalActions:0}};
}
