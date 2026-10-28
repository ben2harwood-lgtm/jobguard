import type { Pool } from "pg";
import { z } from "zod";
import { jobWorkStateReadV1, jobWorkStateMutationV1, JobWorkStateError } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";

import { practiceOwnedJobsSql } from "./practice-session.js";
import { requireLiveJob, WatchdogError } from "./watchdog.js";

export const workStateReadV1 = jobWorkStateReadV1;
/** Receives the existing stamp per call. Contains no context constructor or saved authority. */
export class JobWorkStateRepository {
 constructor(private readonly pool:Pool) {}
 async read(context:VerifiedTenantContext,jobId:string,digest:string) {
  if(!z.guid({ error: "Invalid uuid" }).safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest))throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try {
    const row=(await db.$client.query<{result:unknown}>("SELECT app.ch4_read_work_facts($1,$2,$3) result",[context.tenantId,jobId,digest])).rows[0];
    const parsed=workStateReadV1.safeParse(row?.result);if(!parsed.success)throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return parsed.data;
   } catch(error) {if(error instanceof Error && error.message==="WORK_STATE_FORBIDDEN")throw new JobWorkStateError("WORK_STATE_FORBIDDEN");throw error;}
  });
 }
 // Authentication precedes the live SHARE guard. SQL never upgrades finish/cancel locks.
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
  if(!input.success || !z.guid({ error: "Invalid uuid" }).safeParse(jobId).success || (!z.guid({ error: "Invalid uuid" }).safeParse(digest).success && !/^[a-f0-9]{64}$/u.test(digest)))throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try {
    if(precheck) {
     // Plain reads only: authenticate before the first business lock. Controlled
     // SQL repeats these checks after waits and before returning a stored replay.
     const actor=z.guid({ error: "Invalid uuid" }).safeParse(digest).success ? digest :
      (await db.$client.query<{membership_id:string}>("SELECT membership_id FROM app.authenticate_practice_session($1,$2)",[digest,context.tenantId])).rows[0]?.membership_id;
     const membershipAuthority=z.guid({ error: "Invalid uuid" }).safeParse(digest).success;
     const owner=actor && (await db.$client.query<{allowed:boolean}>(
      (membershipAuthority ? "" : practiceOwnedJobsSql())+
      " SELECT EXISTS(SELECT 1 FROM app.membership m JOIN app.job_commercial_track c ON c.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.id=$4 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND c.job_id=$2 AND c.job_track='small_builder' AND c.environment='synthetic_demo'"+
      (membershipAuthority ? " AND $3::text IS NOT NULL" : " AND c.job_id IN(SELECT id FROM practice_owned_job)")+") allowed",
      [context.tenantId,jobId,digest,actor])).rows[0]?.allowed;
     if(!owner)throw new JobWorkStateError("WORK_STATE_FORBIDDEN");
     await precheck(db);
    }
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
     const codes=["WORK_STATE_FORBIDDEN","INVALID_WORK_STATE_INPUT","WORK_STATE_CONFLICT","WORK_STATE_STALE_REVISION","CAPACITY_ADMISSION_UNAVAILABLE","METER_UPGRADE_REQUIRED","METER_PROJECTION_MISMATCH","JOB_WORK_CLOSED","POST_LOCK_WORK_REQUIRES_LINKED_JOB"] as const;
     const code=codes.find(code=>code===error.message);if(code)throw new JobWorkStateError(code);
    }
    throw error;
   }
  });
 }

}
