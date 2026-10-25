import "server-only";
import type { VerifiedTenantContext } from "@jobguard/db";
import { z } from "zod";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { withTenant, northsideRun } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, demoContext, evidenceService, failure, json, practicePng, practiceStorage, requireOrigin, parseDemoBody } from "../../../lib/northside-server";

/** The operative attaches a practice photo (generated, never a real image) and gets back the hash the resident is shown. */
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { pool, member, role, sessionId } = await demoActor();
    const context: VerifiedTenantContext = await demoContext(pool, sessionId);
    const body = parseDemoBody(z.object({ version: z.literal("northside-command.v1"), jobId: z.guid({ error: "Invalid uuid" }), description: z.string().trim().min(1).max(500), note: z.string().trim().min(1).max(5000) }).strict(), await bodyOf(request));
    if (role !== "operative") throw new DemoError("PERMISSION_DENIED", 403);
    const { jobId, description, note } = body;
    if (typeof jobId !== "string" || typeof description !== "string" || typeof note !== "string" || !/^[0-9a-f-]{36}$/iu.test(jobId) || !description.trim() || !note.trim()) throw new DemoError("INVALID_COMMAND", 422);
    // The merged predicate checks assignment against the order's current revision, not its historical assignments.
    const allowed = await withTenant(pool, context, async db => (await db.$client.query<{ allowed: boolean }>(
      "SELECT app.contractor_member_active($1) AND app.contractor_job_assigned($1,$2) AS allowed", [member.membershipId, jobId])).rows[0]?.allowed);
    if (!allowed) throw new DemoError("PERMISSION_DENIED", 403);
    const run = await northsideRun(pool, member, context);
    if (!run) throw new DemoError("NOT_FOUND", 404);
    const service = evidenceService(), photo = practicePng();
    const upload = await service.beginUpload(context, { jobId, scopeItemId: null, expectedSha256: photo.sha256, contentType: "image/png", maximumBytes: 10_000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + run.settings.photoUploadLifetimeMinutes * 60_000) });
    practiceStorage().put(upload.objectKey, "v1", photo.bytes);
    await service.finalize(context, { uploadId: upload.id, objectVersionId: "v1", evidenceType: "site_photo" });
    return json({ version: "northside-photo.v1", environment: "synthetic_demo", realExternalActions: 0, photoEvidenceId: upload.id, photoSha256: photo.sha256, shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: photo.sha256 }) });
  } catch (error) { return failure(error); }
}
