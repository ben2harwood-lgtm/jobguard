import type {Pool} from "pg";
import {JobSourceError,customerMessageInputV1,diaryInputV1} from "@jobguard/core";
import {JobSourceRepository} from "@jobguard/db";
import {jobSourceReadQueryV1} from "./job-source.contracts.js";
import {PracticeAccess} from "./practice-access.js";
/** Shared persisted reads and checked intake. On-site notes and post-lock sources are refused in SQL. */
export class JobSourceApplication {
 private readonly access:PracticeAccess;
 private readonly repository:JobSourceRepository;
 constructor(pool:Pool,sessionId?:string){this.assertMode();this.access=new PracticeAccess(pool,sessionId);this.repository=new JobSourceRepository(pool)}
 private assertMode(){if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new JobSourceError("SYNTHETIC_MODE_REQUIRED")}
 async diary(jobId:string,query:unknown={}){this.assertMode();const auth=await this.access.job(jobId);if(!jobSourceReadQueryV1.safeParse(query).success)throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");return this.repository.read(auth.context,jobId,auth.digest,"diary")}
 async messages(jobId:string,query:unknown={}){this.assertMode();const auth=await this.access.job(jobId);if(!jobSourceReadQueryV1.safeParse(query).success)throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");return this.repository.read(auth.context,jobId,auth.digest,"customer_message")}
 /** Strict input before the checked routine; the server picks actor, tenant, time and hashes. */
 async intake(jobId:string,kind:"diary"|"customer_message",raw:unknown){
  this.assertMode();const auth=await this.access.job(jobId);
  if(!(kind==="diary"?diaryInputV1:customerMessageInputV1).safeParse(raw).success)throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
  return this.repository.intake(auth.context,jobId,auth.digest,kind,raw);
 }
}
