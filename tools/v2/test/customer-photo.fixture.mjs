// Generated test evidence through the existing authenticated evidence service.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "../../../packages/db/node_modules/pg/esm/index.mjs";
import { EvidenceService, V2FilesystemStorage, authenticatePracticeSession, generatePracticePng } from "../../../packages/db/dist/index.js";
import { validateSettings } from "../settings.mjs";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "../local-targets.mjs";

export async function customerPhoto(context, jobId, scopeItemId) {
  const { settings, backend } = validateSettings({ JOBGUARD_V2_BACKEND: process.env.JOBGUARD_V2_BACKEND ?? "docker" });
  const admin = new Pool({ connectionString: settings.MIGRATION_DATABASE_URL, max: 1 });
  const pool = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
  try {
    await verifyDatabaseTarget(admin, backend === "embedded" ? embeddedSystemId() : process.env.JOBGUARD_V2_TEST_SYSTEM_ID, backend === "embedded");
    const session = (await context.cookies()).find(cookie => cookie.name === "jg_session");
    assert.ok(session, "Photo fixture requires the signed-in owner's practice session");
    const auth = await authenticatePracticeSession(pool, session.value);
    const bytes = generatePracticePng("completion-photo");
    const digest = createHash("sha256").update(bytes).digest("hex");
    // Match the launcher's storage configuration; Docker uses saved synthetic bytes.
    if (backend === "embedded") {
      process.env.JOBGUARD_LOCAL_V2 = "1";
      process.env.JOBGUARD_V2_STORAGE_DIR = storageData;
    }
    const disk = V2FilesystemStorage.fromEnvironment();
    let object;
    const storage = disk ?? {
      createUploadUrl: async () => "urn:jobguard:test:upload",
      createDownloadUrl: async () => "urn:jobguard:test:download",
      readExactVersion: async () => object,
    };
    const service = new EvidenceService(pool, storage);
    const upload = await service.beginUpload(auth.context, { jobId, scopeItemId,
      expectedSha256: digest, contentType: "image/png", maximumBytes: bytes.length,
      retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) }, async (db, upload) => {
      const version = disk ? await disk.put(upload.objectKey, "image/png", bytes) : `synthetic-${digest.slice(0, 16)}`;
      object = { key: upload.objectKey, versionId: version, contentType: "image/png", bytes, byteLength: bytes.length };
      await db.$client.query(`INSERT INTO app.synthetic_evidence_original
        (tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
        VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)`,
      [auth.context.tenantId, upload.id, jobId, scopeItemId, upload.objectKey, version, bytes]);
    });
    const photo = await service.finalize(auth.context, { uploadId: upload.id,
      objectVersionId: object.versionId, evidenceType: "completion_photo" });
    assert.ok(photo.id, "Generated photo must be finalized");
    return photo.id;
  } finally { await Promise.all([pool.end(), admin.end()]); }
}
