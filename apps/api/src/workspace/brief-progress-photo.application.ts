import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch, briefProgressPhotoCommandV1, BriefProgressError, commandIdFor,
  EvidenceService, generatePracticePng, V2FilesystemStorage, withTenant,
  type VerifiedTenantContext } from "@jobguard/db";

/** The Proof card's generated-original path, scoped to the already authorized job. */
export async function uploadBriefProgressPhoto(pool: Pool, context: VerifiedTenantContext, jobId: string,
  actorId: string, raw: unknown) {
  const parsed = briefProgressPhotoCommandV1.safeParse(raw);
  if (!parsed.success) throw new BriefProgressError("BRIEF_PROGRESS_INVALID_COMMAND");
  const command = parsed.data;
  const bytes = generatePracticePng(command.fixture);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const filesystem = V2FilesystemStorage.fromEnvironment();
  const storage = {
    createUploadUrl: async ({ key }: { key: string }) => `urn:jobguard:v2:upload:${createHash("sha256").update(key).digest("hex")}`,
    createDownloadUrl: async () => { throw new Error("Server-mediated practice photos only"); },
    deleteExactVersion: async () => { throw new Error("Immutable original"); },
    readExactVersion: async (key: string, versionId: string) => {
      const original = await withTenant(pool, context, async db => (await db.$client.query<{ bytes: Buffer; content_type: string }>(`
        SELECT bytes,content_type FROM app.synthetic_evidence_original
        WHERE tenant_id=$1 AND job_id=$2 AND object_key=$3 AND object_version_id=$4`,
      [context.tenantId,jobId,key,versionId])).rows[0]);
      if (!original) throw new Error("Missing original");
      if (filesystem) return filesystem.readExactVersion(key, versionId);
      return { key, versionId, bytes: original.bytes, byteLength: original.bytes.length, contentType: original.content_type };
    },
  };
  const evidence = new EvidenceService(pool, storage);
  const audit = (verb: string, commandId = command.commandId) => ({ id: randomUUID(), version: "audit.v1" as const,
    actorRef: `membership:${actorId}`, eventType: `v2.progress_photo.${verb}`, subjectType: "job", subjectRef: jobId,
    payload: { references: { commandId, uploadCommandId: command.commandId, scopeItemId: command.scopeItemId, photoId: command.commandId } } });
  // A finalized upload is immutable. Do not replay beginUpload's upsert against it.
  const prior = await withTenant(pool, context, async db => (await db.$client.query<{
    scope_item_id: string | null; expected_sha256: string; state: string; object_version_id: string | null; actor_ref: string;
  }>(`SELECT a.payload->'references'->>'scopeItemId' AS scope_item_id,u.expected_sha256,u.state,u.object_version_id,a.actor_ref
    FROM app.evidence_upload u LEFT JOIN app.audit_event a ON a.tenant_id=u.tenant_id
      AND a.subject_ref=u.job_id::text AND a.event_type='v2.progress_photo.attached'
      AND a.payload->'references'->>'commandId'=u.id::text
    WHERE (u.tenant_id,u.job_id,u.id)=($1,$2,$3)`, [context.tenantId,jobId,command.commandId])).rows[0]);
  if (prior && (prior.scope_item_id !== command.scopeItemId || prior.expected_sha256.trim() !== digest ||
    prior.actor_ref !== `membership:${actorId}`)) throw new BriefProgressError("BRIEF_PROGRESS_COMMAND_CONFLICT");
  let objectVersionId = prior?.object_version_id ?? "";
  // No scope on the upload row: stage proof picks the newest upload for its scope and the proof
  // statement locks once any scoped upload exists, so a progress photo must stay out of both.
  // The task's scope is bound by the progress row and the attached audit event.
  if (prior?.state !== "verified") await evidence.beginUpload(context, { id: command.commandId, jobId, scopeItemId: null,
    expectedSha256: digest, contentType: "image/png", maximumBytes: bytes.length,
    retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) }, async (db, upload) => {
    objectVersionId = filesystem ? await filesystem.put(upload.objectKey, "image/png", bytes) : `synthetic-${digest.slice(0,16)}`;
    const inserted = await db.$client.query(`INSERT INTO app.synthetic_evidence_original
      (tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
      VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7) ON CONFLICT(tenant_id,upload_id) DO NOTHING`,
    [context.tenantId,upload.id,jobId,null,upload.objectKey,objectVersionId,bytes]);
    if (inserted.rowCount) await appendAuditBatch(db, [audit("attached")]);
  });
  const finalization = { uploadId: command.commandId, objectVersionId, evidenceType: "progress_photo" };
  const finalizeId = commandIdFor("evidence.finalize", jobId, finalization);
  await evidence.finalize(context, { ...finalization, commandId: finalizeId },
    async db => { await appendAuditBatch(db, [audit("finalized", finalizeId)]); });
  return { uploadId: command.commandId, evidenceId: command.commandId, state: "verified" as const };
}
