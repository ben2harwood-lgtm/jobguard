import type { Pool } from "pg";
import { parseRecoveryAttributionCommand, RecoveryAttributionError } from "@jobguard/core";
import { PracticeAccessError, RecoveryAttributionRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { recoveryAttributionHistoryV1, recoveryAttributionReadQueryV1 } from "./recovery-attribution.contracts.js";
export class RecoveryAttributionDependencyError extends Error {
 readonly code="RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND";
 constructor(){super("RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND");}
}
function syntheticOnly(){if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");}
export function recoveryAttributionFailure(error:unknown):{status:number;body:{code:string}}|null {
 if(error instanceof PracticeAccessError)return {status:error.code==="NOT_FOUND"?404:error.code==="UNAUTHENTICATED"?401:403,body:{code:error.code}};
 if(error instanceof RecoveryAttributionError)return {status:400,body:{code:error.code}};
 if(error instanceof RecoveryAttributionDependencyError || error instanceof Error && error.message==="RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND")return {status:503,body:{code:"RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND"}};
 return null;
}
/** Every call authenticates again, including historical reads and attempted replay. */
export class RecoveryAttributionApplication {
 private readonly access:PracticeAccess;
 private readonly repository:RecoveryAttributionRepository;
 constructor(pool:Pool,sessionId?:string){this.access=new PracticeAccess(pool,sessionId);this.repository=new RecoveryAttributionRepository(pool);}
 async get(jobId:string,query:unknown={}){
  syntheticOnly();const auth=await this.access.job(jobId);
  if(!recoveryAttributionReadQueryV1.safeParse(query).success)throw new RecoveryAttributionError();
  const revisions=await this.repository.history(auth.context,jobId,auth.digest);
  return recoveryAttributionHistoryV1.parse({version:"recovery-attribution-history.v1",jobId,environment:"synthetic_demo",proposed:true,principalOnly:true,productionEnabled:false,realExternalActions:0,qualification:"dependency_bound",revisions});
 }
 async command(jobId:string,raw:unknown,query:unknown={}){
  syntheticOnly();await this.access.job(jobId);
  if(!recoveryAttributionReadQueryV1.safeParse(query).success)throw new RecoveryAttributionError();
  parseRecoveryAttributionCommand(raw);
  // The accepted source adapter, audit transaction and review bridge are prerequisites.
  // Do not reinterpret a parsed command or stored fixture as authority to execute.
  throw new RecoveryAttributionDependencyError();
 }
}
