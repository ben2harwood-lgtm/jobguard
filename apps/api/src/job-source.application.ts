import type {Pool} from "pg";
import {JobSourceError} from "@jobguard/core";
import {JobSourceRepository} from "@jobguard/db";
import {jobSourceReadQueryV1} from "./job-source.contracts.js";
import {PracticeAccess} from "./practice-access.js";
/** Shared persisted reads only; Q3 and Q4 creation paths remain held. */
export class JobSourceApplication {
 private readonly access:PracticeAccess;
 private readonly repository:JobSourceRepository;
 constructor(pool:Pool,sessionId?:string){this.assertMode();this.access=new PracticeAccess(pool,sessionId);this.repository=new JobSourceRepository(pool)}
 private assertMode(){if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new JobSourceError("SYNTHETIC_MODE_REQUIRED")}
 async diary(jobId:string,query:unknown={}){this.assertMode();const auth=await this.access.job(jobId);if(!jobSourceReadQueryV1.safeParse(query).success)throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");return this.repository.read(auth.context,jobId,auth.digest,"diary")}
 async messages(jobId:string,query:unknown={}){this.assertMode();const auth=await this.access.job(jobId);if(!jobSourceReadQueryV1.safeParse(query).success)throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");return this.repository.read(auth.context,jobId,auth.digest,"customer_message")}
}
