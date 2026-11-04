import {z} from "zod";
import type {Pool} from "pg";
import {diaryReadV1,customerMessageReadV1,jobSourceIntakeReceiptV1,JobSourceError,JobWorkStateError,type DiaryRead,type CustomerMessageRead,type JobSourceIntakeReceipt} from "@jobguard/core";
import {WatchdogError} from "./watchdog.js";
import {withTenant,type VerifiedTenantContext} from "./tenant-context.js";
/** Persisted reads and the one checked intake routine. No context constructor or cached principal. */
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
 /** Diary notes and fictional customer messages through app.sv7a_intake_job_source only.
  * `owner` is the practice session digest, or a trusted server membership id: the same CH-4 authority seam
  * (app.ch4_require_command_owner) the work-state commands use. Routine-guarded live-only command (CH-2): the checked
  * routine replays first, then refuses a new note on a job that is not live. */
 async intake(context:VerifiedTenantContext,jobId:string,owner:string,kind:"diary"|"customer_message",raw:unknown):Promise<JobSourceIntakeReceipt>{
  if(!z.guid({ error: "Invalid uuid" }).safeParse(jobId).success || !(/^[a-f0-9]{64}$/u.test(owner) || z.guid().safeParse(owner).success))throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try{
    // Separate first lock, with authority checked before and after the wait.
    // The writer rechecks lifecycle after replay, so post-live retries still work.
    await db.$client.query("SELECT app.sv7a_require_watchdog_live_lock($1,$2,$3)",[context.tenantId,jobId,owner]);
    const result=(await db.$client.query<{result:unknown}>("SELECT app.sv7a_intake_job_source($1,$2,$3,$4,$5::jsonb) result",[context.tenantId,jobId,owner,kind,JSON.stringify(raw)])).rows[0]?.result;
    const parsed=jobSourceIntakeReceiptV1.safeParse(result);if(!parsed.success)throw new JobSourceError("SOURCE_NOT_FINALIZED");return parsed.data;
   }catch(error){
    if(!(error instanceof Error))throw error;
    if(["JOB_SOURCE_FORBIDDEN","JOB_NOT_FOUND"].includes(error.message))throw new JobSourceError("JOB_SOURCE_FORBIDDEN");
    if(error.message==="INVALID_JOB_SOURCE_INPUT")throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
    // Missing MON-1 admission facts fail closed.
    if(error.message==="CAPACITY_ADMISSION_UNAVAILABLE")throw new JobSourceError("JOB_SOURCE_UNAVAILABLE");
    const workCode=(["POST_LOCK_WORK_REQUIRES_LINKED_JOB","METER_UPGRADE_REQUIRED","METER_PROJECTION_MISMATCH","JOB_WORK_CLOSED"] as const).find(code=>code===error.message);
    if(workCode)throw new JobWorkStateError(workCode);
    if(error.message==="JOB_NOT_LIVE"||error.message==="IDEMPOTENCY_CONFLICT")throw new WatchdogError(error.message);
    throw error;
   }
  });
 }
}
