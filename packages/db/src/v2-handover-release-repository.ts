// V2-G3 (Q57): release a saved handover version to the customer by link, and "Acknowledge receipt".
// Release needs ordinary site completion (the 2058 guard) and never reads the financial lock. The link
// side reads and writes only through the owner functions in 2058, copied from E2's reply link.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { HandoverContent } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { readFirmProfile } from "./firm-profile-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";

export const handoverReleaseCommandV1 = z.strictObject({ version: z.literal("v2-handover-release-command.v1"), commandId: z.guid(),
  handoverVersion: z.number().int().min(1).max(100000), expiresInDays: z.number().int().min(1).max(90).default(30) });
export const handoverAcknowledgeV1 = z.strictObject({ version: z.literal("v2-handover-acknowledge.v1"), token: z.string().min(1).max(200) });
export type HandoverReleaseCommand = z.input<typeof handoverReleaseCommandV1>;

export class HandoverReleaseError extends Error {
  constructor(readonly code: "HANDOVER_RELEASE_INVALID_COMMAND" | "HANDOVER_RELEASE_NOT_FOUND" | "HANDOVER_SITE_NOT_COMPLETE" |
    "HANDOVER_NO_RECIPIENT" | "HANDOVER_RELEASE_COMMAND_CONFLICT" | "HANDOVER_LINK_REFUSED") { super(code); }
}

export type HandoverRelease = { releaseId: string; version: number; recipient: string; releasedAt: string; expiresAt: string;
  acknowledgedAt: string | null; superseded: boolean };
export type HandoverLinkView = { status: "open"; version: number; firmName: string; releasedAt: string; expiresAt: string;
  content: HandoverContent; newerAvailable: boolean; acknowledgedAt: string | null };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
/** Only the hash is stored; the token travels once to the builder's screen and the catcher. */
export const handoverLinkTokenHash = (token: string) => sha256(token);

export class HandoverReleaseRepository {
  constructor(private readonly pool: Pool, private readonly clock: () => number = Date.now) {}

  private async releases(client: PoolClient, tenantId: string, jobId: string) {
    return (await client.query<HandoverRelease>(`
      SELECT r.id AS "releaseId", r.version, r.recipient_email AS recipient, r.released_at::text AS "releasedAt",
        r.expires_at::text AS "expiresAt", a.acknowledged_at::text AS "acknowledgedAt",
        EXISTS (SELECT FROM app.v2_handover_release n WHERE (n.tenant_id, n.job_id) = (r.tenant_id, r.job_id)
          AND (n.released_at, n.id) > (r.released_at, r.id)) AS superseded
      FROM app.v2_handover_release r
      LEFT JOIN app.v2_handover_acknowledgement a ON (a.tenant_id, a.job_id, a.release_id) = (r.tenant_id, r.job_id, r.id)
      WHERE (r.tenant_id, r.job_id) = ($1, $2) ORDER BY r.released_at, r.id`, [tenantId, jobId])).rows;
  }

  /** The same rule as the 2058 guard, for the screen: every scope item of the job complete. */
  private async siteComplete(client: PoolClient, tenantId: string, jobId: string) {
    return (await client.query<{ complete: boolean }>(`SELECT count(*) > 0 AND bool_and(stage = 'complete') AS complete
      FROM app.scope_progress WHERE (tenant_id, job_id) = ($1, $2)`, [tenantId, jobId])).rows[0]?.complete === true;
  }

  /** Builder: every release with its receipt, and whether the site work is complete. Never a token. */
  list(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      if (!(await $client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)", [context.tenantId, jobId])).rowCount)
        throw new HandoverReleaseError("HANDOVER_RELEASE_NOT_FOUND");
      return { siteComplete: await this.siteComplete($client, context.tenantId, jobId),
        releases: await this.releases($client, context.tenantId, jobId) };
    });
  }

  /** Builder: release one saved version. Returns the link once; a replay returns the release without it. */
  async release(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown) {
    const parsed = handoverReleaseCommandV1.safeParse(raw);
    if (!parsed.success) throw new HandoverReleaseError("HANDOVER_RELEASE_INVALID_COMMAND");
    const command = parsed.data;
    const result = await withTenant(this.pool, context, async db => {
      const client = db.$client;
      const actor = (await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [sha256(sessionId)])).rows[0]?.id;
      if (!actor) throw new HandoverReleaseError("HANDOVER_RELEASE_NOT_FOUND");
      // G2's lock: a release and a save of the same job never interleave.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2043))", [`handover:${jobId}`]);
      const requestHash = sha256(JSON.stringify({ jobId, actor, command }));
      const prior = (await client.query<{ id: string; jobId: string; requestHash: string }>(`SELECT id, job_id AS "jobId",
        request_hash AS "requestHash" FROM app.v2_handover_release WHERE (tenant_id, command_id) = ($1, $2)`,
      [context.tenantId, command.commandId])).rows[0];
      if (prior) {
        if (prior.jobId !== jobId || prior.requestHash !== requestHash) throw new HandoverReleaseError("HANDOVER_RELEASE_COMMAND_CONFLICT");
        const release = (await this.releases(client, context.tenantId, jobId)).find(row => row.releaseId === prior.id)!;
        return { release, token: null, recipient: release.recipient, replayed: true };
      }
      const saved = (await client.query<{ contentHash: string }>(`SELECT content_hash AS "contentHash" FROM app.v2_handover_version
        WHERE (tenant_id, job_id, version) = ($1, $2, $3)`, [context.tenantId, jobId, command.handoverVersion])).rows[0];
      if (!saved) throw new HandoverReleaseError("HANDOVER_RELEASE_NOT_FOUND");
      // The job's current customer contact, as E2 reads it.
      const party = (await client.query<{ email: string | null; bindingId: string; revisionId: string }>(`SELECT
        cr.payload->>'email' AS email, b.id AS "bindingId", b.customer_revision_id AS "revisionId"
        FROM app.job_party_current x JOIN app.job_party_binding b ON (b.tenant_id, b.id) = (x.tenant_id, x.binding_id)
        JOIN app.customer_revision cr ON (cr.tenant_id, cr.id) = (b.tenant_id, b.customer_revision_id)
        WHERE (x.tenant_id, x.job_id) = ($1, $2)`, [context.tenantId, jobId])).rows[0];
      const recipient = party?.email?.trim();
      if (!party || !recipient) throw new HandoverReleaseError("HANDOVER_NO_RECIPIENT");
      assertV2Recipient(recipient);
      const firmName = (await readFirmProfile(db))?.tradingName ?? "Your builder";
      const token = randomBytes(32).toString("base64url");
      const releaseId = randomUUID();
      const releasedAt = new Date(this.clock());
      const expiresAt = new Date(releasedAt.getTime() + command.expiresInDays * 86_400_000);
      try {
        await client.query(`INSERT INTO app.v2_handover_release (tenant_id, job_id, id, version, content_hash, recipient_email, party_binding_id,
          customer_revision_id, firm_name, token_hash, request_hash, command_id, actor_membership_id, released_at, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [context.tenantId, jobId, releaseId, command.handoverVersion, saved.contentHash, recipient, party.bindingId, party.revisionId, firmName,
          handoverLinkTokenHash(token), requestHash, command.commandId, actor, releasedAt, expiresAt]);
      } catch (error) {
        if (/V2_HANDOVER_SITE_NOT_COMPLETE/u.test((error as Error).message)) throw new HandoverReleaseError("HANDOVER_SITE_NOT_COMPLETE");
        throw error;
      }
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: "v2.handover.released",
        subjectType: "job", subjectRef: jobId, payload: {
          references: { commandId: command.commandId, releaseId, handoverVersion: String(command.handoverVersion), expiresAt: expiresAt.toISOString() },
          hashes: { content: saved.contentHash, request: requestHash, recipient: sha256(recipient) }, classifications: { action: "operational" } } }]);
      const release = (await this.releases(client, context.tenantId, jobId)).find(row => row.releaseId === releaseId)!;
      return { release, token, recipient, replayed: false };
    });
    // After commit, once per new release: the local catcher only (metadata, never the link).
    if (!result.replayed) captureV2Delivery("v2_handover_release", result.recipient);
    return { release: result.release, token: result.token, replayed: result.replayed };
  }

  /** Customer page. One refusal for every unknown or expired link. */
  async open(token: string): Promise<HandoverLinkView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const view = (await client.query<{ view: HandoverLinkView | { status: "refused" } }>(
        "SELECT app.v2_handover_link_open($1) AS view", [handoverLinkTokenHash(token)])).rows[0]!.view;
      await client.query("COMMIT");
      if (view.status !== "open") throw new HandoverReleaseError("HANDOVER_LINK_REFUSED");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  /** Customer press: receipt only. A repeat returns the stored time. */
  async acknowledge(raw: unknown) {
    const parsed = handoverAcknowledgeV1.safeParse(raw);
    if (!parsed.success) throw new HandoverReleaseError("HANDOVER_RELEASE_INVALID_COMMAND");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      type Saved = { status: "refused" } | { status: "acknowledged"; replayed: boolean; jobId: string; releaseId: string; version: number;
        contentHash: string; acknowledgedAt: string };
      const saved = (await client.query<{ saved: Saved }>("SELECT app.v2_handover_link_acknowledge($1) AS saved",
        [handoverLinkTokenHash(parsed.data.token)])).rows[0]!.saved;
      if (saved.status === "acknowledged" && !saved.replayed) {
        // Only the scope's one receipt may enter the chain (policy v2_handover_link_audit_write consumes the allowance).
        await appendAuditBatch(drizzle(client) as TenantTransaction, [{ id: randomUUID(), version: "audit.v1",
          actorRef: `handover_link:${saved.releaseId}`, eventType: "v2.handover.acknowledged", subjectType: "job", subjectRef: saved.jobId,
          payload: { references: { releaseId: saved.releaseId, handoverVersion: String(saved.version) },
            hashes: { content: saved.contentHash }, classifications: { action: "operational" } } }]);
        await client.query("SELECT app.v2_handover_link_close()");
      }
      await client.query("COMMIT");
      if (saved.status !== "acknowledged") throw new HandoverReleaseError("HANDOVER_LINK_REFUSED");
      return { version: saved.version, acknowledgedAt: saved.acknowledgedAt, replayed: saved.replayed };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
