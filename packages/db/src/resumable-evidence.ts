import type { Pool } from "pg";
import { z } from "zod";
import { sha256, type PrivateVersionedStorage } from "@jobguard/storage";
import { EvidenceError, EvidenceService, syntheticMediaUploadSchema } from "./evidence.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { requireLiveJob } from "./watchdog.js";
import { refuseLockedNewSource } from "./job-work-state-sources.js";

const uuid = z.guid();
const identity = { version: z.literal("resumable-evidence.v1"), uploadId: uuid, jobId: uuid, actorMembershipId: uuid };
const access = z.object(identity).strict();
const chunk = z.object({ ...identity, offset: z.number().int().min(0).max(25_000_000),
  bytes: z.instanceof(Uint8Array).refine(bytes => bytes.length > 0 && bytes.length <= 1_000_000) }).strict();
const begin = syntheticMediaUploadSchema.extend({ version: identity.version, id: uuid, actorMembershipId: uuid }).strict();
const finish = access.extend({ commandId: uuid, evidenceType: z.string().min(1).max(40) }).strict();
type Access = z.infer<typeof access>;
type Upload = { id: string; object_key: string; expected_content_type: string; maximum_bytes: string;
  state: string; expires_at: Date };

export class ResumableEvidenceError extends Error {
  constructor(readonly code: "DISABLED" | "NOT_FOUND" | "CONFLICT" | "LIMIT" | "INCOMPLETE") {
    super(code); this.name = "ResumableEvidenceError";
  }
}

/** DARK: database-backed synthetic bytes only. No controller, provider or upload URL.
 * The caller must supply an authenticated context; membership is rechecked on every operation.
 * Sequential offsets make interruptions resumable without a second upload/session identity.
 * maximumBytes is the exact encrypted-local-file plaintext length for this protocol.
 */
export class ResumableEvidenceService {
  constructor(private readonly pool: Pool, private readonly enabled = false) {}

  private async authorize(db: TenantTransaction, context: VerifiedTenantContext, input: Access) {
    const allowed = await db.$client.query(`SELECT 1 FROM app.job_commercial_track t
      JOIN app.membership m ON m.tenant_id=t.tenant_id
      WHERE t.tenant_id=$1 AND t.job_id=$2 AND t.environment='synthetic_demo'
      AND m.id=$3 AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`,
    [context.tenantId, input.jobId, input.actorMembershipId]);
    if (!allowed.rows[0]) throw new ResumableEvidenceError("NOT_FOUND");
    await requireLiveJob(db, input.jobId);
  }

  private checkEnabled() { if (!this.enabled) throw new ResumableEvidenceError("DISABLED"); }

  async begin(context: VerifiedTenantContext, raw: unknown) {
    this.checkEnabled();
    const input = begin.parse(raw);
    const target = { ...input, uploadId: input.id };
    await withTenant(this.pool, context, db => this.authorize(db, context, target));
    const evidence = new EvidenceService(this.pool, this.storage(context, target), true);
    // The existing two-phase command owns identity, labelled client hash/time and expiry.
    const result = await evidence.beginUpload(context, input, db => this.authorize(db, context, target));
    const { uploadUrl: _url, ...upload } = result;
    return { version: "resumable-evidence.v1" as const, upload };
  }

  private async lockedUpload(db: TenantTransaction, context: VerifiedTenantContext, input: Access) {
    await this.authorize(db, context, input);
    const row = (await db.$client.query<Upload>(`SELECT id,object_key,expected_content_type,maximum_bytes,state,expires_at
      FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2 AND job_id=$3 FOR UPDATE`,
    [context.tenantId, input.uploadId, input.jobId])).rows[0];
    if (!row) throw new ResumableEvidenceError("NOT_FOUND");
    return row;
  }

  private async parts(db: TenantTransaction, context: VerifiedTenantContext, uploadId: string) {
    return (await db.$client.query<{ byte_offset: number; bytes: Buffer }>(`SELECT byte_offset,bytes
      FROM app.synthetic_evidence_chunk WHERE tenant_id=$1 AND upload_id=$2 ORDER BY byte_offset`,
    [context.tenantId, uploadId])).rows;
  }

  async status(context: VerifiedTenantContext, raw: unknown) {
    this.checkEnabled();
    const input = access.parse(raw);
    return withTenant(this.pool, context, async db => {
      const upload = await this.lockedUpload(db, context, input);
      const parts = await this.parts(db, context, input.uploadId);
      return { version: "resumable-evidence.v1" as const, state: upload.state,
        nextOffset: parts.reduce((total, part) => total + part.bytes.length, 0) };
    });
  }

  async append(context: VerifiedTenantContext, raw: unknown) {
    this.checkEnabled();
    const input = chunk.parse(raw);
    // Copy before the first await so the caller cannot mutate an in-flight payload.
    const bytes = Buffer.from(input.bytes);
    return withTenant(this.pool, context, async db => {
      const upload = await this.lockedUpload(db, context, input);
      await refuseLockedNewSource(db, input.jobId);
      if (upload.state !== "pending" || upload.expires_at.getTime() <= Date.now()) throw new ResumableEvidenceError("CONFLICT");
      const parts = await this.parts(db, context, input.uploadId);
      const nextOffset = parts.reduce((total, part) => total + part.bytes.length, 0);
      const previous = parts.find(part => part.byte_offset === input.offset);
      if (previous) {
        if (!previous.bytes.equals(bytes)) throw new ResumableEvidenceError("CONFLICT");
        return { nextOffset };
      }
      if (input.offset !== nextOffset) throw new ResumableEvidenceError("CONFLICT");
      if (nextOffset + bytes.length > Number(upload.maximum_bytes)) throw new ResumableEvidenceError("LIMIT");
      await db.$client.query(`INSERT INTO app.synthetic_evidence_chunk(tenant_id,upload_id,byte_offset,bytes)
        VALUES($1,$2,$3,$4)`, [context.tenantId, input.uploadId, input.offset, bytes]);
      return { nextOffset: nextOffset + bytes.length };
    });
  }

  async finalize(context: VerifiedTenantContext, raw: unknown) {
    this.checkEnabled();
    const input = finish.parse(raw);
    const object = await withTenant(this.pool, context, async db => {
      const upload = await this.lockedUpload(db, context, input);
      const parts = await this.parts(db, context, input.uploadId);
      const bytes = Buffer.concat(parts.map(part => part.bytes));
      if (bytes.length < Number(upload.maximum_bytes)) throw new ResumableEvidenceError("INCOMPLETE");
      return { key: upload.object_key, versionId: `synthetic-${sha256(bytes)}`, bytes,
        byteLength: bytes.length, contentType: upload.expected_content_type };
    });
    // No client-supplied object version or digest becomes authoritative. The finaliser
    // verifies the server-read bytes against the labelled client expectation as usual.
    return new EvidenceService(this.pool, this.storage(context, input), true).finalize(context, {
      commandId: input.commandId, uploadId: input.uploadId, objectVersionId: object.versionId, evidenceType: input.evidenceType,
    }, db => this.authorize(db, context, input));
  }

  /** Use with the existing ProofCommandService so stage completion re-reads these exact bytes. */
  storageForProof(context: VerifiedTenantContext, raw: unknown): PrivateVersionedStorage {
    this.checkEnabled();
    return this.storage(context, access.parse(raw));
  }

  private storage(context: VerifiedTenantContext, input: Access): PrivateVersionedStorage {
    return {
      createUploadUrl: async () => "synthetic-resumable.invalid",
      createDownloadUrl: async () => { throw new ResumableEvidenceError("DISABLED"); },
      deleteExactVersion: async () => { throw new ResumableEvidenceError("DISABLED"); },
      readExactVersion: async (key, versionId) => withTenant(this.pool, context, async db => {
        const upload = await this.lockedUpload(db, context, input);
        const parts = await this.parts(db, context, input.uploadId);
        const bytes = Buffer.concat(parts.map(part => part.bytes));
        if (key !== upload.object_key || versionId !== `synthetic-${sha256(bytes)}`) throw new EvidenceError("OBJECT_INVALID");
        return { key, versionId, bytes, byteLength: bytes.length, contentType: upload.expected_content_type };
      }),
    };
  }
}
