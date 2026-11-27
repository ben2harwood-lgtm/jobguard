// V2-G2 (Q56): handover pack versions. The builder chooses what goes in, previews it and saves frozen,
// numbered versions. Reads descriptions and version references only: no money column is ever selected.
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { composeHandoverPack, handoverChoiceV1, type HandoverContent, type HandoverRefusal,
  type HandoverSources } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { readFirmProfile } from "./firm-profile-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const handoverSaveCommandV1 = z.strictObject({ version: z.literal("v2-handover-save-command.v1"), commandId: z.guid(),
  expectedVersion: z.number().int().min(0).max(100000), choice: handoverChoiceV1,
  // The preview's content hash: when given, the save refuses if any chosen source changed since that preview.
  previewHash: z.string().regex(/^[0-9a-f]{64}$/u).optional() });
export const handoverPreviewV1 = z.strictObject({ version: z.literal("v2-handover-preview.v1"), choice: handoverChoiceV1 });
export type HandoverSaveCommand = z.infer<typeof handoverSaveCommandV1>;
export type HandoverVersion = { version: number; commandId: string; content: HandoverContent; sources: unknown;
  contentHash: string; recordedAt: string };

export class HandoverError extends Error {
  constructor(readonly code: "HANDOVER_INVALID_COMMAND" | "HANDOVER_NOT_FOUND" | "HANDOVER_NOTHING_CHOSEN" | "HANDOVER_LINE_REFUSED" |
    "HANDOVER_SOURCE_CHANGED" | "HANDOVER_VERSION_CONFLICT" | "HANDOVER_COMMAND_CONFLICT", readonly refused: HandoverRefusal[] = []) { super(code); }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const columns = `version, command_id AS "commandId", content, sources, content_hash AS "contentHash", recorded_at::text AS "recordedAt"`;

/** Use a pool from `practiceMaterialPool`, as the snag register does, so main's snag rows are readable. */
export class HandoverRepository {
  constructor(private readonly pool: Pool) {}

  private async read(client: PoolClient, db: TenantTransaction, tenantId: string, jobId: string): Promise<HandoverSources> {
    const job = (await client.query<{ quoteRevisionId: string | null }>(`
      SELECT q.quote_revision_id AS "quoteRevisionId" FROM app.job j
      LEFT JOIN app.job_activation a ON (a.tenant_id, a.job_id) = (j.tenant_id, j.id)
      LEFT JOIN app.quote_document_version q ON (q.tenant_id, q.job_id, q.id) = (j.tenant_id, j.id,
        COALESCE(a.accepted_document_id, j.accepted_quote_version_id, (
          SELECT x.document_id FROM app.quote_acceptance x WHERE (x.tenant_id, x.job_id) = (j.tenant_id, j.id)
          ORDER BY x.recorded_at DESC, x.document_version DESC, x.id DESC LIMIT 1)))
      WHERE (j.tenant_id, j.id) = ($1, $2)`, [tenantId, jobId])).rows[0];
    if (!job) throw new HandoverError("HANDOVER_NOT_FOUND");
    const lines = job.quoteRevisionId ? (await client.query<{ id: string; description: string }>(`SELECT id, description FROM app.quote_line
      WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3) AND included ORDER BY ordinal, id`, [tenantId, jobId, job.quoteRevisionId])).rows : [];
    const variations = (await client.query<{ variationId: string; revisionId: string; description: string }>(`
      SELECT v.id AS "variationId", r.id AS "revisionId", r.description FROM app.variation v
      JOIN app.variation_revision r ON (r.tenant_id, r.job_id, r.id) = (v.tenant_id, v.job_id, v.current_revision_id)
      WHERE (v.tenant_id, v.job_id) = ($1, $2) AND v.state = 'approved' ORDER BY v.created_at, v.id`, [tenantId, jobId])).rows;
    // F6's customer-photo query (verified originals, not invalidated), copied, with the sha256. Only site, completion,
    // snag and variation photos: never a receipt or record image, whose amounts no text check can see.
    const photos = (await client.query<{ id: string; sha256: string; receivedAt: string }>(`
      SELECT e.id, e.sha256, to_char(e.server_received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "receivedAt"
      FROM app.evidence_object e WHERE e.tenant_id = $1 AND e.job_id = $2 AND e.kind = 'original'
        AND e.evidence_type IN ('site_photo', 'completion_photo', 'snag_photo', 'variation_photo')
        AND e.content_type IN ('image/png', 'image/jpeg', 'image/webp') AND e.server_verified_at IS NOT NULL
        AND NOT EXISTS (SELECT FROM app.evidence_invalidation i WHERE (i.tenant_id, i.evidence_id) = (e.tenant_id, e.id))
      ORDER BY e.server_received_at, e.id`, [tenantId, jobId])).rows;
    // Open and fixed snags, with G1's crew owner (or main's label) and agreed note. Checked snags are not outstanding.
    const snags = (await client.query<HandoverSources["snags"][number]>(`
      SELECT s.id, s.title, COALESCE(c.display_name, CASE WHEN o.snag_id IS NULL OR o.crew_id IS NULL THEN s.assignee_label END) AS owner,
        s.due_on::text AS "dueOn", CASE WHEN e.kind = 'fixed' THEN 'fixed' ELSE 'open' END AS state,
        COALESCE(e.sequence, 0) AS "lastSequence", CASE WHEN g.agreed THEN g.note END AS "agreedNote"
      FROM app.snag s
      LEFT JOIN LATERAL (SELECT x.sequence, x.kind FROM app.snag_event x WHERE (x.tenant_id, x.snag_id) = (s.tenant_id, s.id)
        ORDER BY x.sequence DESC LIMIT 1) e ON true
      LEFT JOIN LATERAL (SELECT x.snag_id, x.crew_id, x.crew_revision, x.firm_key FROM app.v2_snag_owner x
        WHERE (x.tenant_id, x.snag_id) = (s.tenant_id, s.id) ORDER BY x.sequence DESC LIMIT 1) o ON true
      LEFT JOIN app.v2_crew_contact c ON (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (s.tenant_id, o.firm_key, o.crew_id, o.crew_revision)
      LEFT JOIN LATERAL (SELECT x.agreed, x.note FROM app.v2_snag_agreed x WHERE (x.tenant_id, x.snag_id) = (s.tenant_id, s.id)
        ORDER BY x.sequence DESC LIMIT 1) g ON true
      WHERE (s.tenant_id, s.job_id) = ($1, $2) AND e.kind IS DISTINCT FROM 'checked' ORDER BY s.created_at, s.id`, [tenantId, jobId])).rows;
    const profile = await readFirmProfile(db);
    return { quoteRevisionId: job.quoteRevisionId, lines, variations, photos, snags,
      contact: profile ? { tradingName: profile.tradingName, email: profile.contactEmail || null, phone: profile.contactPhone || null } : null };
  }

  private async versions(client: PoolClient, tenantId: string, jobId: string) {
    return (await client.query<HandoverVersion>(`SELECT ${columns} FROM app.v2_handover_version WHERE (tenant_id, job_id) = ($1, $2)
      ORDER BY version`, [tenantId, jobId])).rows;
  }

  /** Everything the builder can choose from, and every saved version. */
  async view(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async db => ({ sources: await this.read(db.$client, db, context.tenantId, jobId),
      versions: await this.versions(db.$client, context.tenantId, jobId) }));
  }

  /** Writes nothing. */
  async preview(context: VerifiedTenantContext, jobId: string, raw: unknown) {
    const parsed = handoverPreviewV1.safeParse(raw);
    if (!parsed.success) throw new HandoverError("HANDOVER_INVALID_COMMAND");
    return withTenant(this.pool, context, async db => {
      const { content, refused, unknown } = composeHandoverPack(await this.read(db.$client, db, context.tenantId, jobId), parsed.data.choice);
      if (unknown.length) throw new HandoverError("HANDOVER_SOURCE_CHANGED");
      return { content, refused, contentHash: sha256(JSON.stringify(content)) };
    });
  }

  async save(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown): Promise<HandoverVersion & { replayed: boolean }> {
    const parsed = handoverSaveCommandV1.safeParse(raw);
    if (!parsed.success) throw new HandoverError("HANDOVER_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async db => {
      const client = db.$client;
      const actor = (await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [sha256(sessionId)])).rows[0]?.id;
      if (!actor) throw new HandoverError("HANDOVER_NOT_FOUND");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2043))", [`handover:${jobId}`]);
      const requestHash = sha256(JSON.stringify({ jobId, actor, command }));
      const replay = (await client.query<HandoverVersion & { requestHash: string; jobId: string }>(`SELECT ${columns},
        request_hash AS "requestHash", job_id AS "jobId" FROM app.v2_handover_version WHERE (tenant_id, command_id) = ($1, $2)`,
      [context.tenantId, command.commandId])).rows[0];
      if (replay) {
        if (replay.requestHash !== requestHash || replay.jobId !== jobId) throw new HandoverError("HANDOVER_COMMAND_CONFLICT");
        const { requestHash: _hash, jobId: _job, ...saved } = replay;
        return { ...saved, replayed: true };
      }
      const latest = (await this.versions(client, context.tenantId, jobId)).at(-1)?.version ?? 0;
      if (latest !== command.expectedVersion) throw new HandoverError("HANDOVER_VERSION_CONFLICT");
      if (!command.choice.sections.length) throw new HandoverError("HANDOVER_NOTHING_CHOSEN");
      // Every chosen source is re-read under the lock; anything no longer offered refuses the save.
      const composed = composeHandoverPack(await this.read(client, db, context.tenantId, jobId), command.choice);
      if (composed.unknown.length) throw new HandoverError("HANDOVER_SOURCE_CHANGED");
      if (composed.refused.length) throw new HandoverError("HANDOVER_LINE_REFUSED", composed.refused);
      const contentHash = sha256(JSON.stringify(composed.content));
      if (command.previewHash && command.previewHash !== contentHash) throw new HandoverError("HANDOVER_SOURCE_CHANGED");
      const saved = (await client.query<HandoverVersion>(`INSERT INTO app.v2_handover_version (tenant_id, job_id, version, command_id,
        content, sources, content_hash, request_hash, actor_membership_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${columns}`,
      [context.tenantId, jobId, latest + 1, command.commandId, JSON.stringify(composed.content), JSON.stringify(composed.sources),
        contentHash, requestHash, actor])).rows[0]!;
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: "v2.handover.version_saved",
        subjectType: "job", subjectRef: jobId, payload: {
          references: { commandId: command.commandId, handoverVersion: String(saved.version),
            ...(composed.sources.quoteRevisionId && { quoteRevisionId: composed.sources.quoteRevisionId }) },
          hashes: { content: contentHash, sources: sha256(JSON.stringify(composed.sources)) }, classifications: { action: "operational" } } }]);
      return { ...saved, replayed: false };
    });
  }

  async list(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async db => this.versions(db.$client, context.tenantId, jobId));
  }
}
