import { JobWorkStateError, linkedJobOfferV1 } from "@jobguard/core";
/** Existing source commands keep their own parsing/identity/authority. Only the added database refusal is translated. */
export function rethrowJobWorkState(error:unknown):never {
 const failure=error as {message?:unknown;detail?:unknown};
 if(failure?.message==="POST_LOCK_WORK_REQUIRES_LINKED_JOB") {
  const typed=new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  if(typeof failure.detail==="string") {
   try {const offer=linkedJobOfferV1.safeParse(JSON.parse(failure.detail));if(offer.success)Object.assign(typed,{offer:offer.data});}catch { /* Invalid detail is never reflected. */ }
  }
  throw typed;
 }
 if(failure?.message==="WORK_STATE_FORBIDDEN")throw new JobWorkStateError("WORK_STATE_FORBIDDEN");
 if(failure?.message==="JOB_WORK_CLOSED")throw new JobWorkStateError("JOB_WORK_CLOSED");
 throw error;
}

import type { TenantTransaction } from "./tenant-context.js";
/** Authorized existing-source callers only. The source's original live guard still runs.
 * This read supplies the issued redirect for a locked job that has left live;
 * the insert/update trigger remains the serializing boundary for live jobs.
 */
export async function checkPostLockSourceLifecycle(database:TenantTransaction,jobId:string,actorMembershipId?:string) {
 if(actorMembershipId){
  const actor=(await database.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())",[actorMembershipId])).rows[0];
  if(!actor)throw new JobWorkStateError("WORK_STATE_FORBIDDEN");
 }
 const row=(await database.$client.query<{job_id:string;customer_id:string;site_id:string}>(`SELECT j.id job_id,b.customer_id,b.site_id FROM app.job j
  JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
  JOIN app.final_account_lock l ON(l.tenant_id,l.job_id)=(j.tenant_id,j.id)
  JOIN app.job_party_current c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
  WHERE j.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND j.id=$1 AND j.status<>'live' AND t.job_track='small_builder' AND t.environment='synthetic_demo'`,[jobId])).rows[0];
 if(row) {
  const error=new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  Object.assign(error,{offer:linkedJobOfferV1.parse({version:"job-linked-offer.v1",code:error.code,message:"Start a linked job for this customer and site",jobId:row.job_id,customerId:row.customer_id,siteId:row.site_id})});throw error;
 }
}

/** Called only after a genuine stored replay has returned and before new source effects. */
export async function refuseLockedNewSource(database:TenantTransaction,jobId:string) {
 const row=(await database.$client.query<{job_id:string;customer_id:string;site_id:string}>(`SELECT j.id job_id,b.customer_id,b.site_id FROM app.job j
  JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
  JOIN app.final_account_lock l ON(l.tenant_id,l.job_id)=(j.tenant_id,j.id)
  JOIN app.job_party_current c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
  WHERE j.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND j.id=$1 AND t.job_track='small_builder' AND t.environment='synthetic_demo'`,[jobId])).rows[0];
 if(row){const error=new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB");Object.assign(error,{offer:linkedJobOfferV1.parse({version:"job-linked-offer.v1",code:error.code,message:"Start a linked job for this customer and site",jobId:row.job_id,customerId:row.customer_id,siteId:row.site_id})});throw error;}
}
