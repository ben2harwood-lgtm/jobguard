// V2-PX: one real practice photo through the existing authenticated evidence
// service (beginUpload, then finalize). The bytes are the fictional generated
// PNG, and verification is the service's own check of the stored bytes. No
// seeded rows, no hand-written receipts, and no database check is bypassed.
// The job must be live (EvidenceService refuses others with JOB_NOT_LIVE).
import { createHash } from "node:crypto";
import { EvidenceService, V2FilesystemStorage, generatePracticePng } from "../../../packages/db/dist/index.js";
import { storageData } from "../local-targets.mjs";

export async function uploadPracticePhoto(pool, context, { jobId, scopeItemId, fixture = "completion-photo" }) {
  process.env.JOBGUARD_V2_STORAGE_DIR ??= storageData;
  const storage = V2FilesystemStorage.fromEnvironment();
  if (!storage) throw new Error("V2 practice photos need the V2 filesystem store");
  const bytes = generatePracticePng(fixture);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const service = new EvidenceService(pool, storage);
  let objectVersionId;
  const upload = await service.beginUpload(context, { jobId, scopeItemId, expectedSha256: sha256, contentType: "image/png",
    maximumBytes: bytes.length, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3_600_000) },
  async (db, pending) => {
    objectVersionId = await storage.put(pending.objectKey, "image/png", bytes);
    await db.$client.query(`INSERT INTO app.synthetic_evidence_original
      (tenant_id, upload_id, job_id, scope_item_id, object_key, object_version_id, environment, content_type, bytes)
      VALUES ($1, $2, $3, $4, $5, $6, 'synthetic_demo', 'image/png', $7)`,
    [context.tenantId, pending.id, jobId, scopeItemId, pending.objectKey, objectVersionId, bytes]);
  });
  const photo = await service.finalize(context, { uploadId: upload.id, objectVersionId, evidenceType: "completion_photo" });
  return { evidenceId: photo.id, uploadId: upload.id, objectKey: upload.objectKey, objectVersionId, sha256,
    contentType: "image/png", bytes };
}
