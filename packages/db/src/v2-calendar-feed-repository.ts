import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { calendarFeedCommandV1, calendarFeedSnapshotV1, calendarFeedTokenHash, calendarFeedTokenPattern,
  newCalendarFeedToken, CalendarFeedError, type CalendarFeed, type CalendarFeedCommand,
  type CalendarFeedSnapshot } from "./v2-calendar-feed.js";

export type CalendarFeedReceipt = { feedId: string; feedVersion: number; actorMembershipId: string; recordedAt: string };
type FeedRow = { feedId: string; feedVersion: number; action: "create" | "refresh" | "revoke";
  createdAt: string; updatedAt: string; snapshot: CalendarFeedSnapshot | null };

export class CalendarFeedRepository {
  constructor(private readonly pool: Pool) {}

  /** The builder's view of the job's links: no token and no token hash. */
  async list(context: VerifiedTenantContext, jobId: string, sessionId: string) {
    const rows = await withTenant(this.pool, context, async ({ $client }) => {
      await this.editor($client, sessionId);
      return (await $client.query<FeedRow>(`SELECT DISTINCT ON (r.feed_id) r.feed_id AS "feedId",
          r.feed_version AS "feedVersion", r.action, r.snapshot, r.recorded_at::text AS "updatedAt",
          c.recorded_at::text AS "createdAt"
        FROM app.v2_calendar_feed_revision r JOIN app.v2_calendar_feed_revision c
          ON (c.tenant_id,c.job_id,c.feed_id,c.feed_version)=(r.tenant_id,r.job_id,r.feed_id,1)
        WHERE (r.tenant_id,r.job_id)=($1,$2) ORDER BY r.feed_id, r.feed_version DESC`, [context.tenantId, jobId])).rows;
    });
    const feeds = rows.map(({ action, snapshot, ...row }) => ({ feed: { ...row, revoked: action === "revoke",
      taskCount: snapshot?.tasks.length ?? 0 } satisfies CalendarFeed,
    // Parsed again so key order matches a freshly built copy (jsonb reorders keys).
    snapshot: snapshot && calendarFeedSnapshotV1.parse(snapshot) }));
    return feeds.sort((a, b) => b.feed.createdAt.localeCompare(a.feed.createdAt));
  }

  /**
   * One audited row per command. `snapshot` is built by the caller from the builder's own plan read and is
   * required for create and refresh. Create returns the token once; a replay never returns it again.
   */
  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, input: CalendarFeedCommand,
    snapshot: CalendarFeedSnapshot | null) {
    const parsed = calendarFeedCommandV1.safeParse(input);
    if (!parsed.success) throw new CalendarFeedError("CALENDAR_FEED_INVALID");
    const command = parsed.data;
    const saved = command.action === "revoke" ? null : calendarFeedSnapshotV1.safeParse(snapshot);
    if (saved && !saved.success) throw new CalendarFeedError("CALENDAR_FEED_INVALID");
    return withTenant(this.pool, context, async database => {
      const client = database.$client;
      const actor = await this.editor(client, sessionId);
      // Same job lock as c3 and K8: one command on this job at a time, before the audit head.
      const lock = await client.query(`SELECT 1 FROM app.quote_draft WHERE (tenant_id,job_id)=($1,$2) FOR UPDATE`,
        [context.tenantId, jobId]);
      if (!lock.rowCount) throw new CalendarFeedError("CALENDAR_FEED_NOT_FOUND");
      const { rows: [replay] } = await client.query<CalendarFeedReceipt & { matches: boolean }>(`
        SELECT feed_id AS "feedId", feed_version AS "feedVersion", actor_membership_id AS "actorMembershipId",
          recorded_at::text AS "recordedAt", (request,actor_membership_id)=($4::jsonb,$5::uuid) AS matches
        FROM app.v2_calendar_feed_revision WHERE (tenant_id,job_id,command_id)=($1,$2,$3)`,
      [context.tenantId, jobId, command.commandId, JSON.stringify(command), actor]);
      if (replay) {
        const { matches, ...receipt } = replay;
        if (!matches) throw new CalendarFeedError("CALENDAR_FEED_COMMAND_CONFLICT");
        return { ...receipt, token: null };
      }
      const { rows: [prior] } = await client.query<{ feed_version: number; revoked: boolean }>(`
        SELECT feed_version, EXISTS (SELECT FROM app.v2_calendar_feed_revision x
          WHERE (x.tenant_id,x.job_id,x.feed_id)=($1,$2,$3) AND x.action='revoke') AS revoked
        FROM app.v2_calendar_feed_revision WHERE (tenant_id,job_id,feed_id)=($1,$2,$3)
        ORDER BY feed_version DESC LIMIT 1`, [context.tenantId, jobId, command.feedId]);
      if ((prior?.feed_version ?? 0) !== command.expectedVersion) throw new CalendarFeedError("CALENDAR_FEED_VERSION_CONFLICT");
      if (prior?.revoked) throw new CalendarFeedError("CALENDAR_FEED_NOT_FOUND");
      if (command.action === "create") {
        // One live link per job, so there is one feed to keep up to date and one to turn off.
        const { rowCount } = await client.query(`SELECT 1 FROM app.v2_calendar_feed_revision c
          WHERE (c.tenant_id,c.job_id)=($1,$2) AND c.action='create' AND NOT EXISTS (
            SELECT FROM app.v2_calendar_feed_revision x WHERE (x.tenant_id,x.job_id,x.feed_id)=(c.tenant_id,c.job_id,c.feed_id)
            AND x.action='revoke')`, [context.tenantId, jobId]);
        if (rowCount) throw new CalendarFeedError("CALENDAR_FEED_EXISTS");
      }
      const token = command.action === "create" ? newCalendarFeedToken() : null;
      const snapshotJson = saved ? JSON.stringify(saved.data) : null;
      const { rows: [receipt] } = await client.query<CalendarFeedReceipt>(`
        INSERT INTO app.v2_calendar_feed_revision
          (tenant_id,job_id,feed_id,feed_version,command_id,action,request,token_hash,snapshot,actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING feed_id AS "feedId",feed_version AS "feedVersion",actor_membership_id AS "actorMembershipId",
          recorded_at::text AS "recordedAt"`, [context.tenantId, jobId, command.feedId, command.expectedVersion + 1,
        command.commandId, command.action, JSON.stringify(command), token && calendarFeedTokenHash(token), snapshotJson, actor]);
      // No business locks or writes follow the tenant audit append. The token and its hash never enter the audit.
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: `v2.calendar_feed.${command.action}`, subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, feedId: command.feedId,
          feedVersion: String(receipt!.feedVersion), ...(saved && { taskCount: String(saved.data.tasks.length) }) },
        ...(snapshotJson && { hashes: { snapshot: createHash("sha256").update(snapshotJson).digest("hex") } }),
        classifications: { action: "operational" } } }]);
      return { ...receipt!, token };
    });
  }

  /** Bearer read for calendar apps: unknown, malformed or revoked tokens all return null. */
  async read(token: string): Promise<{ feedId: string; snapshot: CalendarFeedSnapshot; updatedAt: string } | null> {
    if (typeof token !== "string" || !calendarFeedTokenPattern.test(token)) return null;
    const { rows: [row] } = await this.pool.query<{ feed: { feedId: string; snapshot: unknown; updatedAt: string } | null }>(
      "SELECT app.v2_calendar_feed_read($1) AS feed", [calendarFeedTokenHash(token)]);
    const snapshot = calendarFeedSnapshotV1.safeParse(row?.feed?.snapshot);
    return row?.feed && snapshot.success ? { feedId: row.feed.feedId, snapshot: snapshot.data, updatedAt: row.feed.updatedAt } : null;
  }

  private async editor(client: PoolClient, sessionId: string) {
    const { rows: [editor] } = await client.query<{ id: string | null }>(
      "SELECT app.v2_work_plan_editor($1) AS id", [createHash("sha256").update(sessionId).digest("hex")]);
    if (!editor?.id) throw new CalendarFeedError("CALENDAR_FEED_EDITOR_REQUIRED");
    return editor.id;
  }
}
