import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { JobSourceError, lateSourceImportV1, lateSourceReceiptV1, observationV1, type Observation } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { WatchdogError } from "./watchdog.js";
import { decodeJobSourceFixture } from "./job-source-fixtures.js";

/** A separate historical evidence command. Never enters CH-4 or the ordinary message writer. */
export async function importLateSource(pool: Pool, context: VerifiedTenantContext, jobId: string, digest: string, raw: unknown) {
 const input = lateSourceImportV1.safeParse(raw);
 if (!input.success) throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
 try {
  return await withTenant(pool, context, async db => {
   const row = (await db.$client.query("SELECT app.import_late_source($1,$2,$3,$4::jsonb) result", [context.tenantId, jobId, digest, JSON.stringify(input.data)])).rows[0];
   return lateSourceReceiptV1.parse(row.result);
  });
 } catch (error) {
  const message = error instanceof Error ? error.message : "";
  if (["JOB_SOURCE_FORBIDDEN", "FORBIDDEN", "WORK_STATE_FORBIDDEN"].includes(message)) throw new JobSourceError("JOB_SOURCE_FORBIDDEN");
  if (message === "SYNTHETIC_MODE_REQUIRED") throw new JobSourceError(message);
  if (message === "INVALID_JOB_SOURCE_INPUT") throw new JobSourceError(message);
  if (["COMMAND_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(message)) throw new WatchdogError("IDEMPOTENCY_CONFLICT");
  throw error;
 }
}

/** Worker-facing SV-7A observations, revalidated against the immutable original. No shadow access. */
export async function readLateSourceObservations(pool: Pool, context: VerifiedTenantContext, jobId: string): Promise<Observation[]> {
 return withTenant(pool, context, async db => {
  const rows = (await db.$client.query(`SELECT s.*,to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received
   FROM app.late_source_import s JOIN app.evidence_object e
    ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256,e.server_received_at)=
      (s.tenant_id,s.job_id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at)
   JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
   JOIN app.final_account_lock l ON(l.tenant_id,l.job_id)=(s.tenant_id,s.job_id)
   JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(s.tenant_id,s.job_id)
   WHERE s.tenant_id=$1 AND s.job_id=$2 AND tr.job_track='small_builder' AND tr.environment='synthetic_demo'
    AND s.source_received_at>l.locked_at AND s.stated_sent_at<l.locked_at
    AND e.kind='original' AND e.server_verified_at IS NOT NULL AND e.evidence_type='customer_message_text'
    AND e.content_type='text/plain; charset=utf-8' AND e.byte_length=octet_length(s.bytes)
    AND e.device_captured_at=s.stated_sent_at AND u.state='verified' AND u.server_verified_at IS NOT NULL
    AND u.object_version_id=e.object_version_id AND u.expected_sha256=e.sha256 AND u.object_key=e.object_key
    AND u.server_received_at=e.server_received_at AND u.expected_content_type=e.content_type
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
   ORDER BY s.evidence_id`, [context.tenantId, jobId])).rows;
  return rows.flatMap(row => {
   if (!Buffer.isBuffer(row.bytes) || createHash("sha256").update(row.bytes).digest("hex") !== row.sha256) return [];
   const text = row.bytes.toString("utf8");
   if (!Buffer.from(text, "utf8").equals(row.bytes)) return [];
   // One reviewed fictional original; arbitrary historical messages remain stored evidence, never invented facts.
   const source = decodeJobSourceFixture("job-source:outside-tap.v1", text, "note_or_voice");
   if (!source) return [];
   return [observationV1.parse({ version: "observation.v1", tenantId: context.tenantId, jobId, kind: "note_or_voice",
    evidence: { id: row.evidence_id, objectVersionId: row.object_version_id, sha256: row.sha256, serverReceivedAt: row.received }, ...source })];
  });
 });
}

/** Ordinary source history only: caller authenticates job ownership before invoking this read. */
export async function readLateSources(pool:Pool,context:VerifiedTenantContext,jobId:string) {
 return withTenant(pool,context,async db=>(await db.$client.query("SELECT receipt FROM app.late_source_import WHERE tenant_id=$1 AND job_id=$2 ORDER BY source_received_at,command_id",[context.tenantId,jobId])).rows.map(row=>lateSourceReceiptV1.parse(row.receipt)));
}
