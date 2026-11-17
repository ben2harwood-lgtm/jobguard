import {z} from "zod";
import type {Pool} from "pg";
import {diaryReadV1,customerMessageReadV1,JobSourceError,type DiaryRead,type CustomerMessageRead} from "@jobguard/core";
import {withTenant,type VerifiedTenantContext} from "./tenant-context.js";
/** Read-only. No context constructor, cached principal, or held intake method. */
export class JobSourceRepository {
 constructor(private readonly pool:Pool){}
 read(context:VerifiedTenantContext,jobId:string,digest:string,kind:"diary"):Promise<DiaryRead>;
 read(context:VerifiedTenantContext,jobId:string,digest:string,kind:"customer_message"):Promise<CustomerMessageRead>;
 async read(context:VerifiedTenantContext,jobId:string,digest:string,kind:"diary"|"customer_message"):Promise<DiaryRead|CustomerMessageRead>{
  if(!z.guid({ error: "Invalid uuid" }).safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest))throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try{
    const result=(await db.$client.query<{result:unknown}>("SELECT app.read_job_sources($1,$2,$3,$4) result",[context.tenantId,jobId,digest,kind])).rows[0]?.result;
    const parsed=(kind==="diary"?diaryReadV1:customerMessageReadV1).safeParse(result);if(!parsed.success)throw new JobSourceError("SOURCE_NOT_FINALIZED");return parsed.data;
   }catch(error){if(error instanceof Error && error.message==="JOB_SOURCE_FORBIDDEN")throw new JobSourceError("JOB_SOURCE_FORBIDDEN");throw error}
  });
 }
}
