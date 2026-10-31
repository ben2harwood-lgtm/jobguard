import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { FreeFirstJobCardRepository } from "./free-first-job-card-repository.js";
import { trialCardRequestV1,trialCardAttemptV1 } from "./free-first-job-repository.js";
const env=process.env.JOBGUARD_ENV;
afterEach(()=>{if(env===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=env;});
it("no client completion, identity, tenant or provider authority",()=>{
 for(const field of ['status','outcome','reference','fingerprint','tenantId','verificationId'])expect(trialCardRequestV1.safeParse({version:"trial-card-request.v1",[field]:"completed"}).success).toBe(false);
 expect(trialCardAttemptV1.safeParse({version:"trial-card-attempt.v1",environment:"synthetic_demo",hypothetical:true,attemptId:randomUUID(),verificationId:randomUUID(),status:"completed"}).success).toBe(false);
});
it("production request cannot reach a connection",async()=>{
 process.env.JOBGUARD_ENV="production";
 await expect(new FreeFirstJobCardRepository({} as Pool).request({} as never,"a".repeat(64),randomUUID(),{version:"trial-card-request.v1"})).rejects.toMatchObject({code:"FREE_FIRST_JOB_SYNTHETIC_ONLY"});
});

it("mode change after the awaited SQL call rolls back the request transaction",async()=>{
 const {verifiedTenantContextForQueuedJob}=await import("./tenant-context.js");
 process.env.JOBGUARD_ENV="synthetic_demo";const statements:string[]=[];
 const pool={connect:async()=>({query:async(sql:string)=>{
  statements.push(sql);
  if(sql.includes('app.mon3_request_card'))process.env.JOBGUARD_ENV='production';
  return {rows:[{result:{version:'trial-card-attempt.v1',environment:'synthetic_demo',hypothetical:true,attemptId:randomUUID(),verificationId:randomUUID(),status:'requested'}}]};
 },release:()=>{}})} as unknown as Pool;
 await expect(new FreeFirstJobCardRepository(pool).request(verifiedTenantContextForQueuedJob(randomUUID()),"a".repeat(64),randomUUID(),{version:'trial-card-request.v1'})).rejects.toMatchObject({code:'FREE_FIRST_JOB_SYNTHETIC_ONLY'});
 expect(statements.at(-1)).toBe('ROLLBACK');expect(statements).not.toContain('COMMIT');
});
