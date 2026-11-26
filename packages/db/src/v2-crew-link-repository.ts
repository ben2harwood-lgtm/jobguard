// V2-F7M (Q52): "My brief" for a crew member by their own link. The builder issues
// and cancels links; the crew page reads its brief and records presses through the
// owner functions in 2041, copied from E2's reply link. A crew press is an
// observation: F2's status never counts it, and the builder confirms it with an
// ordinary F1 press.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const crewLinkCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ version: z.literal("v2-crew-link-command.v1"), action: z.literal("issue"), commandId: uuid,
    crewId: uuid, expiresInDays: z.number().int().min(1).max(30).default(14) }),
  z.strictObject({ version: z.literal("v2-crew-link-command.v1"), action: z.literal("cancel"), commandId: uuid,
    linkId: uuid }),
]);
export type CrewLinkCommand = z.input<typeof crewLinkCommandV1>;

export const crewLinkPressV1 = z.strictObject({
  version: z.literal("v2-crew-link-press.v1"),
  token: z.string().min(1).max(200),
  commandId: uuid,
  briefVersion: z.number().int().min(1).max(2_147_483_646),
  scopeItemId: uuid,
  taskKey: z.string().trim().min(1).max(200),
  kind: z.enum(["done", "blocked", "changed"]),
  note: z.string().trim().max(2000).refine(text => !text.includes("\0")),
}).refine(press => press.kind === "done" || press.note.length > 0);
export type CrewLinkPress = z.input<typeof crewLinkPressV1>;

export class CrewLinkError extends Error {
  constructor(readonly code: "CREW_LINK_INVALID_COMMAND" | "CREW_LINK_EDITOR_REQUIRED" | "CREW_LINK_CREW_UNAVAILABLE" |
    "CREW_LINK_NOT_FOUND" | "CREW_LINK_COMMAND_CONFLICT" | "CREW_LINK_REFUSED" | "CREW_LINK_STALE") { super(code); }
}

export type CrewLinkRow = { linkId: string; crewId: string; crewName: string; trade: string; issuedAt: Date;
  expiresAt: Date; cancelled: boolean; replaced: boolean };
export type CrewPress = { commandId: string; linkId: string; crewName: string; trade: string; briefVersion: number;
  scopeItemId: string; taskKey: string; kind: "done" | "blocked" | "changed"; note: string; seenHead: number;
  recordedAt: Date; confirmed: boolean };
export type CrewLinkTask = { scopeItemId: string; taskKey: string; title: string;
  scope: { description: string; quantity: string | null; unit: string | null }; durationMinutes: number;
  visit: string | null; proofNeeded: string[]; version: number;
  latest: { kind: "done" | "blocked" | "changed"; note: string; recordedAt: string } | null;
  /** This link's own latest observation on the task: what the crew member sent, confirmed or not. */
  reported: { kind: "done" | "blocked" | "changed"; note: string; recordedAt: string } | null };
export type CrewLinkView = { status: "open"; trade: string; crewName: string; expiresAt: string;
  brief: { version: number; accessWindow: string; proofNeeded: string[]; changed: boolean; tasks: CrewLinkTask[] } | null };

/** Only the hash is stored; the token travels once to the builder's screen. */
export const crewLinkTokenHash = (token: string) => sha256(token);

export class CrewLinkRepository {
  constructor(private readonly pool: Pool, private readonly clock: () => number = Date.now) {}

  private async editor(client: PoolClient, sessionId: string) {
    const { rows: [actor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [sha256(sessionId)]);
    if (!actor?.id) throw new CrewLinkError("CREW_LINK_EDITOR_REQUIRED");
    return actor.id;
  }

  private async requireJob(client: PoolClient, tenantId: string, jobId: string) {
    const job = await client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)", [tenantId, jobId]);
    if (!job.rowCount) throw new PracticeAccessError("NOT_FOUND");
  }

  /** Builder: every link on the job, newest first. Never a token. */
  list(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      await this.requireJob($client, context.tenantId, jobId);
      return (await $client.query<CrewLinkRow>(`
        SELECT l.id AS "linkId", l.crew_id AS "crewId", c.display_name AS "crewName", l.trade, l.issued_at AS "issuedAt",
          l.expires_at AS "expiresAt",
          EXISTS (SELECT FROM app.v2_crew_link_cancel x WHERE (x.tenant_id, x.job_id, x.link_id) = (l.tenant_id, l.job_id, l.id)) AS cancelled,
          EXISTS (SELECT FROM app.v2_crew_link n WHERE (n.tenant_id, n.job_id, n.crew_id, n.trade) = (l.tenant_id, l.job_id, l.crew_id, l.trade)
            AND (n.issued_at, n.id) > (l.issued_at, l.id)) AS replaced
        FROM app.v2_crew_link l
        JOIN app.v2_crew_contact c ON (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (l.tenant_id, l.firm_key, l.crew_id, l.crew_revision)
        WHERE (l.tenant_id, l.job_id) = ($1, $2) ORDER BY l.issued_at DESC, l.id DESC`, [context.tenantId, jobId])).rows;
    });
  }

  /** Builder: the firm's crew records (newest revision), to pick who gets a link. No phone or email. */
  crew(context: VerifiedTenantContext) {
    return withTenant(this.pool, context, async ({ $client }) => (await $client.query<{ crewId: string; name: string; trade: string }>(`
      SELECT DISTINCT ON (crew_id) crew_id AS "crewId", display_name AS name, trade FROM app.v2_crew_contact
      WHERE tenant_id = $1 ORDER BY crew_id, revision DESC`, [context.tenantId])).rows);
  }

  /** Builder: every crew press on the job, with "confirmed" derived from a later matching F1 press. */
  crewPresses(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      await this.requireJob($client, context.tenantId, jobId);
      return (await $client.query<CrewPress>(`
        SELECT p.command_id AS "commandId", p.crew_link_id AS "linkId", c.display_name AS "crewName", p.trade,
          p.brief_version + 1 AS "briefVersion", p.scope_item_id AS "scopeItemId", p.task_key AS "taskKey", p.kind, p.note,
          p.seen_head AS "seenHead", p.recorded_at AS "recordedAt",
          EXISTS (SELECT FROM app.v2_brief_progress b
            WHERE (b.tenant_id, b.job_id, b.trade, b.scope_item_id, b.task_key) = (p.tenant_id, p.job_id, p.trade, p.scope_item_id, p.task_key)
              AND b.kind = p.kind AND b.recorded_at > p.recorded_at) AS confirmed
        FROM app.v2_crew_progress p
        JOIN app.v2_crew_link l ON (l.tenant_id, l.job_id, l.id) = (p.tenant_id, p.job_id, p.crew_link_id)
        JOIN app.v2_crew_contact c ON (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (l.tenant_id, l.firm_key, l.crew_id, l.crew_revision)
        WHERE (p.tenant_id, p.job_id) = ($1, $2) ORDER BY p.recorded_at, p.command_id`, [context.tenantId, jobId])).rows;
    });
  }

  /** Builder: issue or cancel. An issue returns the token once; its replay returns the link without it. */
  command(context: VerifiedTenantContext, jobId: string, sessionId: string, input: unknown) {
    const parsed = crewLinkCommandV1.safeParse(input);
    if (!parsed.success) throw new CrewLinkError("CREW_LINK_INVALID_COMMAND");
    const command = parsed.data;
    const digest = sha256(JSON.stringify(command));
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      await this.requireJob($client, context.tenantId, jobId);
      const actor = await this.editor($client, sessionId);
      await $client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2041))", [`crew_link:${context.tenantId}:${jobId}`]);
      if (command.action === "cancel") {
        const { rows: [prior] } = await $client.query<{ linkId: string; jobId: string }>(`SELECT link_id AS "linkId", job_id AS "jobId"
          FROM app.v2_crew_link_cancel WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId]);
        if (prior) {
          if (prior.linkId !== command.linkId || prior.jobId !== jobId) throw new CrewLinkError("CREW_LINK_COMMAND_CONFLICT");
          return { action: "cancel" as const, linkId: command.linkId, replayed: true };
        }
        const { rows: [link] } = await $client.query<{ cancelled: boolean }>(`SELECT EXISTS (SELECT FROM app.v2_crew_link_cancel x
          WHERE (x.tenant_id, x.job_id, x.link_id) = (l.tenant_id, l.job_id, l.id)) AS cancelled
          FROM app.v2_crew_link l WHERE (l.tenant_id, l.job_id, l.id) = ($1, $2, $3)`, [context.tenantId, jobId, command.linkId]);
        if (!link) throw new CrewLinkError("CREW_LINK_NOT_FOUND");
        if (link.cancelled) throw new CrewLinkError("CREW_LINK_COMMAND_CONFLICT");
        await $client.query(`INSERT INTO app.v2_crew_link_cancel (tenant_id, job_id, link_id, command_id, actor_membership_id)
          VALUES ($1, $2, $3, $4, $5)`, [context.tenantId, jobId, command.linkId, command.commandId, actor]);
        await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
          eventType: "v2.crew_link.cancelled", subjectType: "job", subjectRef: jobId,
          payload: { references: { commandId: command.commandId, linkId: command.linkId }, classifications: { action: "operational" } } }]);
        return { action: "cancel" as const, linkId: command.linkId, replayed: false };
      }
      const { rows: [prior] } = await $client.query<{ id: string; jobId: string; digest: string; expiresAt: Date }>(`
        SELECT id, job_id AS "jobId", request_digest AS digest, expires_at AS "expiresAt" FROM app.v2_crew_link
        WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId]);
      if (prior) {
        if (prior.jobId !== jobId || prior.digest !== digest) throw new CrewLinkError("CREW_LINK_COMMAND_CONFLICT");
        return { action: "issue" as const, linkId: prior.id, token: null, expiresAt: prior.expiresAt, replayed: true };
      }
      const { rows: [crew] } = await $client.query<{ revision: number; trade: string }>(`SELECT revision, trade
        FROM app.v2_crew_contact WHERE tenant_id = $1 AND crew_id = $2 ORDER BY revision DESC LIMIT 1`, [context.tenantId, command.crewId]);
      if (!crew) throw new CrewLinkError("CREW_LINK_CREW_UNAVAILABLE");
      const token = randomBytes(32).toString("base64url");
      const linkId = randomUUID();
      const issuedAt = new Date(this.clock());
      const expiresAt = new Date(issuedAt.getTime() + command.expiresInDays * 86_400_000);
      try {
        await $client.query(`INSERT INTO app.v2_crew_link (tenant_id, job_id, id, command_id, firm_key, crew_id, crew_revision, trade,
          token_hash, request_digest, issued_at, expires_at, actor_membership_id)
          VALUES ($1, $2, $3, $4, app.current_firm_profile_key(), $5, $6, $7, $8, $9, $10, $11, $12)`,
        [context.tenantId, jobId, linkId, command.commandId, command.crewId, crew.revision, crew.trade, crewLinkTokenHash(token),
          digest, issuedAt, expiresAt, actor]);
      } catch (error) {
        if ((error as { code?: string }).code === "23503") throw new CrewLinkError("CREW_LINK_CREW_UNAVAILABLE");
        throw error;
      }
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: "v2.crew_link.issued", subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, linkId, crewId: command.crewId, crewRevision: String(crew.revision),
          expiresAt: expiresAt.toISOString() }, hashes: { request: digest, trade: sha256(crew.trade) },
          classifications: { action: "operational" } } }]);
      return { action: "issue" as const, linkId, token, expiresAt, replayed: false };
    });
  }

  /** Crew page. One refusal for every bad link. */
  async open(token: string): Promise<CrewLinkView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const view = (await client.query<{ view: CrewLinkView | { status: "refused" } }>(
        "SELECT app.v2_crew_link_open($1) AS view", [crewLinkTokenHash(token)])).rows[0]!.view;
      await client.query("COMMIT");
      if (view.status !== "open") throw new CrewLinkError("CREW_LINK_REFUSED");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  /** Crew press. An exact retry replays; anything the link may not do is one refusal. */
  async receive(input: unknown) {
    const parsed = crewLinkPressV1.safeParse(input);
    if (!parsed.success) throw new CrewLinkError("CREW_LINK_INVALID_COMMAND");
    const { token, ...press } = parsed.data;
    const hash = crewLinkTokenHash(token);
    const digest = sha256(JSON.stringify({ tokenHash: hash, ...press }));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      type Received = { status: "refused" | "stale" | "conflict" } | { status: "recorded"; replayed: boolean; commandId: string;
        jobId: string; linkId: string; kind: string; recordedAt: string };
      let saved: Received;
      try {
        saved = (await client.query<{ saved: Received }>("SELECT app.v2_crew_link_receive($1, $2, $3, $4, $5, $6, $7, $8) AS saved",
          [hash, press.commandId, digest, press.kind, press.scopeItemId, press.taskKey, press.briefVersion - 1, press.note])).rows[0]!.saved;
      } catch (error) {
        if ((error as { code?: string }).code === "22023") throw new CrewLinkError("CREW_LINK_INVALID_COMMAND");
        throw error;
      }
      if (saved.status === "recorded" && !saved.replayed) {
        // Only the scope's one crew press may enter the chain (policy v2_crew_link_audit_write consumes the allowance).
        await appendAuditBatch(drizzle(client) as TenantTransaction, [{ id: randomUUID(), version: "audit.v1",
          actorRef: `crew_link:${saved.linkId}`, eventType: "v2.crew_progress.recorded", subjectType: "job", subjectRef: saved.jobId,
          payload: { references: { commandId: saved.commandId, linkId: saved.linkId, scopeItemId: press.scopeItemId,
            taskKey: press.taskKey, kind: press.kind, briefVersion: String(press.briefVersion) }, hashes: { request: digest },
            classifications: { action: "operational" } } }]);
        await client.query("SELECT app.v2_crew_link_close()");
      }
      await client.query("COMMIT");
      if (saved.status === "stale") throw new CrewLinkError("CREW_LINK_STALE");
      if (saved.status !== "recorded") throw new CrewLinkError("CREW_LINK_REFUSED");
      return { commandId: saved.commandId, kind: saved.kind, recordedAt: saved.recordedAt, replayed: saved.replayed };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
