import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  RECOVERY_MESSAGE_ACTION, deriveRecoveryMessageStatus,
  matchesRecoveryMessageApproval, recoveryMessageCommandV1, recoveryMessagePreviewCommandV1, sha256,
  verifyRecoveryMessageContent,
  type RecoveryMessage, type RecoveryMessageCaseType, type RecoveryMessageCommand, type RecoveryMessageEventKind, type RecoveryMessageStatus,
} from "@jobguard/core";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { CommandError, UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { ActionExecutor, appendOutboundAction, reconcileOutbox, type SafeTelemetry } from "./outbox.js";
import { FakeRecoveryMessageAdapter, RECOVERY_MESSAGE_ADAPTER, RECOVERY_MESSAGE_EFFECT_PREFIX, PracticeProcessStopped, type RecoveryMessageDeliveryMode } from "./recovery-message-adapter.js";
import { inspectRecoveryMessageCase, lockRecoveryCase, type Current, type RecoveryMessageReadinessReason } from "./recovery-message-current.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export type RecoveryMessageActor = { membershipId: string; actorRef: string };
const ERROR_CODES = [
  "RECOVERY_MESSAGE_NOT_FOUND", "RECOVERY_MESSAGE_FORBIDDEN", "RECOVERY_MESSAGE_SOURCES_REQUIRED", "RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED",
  "RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE", "RECOVERY_MESSAGE_CHANGED", "RECOVERY_MESSAGE_EXPIRED", "RECOVERY_MESSAGE_STALE_REVISION", "RECOVERY_MESSAGE_COMMAND_CONFLICT",
  "RECOVERY_MESSAGE_EXISTING_EFFECT", "RECOVERY_MESSAGE_NOT_APPROVED", "RECOVERY_MESSAGE_REVOKED", "RECOVERY_MESSAGE_BLOCKED",
  "RECOVERY_MESSAGE_ALREADY_DELIVERED", "RECOVERY_MESSAGE_RECONCILE_REQUIRED", "RECOVERY_MESSAGE_NOT_RECONCILABLE", "RECOVERY_MESSAGE_NOT_REVOCABLE",
  "RECOVERY_MESSAGE_NOT_ADVANCEABLE", "RECOVERY_MESSAGE_EXECUTION_PENDING", "RECOVERY_MESSAGE_CONTENT_INVALID", "RECOVERY_MESSAGE_DELIVERY_INTERRUPTED",
] as const;
export type RecoveryMessageErrorCode = (typeof ERROR_CODES)[number];
export class RecoveryMessageError extends Error {
  constructor(readonly code: RecoveryMessageErrorCode) { super(code); this.name = "RecoveryMessageError"; }
}
const fail = (code: RecoveryMessageErrorCode): never => { throw new RecoveryMessageError(code); };

export type { RecoveryMessageReadinessReason } from "./recovery-message-current.js";
export type RecoveryMessageView = {
  id: string; sequence: number; revision: number; status: RecoveryMessageStatus; changedSinceReview: boolean; superseded: boolean; claimAbandoned: boolean;
  message: Omit<RecoveryMessage, "immutableContent">;
  attachment: { packId: string; packRevision: number; manifestHash: string; contentHash: string; sources: Array<{ sourceId: string; version: number; label: string; kind: string; content: string; contentHash: string }> };
  approval: { decisionId: string; authorizationId: string; outboxActionId: string; revoked: boolean; expiresAt: string } | null;
  attempts: number; history: Array<{ revision: number; kind: RecoveryMessageEventKind; at: string }>; createdAt: string;
};
export type RecoveryMessageSinkView = {
  messageId: string; outboxActionId: string; recipient: string; body: string; contentHash: string; attachmentHash: string; providerReference: string; environment: "synthetic_demo";
};
export type RecoveryMessageState = {
  caseId: string; jobId: string;
  readiness: { eligible: boolean; reason: RecoveryMessageReadinessReason | null; caseRevision: number; outstandingPence: number; packId: string | null; packRevision: number | null };
  messages: RecoveryMessageView[]; latest: RecoveryMessageView | null; sink: RecoveryMessageSinkView[]; sinkCount: number;
  realExternalActions: 0; environment: "synthetic_demo";
};

const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
const requestHashOf = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
/** One canonical spelling per UUID, so lock keys, replay and audit subjects cannot differ by letter case. */
const uuidArg = (value: string) => z.string().uuid().parse(value).toLowerCase();
const APPROVAL_LIFETIME_MS = 3_600_000;
const STALE_EXECUTION_MS = 300_000;
const RECOVERY_MESSAGE_EXECUTOR_REF = "system:recovery-message-executor";
const noTelemetry: SafeTelemetry = { emit: () => undefined };

/** Guards raise typed 23514 errors; map them, and uniqueness races, to the same typed codes the repository uses. */
function translate(error: unknown): unknown {
  if (error instanceof RecoveryMessageError) return error;
  if (error instanceof CommandError) {
    return new RecoveryMessageError(error.code === "FORBIDDEN" ? "RECOVERY_MESSAGE_FORBIDDEN" : error.code === "COMMAND_CONFLICT" ? "RECOVERY_MESSAGE_COMMAND_CONFLICT" : "RECOVERY_MESSAGE_EXPIRED");
  }
  const pg = error as { code?: string; message?: string; constraint?: string };
  if (pg.code === "23514") {
    const mapped: Record<string, RecoveryMessageErrorCode> = {
      RECOVERY_MESSAGE_CHANGED: "RECOVERY_MESSAGE_CHANGED", RECOVERY_MESSAGE_PACK_INVALID: "RECOVERY_MESSAGE_CHANGED",
      RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED: "RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED", RECOVERY_MESSAGE_CASE_INVALID: "RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE",
      RECOVERY_MESSAGE_SEQUENCE_INVALID: "RECOVERY_MESSAGE_STALE_REVISION", RECOVERY_MESSAGE_EVENT_SEQUENCE_INVALID: "RECOVERY_MESSAGE_STALE_REVISION",
      RECOVERY_MESSAGE_EXISTING_EFFECT: "RECOVERY_MESSAGE_EXISTING_EFFECT", RECOVERY_MESSAGE_AUTHORIZATION_INVALID: "RECOVERY_MESSAGE_CHANGED",
    };
    const code = mapped[pg.message ?? ""];
    if (code) return new RecoveryMessageError(code);
  }
  if (pg.code === "23505" && /recovery_message(_event)?_tenant_id_(message_id_revision|case_id_case_sequence|command_id)/u.test(pg.constraint ?? "")) return new RecoveryMessageError("RECOVERY_MESSAGE_STALE_REVISION");
  return error;
}
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) { throw translate(error); }
}

type MessageRow = {
  id: string; job_id: string; case_id: string; case_sequence: number; pack_id: string; pack_revision: number; manifest_hash: string; attachment_hash: string;
  attachment_approval_id: string; command_id: string; request_hash: string; case_type: RecoveryMessageCaseType; case_revision: number; amount_pence: string;
  recipient: string; body: string; content_hash: string; immutable_content: string; created_at: Date;
  authorization_id: string | null; outbox_action_id: string | null; outbox_status: string | null; claimed_at: Date | null; decision_id: string | null;
  authorization_expires_at: Date | null; authorization_revoked_at: Date | null; membership_active: boolean | null; approving_membership_id: string | null; pack_sources: unknown; attempts: number | null;
};
type EventRow = { message_id: string; revision: number; kind: RecoveryMessageEventKind; created_at: Date };

/**
 * Synthetic-only practice recovery messages. Every consequential step is a command bound to the exact message
 * hash: preview and approval are Decisions and durable outbox records, delivery is the shared outbox executor
 * driving a closed fake adapter, and anything uncertain is checked rather than retried.
 */
export class RecoveryMessageRepository {
  constructor(private readonly pool: Pool) {}

  async read(ctx: VerifiedTenantContext, caseId: string): Promise<RecoveryMessageState> {
    caseId = uuidArg(caseId);
    return guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCase(db, ctx.tenantId, caseId);
      await this.finishHistory(db, ctx.tenantId, caseId);
      return this.state(db, ctx.tenantId, caseId);
    }));
  }

  async preview(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor): Promise<RecoveryMessageState> {
    caseId = uuidArg(caseId);
    const input = recoveryMessagePreviewCommandV1.parse(raw), requestHash = requestHashOf({ action: "preview", caseId, ...input, membershipId: actor.membershipId });
    await guarded(() => withTenant(this.pool, ctx, async db => {
      const claimed = await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, true, { action: "preview", requestHash });
      if (await this.isReplay(db, ctx.tenantId, input.commandId, ["previewed"], caseId, requestHash)) return;
      if (!claimed) fail("RECOVERY_MESSAGE_COMMAND_CONFLICT"); // another family holds this id
      const current = await this.inspect(db, ctx.tenantId, caseId);
      if (!current.ok) return this.refuse(current.reason);
      if (current.now.caseRevision !== input.expectedCaseRevision || current.pack.id !== input.packId) fail("RECOVERY_MESSAGE_CHANGED");
      const id = randomUUID(), sequence = Number((await db.$client.query<{ n: number }>("SELECT coalesce(max(case_sequence),0)::int+1 AS n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2", [ctx.tenantId, caseId])).rows[0]!.n);
      const m = current.message;
      await db.$client.query(
        `INSERT INTO app.recovery_message(id,tenant_id,job_id,case_id,case_sequence,pack_id,pack_revision,manifest_hash,attachment_hash,attachment_approval_id,command_id,request_hash,case_type,case_revision,amount_pence,currency,sender,recipient,body,policy_version,content_hash,immutable_content,actor_membership_id,environment)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'GBP',$16,$17,$18,$19,$20,$21,$22,'synthetic_demo')`,
        [id, ctx.tenantId, m.jobId, caseId, sequence, m.packId, m.packRevision, m.manifestHash, m.attachmentHash, current.pack.approvalId, input.commandId, requestHash, m.caseType, m.caseRevision, m.amountPence, m.sender, m.recipient, m.body, m.policyVersion, m.contentHash, m.immutableContent, actor.membershipId]);
      await this.event(db, ctx.tenantId, { id, jobId: m.jobId, caseId }, actor, "previewed", input.commandId, requestHash, 0);
      await this.audit(db, actor, id, "previewed", { caseId, jobId: m.jobId, commandId: input.commandId }, m.contentHash, requestHash);
    }));
    return this.read(ctx, caseId);
  }

  async command(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor): Promise<RecoveryMessageState> {
    caseId = uuidArg(caseId);
    const input = recoveryMessageCommandV1.parse(raw);
    await this.read(ctx, caseId);
    const messageId = uuidArg(input.messageId), requestHash = requestHashOf({ caseId, membershipId: actor.membershipId, ...input, messageId });
    if (input.action === "approve") await this.approve(ctx, caseId, messageId, input, actor, requestHash);
    else if (input.action === "revoke") await this.revoke(ctx, caseId, messageId, input, actor, requestHash);
    else if (input.action === "advance") await this.advance(ctx, caseId, messageId, input, actor, requestHash);
    else await this.reconcile(ctx, caseId, messageId, input, actor, requestHash);
    return this.read(ctx, caseId);
  }

  // ---- approve: an exact Decision, authorization and outbox action in one transaction -------------------------
  private async approve(ctx: VerifiedTenantContext, caseId: string, messageId: string, input: Extract<RecoveryMessageCommand, { action: "approve" }>, actor: RecoveryMessageActor, requestHash: string) {
    // A replay must be recognised before any freshness check: the first success already moved the revision on.
    const pre = await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, false);
      if (await this.isReplay(db, ctx.tenantId, input.commandId, ["approved"], caseId, requestHash)) return { replayed: true as const };
      const m = await this.messageRow(db, ctx.tenantId, caseId, messageId);
      if (await this.revisionOf(db, ctx.tenantId, messageId) !== input.expectedRevision) fail("RECOVERY_MESSAGE_STALE_REVISION");
      const content = this.verified(m);
      if (!matchesRecoveryMessageApproval(content, input)) fail("RECOVERY_MESSAGE_CHANGED");
      return { replayed: false as const, row: m };
    }));
    if (pre.replayed) return;
    const m = pre.row, outboxId = randomUUID(), authorizationId = randomUUID();
    const expiresAt = new Date(new Date(m.created_at).getTime() + APPROVAL_LIFETIME_MS);
    const command: ConsequentialCommand = {
      version: "command.v1", commandId: input.commandId, commandType: "recovery.message.approve", semanticKey: `recovery-message-approve:${messageId}`,
      actorMembershipId: actor.membershipId, subjectType: "recovery_message", subjectRef: messageId, authorizationId,
      action: { actionType: RECOVERY_MESSAGE_ACTION, recipient: m.recipient, contentHash: m.content_hash, aggregateRevision: m.case_revision, amountPence: Number(m.amount_pence), currency: "GBP", policyVersion: "practice-factual-message.v1", expiresAt },
    };
    const mutation: CommandMutation<{ messageId: string; outboxActionId: string; authorizationId: string }> = {
      mutate: async (db, authorised) => {
        await this.lockCase(db, ctx.tenantId, caseId);
        const row = await this.messageRow(db, ctx.tenantId, caseId, messageId), revision = await this.revisionOf(db, ctx.tenantId, messageId);
        if (revision !== input.expectedRevision) fail("RECOVERY_MESSAGE_STALE_REVISION");
        const content = this.verified(row);
        if (!matchesRecoveryMessageApproval(content, input)) fail("RECOVERY_MESSAGE_CHANGED");
        const existing = await db.$client.query("SELECT 1 FROM app.recovery_message_approval WHERE tenant_id=$1 AND message_id=$2", [ctx.tenantId, messageId]);
        if (existing.rowCount) fail("RECOVERY_MESSAGE_STALE_REVISION");
        const current = await this.inspect(db, ctx.tenantId, caseId);
        if (!current.ok || current.message.contentHash !== row.content_hash) fail("RECOVERY_MESSAGE_CHANGED");
        const live = await db.$client.query(
          `SELECT 1 FROM app.recovery_message_approval x JOIN app.action_outbox o ON o.tenant_id=x.tenant_id AND o.id=x.outbox_action_id
           WHERE x.tenant_id=$1 AND x.case_id=$2 AND o.status<>'cancelled'`, [ctx.tenantId, caseId]);
        if (live.rowCount) fail("RECOVERY_MESSAGE_EXISTING_EFFECT");
        await appendOutboundAction(db, ctx.tenantId, {
          version: "outbound-action.v1", id: outboxId, authorizationId: authorised.authorizationId!, adapter: RECOVERY_MESSAGE_ADAPTER,
          providerEffectKey: `${RECOVERY_MESSAGE_EFFECT_PREFIX}${messageId}`, actionType: RECOVERY_MESSAGE_ACTION, recipient: row.recipient, contentHash: row.content_hash,
          immutableContent: row.immutable_content, aggregateRevision: row.case_revision, amountPence: Number(row.amount_pence), currency: "GBP",
          policyVersion: "practice-factual-message.v1", authorizationExpiresAt: authorised.action.expiresAt,
        });
        await db.$client.query("INSERT INTO app.recovery_message_approval(tenant_id,job_id,case_id,message_id,authorization_id,outbox_action_id,environment) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo')",
          [ctx.tenantId, row.job_id, caseId, messageId, authorised.authorizationId, outboxId]);
        await this.event(db, ctx.tenantId, { id: messageId, jobId: row.job_id, caseId }, actor, "approved", input.commandId, requestHash, input.expectedRevision);
        return { messageId, outboxActionId: outboxId, authorizationId: authorised.authorizationId! };
      },
      auditEvents: () => [this.auditInput(actor, messageId, "approved", { caseId, jobId: m.job_id, commandId: input.commandId }, m.content_hash, requestHash)],
    };
    await guarded(() => new UserCommandDispatcher(this.pool).dispatch(ctx, command, mutation));
    // Shared semantic idempotency can return a different command's completed approval. This leaf binds the caller's
    // expected message revision as well: only the same exact command is a replay; another client's approval is stale.
    await guarded(() => withTenant(this.pool, ctx, async db => {
      const owned = await db.$client.query("SELECT 1 FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2 AND command_id=$3 AND request_hash=$4 AND kind='approved'", [ctx.tenantId, messageId, input.commandId, requestHash]);
      if (!owned.rowCount) fail("RECOVERY_MESSAGE_STALE_REVISION");
    }));
  }

  // ---- revoke: only before anything was claimed; it withdraws the authorization and cancels the queued action --
  private async revoke(ctx: VerifiedTenantContext, caseId: string, messageId: string, input: Extract<RecoveryMessageCommand, { action: "revoke" }>, actor: RecoveryMessageActor, requestHash: string) {
    await guarded(() => withTenant(this.pool, ctx, async db => {
      const claimed = await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, true, { action: "revoke", requestHash });
      if (await this.isReplay(db, ctx.tenantId, input.commandId, ["revoked"], caseId, requestHash)) return;
      if (!claimed) fail("RECOVERY_MESSAGE_COMMAND_CONFLICT"); // another family holds this id
      const m = await this.messageRow(db, ctx.tenantId, caseId, messageId), status = await this.statusOf(db, ctx.tenantId, m);
      if (await this.revisionOf(db, ctx.tenantId, messageId) !== input.expectedRevision) fail("RECOVERY_MESSAGE_STALE_REVISION");
      if (status === "previewed") fail("RECOVERY_MESSAGE_NOT_APPROVED");
      if (status !== "queued" && status !== "retryable") fail("RECOVERY_MESSAGE_NOT_REVOCABLE");
      await db.$client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL", [ctx.tenantId, m.authorization_id]);
      const cancelled = await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status IN('pending','retryable')", [ctx.tenantId, m.outbox_action_id]);
      if (cancelled.rowCount !== 1) fail("RECOVERY_MESSAGE_EXECUTION_PENDING");
      await this.event(db, ctx.tenantId, { id: messageId, jobId: m.job_id, caseId }, actor, "revoked", input.commandId, requestHash, input.expectedRevision);
      await this.audit(db, actor, messageId, "revoked", { caseId, jobId: m.job_id, commandId: input.commandId }, m.content_hash, requestHash);
    }));
  }

  // ---- advance: claim under the case lock, run the fake adapter after commit, record the result ---------------
  private async advance(ctx: VerifiedTenantContext, caseId: string, messageId: string, input: Extract<RecoveryMessageCommand, { action: "advance" }>, actor: RecoveryMessageActor, requestHash: string) {
    const claimed = await guarded(() => withTenant(this.pool, ctx, async db => {
      const claimed = await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, true, { action: "advance", requestHash });
      const replay = await this.isReplay(db, ctx.tenantId, input.commandId, ["started", "blocked"], caseId, requestHash);
      if (replay) {
        const m = await this.messageRow(db, ctx.tenantId, caseId, messageId);
        const last = (await db.$client.query<{ revision: number; kind: string }>("SELECT revision,kind FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2 ORDER BY revision DESC LIMIT 1", [ctx.tenantId, messageId])).rows[0]!;
        if (last.kind === "started" && (m.outbox_status === "pending" || m.outbox_status === "retryable"))
          return { replayed: false as const, blocked: false as const, started: last.revision, outboxId: m.outbox_action_id!, row: m };
        return { replayed: true as const, blocked: replay.kind === "blocked" };
      }
      if (!claimed) fail("RECOVERY_MESSAGE_COMMAND_CONFLICT"); // another family holds this id
      const m = await this.messageRow(db, ctx.tenantId, caseId, messageId), status = await this.statusOf(db, ctx.tenantId, m);
      const revision = await this.revisionOf(db, ctx.tenantId, messageId);
      if (revision !== input.expectedRevision) fail("RECOVERY_MESSAGE_STALE_REVISION");
      const refused: Partial<Record<RecoveryMessageStatus, RecoveryMessageErrorCode>> = {
        previewed: "RECOVERY_MESSAGE_NOT_APPROVED", executing: "RECOVERY_MESSAGE_EXECUTION_PENDING", simulated_delivery: "RECOVERY_MESSAGE_ALREADY_DELIVERED",
        outcome_unknown: "RECOVERY_MESSAGE_RECONCILE_REQUIRED", revoked: "RECOVERY_MESSAGE_REVOKED", blocked: "RECOVERY_MESSAGE_BLOCKED", failed: "RECOVERY_MESSAGE_NOT_ADVANCEABLE",
      };
      if (refused[status]) return fail(refused[status]!);
      const ref = { id: messageId, jobId: m.job_id, caseId };
      // The approval must still be live, the owner still active, and the case and evidence exactly as approved.
      let valid = !!m.membership_active && !!m.authorization_expires_at && new Date(m.authorization_expires_at).getTime() > Date.now() && !m.authorization_revoked_at;
      if (valid) {
        const current = await this.inspect(db, ctx.tenantId, caseId).catch(() => null);
        valid = !!current && current.ok && current.message.contentHash === m.content_hash;
      }
      if (!valid) {
        await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status IN('pending','retryable')", [ctx.tenantId, m.outbox_action_id]);
        await this.event(db, ctx.tenantId, ref, actor, "blocked", input.commandId, requestHash, revision);
        await this.audit(db, actor, messageId, "blocked", { caseId, jobId: m.job_id, commandId: input.commandId }, m.content_hash, requestHash);
        return { replayed: false as const, blocked: true as const };
      }
      const started = await this.event(db, ctx.tenantId, ref, actor, "started", input.commandId, requestHash, revision);
      await this.audit(db, actor, messageId, "started", { caseId, jobId: m.job_id, commandId: input.commandId }, m.content_hash, requestHash);
      return { replayed: false as const, blocked: false as const, started, outboxId: m.outbox_action_id!, row: m };
    }));
    if (claimed.replayed) return claimed.blocked ? fail("RECOVERY_MESSAGE_BLOCKED") : undefined;
    if (claimed.blocked) return fail("RECOVERY_MESSAGE_BLOCKED");
    // Deliberate post-commit boundary: only the closed deterministic fake exists, with no transport or credential.
    const adapter = new FakeRecoveryMessageAdapter(this.pool, ctx, input.outcome satisfies RecoveryMessageDeliveryMode);
    try { await new ActionExecutor(this.pool, new Map([[adapter.name, adapter]]), noTelemetry).execute(ctx, claimed.outboxId); }
    catch (error) { if (error instanceof PracticeProcessStopped) fail("RECOVERY_MESSAGE_DELIVERY_INTERRUPTED"); throw error; }
    await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCase(db, ctx.tenantId, caseId);
      // A declined execution or a changed-source refusal has no effect. Persist the block before recording its history.
      await db.$client.query(`UPDATE app.action_outbox o SET status='cancelled',updated_at=clock_timestamp()
        WHERE o.tenant_id=$1 AND o.id=$2 AND (o.status='pending' OR (o.status='retryable' AND EXISTS(
          SELECT 1 FROM app.action_attempt t WHERE t.tenant_id=o.tenant_id AND t.action_id=o.id AND t.error_code='FAKE_BLOCKED_CHANGED'
          AND t.attempt_number=(SELECT max(x.attempt_number) FROM app.action_attempt x WHERE x.tenant_id=o.tenant_id AND x.action_id=o.id))))`, [ctx.tenantId, claimed.outboxId]);
      await this.finishHistory(db, ctx.tenantId, caseId);
    }));
    const after = await this.read(ctx, caseId);
    if (after.messages.find(item => item.id === messageId)?.status === "blocked") fail("RECOVERY_MESSAGE_BLOCKED");
  }

  // ---- reconcile: ask the practice provider what it recorded; never resend an unknown outcome -----------------
  private async reconcile(ctx: VerifiedTenantContext, caseId: string, messageId: string, input: Extract<RecoveryMessageCommand, { action: "reconcile" }>, actor: RecoveryMessageActor, requestHash: string) {
    const adapter = new FakeRecoveryMessageAdapter(this.pool, ctx, "success");
    const claimed = await guarded(() => withTenant(this.pool, ctx, async db => {
      const claimed = await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, true, { action: "reconcile", requestHash });
      if (await this.isReplay(db, ctx.tenantId, input.commandId, ["reconcile_started", "outcome_unknown"], caseId, requestHash)) {
        const m = await this.messageRow(db, ctx.tenantId, caseId, messageId);
        if (m.outbox_status !== "outcome_unknown") return { replayed: true as const };
        return { replayed: false as const, started: await this.revisionOf(db, ctx.tenantId, messageId), outboxId: m.outbox_action_id!, jobId: m.job_id, contentHash: m.content_hash };
      }
      if (!claimed) fail("RECOVERY_MESSAGE_COMMAND_CONFLICT"); // another family holds this id
      let m = await this.messageRow(db, ctx.tenantId, caseId, messageId);
      const revision = await this.revisionOf(db, ctx.tenantId, messageId);
      if (revision !== input.expectedRevision) fail("RECOVERY_MESSAGE_STALE_REVISION");
      const ref = { id: messageId, jobId: m.job_id, caseId }, audit: AuditEventInput[] = [];
      let previous = revision;
      // A stale executing claim is uncertain, never a retry. Record uncertainty and check intent atomically.
      if (m.outbox_status === "executing" && m.claimed_at && Date.now() - new Date(m.claimed_at).getTime() > STALE_EXECUTION_MS) {
        const changed = await db.$client.query("UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status='executing' AND claimed_at<clock_timestamp()-interval '5 minutes' RETURNING id", [ctx.tenantId, m.outbox_action_id]);
        if (!changed.rowCount) fail("RECOVERY_MESSAGE_EXECUTION_PENDING");
        await db.$client.query("UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='STALE_CLAIM',finished_at=clock_timestamp() WHERE tenant_id=$1 AND action_id=$2 AND outcome='started'", [ctx.tenantId, m.outbox_action_id]);
        previous = await this.event(db, ctx.tenantId, ref, actor, "outcome_unknown", input.commandId, requestHash, previous);
        audit.push(this.auditInput(actor, messageId, "outcome_unknown", { caseId, jobId: m.job_id, commandId: input.commandId }, m.content_hash, requestHash));
        m = await this.messageRow(db, ctx.tenantId, caseId, messageId);
      }
      if (m.outbox_status !== "outcome_unknown") return fail("RECOVERY_MESSAGE_NOT_RECONCILABLE");
      const last = (await db.$client.query<{ kind: string }>("SELECT kind FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2 ORDER BY revision DESC LIMIT 1", [ctx.tenantId, messageId])).rows[0];
      if (last?.kind === "reconcile_started") fail("RECOVERY_MESSAGE_EXECUTION_PENDING");
      const started = await this.event(db, ctx.tenantId, ref, actor, "reconcile_started", input.commandId, requestHash, previous);
      audit.push(this.auditInput(actor, messageId, "reconcile_started", { caseId, jobId: m.job_id, commandId: input.commandId }, m.content_hash, requestHash));
      await this.appendHistoryAudit(db, audit);
      return { replayed: false as const, started, outboxId: m.outbox_action_id!, jobId: m.job_id, contentHash: m.content_hash };
    }));
    if (claimed.replayed) return;
    let result: "succeeded" | "not_found" | "unknown";
    try { result = await reconcileOutbox(this.pool, ctx, claimed.outboxId, adapter); }
    catch (error) { if (error instanceof Error && error.message === "NOT_RECONCILABLE") return fail("RECOVERY_MESSAGE_NOT_RECONCILABLE"); throw error; }
    await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCase(db, ctx.tenantId, caseId);
      if (result === "unknown") {
        await this.event(db, ctx.tenantId, { id: messageId, jobId: claimed.jobId, caseId }, actor, "outcome_unknown", input.commandId, requestHash, claimed.started);
        await this.audit(db, actor, messageId, "outcome_unknown", { caseId, jobId: claimed.jobId, commandId: input.commandId }, claimed.contentHash, requestHash);
      } else await this.finishHistory(db, ctx.tenantId, caseId);
    }));
  }

  // ---- shared helpers ---------------------------------------------------------------------------------------
  private lockCase(db: TenantTransaction, tenantId: string, caseId: string) {
    // Same key the evidence pack commands use, so a pack rebuild and a message approval serialize.
    return lockRecoveryCase(db, tenantId, caseId);
  }

  /** Lock order is fixed: command identity, then case, then rows; the audit append is always last. */
  /**
   * Lock order is fixed and matches the shared dispatcher: command identity, owner, shared receipt, then case; rows after;
   * the audit append is always last. Returns whether this transaction newly claimed the command id (true when no claim was asked).
   */
  private async begin(db: TenantTransaction, tenantId: string, caseId: string, commandId: string, actor: RecoveryMessageActor, lockCase = true,
    claim?: Readonly<{ action: string; requestHash: string }>): Promise<boolean> {
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [tenantId, `recovery-message-command:${commandId}`]);
    if (!(await db.$client.query("SELECT 1 FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [tenantId, caseId])).rowCount) fail("RECOVERY_MESSAGE_NOT_FOUND");
    // FOR SHARE needs UPDATE on app.membership, which jobguard_runtime holds (0000_tenancy.sql); it keeps the owner from being revoked mid-command.
    const owner = await db.$client.query(
      `SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`,
      [tenantId, actor.membershipId]);
    if (!owner.rowCount || actor.actorRef !== `membership:${actor.membershipId}`) fail("RECOVERY_MESSAGE_FORBIDDEN");
    // The receipt is claimed BEFORE the case lock, in the same order as UserCommandDispatcher (receipt, then the approval's case lock),
    // so a racing approval with the same id meets a typed conflict instead of a deadlock (Codex P2 4196435988).
    const claimed = claim ? await this.claim(db, tenantId, commandId, claim.action, claim.requestHash, actor) : true;
    if (lockCase) await this.lockCase(db, tenantId, caseId);
    return claimed;
  }

  /**
   * Claims a new command id in the shared receipt table, in the same transaction as its first effect. The family advisory
   * lock does not serialise against other command families, but the receipt primary key does, so a concurrent command of
   * any family with the same id can no longer also commit (AGENTS.md:131). Approval claims through the shared dispatcher.
   */
  private async claim(db: TenantTransaction, tenantId: string, commandId: string, action: string, requestHash: string, actor: RecoveryMessageActor): Promise<boolean> {
    const claimed = await db.$client.query(
      `INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
       VALUES($1,$2,$3,$4,$5,'succeeded',$6::jsonb,$7,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING command_id`,
      [commandId, tenantId, `recovery.message.${action}`, commandId, requestHash, JSON.stringify({ recoveryMessageCommand: action }), actor.membershipId]);
    return !!claimed.rowCount;
  }

  /** The first recorded effect of a command id, whichever table holds it. An approval is also a Decision receipt. */
  private async replayOf(db: TenantTransaction, tenantId: string, commandId: string): Promise<{ kind: string; caseId: string | null; requestHash: string } | null> {
    const preview = (await db.$client.query<{ case_id: string; request_hash: string }>("SELECT case_id,request_hash FROM app.recovery_message WHERE tenant_id=$1 AND command_id=$2", [tenantId, commandId])).rows[0];
    if (preview) return { kind: "previewed", caseId: preview.case_id, requestHash: preview.request_hash };
    const event = (await db.$client.query<{ kind: string; case_id: string; request_hash: string }>("SELECT kind,case_id,request_hash FROM app.recovery_message_event WHERE tenant_id=$1 AND command_id=$2 ORDER BY revision LIMIT 1", [tenantId, commandId])).rows[0];
    if (event) return { kind: event.kind, caseId: event.case_id, requestHash: event.request_hash };
    // Recovery commands are recognised from their own tables above; their receipts (claimed in begin, possibly by this very
    // transaction) only fence other families, so only another family's receipt counts here.
    const receipt = (await db.$client.query<{ request_hash: string }>("SELECT request_hash FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2 AND command_type NOT LIKE 'recovery.message.%'", [tenantId, commandId])).rows[0];
    return receipt ? { kind: "command", caseId: null, requestHash: receipt.request_hash } : null;
  }

  /** A command id may be replayed with the identical request; any other reuse, of any command family, is a conflict. */
  private async isReplay(db: TenantTransaction, tenantId: string, commandId: string, kinds: readonly string[], caseId: string, requestHash: string) {
    const replay = await this.replayOf(db, tenantId, commandId);
    if (!replay) return null;
    if (!kinds.includes(replay.kind) || replay.caseId !== caseId || replay.requestHash !== requestHash) fail("RECOVERY_MESSAGE_COMMAND_CONFLICT");
    return replay;
  }

  private refuse(reason: RecoveryMessageReadinessReason): never {
    return fail(reason === "CASE_NOT_ELIGIBLE" ? "RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE" : reason === "PACK_REQUIRED" ? "RECOVERY_MESSAGE_SOURCES_REQUIRED" : "RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED");
  }

  private async revisionOf(db: TenantTransaction, tenantId: string, messageId: string) {
    return Number((await db.$client.query<{ n: number }>("SELECT coalesce(max(revision),0)::int AS n FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2", [tenantId, messageId])).rows[0]!.n);
  }

  private async event(db: TenantTransaction, tenantId: string, m: { id: string; jobId: string; caseId: string }, actor: RecoveryMessageActor, kind: RecoveryMessageEventKind, commandId: string, requestHash: string, expectedPrevious: number) {
    if (await this.revisionOf(db, tenantId, m.id) !== expectedPrevious) fail("RECOVERY_MESSAGE_STALE_REVISION");
    const revision = expectedPrevious + 1;
    await db.$client.query(
      `INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo')`, [randomUUID(), tenantId, m.jobId, m.caseId, m.id, revision, kind, commandId, requestHash, actor.membershipId]);
    return revision;
  }

  private auditInput(actor: RecoveryMessageActor, messageId: string, kind: RecoveryMessageEventKind, references: Record<string, string>, contentHash: string, requestHash: string): AuditEventInput {
    // Identifiers and hashes only: no recipient, body, amount or free text ever enters the audit chain.
    return { id: randomUUID(), version: "audit.v1", actorRef: actor.actorRef, eventType: `recovery.message.${kind}`, subjectType: "recovery_message", subjectRef: messageId,
      payload: { references, hashes: { content: contentHash, request: requestHash }, classifications: { action: "commercial" } } };
  }
  private audit(db: TenantTransaction, actor: RecoveryMessageActor, messageId: string, kind: RecoveryMessageEventKind, references: Record<string, string>, contentHash: string, requestHash: string) {
    return appendAuditBatch(db, [this.auditInput(actor, messageId, kind, references, contentHash, requestHash)]);
  }

  private appendHistoryAudit(db: TenantTransaction, events: AuditEventInput[]) { return appendAuditBatch(db, events); }

  private async finishHistory(db: TenantTransaction, tenantId: string, caseId: string) {
    const audits: AuditEventInput[] = [];
    for (const m of await this.messageRows(db, tenantId, caseId)) {
      if (!m.outbox_action_id) continue;
      // Keep execution-result changes from racing the history's fact check. No business locks are taken after audit.
      const fact = (await db.$client.query<{ status: string; claimed_at: Date | null }>(
        "SELECT status,claimed_at FROM app.action_outbox WHERE tenant_id=$1 AND id=$2 FOR SHARE", [tenantId, m.outbox_action_id])).rows[0];
      if (!fact) continue;
      m.outbox_status = fact.status; m.claimed_at = fact.claimed_at;
      const history = (await db.$client.query<EventRow & { command_id: string; request_hash: string; actor_membership_id: string }>(
        "SELECT * FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2 ORDER BY revision", [tenantId, m.id])).rows;
      let last = history.at(-1);
      if (!last) continue;
      const ref = { id: m.id, jobId: m.job_id, caseId };
      // These facts were produced by the outbox executor or reconciler, not by a person (AGENTS.md:123). The approving
      // membership stays on the event row and in the audit references as the authorisation, never as the actor.
      const append = async (kind: RecoveryMessageEventKind, commandId: string, requestHash: string, membershipId: string) => {
        const actor = { membershipId, actorRef: RECOVERY_MESSAGE_EXECUTOR_REF };
        const revision = await this.event(db, tenantId, ref, actor, kind, commandId, requestHash, last!.revision);
        audits.push(this.auditInput(actor, m.id, kind, { caseId, jobId: m.job_id, commandId, authorisedBy: `membership:${membershipId}` }, m.content_hash, requestHash));
        last = { message_id: m.id, revision, kind, command_id: commandId, request_hash: requestHash, actor_membership_id: membershipId, created_at: new Date() };
      };
      // A direct worker may have recorded an attempt without the application's start history.
      const attempts = (await db.$client.query<{ id: string; attempt_number: number; outcome: string }>(
        "SELECT id,attempt_number,outcome FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2 ORDER BY attempt_number", [tenantId, m.outbox_action_id])).rows;
      // The shared executor can mark a stale claim unknown without closing its unfinished attempt.
      // The committed unknown outbox state is positive evidence of uncertainty, never of a successful delivery.
      if (m.outbox_status === "outcome_unknown" && attempts.at(-1)?.outcome === "started") {
        await db.$client.query("UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='STALE_CLAIM',finished_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND outcome='started'", [tenantId, attempts.at(-1)!.id]);
      }
      if ((last.kind === "approved" || last.kind === "retryable") && attempts.length > history.filter(event => event.kind === "started").length) {
        const attempt = attempts.at(-1)!;
        await append("started", attempt.id, requestHashOf({ attemptId: attempt.id, messageId: m.id }), m.approving_membership_id!);
      }
      let kind: RecoveryMessageEventKind | undefined;
      if (last.kind === "started") {
        const kinds: Record<string, RecoveryMessageEventKind> = { succeeded: "succeeded", outcome_unknown: "outcome_unknown", retryable: "retryable", dead_letter: "failed", cancelled: "blocked" };
        kind = kinds[m.outbox_status ?? ""];
      } else if (last.kind === "reconcile_started") {
        if (m.outbox_status === "succeeded") kind = "reconciled";
        else if (m.outbox_status === "retryable") kind = "retryable";
      }
      if (kind) await append(kind, last.command_id, last.request_hash, last.actor_membership_id);
    }
    // All business reads and event writes precede the single audit append. Event + audit either both commit or neither does.
    if (audits.length) await this.appendHistoryAudit(db, audits);
  }

  private verified(row: MessageRow) {
    try { return verifyRecoveryMessageContent(row.immutable_content, row.content_hash); }
    catch { return fail("RECOVERY_MESSAGE_CONTENT_INVALID"); }
  }

  private async messageRows(db: TenantTransaction, tenantId: string, caseId: string, messageId?: string) {
    return (await db.$client.query<MessageRow>(
      `SELECT m.*,ap.authorization_id,ap.outbox_action_id,o.status AS outbox_status,o.claimed_at,a.decision_id,
        a.expires_at AS authorization_expires_at,a.revoked_at AS authorization_revoked_at,a.actor_membership_id AS approving_membership_id,
        (SELECT true FROM app.membership mem WHERE mem.tenant_id=a.tenant_id AND mem.id=a.actor_membership_id AND mem.role='owner' AND mem.revoked_at IS NULL AND (mem.expires_at IS NULL OR mem.expires_at>clock_timestamp())) AS membership_active,
        p.sources AS pack_sources,(SELECT count(*)::int FROM app.action_attempt t WHERE t.tenant_id=m.tenant_id AND t.action_id=ap.outbox_action_id) AS attempts
       FROM app.recovery_message m
       LEFT JOIN app.recovery_message_approval ap ON ap.tenant_id=m.tenant_id AND ap.message_id=m.id
       LEFT JOIN app.action_outbox o ON o.tenant_id=ap.tenant_id AND o.id=ap.outbox_action_id
       LEFT JOIN app.action_authorization a ON a.tenant_id=ap.tenant_id AND a.id=ap.authorization_id
       LEFT JOIN app.evidence_pack_revision p ON p.tenant_id=m.tenant_id AND p.case_id=m.case_id AND p.pack_id=m.pack_id AND p.revision=m.pack_revision
       WHERE m.tenant_id=$1 AND m.case_id=$2 AND ($3::uuid IS NULL OR m.id=$3) ORDER BY m.case_sequence`, [tenantId, caseId, messageId ?? null])).rows;
  }
  private async messageRow(db: TenantTransaction, tenantId: string, caseId: string, messageId: string) {
    return (await this.messageRows(db, tenantId, caseId, messageId))[0] ?? fail("RECOVERY_MESSAGE_NOT_FOUND");
  }
  private async statusOf(db: TenantTransaction, tenantId: string, m: MessageRow) {
    const revoked = (await db.$client.query("SELECT 1 FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2 AND kind='revoked'", [tenantId, m.id])).rowCount !== 0;
    const claimAbandoned = m.outbox_status === "executing" && !!m.claimed_at && Date.now() - new Date(m.claimed_at).getTime() > STALE_EXECUTION_MS;
    return deriveRecoveryMessageStatus({ approved: !!m.outbox_action_id, outboxStatus: m.outbox_status, revoked, claimAbandoned });
  }

  private inspect(db: TenantTransaction, tenantId: string, caseId: string): Promise<Current> {
    return inspectRecoveryMessageCase(db, tenantId, caseId);
  }

  private async state(db: TenantTransaction, tenantId: string, caseId: string): Promise<RecoveryMessageState> {
    const current = await this.inspect(db, tenantId, caseId);
    const rows = await this.messageRows(db, tenantId, caseId);
    const events = (await db.$client.query<EventRow>("SELECT message_id,revision,kind,created_at FROM app.recovery_message_event WHERE tenant_id=$1 AND case_id=$2 ORDER BY message_id,revision", [tenantId, caseId])).rows;
    const sink = (await db.$client.query<{ message_id: string; outbox_action_id: string; recipient: string; body: string; content_hash: string; attachment_hash: string; provider_reference: string }>(
      "SELECT message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference FROM app.recovery_message_sink WHERE tenant_id=$1 AND case_id=$2 ORDER BY created_at,id", [tenantId, caseId])).rows;
    const lastSequence = rows.at(-1)?.case_sequence;
    const messages = rows.map((row): RecoveryMessageView => {
      const content = this.verified(row), { immutableContent: _immutable, ...message } = content;
      const history = events.filter(event => event.message_id === row.id).map(event => ({ revision: Number(event.revision), kind: event.kind, at: new Date(event.created_at).toISOString() }));
      const revoked = history.some(event => event.kind === "revoked");
      const claimAbandoned = row.outbox_status === "executing" && !!row.claimed_at && Date.now() - new Date(row.claimed_at).getTime() > STALE_EXECUTION_MS;
      const status = deriveRecoveryMessageStatus({ approved: !!row.outbox_action_id, outboxStatus: row.outbox_status, revoked, claimAbandoned });
      const live = status === "previewed" || status === "queued" || status === "retryable";
      const sources = Array.isArray(row.pack_sources) ? (row.pack_sources as Array<{ sourceId: string; version: number; label: string; kind: string; content: string; contentHash: string }>).map(({ sourceId, version, label, kind, content }) => ({ sourceId, version: Number(version), label, kind, content, contentHash: sha256(content) })) : [];
      return {
        id: row.id, sequence: Number(row.case_sequence), revision: history.at(-1)?.revision ?? 0, status, claimAbandoned, superseded: row.case_sequence !== lastSequence,
        changedSinceReview: live && !(current.ok && current.message.contentHash === row.content_hash),
        message, attachment: { packId: row.pack_id, packRevision: Number(row.pack_revision), manifestHash: row.manifest_hash, contentHash: row.attachment_hash, sources },
        approval: row.outbox_action_id ? { decisionId: row.decision_id!, authorizationId: row.authorization_id!, outboxActionId: row.outbox_action_id, revoked: !!row.authorization_revoked_at, expiresAt: new Date(row.authorization_expires_at!).toISOString() } : null,
        attempts: Number(row.attempts ?? 0), history, createdAt: new Date(row.created_at).toISOString(),
      };
    });
    return {
      caseId, jobId: current.now.jobId,
      readiness: { eligible: current.ok, reason: current.ok ? null : current.reason, caseRevision: current.now.caseRevision, outstandingPence: current.now.outstandingPence, packId: current.pack?.id ?? null, packRevision: current.pack?.revision ?? null },
      messages, latest: messages.at(-1) ?? null,
      sink: sink.map(row => ({ messageId: row.message_id, outboxActionId: row.outbox_action_id, recipient: row.recipient, body: row.body, contentHash: row.content_hash, attachmentHash: row.attachment_hash, providerReference: row.provider_reference, environment: "synthetic_demo" as const })),
      sinkCount: sink.length, realExternalActions: 0, environment: "synthetic_demo",
    };
  }
}
