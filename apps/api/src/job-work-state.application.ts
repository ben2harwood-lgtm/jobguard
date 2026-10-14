import { jobWorkStateReadQueryV1 } from "./job-work-state.contracts.js";
import type { Pool } from "pg";
import { JobWorkStateError } from "@jobguard/core";
import { JobWorkStateRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
/** Persisted synthetic reads shared by Nest and Next; no held command is exposed. */
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
}
