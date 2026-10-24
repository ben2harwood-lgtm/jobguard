import { jobWorkStateReadQueryV1 } from "./job-work-state.contracts.js";
import type { Pool } from "pg";
import { JobWorkStateError } from "@jobguard/core";
import { JobWorkStateRepository } from "@jobguard/db";
import type { IdentityApplication } from "./auth/identity.application.js";
import type { TenantRequestCredentials } from "./auth/principal-bridge.js";
import { PracticeAccess } from "./practice-access.js";
/** Persisted synthetic commands and reads shared by Nest and Next. */
export class JobWorkStateApplication {
 private readonly access:PracticeAccess;
 private readonly repository:JobWorkStateRepository;
 constructor(pool:Pool,sessionId?:string) {
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new JobWorkStateError("SYNTHETIC_MODE_REQUIRED");
  this.access=new PracticeAccess(pool,sessionId);this.repository=new JobWorkStateRepository(pool);
 }
 async get(jobId:string,rawQuery:unknown={}) {
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new JobWorkStateError("SYNTHETIC_MODE_REQUIRED");
  const auth=await this.access.job(jobId);
  if(!jobWorkStateReadQueryV1.safeParse(rawQuery).success)throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  return this.repository.read(auth.context,jobId,auth.digest);
 }
 /** Optional normal-session authority uses the established identity bridge. */
 async command(jobId:string,raw:unknown,identity?:IdentityApplication,credentials?:TenantRequestCredentials) {
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new JobWorkStateError("SYNTHETIC_MODE_REQUIRED");
  if(identity && credentials){
   const context=await identity.context(credentials);
   const principal=await identity.principal(credentials.sessionToken);
   const membership=await identity.provider.findMembership(principal,context.tenantId);
   if(!membership || membership.role!=="owner")throw new JobWorkStateError("WORK_STATE_FORBIDDEN");
   return this.repository.command(context,jobId,membership.id,raw);
  }
  const auth=await this.access.job(jobId);
  return this.repository.command(auth.context,jobId,auth.digest,raw);
 }

}
