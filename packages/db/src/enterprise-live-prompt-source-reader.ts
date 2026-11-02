import { calculateCompletionWorkFindings, type CompletionWorkFinding } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";
/** Reads only session-scoped, stored evidence preimages and immutable vocabulary. The merged rule (a) remains the proposal calculator. */
export async function readEnterpriseCompletionFindings(db: TenantTransaction, sessionId: string, jobId: string): Promise<CompletionWorkFinding[]> {
 const value = (await db.$client.query<{ snapshot: unknown }>("SELECT app.lp_sources($1,$2) snapshot",[sessionId,jobId])).rows[0]?.snapshot;
 return value == null ? [] : calculateCompletionWorkFindings(value);
}

/** Reads the real original bytes using the existing ordinary-runtime RLS grant, after scoped session authority. */
export async function readStoredCompletionPhoto(db: TenantTransaction, sessionId: string, input: {jobId:string;evidenceId:string;sha256:string;objectVersion:string}):Promise<Buffer|null> {
 await db.$client.query("SELECT app.lp_sources($1,$2)",[sessionId,input.jobId]);
 const row=(await db.$client.query<{bytes:Buffer}>(`SELECT o.bytes FROM app.synthetic_evidence_original o
 JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id,e.object_key,e.object_version_id)=(o.tenant_id,o.job_id,o.upload_id,o.object_key,o.object_version_id)
 JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
 WHERE e.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND e.job_id=$1 AND e.id=$2 AND e.sha256=$3 AND e.object_version_id=$4
 AND e.kind='original' AND e.evidence_type='completion_photo' AND e.content_type='image/png' AND o.content_type='image/png' AND o.environment='synthetic_demo'
 AND u.state='verified' AND e.server_verified_at IS NOT NULL AND octet_length(o.bytes)=e.byte_length AND encode(sha256(o.bytes),'hex')=e.sha256`,[input.jobId,input.evidenceId,input.sha256,input.objectVersion])).rows[0];
 return row?.bytes ?? null;
}
