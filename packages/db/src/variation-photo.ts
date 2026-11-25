import type { Pool } from "pg";
import { z } from "zod";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { EvidenceService, pilotEvidenceStorage } from "./evidence.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

/** QW-1: at most six photos per extra; the same cap freezes onto a priced revision. */
export const MAX_EXTRA_PHOTOS = 6;
const id = z.guid();
const base = { version: z.literal("pilot-extra-photo.v1"), commandId: id };
export const extraPhotoCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("begin"), variationId: id, expectedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]), byteLength: z.number().int().positive().max(5_000_000) }),
  z.strictObject({ ...base, action: z.literal("finalize"), uploadId: id, objectVersionId: z.string().min(1).max(1024).refine(version => version !== "null") }),
]);
export type ExtraPhotoCommand = z.infer<typeof extraPhotoCommandV1>;
export type ExtraPhoto = { variationId: string; evidenceId: string; sha256: string; receivedAt: string; revisionIds: string[] };

/** A photo counts once its upload is verified and while it is not invalidated. */
const livePhoto = `e.kind='original' AND e.evidence_type='variation_photo'
  AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
    AND u.state='verified' AND u.object_version_id=e.object_version_id)
  AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))`;

async function openExtra(db: TenantTransaction, tenantId: string, jobId: string, where: string, key: string) {
  return (await db.$client.query<{ scopeItemId: string; open: boolean; photos: number }>(`
    SELECT v.scope_item_id AS "scopeItemId",v.state IN('draft','priced') AS open,(SELECT count(*)::int FROM app.evidence_object e
      WHERE (e.tenant_id,e.job_id,e.scope_item_id)=(v.tenant_id,v.job_id,v.scope_item_id) AND ${livePhoto}) AS photos
    FROM app.variation v WHERE (v.tenant_id,v.job_id)=($1,$2) AND v.existing_scope_item_id IS NULL AND ${where}
    FOR UPDATE OF v`, [tenantId, jobId, key])).rows[0];
}

/** Photos on a builder-logged extra, through the verified begin/finalize evidence flow. */
export class VariationPhotoService {
  private readonly evidence: EvidenceService;
  constructor(private readonly pool: Pool, private readonly jobId: string, storage: PrivateVersionedStorage) {
    this.evidence = new EvidenceService(pool, storage, false, jobId, "extra");
  }

  static forPilot(pool: Pool, jobId: string) { return new VariationPhotoService(pool, jobId, pilotEvidenceStorage()); }

  async save(context: VerifiedTenantContext, input: ExtraPhotoCommand) {
    if (input.action === "begin") {
      const target = await withTenant(this.pool, context, db => openExtra(db, context.tenantId, this.jobId, "v.id=$3", input.variationId));
      if (!target?.open) throw new Error("NOT_FOUND");
      if (target.photos >= MAX_EXTRA_PHOTOS) throw new Error("PHOTO_LIMIT_REACHED");
      const upload = await this.evidence.beginUpload(context, {
        id: input.commandId, jobId: this.jobId, scopeItemId: target.scopeItemId, expectedSha256: input.expectedSha256,
        maximumBytes: input.byteLength, contentType: input.contentType, expiresAt: new Date(Date.now() + 3600_000),
      });
      return { uploadId: upload.id, uploadUrl: upload.uploadUrl };
    }
    // Recheck inside the finalizing transaction, counting the object this command has just stored:
    // the extra must still take photos and stay within the cap.
    const verified = await this.evidence.finalize(context, { commandId: input.commandId, uploadId: input.uploadId,
      objectVersionId: input.objectVersionId, evidenceType: "variation_photo" }, async db => {
      const check = await openExtra(db, context.tenantId, this.jobId,
        "v.scope_item_id=(SELECT u.scope_item_id FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=(v.tenant_id,v.job_id,$3::uuid))", input.uploadId);
      if (!check?.open) throw new Error("NOT_FOUND");
      if (check.photos > MAX_EXTRA_PHOTOS) throw new Error("PHOTO_LIMIT_REACHED");
    });
    return { evidenceId: verified.id as string };
  }

  /** Each extra's live photos, oldest first, with the revisions each is frozen on. */
  async list(context: VerifiedTenantContext): Promise<ExtraPhoto[]> {
    return withTenant(this.pool, context, async db => (await db.$client.query<Omit<ExtraPhoto, "receivedAt"> & { receivedAt: Date }>(`
      SELECT v.id AS "variationId",e.id AS "evidenceId",btrim(e.sha256) AS sha256,e.server_verified_at AS "receivedAt",
        coalesce((SELECT array_agg(p.revision_id::text ORDER BY p.revision_id) FROM app.variation_revision_photo p
          WHERE (p.tenant_id,p.job_id,p.evidence_id)=(e.tenant_id,e.job_id,e.id)),'{}') AS "revisionIds"
      FROM app.variation v
      JOIN app.evidence_object e ON (e.tenant_id,e.job_id,e.scope_item_id)=(v.tenant_id,v.job_id,v.scope_item_id)
      WHERE (v.tenant_id,v.job_id)=($1,$2) AND v.existing_scope_item_id IS NULL AND ${livePhoto}
      ORDER BY e.server_verified_at,e.id`, [context.tenantId, this.jobId])).rows
      .map(row => ({ ...row, receivedAt: row.receivedAt.toISOString() })));
  }
}
