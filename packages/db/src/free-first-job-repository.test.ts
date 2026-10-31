import { afterEach, describe, expect, it } from "vitest";
import { FreeFirstJobRepository, trialAdmissionV1 } from "./free-first-job-repository.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
const env=process.env.JOBGUARD_ENV;
afterEach(()=>{if(env===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=env;});
export const input=()=>({version:"trial-admission.v1",activationId:randomUUID(),termsId:randomUUID(),jobId:randomUUID(),acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),expectedJobRevision:1,authorizationId:randomUUID()});
describe("B admission boundary",()=>{
 it("strict inputs cannot supply enablement, keys, verified identity or clock",()=>{
  expect(trialAdmissionV1.safeParse(input()).success).toBe(true);
  for(const field of ['enabled','companyNumber','cardFingerprint','deadline','trial'])expect(trialAdmissionV1.safeParse({...input(),[field]:true}).success).toBe(false);
 });
 it("exact synthetic denial occurs before pool access",async()=>{
  process.env.JOBGUARD_ENV="production";
  await expect(new FreeFirstJobRepository({} as Pool).admit({} as never,"a".repeat(64),randomUUID(),input())).rejects.toMatchObject({code:"FREE_FIRST_JOB_SYNTHETIC_ONLY"});
 });
});

it("ATOMIC-01 fails closed and rolls back if the database unexpectedly returns admission",async()=>{
 const {verifiedTenantContextForQueuedJob}=await import("./tenant-context.js");
 process.env.JOBGUARD_ENV="synthetic_demo";const statements:string[]=[];
 const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);return {rows:[{result:{state:'live'}}]};},release:()=>{}})} as unknown as Pool;
 await expect(new FreeFirstJobRepository(pool).admit(verifiedTenantContextForQueuedJob(randomUUID()),"a".repeat(64),randomUUID(),input())).rejects.toMatchObject({code:'FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C'});
 expect(statements.at(-1)).toBe('ROLLBACK');expect(statements).not.toContain('COMMIT');
});

it("AUTH-01 disabled mutation checks persisted actor before receipt replay",async()=>{
 const {DisabledFreeFirstJobActivationMutation}=await import("./activation-repository.js");
 const {trialInput:parse}=await import("./free-first-job-repository.js");
 const value=parse(trialAdmissionV1,input());process.env.JOBGUARD_ENV='synthetic_demo';
 const actor=randomUUID(),statements:string[]=[];
 const db={$client:{query:async(sql:string)=>{statements.push(sql);return {rows:[{actor}]};}}} as unknown as import('./tenant-context.js').TenantTransaction;
 const mutation=new DisabledFreeFirstJobActivationMutation(randomUUID(),'a'.repeat(64),value);
 await expect(mutation.lock(db,{actorMembershipId:randomUUID()} as import('./commands.js').ConsequentialCommand)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
 expect(statements).toEqual(['SELECT app.mon3_owner($1,$2) actor']);
});
