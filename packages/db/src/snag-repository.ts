import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { SnagError, snagErrorCodes, snagEventKind, SNAG_PHOTO_LIMIT, type SnagCommand, type SnagErrorCode, type SnagEventCommand, type SnagPhotoCommand, type SnagRow } from "@jobguard/core";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { EvidenceError, EvidenceService } from "./evidence.js";
import { generatePracticePng } from "./practice-proof-image.js";
import { WatchdogError } from "./watchdog.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

/** A refusal raised by the snag routines, as its typed code; anything else passes through. */
function snagRefusal(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if ((snagErrorCodes as readonly string[]).includes(message)) throw new SnagError(message as SnagErrorCode);
  if (message === "SNAG_INVALID") throw new SnagError("INVALID_SNAG_INPUT");
  if (message === "IDEMPOTENCY_CONFLICT") throw new SnagError("SNAG_COMMAND_CONFLICT");
  if (message === "JOB_NOT_LIVE") throw new WatchdogError("JOB_NOT_LIVE");
  if (message === "JOB_NOT_FOUND") throw new SnagError("SNAG_NOT_FOUND");
  throw error;
}

const fixtureVersion = (fixture: string) => `synthetic-snag-${fixture}`;
/** Practice snag photos are the generated practice images; the version names which one. Uploads and downloads never leave the app. */
export function practiceSnagPhotoStorage(): PrivateVersionedStorage {
  return {
    createUploadUrl: async ({ key }) => `synthetic-db.invalid/${encodeURIComponent(key)}`,
    createDownloadUrl: async ({ key, versionId }) => `synthetic-db.invalid/${encodeURIComponent(key)}?version=${encodeURIComponent(versionId)}`,
    async readExactVersion(key: string, versionId: string): Promise<StoredObject> {
      const fixture = ["completion-photo", "j3-drainage-photo"].find(name => fixtureVersion(name) === versionId) as "completion-photo" | "j3-drainage-photo" | undefined;
      if (!fixture) throw new EvidenceError("OBJECT_INVALID", "missing_version");
      const bytes = generatePracticePng(fixture);
      return { key, versionId, contentType: "image/png", byteLength: bytes.length, bytes };
    },
    async deleteExactVersion() { throw new Error("immutable synthetic original"); },
  };
}

/**
 * QW-4 snag list writes and reads. Every write is one checked SECURITY DEFINER routine; the runtime only reads.
 * Use a pool from `practiceMaterialPool`, so the routines can check that this practice session owns the job.
 */
export class SnagRepository {
  constructor(private readonly pool: Pool, private readonly storage: PrivateVersionedStorage = practiceSnagPhotoStorage()) {}

  async add(context: VerifiedTenantContext, jobId: string, input: Extract<SnagCommand, { action: "add" }>) {
    return withTenant(this.pool, context, async db => (await db.$client.query<{ result: { snagId: string; revision: number } }>(
      "SELECT app.snag_add($1,$2,$3,$4,$5,$6,$7) result",
      [jobId, input.commandId, input.snagId, input.title, input.location, input.assigneeLabel, input.dueOn])).rows[0]!.result).catch(snagRefusal);
  }

  async revise(context: VerifiedTenantContext, jobId: string, input: Extract<SnagCommand, { action: "revise" }>) {
    return withTenant(this.pool, context, async db => (await db.$client.query<{ result: { snagId: string; revision: number } }>(
      "SELECT app.snag_revise($1,$2,$3,$4,$5,$6,$7,$8) result",
      [jobId, input.commandId, input.snagId, input.expectedRevision, input.title, input.location, input.assigneeLabel, input.dueOn])).rows[0]!.result).catch(snagRefusal);
  }

  async recordEvent(context: VerifiedTenantContext, jobId: string, snagId: string, input: SnagEventCommand) {
    return withTenant(this.pool, context, async db => (await db.$client.query<{ result: { snagId: string; sequence: number; kind: string } }>(
      "SELECT app.snag_record_event($1,$2,$3,$4) result", [jobId, input.commandId, snagId, snagEventKind[input.action]])).rows[0]!.result).catch(snagRefusal);
  }

  /** Begin: a generated practice photo for this snag, refused once it has six. Finalize: verify it and link it, in one transaction. */
  async photo(context: VerifiedTenantContext, jobId: string, snagId: string, input: SnagPhotoCommand) {
    const evidence = new EvidenceService(this.pool, this.storage);
    const openSnag = async (db: TenantTransaction) => {
      const found = (await db.$client.query<{ photos: number }>(`SELECT (SELECT count(*)::int FROM app.snag_photo p WHERE (p.tenant_id,p.snag_id)=(s.tenant_id,s.id)) photos
        FROM app.snag s WHERE (s.tenant_id,s.job_id,s.id)=($1,$2,$3)`, [context.tenantId, jobId, snagId])).rows[0];
      if (!found) throw new SnagError("SNAG_NOT_FOUND");
      if (found.photos >= SNAG_PHOTO_LIMIT) throw new SnagError("PHOTO_LIMIT_REACHED");
    };
    try {
      if (input.action === "begin") {
        const bytes = generatePracticePng(input.fixture), digest = createHash("sha256").update(bytes).digest("hex");
        const upload = await evidence.beginUpload(context, { id: input.commandId, jobId, scopeItemId: null, expectedSha256: digest, contentType: "image/png",
          maximumBytes: bytes.length, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600_000) },
          // The upload belongs to this snag from the start: a retry of the same begin naming another snag conflicts (Codex P2 4685550045).
          async (db, upload) => {
            // An exact retry of a recorded begin replays even once the snag is full; only a new upload counts against the cap (Codex P2 4685913757).
            const recorded = (await db.$client.query("SELECT 1 FROM app.snag_photo_upload WHERE tenant_id=$1 AND upload_id=$2", [context.tenantId, upload.id])).rowCount;
            if (!recorded) await openSnag(db);
            await db.$client.query("SELECT app.snag_bind_photo_upload($1,$2,$3)", [jobId, snagId, upload.id]);
          });
        return { uploadId: upload.id, objectVersionId: fixtureVersion(input.fixture) };
      }
      // Only this job's unscoped uploads become snag photos, so a proof upload cannot be finalized here.
      const pending = await withTenant(this.pool, context, async db => (await db.$client.query(
        `SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=($1,$2,$3) AND u.scope_item_id IS NULL`, [context.tenantId, jobId, input.uploadId])).rowCount);
      if (!pending) throw new SnagError("SNAG_PHOTO_REFUSED");
      const verified = await evidence.finalize(context, { commandId: input.commandId, uploadId: input.uploadId, objectVersionId: input.objectVersionId, evidenceType: "snag_photo" },
        async db => { await db.$client.query("SELECT app.snag_attach_photo($1,$2,$3)", [jobId, snagId, input.uploadId]); });
      // A stored finalize replays without linking again, so the link decides. It commits with the evidence and never changes:
      // a retry or a concurrent request naming another snag conflicts instead of reporting success (Codex P2 4685119174, 4685159915).
      const linkedHere = await withTenant(this.pool, context, async db => (await db.$client.query(
        `SELECT 1 FROM app.snag_photo p WHERE (p.tenant_id,p.job_id,p.evidence_id,p.snag_id)=($1,$2,$3,$4)`, [context.tenantId, jobId, verified.id, snagId])).rowCount);
      if (!linkedHere) throw new SnagError("SNAG_COMMAND_CONFLICT");
      return { evidenceId: verified.id as string };
    } catch (error) {
      if (error instanceof EvidenceError && error.code === "COMMAND_CONFLICT") throw new SnagError("SNAG_COMMAND_CONFLICT");
      if (error instanceof EvidenceError) throw new SnagError("SNAG_PHOTO_REFUSED");
      if (error instanceof SnagError || error instanceof WatchdogError) throw error;
      return snagRefusal(error);
    }
  }

  /** Every snag on the job with its current details, events and photos. */
  async read(context: VerifiedTenantContext, jobId: string): Promise<SnagRow[]> {
    return withTenant(this.pool, context, async db => (await db.$client.query<SnagRow>(`
      SELECT s.id,coalesce(r.revision,1) AS revision,coalesce(r.title,s.title) AS title,
        CASE WHEN r.revision IS NULL THEN s.location ELSE r.location END AS location,
        CASE WHEN r.revision IS NULL THEN s.assignee_label ELSE r.assignee_label END AS "assigneeLabel",
        to_char(CASE WHEN r.revision IS NULL THEN s.due_on ELSE r.due_on END,'YYYY-MM-DD') AS "dueOn",
        to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",s.created_by_membership_id AS "createdByMembershipId",
        coalesce((SELECT jsonb_agg(jsonb_build_object('sequence',e.sequence,'kind',e.kind,'actorMembershipId',e.actor_membership_id,
          'recordedAt',to_char(e.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY e.sequence)
          FROM app.snag_event e WHERE (e.tenant_id,e.snag_id)=(s.tenant_id,s.id)),'[]') AS events,
        coalesce((SELECT jsonb_agg(jsonb_build_object('evidenceId',p.evidence_id,'position',p.position,'sha256',p.sha256,
          'receivedAt',to_char(p.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'withdrawn',EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(p.tenant_id,p.evidence_id))) ORDER BY p.position)
          FROM app.snag_photo p WHERE (p.tenant_id,p.snag_id)=(s.tenant_id,s.id)),'[]') AS photos
      FROM app.snag s
      LEFT JOIN LATERAL (SELECT * FROM app.snag_revision x WHERE (x.tenant_id,x.snag_id)=(s.tenant_id,s.id) ORDER BY x.revision DESC LIMIT 1) r ON true
      WHERE (s.tenant_id,s.job_id)=($1,$2) ORDER BY s.created_at,s.id`, [context.tenantId, jobId])).rows);
  }
}
