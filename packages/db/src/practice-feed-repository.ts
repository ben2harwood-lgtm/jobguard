import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { generatedPracticeFeedEvents, practiceFeedAdapterEventV1, practiceFeedCommandV1, practiceFeedQueryV1,
  projectPracticeFeedMovements, type PracticeFeedAdapterEvent, type PracticeFeedView, type PracticeFeedQuery } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "./demo-seed.js";
import { verifiedTenantContextFromMembership, withTenant, type TenantTransaction } from "./tenant-context.js";

export class PracticeFeedRepositoryError extends Error {
  constructor(readonly code: "PRACTICE_FEED_FORBIDDEN" | "PRACTICE_FEED_NOT_FOUND" | "PRACTICE_FEED_NOT_CONNECTED" |
    "PRACTICE_FEED_DISCONNECTED" | "PRACTICE_FEED_STALE_REVISION" | "IDEMPOTENCY_PAYLOAD_CONFLICT" |
    "PRACTICE_FEED_DUPLICATE_NOT_FOUND" | "PRACTICE_FEED_SETTLEMENT_REQUIRED" | "PRACTICE_FEED_INVALID_TRANSITION") { super(code); }
}
const fail = (code: PracticeFeedRepositoryError["code"]): never => { throw new PracticeFeedRepositoryError(code); };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
// The principal is server-selected, never supplied by an HTTP tenant/account field.
const context = () => verifiedTenantContextFromMembership({ identityUserId: DEMO_IDENTITY_USER_ID,
  membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
type AccountRow = { id: string; session_id: string };
type CommandRow = { id: string; action: string; revision: number; payload_hash: string };
type EventRow = { version: string; environment: string; gross_pence: string | number; currency: string; event_id: string; underlying_movement_id: string; representation_id: string; state: string; source_hash: string };

/** Internal deterministic adapter; no network, provider tokens or bank consent. */
export class PracticeFeedRepository {
  constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV ?? "unconfigured") {}
  private guard(sessionId: string, jobId: string) {
    if (this.environment !== "synthetic_demo") fail("PRACTICE_FEED_FORBIDDEN");
    z.string().uuid().parse(sessionId); z.string().uuid().parse(jobId);
  }
  private async authorize(db: TenantTransaction, sessionId: string, jobId: string, lockMembership = false) {
    await db.$client.query("SELECT set_config('app.practice_feed_session',$1,true),set_config('app.practice_feed_environment','synthetic_demo',true)", [sessionId]);
    const member = await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3
      AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>transaction_timestamp()) ${lockMembership ? 'FOR SHARE' : ''}`,
    [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID]);
    if (member.rowCount !== 1) fail("PRACTICE_FEED_FORBIDDEN");
    const job = await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, jobId]);
    if (!job.rowCount) fail("PRACTICE_FEED_NOT_FOUND");
    const live = await db.$client.query("SELECT 1 FROM app.job_activation WHERE tenant_id=$1 AND job_id=$2 AND mode<>'synthetic_demo'", [DEMO_TENANT_ID, jobId]);
    if (live.rowCount) fail("PRACTICE_FEED_FORBIDDEN");
    const run = await db.$client.query<{ session_id: string }>("SELECT session_id FROM app.sandbox_run WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId]);
    if (run.rows.some(row => row.session_id !== sessionId)) fail("PRACTICE_FEED_FORBIDDEN");
  }
  private async account(db: TenantTransaction, sessionId: string, jobId: string): Promise<AccountRow | undefined> {
    const row = (await db.$client.query<AccountRow>("SELECT id,session_id FROM app.practice_feed_account WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId])).rows[0];
    if (row && row.session_id !== sessionId) fail("PRACTICE_FEED_FORBIDDEN");
    return row;
  }
  private async readIn(db: TenantTransaction, sessionId: string, jobId: string, query: PracticeFeedQuery): Promise<PracticeFeedView> {
    const account = await this.account(db, sessionId, jobId);
    const base = { version: "practice-feed-view.v1", environment: "synthetic_demo", scenario: "recovery-18800", jobId, realExternalActions: 0 } as const;
    if (!account) return { ...base, accountId: null, feedState: "not_connected", revision: 0, movements: [], eventCount: 0, nextCursor: null };
    // One SQL snapshot binds command state, retained events and reconciliation.
    const row = (await db.$client.query<{ commands: CommandRow[]; events: EventRow[] }>(`SELECT
      coalesce((SELECT jsonb_agg(c ORDER BY c.revision) FROM app.practice_feed_command c WHERE c.tenant_id=$1 AND c.account_id=$2),'[]'::jsonb) commands,
      coalesce((SELECT jsonb_agg(e ORDER BY e.created_at,e.event_id) FROM app.practice_feed_event e WHERE e.tenant_id=$1 AND e.account_id=$2),'[]'::jsonb) events`, [DEMO_TENANT_ID, account.id])).rows[0]!;
    const events = row.events.map(event => ({ ...practiceFeedAdapterEventV1.parse({ version: event.version, environment: event.environment,
      eventId: event.event_id, underlyingMovementId: event.underlying_movement_id, representationId: event.representation_id,
      grossPence: Number(event.gross_pence), currency: event.currency, state: event.state }), sourceHash: event.source_hash.trim() }));
    const all = projectPracticeFeedMovements(account.id, events, row.commands.some(command => command.action === "reconcile_duplicate"));
    const offset = Number(query.cursor ?? 0), movements = all.slice(offset, offset + query.limit);
    return { ...base, accountId: account.id, feedState: row.commands.some(command => command.action === "disconnect") ? "disconnected" : "connected",
      revision: row.commands.at(-1)?.revision ?? 0, movements, eventCount: events.length,
      nextCursor: offset + query.limit < all.length ? String(offset + query.limit) : null };
  }
  async view(sessionId: string, jobId: string, rawQuery: unknown = { version: "practice-feed-query.v1" }): Promise<PracticeFeedView> {
    this.guard(sessionId, jobId); const query = practiceFeedQueryV1.parse(rawQuery);
    return withTenant(this.pool, context(), async db => { await this.authorize(db, sessionId, jobId); return this.readIn(db, sessionId, jobId, query); });
  }
  async command(sessionId: string, jobId: string, raw: unknown): Promise<PracticeFeedView> {
    this.guard(sessionId, jobId); const input = practiceFeedCommandV1.parse(raw), payloadHash = hash(JSON.stringify({ jobId, ...input }));
    return withTenant(this.pool, context(), async db => {
      await this.authorize(db, sessionId, jobId, true);
      // Every business lock precedes the audit append; the SQL trigger uses this same job lock.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [DEMO_TENANT_ID, `practice-command:${input.commandId}`]);
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [DEMO_TENANT_ID, jobId]);
      let account = await this.account(db, sessionId, jobId);
      const replay = (await db.$client.query<CommandRow>("SELECT id,action,revision,payload_hash FROM app.practice_feed_command WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, input.commandId])).rows[0];
      if (replay) {
        if (replay.payload_hash.trim() !== payloadHash) fail("IDEMPOTENCY_PAYLOAD_CONFLICT");
        return this.readIn(db, sessionId, jobId, practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" }));
      }
      const current = await this.readIn(db, sessionId, jobId, practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" }));
      if (current.revision !== input.expectedRevision) fail("PRACTICE_FEED_STALE_REVISION");
      if (current.feedState === "disconnected") fail("PRACTICE_FEED_DISCONNECTED");
      if (input.action === "connect") {
        if (account) fail("PRACTICE_FEED_INVALID_TRANSITION");
        account = { id: randomUUID(), session_id: sessionId };
        await db.$client.query(`INSERT INTO app.practice_feed_account(id,tenant_id,job_id,session_id,actor_membership_id,environment,scenario)
          VALUES($1,$2,$3,$4,$5,'synthetic_demo','recovery-18800')`, [account.id, DEMO_TENANT_ID, jobId, sessionId, DEMO_MEMBERSHIP_ID]);
      } else if (!account) fail("PRACTICE_FEED_NOT_CONNECTED");
      if (input.action === "reconcile_duplicate" && (!current.movements.some(m => m.state === "possible_duplicate") || !current.movements.some(m => m.state === "settled"))) fail("PRACTICE_FEED_DUPLICATE_NOT_FOUND");
      if (input.action === "advance" && ["replay_event", "alternate_representation", "unknown_duplicate"].includes(input.scenario) && !current.movements.some(m => m.eventIds.includes("settled-384"))) fail("PRACTICE_FEED_SETTLEMENT_REQUIRED");
      const accountId = account!.id;
      await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,scenario,actor_membership_id,payload_hash,environment)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'synthetic_demo')`, [input.commandId, DEMO_TENANT_ID, jobId, accountId, current.revision + 1,
        input.action, input.action === "advance" ? input.scenario : null, DEMO_MEMBERSHIP_ID, payloadHash]);
      if (input.action === "advance") for (const event of generatedPracticeFeedEvents(input.scenario)) await this.ingest(db, jobId, accountId, input.commandId, event);
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `synthetic-session:${sessionId}`,
        eventType: `practice_feed.${input.action}`, subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: input.commandId, accountId }, hashes: { command: payloadHash }, classifications: { practiceFeed: "financial" } } }]);
      return this.readIn(db, sessionId, jobId, practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" }));
    });
  }
  private async ingest(db: TenantTransaction, jobId: string, accountId: string, commandId: string, event: PracticeFeedAdapterEvent) {
    const e = practiceFeedAdapterEventV1.parse(event);
    const sourceHash = hash([e.version, e.environment, DEMO_TENANT_ID, jobId, accountId, e.eventId,
      e.underlyingMovementId, e.representationId, e.grossPence, e.currency, e.state].join("|"));
    await db.$client.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_id,underlying_movement_id,representation_id,gross_pence,currency,state,environment,version,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(tenant_id,account_id,event_id) DO NOTHING`,
    [randomUUID(), DEMO_TENANT_ID, jobId, accountId, commandId, e.eventId, e.underlyingMovementId, e.representationId, e.grossPence, e.currency, e.state, e.environment, e.version, sourceHash]);
  }
}
