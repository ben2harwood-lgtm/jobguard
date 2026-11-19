import type { Pool } from "pg";
import { z } from "zod";
import { EvidenceError, ResumableEvidenceError, ResumableEvidenceService, WatchdogError, withTenant } from "@jobguard/db";
import { JobWorkStateError } from "@jobguard/core";
import { AuthError, rolePermits } from "./auth/auth-provider.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";

const maxInlineBytes = 98_304; // The existing 131072-character base64 attachment limit.
const identity = { version: z.literal("native-capture-upload.v1"), uploadId: z.guid(), jobId: z.guid() };
const time = z.number().int().nonnegative().max(8_640_000_000_000_000);
const request = z.discriminatedUnion("action", [
 z.object({ ...identity, action: z.literal("begin"), scopeItemId: z.guid().nullable(), capturedAtMs: time,
  clientSha256: z.string().regex(/^[0-9a-f]{64}$/u), expiresAtMs: time, byteLength: z.number().int().min(1).max(maxInlineBytes),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "audio/wav"]) }).strict(),
 z.object({ ...identity, action: z.literal("status") }).strict(),
 z.object({ ...identity, action: z.literal("append"), offset: z.number().int().min(0).max(maxInlineBytes),
  bytes: z.instanceof(Uint8Array).refine(bytes => bytes.length > 0 && bytes.length <= maxInlineBytes)
   .transform(bytes => new Uint8Array(bytes)) }).strict(),
 z.object({ ...identity, action: z.literal("finalize"), commandId: z.guid() }).strict(),
]);

/** Dark, in-process synthetic transport seam. The server caller owns request credentials. */
export class NativeCaptureUploadApplication {
 private readonly service: ResumableEvidenceService;
 constructor(private readonly pool: Pool, private readonly identity: IdentityApplication, private readonly enabled = false) {
  this.service = new ResumableEvidenceService(pool, enabled);
 }

 async transfer(rawCredentials: TenantRequestCredentials, raw: unknown) {
  if (!this.enabled || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ResumableEvidenceError("DISABLED");
  const credentials = { ...rawCredentials };
  const input = request.parse(raw);
  const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
  const principal = await this.identity.principal(credentials.sessionToken);
  const member = await this.identity.provider.findMembership(principal, context.tenantId);
  if (!member || !rolePermits(member.role, "job:update")) throw new AuthError("TENANT_FORBIDDEN");
  const actor = { membershipId: member.id, identityUserId: principal.identityUserId };
  const access = { version: "resumable-evidence.v1" as const, actorMembershipId: actor.membershipId,
   jobId: input.jobId, uploadId: input.uploadId };
  const permitted = await withTenant(this.pool, context, async db => (await db.$client.query(`
   SELECT 1 FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2 AND environment='synthetic_demo'
   AND (job_track='small_builder' OR app.contractor_job_allowed($3,'extra.log',job_id))`,
  [context.tenantId, input.jobId, actor.membershipId])).rowCount);
  if (!permitted) throw new ResumableEvidenceError("NOT_FOUND");
  try {
   switch (input.action) {
    case "begin": {
     const { upload } = await this.service.begin(context, actor, {
      version: access.version, actorMembershipId: actor.membershipId, jobId: input.jobId, id: input.uploadId,
      scopeItemId: input.scopeItemId, expectedSha256: input.clientSha256, maximumBytes: input.byteLength,
      contentType: input.contentType, deviceCapturedAt: new Date(input.capturedAtMs), expiresAt: new Date(input.expiresAtMs),
     });
     return { uploadId: upload.id, jobId: upload.jobId, scopeItemId: upload.scopeItemId, clientSha256: upload.expectedSha256,
      capturedAtMs: upload.deviceCapturedAt?.getTime(), expiresAtMs: upload.expiresAt.getTime(),
      byteLength: upload.maximumBytes, contentType: upload.contentType };
    }
    case "status": return { status: await this.service.status(context, actor, access), checkedAtMs: Date.now() };
    case "append": return await this.service.append(context, actor, { ...access, offset: input.offset, bytes: input.bytes });
    case "finalize": {
     // Read the stored content type. Only a photo may be classified as site_photo.
     const type = await withTenant(this.pool, context, async db => (await db.$client.query<{ expected_content_type: string }>(
      `SELECT expected_content_type FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,
      [context.tenantId, input.jobId, input.uploadId])).rows[0]?.expected_content_type);
     if (!type || !["audio/wav", "image/png", "image/jpeg", "image/webp"].includes(type)) throw new ResumableEvidenceError("NOT_FOUND");
     const row = await this.service.finalize(context, actor, { ...access, commandId: input.commandId,
      evidenceType: type === "audio/wav" ? "site_voice" : "site_photo" });
     return { evidenceId: row.id, jobId: row.job_id, scopeItemId: row.scope_item_id, objectVersionId: row.object_version_id,
      sha256: typeof row.sha256 === "string" ? row.sha256.trim() : row.sha256, byteLength: Number(row.byte_length) };
    }
   }
  } catch (error) {
   if (error instanceof EvidenceError) {
    if (error.code === "COMMAND_CONFLICT") return { outcome: "conflict" } as const;
    if (error.code === "OBJECT_INVALID" || error.code === "UPLOAD_EXPIRED") return { outcome: "rejected" } as const;
   }
   if (error instanceof ResumableEvidenceError) {
    if (error.code === "CONFLICT") return { outcome: "conflict" } as const;
    if (error.code === "LIMIT") return { outcome: "rejected" } as const;
    if (error.code === "INCOMPLETE") return { outcome: "retry" } as const;
   }
   if (error instanceof JobWorkStateError || (error instanceof WatchdogError && error.code !== "JOB_NOT_FOUND")) {
    return { outcome: "conflict" } as const;
   }
   throw error;
  }
 }
}
