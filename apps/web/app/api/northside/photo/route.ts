import "server-only";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { DemoError, bodyOf, demoActor, evidenceService, failure, json, practicePng, practiceStorage, requireOrigin } from "../../../lib/northside-server";

/** The operative attaches a practice photo (generated, never a real image) and gets back the hash the resident is shown. */
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const body = await bodyOf(request);
    const { context, role } = await demoActor();
    if (role !== "operative") throw new DemoError("PERMISSION_DENIED", 403);
    const { jobId, description, note } = body;
    if (typeof jobId !== "string" || typeof description !== "string" || typeof note !== "string" || !/^[0-9a-f-]{36}$/iu.test(jobId) || !description.trim() || !note.trim()) throw new DemoError("INVALID_COMMAND", 422);
    const service = evidenceService(), photo = practicePng();
    const upload = await service.beginUpload(context, { jobId, scopeItemId: null, expectedSha256: photo.sha256, contentType: "image/png", maximumBytes: 10_000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3_600_000) });
    practiceStorage().put(upload.objectKey, "v1", photo.bytes);
    await service.finalize(context, { uploadId: upload.id, objectVersionId: "v1", evidenceType: "site_photo" });
    return json({ version: "northside-photo.v1", environment: "synthetic_demo", realExternalActions: 0, photoEvidenceId: upload.id, photoSha256: photo.sha256, shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: photo.sha256 }) });
  } catch (error) { return failure(error); }
}
