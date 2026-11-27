// V2-B1E: copied from F1-P's uploadBriefProgressPhoto (apps/api/src/workspace/brief-progress-photo.application.ts
// on codex/sandbox/v2-f1p @ aeedba94d), for walk photos. Merging the two copies is a later tidy.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch, commandIdFor, EvidenceService, generatePracticePng, V2FilesystemStorage, WalkError, withTenant,
  type VerifiedTenantContext } from "@jobguard/db";

import { walkPhotoCommandV1 } from "./walk-photo-command.js";
export { walkPhotoCommandV1, type WalkPhotoCommand } from "./walk-photo-command.js";

/** The Proof card's generated-original path, on the shared live-job upload rule, scoped to the authorized job. */
export async function uploadWalkPhoto(pool: Pool, context: VerifiedTenantContext, jobId: string, actorId: string, raw: unknown) {
  const parsed = walkPhotoCommandV1.safeParse(raw);
  if (!parsed.success) throw new WalkError("WALK_INVALID_COMMAND");
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
    actorRef: `membership:${actorId}`, eventType: `v2.walk_photo.${verb}`, subjectType: "job", subjectRef: jobId,
    payload: { references: { commandId, uploadCommandId: command.commandId, photoId: command.commandId } } });
  // A finalized upload is immutable. Do not replay beginUpload's upsert against it.
  const readPrior = () => withTenant(pool, context, async db => (await db.$client.query<{
    expected_sha256: string; state: string; object_version_id: string | null; actor_ref: string | null;
  }>(`SELECT u.expected_sha256,u.state,u.object_version_id,a.actor_ref
    FROM app.evidence_upload u LEFT JOIN app.audit_event a ON a.tenant_id=u.tenant_id
      AND a.subject_ref=u.job_id::text AND a.event_type='v2.walk_photo.attached'
      AND a.payload->'references'->>'commandId'=u.id::text
    WHERE (u.tenant_id,u.job_id,u.id)=($1,$2,$3)`, [context.tenantId,jobId,command.commandId])).rows[0]);
  let prior = await readPrior();
  if (prior && (prior.expected_sha256.trim() !== digest || prior.actor_ref !== `membership:${actorId}`)) {
    throw new WalkError("WALK_PHOTO_REFUSED");
  }
  let objectVersionId = prior?.object_version_id ?? "";
  // No scope on the upload row, so stage proof (newest upload per scope) never sees a walk photo.
  if (prior?.state !== "verified") try { await evidence.beginUpload(context, { id: command.commandId, jobId, scopeItemId: null,
    expectedSha256: digest, contentType: "image/png", maximumBytes: bytes.length,
    retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) }, async (db, upload) => {
    objectVersionId = filesystem ? await filesystem.put(upload.objectKey, "image/png", bytes) : `synthetic-${digest.slice(0,16)}`;
    const inserted = await db.$client.query(`INSERT INTO app.synthetic_evidence_original
      (tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
      VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7) ON CONFLICT(tenant_id,upload_id) DO NOTHING`,
    [context.tenantId,upload.id,jobId,null,upload.objectKey,objectVersionId,bytes]);
    if (inserted.rowCount) { await appendAuditBatch(db, [audit("attached")]); return; }
    // An overlapping request with this commandId passed the unlocked check above (F1-P, Codex P2 4707412001).
    // Under the begin lock the first request's attached event is visible: its actor must match.
    const { rows: [bound] } = await db.$client.query<{ actor_ref: string }>(`
      SELECT actor_ref FROM app.audit_event
      WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='v2.walk_photo.attached'
        AND payload->'references'->>'commandId'=$3`, [context.tenantId,jobId,command.commandId]);
    if (!bound || bound.actor_ref !== `membership:${actorId}`) throw new WalkError("WALK_PHOTO_REFUSED");
  }); } catch (error) {
    // Codex P2 4711258427: an overlapping first request can verify the upload after the check above, and
    // beginUpload's upsert is then refused. Reread: the same verified upload by this actor replays.
    if (error instanceof WalkError) throw error;
    prior = await readPrior();
    if (prior?.state !== "verified" || prior.expected_sha256.trim() !== digest || prior.actor_ref !== `membership:${actorId}`) throw error;
    objectVersionId = prior.object_version_id ?? "";
  }
  const finalization = { uploadId: command.commandId, objectVersionId, evidenceType: "walk_photo" };
  const finalizeId = commandIdFor("evidence.finalize", jobId, finalization);
  await evidence.finalize(context, { ...finalization, commandId: finalizeId },
    async db => { await appendAuditBatch(db, [audit("finalized", finalizeId)]); });
  return { photoId: command.commandId, state: "verified" as const };
}
