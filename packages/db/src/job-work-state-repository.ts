import type { Pool } from "pg";
import { z } from "zod";
import { jobWorkStateReadV1, jobWorkStateMutationV1, JobWorkStateError } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";

import { requireLiveJob, WatchdogError } from "./watchdog.js";

export const workStateReadV1 = jobWorkStateReadV1;
/** Receives the existing stamp per call. Contains no context constructor or saved authority. */
export class JobWorkStateRepository {
 constructor(private readonly pool:Pool) {}
 async read(context:VerifiedTenantContext,jobId:string,digest:string) {
  if(!z.string().uuid().safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest))throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try {
    const row=(await db.$client.query<{result:unknown}>("SELECT app.ch4_read_work_facts($1,$2,$3) result",[context.tenantId,jobId,digest])).rows[0];
    const parsed=workStateReadV1.safeParse(row?.result);if(!parsed.success)throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return parsed.data;
   } catch(error) {if(error instanceof Error && error.message==="WORK_STATE_FORBIDDEN")throw new JobWorkStateError("WORK_STATE_FORBIDDEN");throw error;}
  });
 }
 // Live-only prechecks precede SQL business locks; SQL also enforces lifecycle.
 async finish(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown) { const input=jobWorkStateMutationV1.safeParse(raw);if(!input.success||input.data.action!=="finish")throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return this.execute(context,jobId,digest,input.data,async db=>{await requireLiveJob(db,jobId);}); }
 async cancelFinish(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown) { const input=jobWorkStateMutationV1.safeParse(raw);if(!input.success||input.data.action!=="cancel_finish")throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return this.execute(context,jobId,digest,input.data,async db=>{await requireLiveJob(db,jobId);}); }
 async resume(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown) { const input=jobWorkStateMutationV1.safeParse(raw);if(!input.success||input.data.action!=="resume")throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return this.execute(context,jobId,digest,input.data,async db=>{await requireLiveJob(db,jobId);}); }
 async command(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown) {
  const input=jobWorkStateMutationV1.safeParse(raw);
  if(!input.success)throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  if(input.data.action==="finish")return this.finish(context,jobId,digest,input.data);
  if(input.data.action==="cancel_finish")return this.cancelFinish(context,jobId,digest,input.data);
  return this.execute(context,jobId,digest,input.data);
 }
 /** SQL derives and rechecks authority, serializes work, and returns the durable first snapshot. */
 private async execute(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown,precheck?: (db:TenantTransaction)=>Promise<void>) {
  const input=jobWorkStateMutationV1.safeParse(raw);
  if(!input.success || !z.string().uuid().safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest))throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try {
    // Resume remains unavailable until MON-1-PLACES supplies capacity admission.
    if(input.data.action==="resume")throw new JobWorkStateError("CAPACITY_ADMISSION_UNAVAILABLE");
    await precheck?.(db);
    const sql=input.data.action==="link"?"SELECT app.ch4_link_post_lock_job($1,$2,$3,$4::jsonb) result":"SELECT app.ch4_record_work_state($1,$2,$3,$4::jsonb) result";
    const row=(await db.$client.query<{result:unknown}>(sql,[context.tenantId,jobId,digest,JSON.stringify(input.data)])).rows[0];
    const parsed=workStateReadV1.safeParse(row?.result);
    if(!parsed.success)throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return parsed.data;
   } catch(error) {
    if(error instanceof Error) {
     if(error.message==="WORK_STATE_CONFLICT")throw new WatchdogError("IDEMPOTENCY_CONFLICT");
     if(error.message==="JOB_NOT_LIVE")throw new JobWorkStateError("JOB_NOT_LIVE");
     if(error.message==="JOB_NOT_FOUND")throw new JobWorkStateError("WORK_STATE_FORBIDDEN");
     if(error.message==="INVALID_JOB_LINK" || error.message==="JOB_LINK_CYCLE" || error.message==="INVALID_WORK_PREDECESSOR")throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
     const codes=["WORK_STATE_FORBIDDEN","INVALID_WORK_STATE_INPUT","WORK_STATE_CONFLICT","WORK_STATE_STALE_REVISION","CAPACITY_ADMISSION_UNAVAILABLE","JOB_WORK_CLOSED","POST_LOCK_WORK_REQUIRES_LINKED_JOB"] as const;
     const code=codes.find(code=>code===error.message);if(code)throw new JobWorkStateError(code);
    }
    throw error;
   }
  });
 }

}
