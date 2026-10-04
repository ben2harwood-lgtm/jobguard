import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  assessAttestedReceipt, generatedPracticeFeedEvents, practiceFeedAdapterEventV1, practiceFeedCommandV1, practiceFeedQueryV1,
  practiceMovementCatalogueV1, practiceMovementDefinition, practiceMovementKeyV1, projectPracticeFeedMovements,
  type HashedPracticeFeedEvent, type PracticeFeedAdapterEvent, type PracticeFeedCommand, type PracticeFeedQuery, type PracticeFeedView,
  type PracticeMovementKey,
} from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const PRACTICE_FEED_ERROR_CODES = [
  "PRACTICE_FEED_FORBIDDEN", "PRACTICE_FEED_NOT_FOUND", "PRACTICE_FEED_NOT_CONNECTED", "PRACTICE_FEED_DISCONNECTED",
  "PRACTICE_FEED_STALE_REVISION", "IDEMPOTENCY_PAYLOAD_CONFLICT", "PRACTICE_FEED_DUPLICATE_NOT_FOUND",
  "PRACTICE_FEED_SETTLEMENT_REQUIRED", "PRACTICE_FEED_INVALID_TRANSITION", "PRACTICE_FEED_MOVEMENT_NOT_SETTLED",
  "PRACTICE_FEED_RECEIPT_MISMATCH", "PRACTICE_FEED_RECEIPT_ALREADY_MATCHED", "PRACTICE_FEED_DUPLICATE_HELD",
  "INVALID_COMMAND", "INVALID_QUERY",
] as const;
export type PracticeFeedErrorCode = (typeof PRACTICE_FEED_ERROR_CODES)[number];
export class PracticeFeedRepositoryError extends Error {
  constructor(readonly code: PracticeFeedErrorCode) { super(code); this.name = "PracticeFeedRepositoryError"; }
}
const fail = (code: PracticeFeedErrorCode): never => { throw new PracticeFeedRepositoryError(code); };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = z.string().uuid();
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
};

/** The server-selected principal. It is re-verified against the live membership row in every transaction. */
export type PracticeFeedActor = Readonly<{ membershipId: string; identityUserId: string }>;

type AccountRow = { id: string; session_id: string };
type CommandRow = { id: string; revision: number; action: string; movement_key: string | null; payload_hash: string };
type EventRow = Record<string, unknown>;
type Snapshot = {
  account: AccountRow | null; commands: CommandRow[]; events: EventRow[];
  matches: Array<{ payment_id: string; movement_key: PracticeMovementKey }>;
  payments: Array<{ id: string; invoice_id: string; paid_on: string; amount_pence: number; currency: "GBP"; reference: string; reversed: boolean }>;
};

/**
 * Internal deterministic adapter over fixed generated movement facts. There is no network, provider token or bank
 * consent anywhere in this class; it refuses to run outside the synthetic demo environment, and the database refuses
 * the same writes independently. A settled movement is never an allocation, landing, fee or qualifying recovery.
 */
export class PracticeFeedRepository {
  constructor(private readonly pool: Pool, private readonly environment: string = process.env.JOBGUARD_ENV ?? "unconfigured") {}

  private guard(sessionId: string, jobId: string) {
    if (this.environment !== "synthetic_demo") fail("PRACTICE_FEED_FORBIDDEN");
    if (!uuid.safeParse(sessionId).success) fail("PRACTICE_FEED_FORBIDDEN");
    if (!uuid.safeParse(jobId).success) fail("PRACTICE_FEED_NOT_FOUND");
  }

  /**
   * Session ownership, live membership (locked for writes) and a real job in this tenant. The deployment environment, checked in
   * guard() and again by the database trigger, is what refuses pilot and production use: a practice job's own activation mode is
   * pilot_no_charge in the no-charge scenario, so it cannot be the discriminator.
   */
  private async authorize(db: TenantTransaction, context: VerifiedTenantContext, actor: PracticeFeedActor, sessionId: string, jobId: string, lock: boolean) {
    await db.$client.query("SELECT set_config('app.practice_feed_session',$1,true),set_config('app.practice_feed_environment','synthetic_demo',true)", [sessionId]);
    // FOR SHARE needs UPDATE on app.membership, which jobguard_runtime already holds (0000_tenancy.sql). It keeps the
    // membership from being revoked between this check and the commit.
    const member = await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>transaction_timestamp())${lock ? " FOR SHARE" : ""}`,
    [context.tenantId, actor.membershipId, actor.identityUserId]);
    if (member.rowCount !== 1) fail("PRACTICE_FEED_FORBIDDEN");
    if (!(await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2", [context.tenantId, jobId])).rowCount) fail("PRACTICE_FEED_NOT_FOUND");
    const runs = await db.$client.query<{ session_id: string }>("SELECT session_id FROM app.sandbox_run WHERE tenant_id=$1 AND job_id=$2", [context.tenantId, jobId]);
    if (runs.rows.some((row) => row.session_id !== sessionId)) fail("PRACTICE_FEED_FORBIDDEN");
  }

  /** One SQL statement, so commands, events, matches and receipts are read from the same snapshot. */
  private async snapshot(db: TenantTransaction, context: VerifiedTenantContext, sessionId: string, jobId: string): Promise<Snapshot> {
    const row = (await db.$client.query<Snapshot>(`SELECT
      (SELECT jsonb_build_object('id',a.id,'session_id',a.session_id) FROM app.practice_feed_account a WHERE a.tenant_id=$1 AND a.job_id=$2) account,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'action',c.action,'movement_key',c.movement_key,'payload_hash',c.payload_hash) ORDER BY c.revision)
        FROM app.practice_feed_command c WHERE c.tenant_id=$1 AND c.job_id=$2),'[]'::jsonb) commands,
      coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.event_id) FROM app.practice_feed_event e WHERE e.tenant_id=$1 AND e.job_id=$2),'[]'::jsonb) events,
      coalesce((SELECT jsonb_agg(jsonb_build_object('payment_id',m.payment_id,'movement_key',m.movement_key) ORDER BY m.created_at,m.id)
        FROM app.practice_feed_receipt_match m WHERE m.tenant_id=$1 AND m.job_id=$2),'[]'::jsonb) matches,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',p.invoice_id,'paid_on',to_char(p.paid_on,'YYYY-MM-DD'),'amount_pence',p.amount_pence,'currency',p.currency,
          'reference',p.reference,'reversed',r.id IS NOT NULL) ORDER BY p.created_at,p.id)
        FROM app.customer_payment p LEFT JOIN app.customer_payment_reversal r ON r.tenant_id=p.tenant_id AND r.payment_id=p.id
        WHERE p.tenant_id=$1 AND p.job_id=$2 AND p.builder_attested),'[]'::jsonb) payments`, [context.tenantId, jobId])).rows[0]!;
    if (row.account && row.account.session_id !== sessionId) fail("PRACTICE_FEED_FORBIDDEN");
    return row;
  }

  private project(snapshot: Snapshot, jobId: string, query: PracticeFeedQuery): PracticeFeedView {
    const account = snapshot.account;
    const base = { version: "practice-feed-view.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, catalogue: practiceMovementCatalogueV1, allocatedEligibleNetPence: 0 } as const;
    const attested = (payments: Snapshot["payments"], movements: PracticeFeedView["movements"]) => payments.map((payment) => ({
      paymentId: payment.id, invoiceId: payment.invoice_id, paidOn: payment.paid_on, reference: payment.reference, amountPence: Number(payment.amount_pence),
      currency: payment.currency, reversed: payment.reversed,
      assessment: assessAttestedReceipt({ paymentId: payment.id, amountPence: Number(payment.amount_pence), currency: payment.currency, reversed: payment.reversed },
        movements, snapshot.matches.map((match) => ({ paymentId: match.payment_id, movementKey: match.movement_key }))),
    }));
    if (!account) {
      return { ...base, accountId: null, feedState: "not_connected", consent: null, revision: 0, movementCount: 0, movements: [], receipts: attested(snapshot.payments, []), eventCount: 0, nextCursor: null };
    }
    const events: HashedPracticeFeedEvent[] = snapshot.events.map((event) => ({
      ...practiceFeedAdapterEventV1.parse({
        version: event.version, environment: event.environment, eventId: event.event_id, eventKind: event.event_kind, movementKey: event.movement_key,
        identity: event.identity, representationId: event.representation_id, grossPence: Number(event.gross_pence), currency: event.currency, state: event.state,
      }),
      sourceHash: String(event.source_hash).trim(),
    }));
    const reconciled = snapshot.commands.filter((command) => command.action === "reconcile_duplicate").map((command) => practiceMovementKeyV1.parse(command.movement_key));
    const all = projectPracticeFeedMovements(account.id, events, reconciled);
    const offset = Number(query.cursor ?? 0), movements = all.slice(offset, offset + query.limit);
    const disconnect = snapshot.commands.find((command) => command.action === "disconnect");
    return {
      ...base, accountId: account.id, feedState: disconnect ? "disconnected" : "connected",
      consent: { version: "practice-feed-consent.v1", scope: "read_generated_movements", provider: "none", grantedAtRevision: 1, revokedAtRevision: disconnect?.revision ?? null },
      revision: snapshot.commands.at(-1)?.revision ?? 0, movementCount: all.length, movements, receipts: attested(snapshot.payments, all),
      eventCount: events.length, nextCursor: offset + query.limit < all.length ? String(offset + query.limit) : null,
    };
  }

  private async readIn(db: TenantTransaction, context: VerifiedTenantContext, sessionId: string, jobId: string, query: PracticeFeedQuery): Promise<PracticeFeedView> {
    return this.project(await this.snapshot(db, context, sessionId, jobId), jobId, query);
  }

  async view(context: VerifiedTenantContext, actor: PracticeFeedActor, sessionId: string, jobId: string, rawQuery: unknown = { version: "practice-feed-query.v1" }): Promise<PracticeFeedView> {
    this.guard(sessionId, jobId);
    const query = practiceFeedQueryV1.safeParse(rawQuery);
    if (!query.success) fail("INVALID_QUERY");
    return withTenant(this.pool, context, async (db) => {
      await this.authorize(db, context, actor, sessionId, jobId, false);
      return this.readIn(db, context, sessionId, jobId, query.data!);
    });
  }

  async command(context: VerifiedTenantContext, actor: PracticeFeedActor, sessionId: string, jobId: string, raw: unknown): Promise<PracticeFeedView> {
    this.guard(sessionId, jobId);
    const parsed = practiceFeedCommandV1.safeParse(raw);
    if (!parsed.success) fail("INVALID_COMMAND");
    const input = parsed.data!, payloadHash = sha256(canonical({ jobId, ...input }));
    try {
      return await withTenant(this.pool, context, async (db) => {
        await this.authorize(db, context, actor, sessionId, jobId, true);
        // Every business lock precedes the audit append; the database guard takes this same job lock.
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [context.tenantId, `practice-command:${input.commandId}`]);
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [context.tenantId, jobId]);
        const before = await this.snapshot(db, context, sessionId, jobId);
        const replay = (await db.$client.query<{ payload_hash: string }>("SELECT payload_hash FROM app.practice_feed_command WHERE tenant_id=$1 AND id=$2", [context.tenantId, input.commandId])).rows[0];
        if (replay) {
          if (replay.payload_hash.trim() !== payloadHash) fail("IDEMPOTENCY_PAYLOAD_CONFLICT");
          return this.project(before, jobId, practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" }));
        }
        const current = this.project(before, jobId, practiceFeedQueryV1.parse({ version: "practice-feed-query.v1", limit: 50 }));
        if (current.revision !== input.expectedRevision) fail("PRACTICE_FEED_STALE_REVISION");
        if (current.feedState === "disconnected") fail("PRACTICE_FEED_DISCONNECTED");
        const effects = this.preconditions(input, before);
        let accountId = before.account?.id;
        if (input.action === "connect") {
          accountId = randomUUID();
          await db.$client.query(`INSERT INTO app.practice_feed_account(id,tenant_id,job_id,session_id,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,'synthetic_demo')`,
            [accountId, context.tenantId, jobId, sessionId, actor.membershipId]);
        }
        await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,step,payment_id,actor_membership_id,payload_hash,environment)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synthetic_demo')`,
        [input.commandId, context.tenantId, jobId, accountId, current.revision + 1, input.action, "movement" in input ? input.movement : null,
          input.action === "advance" ? input.step : null, input.action === "match_receipt" ? input.paymentId : null, actor.membershipId, payloadHash]);
        if (input.action === "advance") for (const event of generatedPracticeFeedEvents(input.movement, input.step)) await this.ingest(db, context, jobId, accountId!, input.commandId, event);
        if (input.action === "match_receipt") {
          await db.$client.query(`INSERT INTO app.practice_feed_receipt_match(id,tenant_id,job_id,account_id,command_id,payment_id,movement_key,settled_event_id,matched_pence,currency,environment)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'GBP','synthetic_demo')`,
          [randomUUID(), context.tenantId, jobId, accountId, input.commandId, input.paymentId, input.movement, effects.settledEventId, practiceMovementDefinition(input.movement).grossPence]);
        }
        await appendAuditBatch(db, [{
          id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor.membershipId}`, eventType: `practice_feed.${input.action}`,
          subjectType: "job", subjectRef: jobId,
          payload: {
            references: { commandId: input.commandId, accountId: accountId!, sessionId, ...("movement" in input ? { movement: input.movement } : {}), ...(input.action === "match_receipt" ? { paymentId: input.paymentId } : {}) },
            hashes: { command: payloadHash }, classifications: { practiceFeed: "financial" },
          },
        }]);
        return this.readIn(db, context, sessionId, jobId, practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" }));
      });
    } catch (error) { throw translate(error); }
  }

  /** Typed refusals before any write. The database guard enforces the same rules as the independent backstop. */
  private preconditions(input: PracticeFeedCommand, snapshot: Snapshot): { settledEventId: string } {
    const account = snapshot.account;
    if (input.action === "connect") {
      if (account) fail("PRACTICE_FEED_INVALID_TRANSITION");
      return { settledEventId: "" };
    }
    if (!account) fail("PRACTICE_FEED_NOT_CONNECTED");
    const hasEvent = (key: PracticeMovementKey, predicate: (event: EventRow) => boolean) => snapshot.events.some((event) => event.movement_key === key && predicate(event));
    const settled = (key: PracticeMovementKey) => hasEvent(key, (event) => event.state === "settled" && event.identity === "identified");
    const unresolved = (key: PracticeMovementKey) => hasEvent(key, (event) => event.identity === "unidentified")
      && !snapshot.commands.some((command) => command.action === "reconcile_duplicate" && command.movement_key === key);
    if (input.action === "advance") {
      if (["replay", "alternate_representation", "unknown_duplicate"].includes(input.step) && !settled(input.movement)) fail("PRACTICE_FEED_SETTLEMENT_REQUIRED");
    } else if (input.action === "reconcile_duplicate") {
      if (!unresolved(input.movement) || !settled(input.movement)) fail("PRACTICE_FEED_DUPLICATE_NOT_FOUND");
    } else if (input.action === "match_receipt") {
      const payment = snapshot.payments.find((row) => row.id === input.paymentId);
      if (!payment || payment.reversed || payment.currency !== "GBP" || Number(payment.amount_pence) !== practiceMovementDefinition(input.movement).grossPence) fail("PRACTICE_FEED_RECEIPT_MISMATCH");
      const settledEvent = snapshot.events.find((event) => event.movement_key === input.movement && event.state === "settled" && event.identity === "identified");
      if (!settledEvent) fail("PRACTICE_FEED_MOVEMENT_NOT_SETTLED");
      if (unresolved(input.movement)) fail("PRACTICE_FEED_DUPLICATE_HELD");
      if (snapshot.matches.some((match) => match.payment_id === input.paymentId || match.movement_key === input.movement)) fail("PRACTICE_FEED_RECEIPT_ALREADY_MATCHED");
      return { settledEventId: String(settledEvent!.event_id) };
    }
    return { settledEventId: "" };
  }

  private async ingest(db: TenantTransaction, context: VerifiedTenantContext, jobId: string, accountId: string, commandId: string, event: PracticeFeedAdapterEvent) {
    const e = practiceFeedAdapterEventV1.parse(event);
    const sourceHash = sha256([e.version, e.environment, context.tenantId, jobId, accountId, e.eventId, e.eventKind, e.movementKey, e.identity, e.representationId, e.grossPence, e.currency, e.state].join("|"));
    // A replay or overlapping page carries an event id that is already stored: it adds nothing.
    await db.$client.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(tenant_id,account_id,event_id) DO NOTHING`,
    [randomUUID(), context.tenantId, jobId, accountId, commandId, e.eventKind, e.movementKey, e.eventId, e.identity, e.representationId, e.grossPence, e.currency, e.state, e.environment, e.version, sourceHash]);
  }
}

/** Database guard messages and constraint races become the same typed codes the preconditions use. */
function translate(error: unknown): unknown {
  if (error instanceof PracticeFeedRepositoryError) return error;
  const { message, code, constraint } = (error ?? {}) as { message?: unknown; code?: unknown; constraint?: unknown };
  if (typeof message === "string" && (PRACTICE_FEED_ERROR_CODES as readonly string[]).includes(message)) return new PracticeFeedRepositoryError(message as PracticeFeedErrorCode);
  if (code === "23505" && typeof constraint === "string" && constraint.startsWith("practice_feed_receipt_match")) return new PracticeFeedRepositoryError("PRACTICE_FEED_RECEIPT_ALREADY_MATCHED");
  if (code === "40001") return new PracticeFeedRepositoryError("PRACTICE_FEED_STALE_REVISION");
  if (typeof message === "string" && /^PRACTICE_FEED_(AUDIT|CONNECTION|MATCH)_REQUIRED$|^PRACTICE_FEED_EVENT_INVALID$/u.test(message)) return new PracticeFeedRepositoryError("PRACTICE_FEED_FORBIDDEN");
  return error;
}
