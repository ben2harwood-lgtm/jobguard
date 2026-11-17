import type { Pool } from "pg";
import { FinalCheckRepository } from "@jobguard/db";
import { FINAL_CHECK_EMPTY_TEXT,FINAL_CHECK_RUNNING_TEXT,parseFinalCheckDisposition } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
/** Authenticate the exact job before parsing any subject-bearing payload. Detector imports stay worker-only. */
export class FinalCheckApplication{
 private readonly access:PracticeAccess;private readonly repo:FinalCheckRepository;
 constructor(pool:Pool,sessionId?:string){this.access=new PracticeAccess(pool,sessionId);this.repo=new FinalCheckRepository(pool);}
 async get(jobId:string){const auth=await this.access.job(jobId);const view=await this.repo.read(auth.context,jobId,auth.digest);return {...view,message:view.state==="completed"?(view.items.length===0?FINAL_CHECK_EMPTY_TEXT:null):view.state==="failed"?null:FINAL_CHECK_RUNNING_TEXT};}
 async disposition(jobId:string,raw:unknown){const auth=await this.access.job(jobId);const command=parseFinalCheckDisposition(raw);return this.repo.disposition(auth.context,jobId,auth.digest,command);}
 async disputes(jobId:string){const auth=await this.access.job(jobId);return this.repo.disputes(auth.context,jobId,auth.digest);}
}
