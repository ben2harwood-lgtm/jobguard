import { requirePilotG1 } from "@jobguard/config";
import { EvidenceService, extraPhotoCommandV1, pilotEvidenceStorage, PilotJobRepository, ProofCommandService, VariationPhotoService, VariationRepository, withTenant, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
import { z } from "zod";
import type { PilotJobAccess } from "./pilot-job-access.js";

const id = z.guid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().min(0).max(2147483647);
const exactQuote = {
  commandId: id, documentId: id, documentHash: digest,
  documentVersion: revision.min(1), expectedJobRevision: revision,
};
const accept = z.strictObject({
  version: z.literal("pilot-acceptance-fixture.v1"), ...exactQuote, acceptedAt: z.iso.datetime({ precision: 3 }),
});
const activate = z.strictObject({ version: z.literal("pilot-switch-live.v1"), ...exactQuote });
const progress = { version: z.literal("pilot-scope-progress.v1"), scopeItemId: id, expectedRevision: revision };
const progressCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...progress, action: z.literal("start") }),
  z.strictObject({ ...progress, action: z.literal("complete"), commandId: id, evidenceId: id }),
]);
const extra = z.strictObject({
  version: z.literal("pilot-log-extra.v1"), commandId: id, description: z.string().trim().min(1).max(500),
});
const proofBase = { version: z.literal("pilot-proof.v1"), commandId: id };
const photoTypes = z.enum(["image/png", "image/jpeg", "image/webp"]);
const proofCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...proofBase, action: z.literal("begin"), scopeItemId: id, expectedSha256: digest,
    contentType: photoTypes, byteLength: z.number().int().positive().max(5_000_000) }),
  z.strictObject({ ...proofBase, action: z.literal("finalize"), uploadId: id, objectVersionId: z.string().min(1).max(1024).refine(version => version !== "null") }),
]);

function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("INVALID_COMMAND");
  return parsed.data;
}

export function pilotJobContinuation(pool: Pool, context: VerifiedTenantContext, access: PilotJobAccess) {
  const job = new PilotJobRepository(pool);
  const variations = new VariationRepository(pool);
  const gate = () => requirePilotG1(process.env);
  return {
    acceptance: async (jobId: string) => {
      await access(jobId);
      return job.quote(context, jobId);
    },
    acceptFixture: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      return job.acceptFixture(context, jobId, actor.membershipId, parse(accept, raw), gate);
    },
    activate: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      return job.activate(context, jobId, actor.membershipId, parse(activate, raw), gate);
    },
    progress: async (jobId: string) => {
      await access(jobId);
      return job.progress(context, jobId);
    },
    changeProgress: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      const input = parse(progressCommand, raw);
      if (input.action === "start") return job.startProgress(context, jobId, actor.membershipId, input);
      await new ProofCommandService(pool, pilotEvidenceStorage()).complete(context, {
        version: "proof.complete.v1", commandId: input.commandId, actorMembershipId: actor.membershipId,
        jobId, scopeItemId: input.scopeItemId, stage: "completion-photo-stage", evidenceId: input.evidenceId,
        requiredEvidenceType: "completion_photo",
      }, undefined, input.expectedRevision);
      return job.progress(context, jobId);
    },
    extras: async (jobId: string) => {
      await access(jobId);
      const rows = (await variations.read(context, jobId)).variations;
      const photos = await VariationPhotoService.forPilot(pool, jobId).list(context);
      return { version: 1 as const, jobId, variations: rows.map(row => ({ ...row, photos: photos
        .filter(photo => photo.variationId === row.id)
        .map(({ variationId: _variation, ...photo }) => photo) })) };
    },
    saveExtraPhoto: async (jobId: string, raw: unknown) => {
      await access(jobId, true);
      return VariationPhotoService.forPilot(pool, jobId).save(context, parse(extraPhotoCommandV1, raw));
    },
    logExtra: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      const input = parse(extra, raw);
      return variations.logBuilderExtra(context, { version: "log-builder-extra.v1", proposal: {
        version: "variation-proposal.v1", id: input.commandId, jobId, scopeItemId: input.commandId,
        existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text",
        captureText: input.description, description: input.description, suggestion: null,
      }, actorMembershipId: actor.membershipId, deviceId: null, deviceCapturedAt: null, price: null }, true);
    },
    proof: async (jobId: string, evidenceId?: string) => {
      await access(jobId);
      const rows = await withTenant(pool, context, async db => (await db.$client.query<{
        id: string; scopeItemId: string; sha256: string;
      }>(`SELECT e.id,e.scope_item_id AS "scopeItemId",e.sha256
        FROM app.evidence_object e JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
        WHERE (e.tenant_id,e.job_id)=($1,$2) AND e.kind='original' AND e.evidence_type='completion_photo'
          AND u.state='verified' AND u.object_version_id=e.object_version_id
          AND ($3::uuid IS NULL OR e.id=$3)
          AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))
        ORDER BY e.server_verified_at,e.id`, [context.tenantId, jobId, evidenceId ? parse(id, evidenceId) : null])).rows);
      if (evidenceId !== undefined) {
        const row = rows[0];
        if (!row) throw new Error("NOT_FOUND");
        const downloadUrl = await EvidenceService.forPilot(pool, jobId).authorizedDownloadUrl(context, {
          evidenceId: row.id, jobId, scopeItemId: row.scopeItemId, expiresInSeconds: 60,
        });
        return { downloadUrl };
      }
      return { version: 1 as const, jobId, evidence: rows.map(({ id, scopeItemId, sha256 }) => ({ id, scopeItemId, sha256 })) };
    },
    saveProof: async (jobId: string, raw: unknown) => {
      await access(jobId, true);
      const input = parse(proofCommand, raw);
      const evidence = EvidenceService.forPilot(pool, jobId);
      if (input.action === "begin") {
        const upload = await evidence.beginUpload(context, {
          id: input.commandId, jobId, scopeItemId: input.scopeItemId, expectedSha256: input.expectedSha256,
          maximumBytes: input.byteLength, contentType: input.contentType, expiresAt: new Date(Date.now() + 3600_000),
        });
        return { uploadId: upload.id, uploadUrl: upload.uploadUrl };
      }
      const verified = await evidence.finalize(context, { commandId: input.commandId, uploadId: input.uploadId,
        objectVersionId: input.objectVersionId, evidenceType: "completion_photo" });
      return { evidenceId: verified.id };
    },
  };
}
