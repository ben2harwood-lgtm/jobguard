import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  RECOVERY_FOLLOW_UP_CLOCK_LIMIT, RECOVERY_FOLLOW_UP_DECISION_SUBJECT, RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS, RECOVERY_FOLLOW_UP_DUE_PERIOD, RECOVERY_FOLLOW_UP_FIXTURE_VERSION,
  RECOVERY_FOLLOW_UP_OWNER, RECOVERY_FOLLOW_UP_RESPONSE_VERSION, RECOVERY_MESSAGE_ACTION, RECOVERY_MESSAGE_POLICY, RECOVERY_MESSAGE_STATUS_LABELS,
  RecoveryFollowUpClockExhausted, deriveRecoveryFollowUpState, followUpDecisionSubjectRef, followUpDueTick, matchesRecoveryMessageApproval,
  recoveryFollowUpCommandV1, recoveryFollowUpScheduleCommandV1, verifyRecoveryMessageContent,
  type RecoveryFollowUpCaseStop, type RecoveryFollowUpCommand, type RecoveryFollowUpEventKind, type RecoveryFollowUpStopReason, type RecoveryFollowUpViewShape, type RecoveryFollowUpStateShape,
  type RecoveryMessageStatus,
} from "@jobguard/core";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { appendOutboundAction } from "./outbox.js";
import { inspectRecoveryMessageCase, lockRecoveryCase } from "./recovery-message-current.js";
import { RECOVERY_MESSAGE_ADAPTER, RECOVERY_MESSAGE_EFFECT_PREFIX } from "./recovery-message-adapter.js";
import { RecoveryMessageError, RecoveryMessageRepository, type RecoveryMessageActor, type RecoveryMessageState } from "./recovery-message-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const RECOVERY_FOLLOW_UP_ERROR_CODES = [
  "RECOVERY_FOLLOW_UP_NOT_FOUND", "RECOVERY_FOLLOW_UP_FORBIDDEN", "RECOVERY_FOLLOW_UP_RUN_REQUIRED", "RECOVERY_FOLLOW_UP_RUN_ARCHIVED", "RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED",
  "RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED", "RECOVERY_FOLLOW_UP_CASE_NOT_ELIGIBLE", "RECOVERY_FOLLOW_UP_CHANGED", "RECOVERY_FOLLOW_UP_ALREADY_ACTIVE",
  "RECOVERY_FOLLOW_UP_STALE_REVISION", "RECOVERY_FOLLOW_UP_COMMAND_CONFLICT", "RECOVERY_FOLLOW_UP_STOPPED", "RECOVERY_FOLLOW_UP_NOT_DUE",
  "RECOVERY_FOLLOW_UP_REMINDER_REQUIRED", "RECOVERY_FOLLOW_UP_REMINDER_APPROVED", "RECOVERY_FOLLOW_UP_COMPLETE", "RECOVERY_FOLLOW_UP_REVIEW_NOT_NEEDED",
] as const;
export type RecoveryFollowUpErrorCode = (typeof RECOVERY_FOLLOW_UP_ERROR_CODES)[number];
export class RecoveryFollowUpError extends Error {
  constructor(readonly code: RecoveryFollowUpErrorCode) { super(code); this.name = "RecoveryFollowUpError"; }
}
function fail(code: RecoveryFollowUpErrorCode): never { throw new RecoveryFollowUpError(code); }

export type RecoveryFollowUpState = RecoveryFollowUpStateShape;
export type RecoveryFollowUpView = RecoveryFollowUpViewShape;
/** Moves the run's practice clock by SBOX-2's own bounded advance. The repository never holds the session: its caller supplies this. */
export type PracticeClockAdvance = (runId: string, commandId: string) => Promise<unknown>;

const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
const requestHashOf = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const uuidArg = (value: string) => z.string().uuid().parse(value).toLowerCase();
/** A deterministic UUID from a seed, so a retried command derives the very same M4-5-S preview command and can be replayed, not repeated. */
const derivedId = (seed: string) => { const h = createHash("sha256").update(seed).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const APPROVAL_LIFETIME_MS = 3_600_000;
const SYSTEM_CLOCK_REF = "system:recovery-follow-up-clock";
const DUE_SUBJECT_ACTION = RECOVERY_MESSAGE_ACTION;

const GUARD_CODES: Readonly<Record<string, RecoveryFollowUpErrorCode>> = {
  RECOVERY_FOLLOW_UP_RUN_INVALID: "RECOVERY_FOLLOW_UP_RUN_REQUIRED", RECOVERY_FOLLOW_UP_CLOCK_INVALID: "RECOVERY_FOLLOW_UP_CHANGED",
  RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED: "RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED", RECOVERY_FOLLOW_UP_CASE_INVALID: "RECOVERY_FOLLOW_UP_CASE_NOT_ELIGIBLE",
  RECOVERY_FOLLOW_UP_CHANGED: "RECOVERY_FOLLOW_UP_CHANGED", RECOVERY_FOLLOW_UP_ALREADY_ACTIVE: "RECOVERY_FOLLOW_UP_ALREADY_ACTIVE", RECOVERY_FOLLOW_UP_FORBIDDEN: "RECOVERY_FOLLOW_UP_FORBIDDEN",
  RECOVERY_FOLLOW_UP_EVENT_SEQUENCE_INVALID: "RECOVERY_FOLLOW_UP_STALE_REVISION", RECOVERY_FOLLOW_UP_EVENT_TRANSITION_INVALID: "RECOVERY_FOLLOW_UP_STALE_REVISION",
  RECOVERY_FOLLOW_UP_EVENT_FACTS_INVALID: "RECOVERY_FOLLOW_UP_REMINDER_APPROVED", RECOVERY_FOLLOW_UP_REMINDER_INVALID: "RECOVERY_FOLLOW_UP_CHANGED",
  RECOVERY_FOLLOW_UP_DUE_INVALID: "RECOVERY_FOLLOW_UP_NOT_DUE",
};
/** Guards raise typed 23514 errors; map them, and uniqueness races, to the same typed codes this repository uses. */
function translate(error: unknown): unknown {
  if (error instanceof RecoveryFollowUpError || error instanceof RecoveryMessageError) return error;
  const pg = error as { code?: string; message?: string; constraint?: string };
  if (pg.code === "23514") { const code = GUARD_CODES[pg.message ?? ""]; if (code) return new RecoveryFollowUpError(code); }
  if (pg.code === "23505" && /recovery_follow_up(_event)?_(tenant_id_command_id|tenant_id_follow_up_id_revision|event_scheduled|event_became_due|event_cancelled|event_command)/u.test(pg.constraint ?? "")) return new RecoveryFollowUpError("RECOVERY_FOLLOW_UP_STALE_REVISION");
  return error;
}
async function guarded<T>(run: () => Promise<T>): Promise<T> { try { return await run(); } catch (error) { throw translate(error); } }

type FollowUpRow = {
  id: string; job_id: string; case_id: string; run_id: string; source_message_id: string; source_message_sequence: number; case_revision: number; case_event_sequence: number;
  created_tick: number; due_tick: number; command_id: string; request_hash: string; created_at: Date;
};
type EventRow = { follow_up_id: string; revision: number; kind: RecoveryFollowUpEventKind; created_at: Date };

/**
 * A persisted practice follow-up for a delivered recovery message (M4-6-S).
 *
 * The follow-up lives on the practice run's own fake clock. When SBOX-2 advances that clock, a database trigger in the very same transaction
 * (migration 0112, `app.recovery_follow_up_on_sandbox_advance`) evaluates which follow-ups are due and records a PENDING Decision for each, once.
 * Nothing here, and nothing the clock does, approves, authorizes, queues or sends: a reminder is previewed through the M4-5-S message path
 * and sent only by an explicit approval of that exact message, through the same authorization, outbox, fake adapter and sink as every M4-5-S message.
 * Every method takes the caller's stamped tenant context whole; none keeps it.
 */
export class RecoveryFollowUpRepository {
  constructor(private readonly pool: Pool, private readonly messages: RecoveryMessageRepository = new RecoveryMessageRepository(pool)) {}

  // ---- read ----------------------------------------------------------------------------------------------------------------------------

  async read(ctx: VerifiedTenantContext, caseId: string): Promise<RecoveryFollowUpState> {
    caseId = uuidArg(caseId);
    // M4-5-S settles any history a direct worker run left behind and is the one authority on a message's status.
    const messages = await guarded(() => this.messages.read(ctx, caseId));
    return guarded(() => withTenant(this.pool, ctx, async db => {
      await this.settleDueAudits(db, ctx.tenantId);
      return this.state(db, ctx.tenantId, caseId, messages);
    }));
  }

  // ---- schedule: a reviewed act bound to a delivered message and the case revision the builder saw ---------------------------------------

  async schedule(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor): Promise<RecoveryFollowUpState> {
    caseId = uuidArg(caseId);
    const input = recoveryFollowUpScheduleCommandV1.parse(raw), sourceMessageId = uuidArg(input.sourceMessageId);
    const requestHash = requestHashOf({ caseId, membershipId: actor.membershipId, ...input, sourceMessageId });
    await guarded(() => withTenant(this.pool, ctx, async db => {
      const began = await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, "schedule", requestHash);
      if (began.replayed) return;
      const jobId = began.jobId;
      const run = await this.activeRun(db, ctx.tenantId, jobId);
      if (!run) fail("RECOVERY_FOLLOW_UP_RUN_REQUIRED");
      let dueTick: number;
      try { dueTick = followUpDueTick(run!.tick); } catch (error) { if (error instanceof RecoveryFollowUpClockExhausted) return fail("RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED"); throw error; }
      const source = await this.sourceMessage(db, ctx.tenantId, caseId);
      if (!source || source.id !== sourceMessageId || !source.delivered) fail("RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED");
      const snapshot = (await db.$client.query<{ synthetic: boolean; environment: string; case_revision: number; outstanding_pence: string }>(
        "SELECT synthetic,environment,case_revision,outstanding_pence FROM app.recovery_message_case_snapshot($1,$2,$3)", [ctx.tenantId, jobId, caseId])).rows[0];
      if (!snapshot || !snapshot.synthetic || snapshot.environment !== "synthetic_demo" || Number(snapshot.outstanding_pence) <= 0) fail("RECOVERY_FOLLOW_UP_CASE_NOT_ELIGIBLE");
      if (Number(snapshot!.case_revision) !== input.expectedCaseRevision) fail("RECOVERY_FOLLOW_UP_CHANGED");
      if (await this.liveFollowUp(db, ctx.tenantId, caseId)) fail("RECOVERY_FOLLOW_UP_ALREADY_ACTIVE");
      const lastEvent = Number((await db.$client.query<{ n: number }>("SELECT coalesce(max(sequence),0)::int AS n FROM app.recovery_case_event WHERE tenant_id=$1 AND case_id=$2", [ctx.tenantId, caseId])).rows[0]!.n);
      const id = randomUUID();
      await db.$client.query(
        `INSERT INTO app.recovery_follow_up(id,tenant_id,job_id,case_id,run_id,source_message_id,source_message_sequence,case_revision,case_event_sequence,created_tick,due_tick,due_after_ticks,fixture_version,command_id,request_hash,actor_membership_id,environment)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'synthetic_demo')`,
        [id, ctx.tenantId, jobId, caseId, run!.id, sourceMessageId, source!.sequence, input.expectedCaseRevision, lastEvent, run!.tick, dueTick, RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS, RECOVERY_FOLLOW_UP_FIXTURE_VERSION, input.commandId, requestHash, actor.membershipId]);
      await db.$client.query("INSERT INTO app.recovery_follow_up_owner(tenant_id,follow_up_id,run_id,owner_kind,environment) VALUES($1,$2,$3,$4,'synthetic_demo')", [ctx.tenantId, id, run!.id, RECOVERY_FOLLOW_UP_OWNER]);
      await this.event(db, ctx.tenantId, { id, jobId, caseId }, "scheduled", { commandId: input.commandId, requestHash, actor }, 0);
      await appendAuditBatch(db, [this.auditInput(actor.actorRef, id, "scheduled", { caseId, jobId, commandId: input.commandId, runId: run!.id, sourceMessageId }, requestHash)]);
    }));
    return this.read(ctx, caseId);
  }

  // ---- Advance practice time: SBOX-2's bounded advance moves the run's fake clock; due evaluation rides in that same transaction --------

  async advanceTime(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor, advance: PracticeClockAdvance): Promise<RecoveryFollowUpState> {
    caseId = uuidArg(caseId);
    const input = recoveryFollowUpCommandV1.parse(raw);
    if (input.action !== "advance_time") throw new z.ZodError([{ code: "custom", path: ["action"], message: "advance_time expected" }]);
    const followUpId = uuidArg(input.followUpId);
    const requestHash = requestHashOf({ caseId, membershipId: actor.membershipId, ...input, followUpId });
    // 1. Recognise a replay, and find the run, before any clock is touched.
    const plan = await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCommand(db, ctx.tenantId, input.commandId);
      const recorded = await this.recordedAdvance(db, ctx.tenantId, input.commandId);
      if (recorded) { if (recorded.request_hash !== requestHash || recorded.follow_up_id !== followUpId) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT"); return { replayed: true as const }; }
      if (await this.isReplay(db, ctx.tenantId, input.commandId, "advance", requestHash)) return { replayed: true as const };
      await this.refuseEvidencePackCommand(db, ctx.tenantId, input.commandId);
      const row = await this.followUpRow(db, ctx.tenantId, caseId, followUpId);
      const run = (await db.$client.query<{ tick: number; archived: boolean }>(
        `SELECT app.recovery_follow_up_run_tick(r.tenant_id,r.id) AS tick,
          EXISTS(SELECT 1 FROM app.sandbox_run_event e WHERE e.tenant_id=r.tenant_id AND e.run_id=r.id AND e.kind='archived') AS archived
         FROM app.sandbox_run r WHERE r.tenant_id=$1 AND r.id=$2`, [ctx.tenantId, row.run_id])).rows[0];
      if (!run) fail("RECOVERY_FOLLOW_UP_NOT_FOUND");
      if (run!.archived) fail("RECOVERY_FOLLOW_UP_RUN_ARCHIVED");
      // This command may already have moved the clock (a previous attempt stopped before recording its result).
      const moved = (await db.$client.query<{ fake_clock_tick: number }>("SELECT fake_clock_tick FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=$2 AND command_id=$3", [ctx.tenantId, row.run_id, input.commandId])).rows[0];
      return { replayed: false as const, runId: row.run_id, alreadyMoved: !!moved };
    }));
    if (!plan.replayed) {
      // 2. The practice clock moves in SBOX-2's own transaction; the database trigger evaluates what is due inside it.
      if (!plan.alreadyMoved) {
        try { await advance(plan.runId, input.commandId); }
        catch (error) {
          const pg = error as { code?: string; message?: string };
          // The same command raced itself, or its clock moved in an earlier attempt: SBOX-2 refuses a second use of a command id. Record from what it saved.
          if (pg.code !== "23505") { if (pg.message === "ARCHIVED") fail("RECOVERY_FOLLOW_UP_RUN_ARCHIVED"); if (pg.message === "NOT_FOUND") fail("RECOVERY_FOLLOW_UP_NOT_FOUND"); throw error; }
        }
      }
      // 3. Record the command and settle the audit of whatever became due, in one transaction.
      await guarded(() => withTenant(this.pool, ctx, async db => {
        await this.lockCommand(db, ctx.tenantId, input.commandId);
        const recorded = await this.recordedAdvance(db, ctx.tenantId, input.commandId);
        if (recorded) { if (recorded.request_hash !== requestHash || recorded.follow_up_id !== followUpId) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT"); return; }
        const row = await this.followUpRow(db, ctx.tenantId, caseId, followUpId);
        const tickAfter = Number((await db.$client.query<{ n: number }>("SELECT app.recovery_follow_up_run_tick($1,$2) AS n", [ctx.tenantId, row.run_id])).rows[0]!.n);
        const moved = (await db.$client.query<{ fake_clock_tick: number }>("SELECT fake_clock_tick FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=$2 AND command_id=$3 AND kind='advanced'", [ctx.tenantId, row.run_id, input.commandId])).rows[0];
        const tickBefore = moved ? Math.max(0, Number(moved.fake_clock_tick) - 1) : tickAfter;
        const claimed = await this.claim(db, ctx.tenantId, input.commandId, "advance", requestHash, actor);
        if (!claimed) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
        await db.$client.query(
          `INSERT INTO app.recovery_follow_up_advance(tenant_id,command_id,run_id,follow_up_id,request_hash,tick_before,tick_after,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'synthetic_demo')`,
          [ctx.tenantId, input.commandId, row.run_id, followUpId, requestHash, tickBefore, tickAfter, actor.membershipId]);
        await this.settleDueAudits(db, ctx.tenantId, [this.auditInput(actor.actorRef, followUpId, "time_advanced", { caseId, jobId: row.job_id, commandId: input.commandId, runId: row.run_id }, requestHash)]);
      }));
    }
    return this.read(ctx, caseId);
  }

  /**
   * A duplicate or restarted "it may be due" signal. It runs the very evaluation the clock runs, so any number of calls, from any connection,
   * leave exactly the due Decisions the clock itself would have left. It authorizes nothing and sends nothing.
   */
  async signalDue(ctx: VerifiedTenantContext, runId: string): Promise<number> {
    runId = uuidArg(runId);
    return guarded(() => withTenant(this.pool, ctx, async db => {
      const made = Number((await db.$client.query<{ n: number }>("SELECT app.evaluate_recovery_follow_ups($1,$2) AS n", [ctx.tenantId, runId])).rows[0]!.n);
      await this.settleDueAudits(db, ctx.tenantId);
      return made;
    }));
  }

  // ---- open_review: the due item opens the M4-5-S review path for the exact reminder ------------------------------------------------------

  async openReview(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor): Promise<RecoveryFollowUpState> {
    caseId = uuidArg(caseId);
    const input = recoveryFollowUpCommandV1.parse(raw);
    if (input.action !== "open_review") throw new z.ZodError([{ code: "custom", path: ["action"], message: "open_review expected" }]);
    const followUpId = uuidArg(input.followUpId), packId = uuidArg(input.packId);
    const requestHash = requestHashOf({ caseId, membershipId: actor.membershipId, ...input, followUpId, packId });
    const previewCommandId = derivedId(`recovery-follow-up-preview:${input.commandId}`);
    // 1. Validate, without claiming the command, so a refusal leaves nothing behind.
    const gate = await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCommand(db, ctx.tenantId, input.commandId);
      if (await this.isReplay(db, ctx.tenantId, input.commandId, "open_review", requestHash)) return { replayed: true as const };
      await this.requireOwner(db, ctx.tenantId, actor);
      const row = await this.followUpRow(db, ctx.tenantId, caseId, followUpId);
      const facts = await this.factsOf(db, ctx.tenantId, row);
      if (facts.delivered) fail("RECOVERY_FOLLOW_UP_COMPLETE");
      if (facts.stop) fail("RECOVERY_FOLLOW_UP_STOPPED");
      if (!facts.due) fail("RECOVERY_FOLLOW_UP_NOT_DUE");
      if (facts.liveApproval) fail("RECOVERY_FOLLOW_UP_REMINDER_APPROVED");
      if (facts.revision !== input.expectedRevision) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
      return { replayed: false as const };
    }));
    if (gate.replayed) return this.read(ctx, caseId);
    // 2. The reminder is a message previewed by the M4-5-S path itself: its case, pack, source and one-effect rules apply to it unchanged.
    const afterPreview = await guarded(() => this.messages.preview(ctx, caseId, { version: "recovery-message-preview.v1", commandId: previewCommandId, expectedCaseRevision: input.expectedCaseRevision, packId }, actor));
    // 3. Link that exact message to this follow-up, in the transaction that claims the command.
    await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCommand(db, ctx.tenantId, input.commandId);
      if (await this.isReplay(db, ctx.tenantId, input.commandId, "open_review", requestHash)) return;
      const created = (await db.$client.query<{ id: string }>("SELECT id FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2 AND command_id=$3", [ctx.tenantId, caseId, previewCommandId])).rows[0];
      if (!created || created.id !== afterPreview.latest?.id) fail("RECOVERY_FOLLOW_UP_CHANGED");
      await this.beginClaim(db, ctx.tenantId, caseId, input.commandId, actor, "open_review", requestHash);
      const row = await this.followUpRow(db, ctx.tenantId, caseId, followUpId);
      const attempt = Number((await db.$client.query<{ n: number }>("SELECT coalesce(max(attempt),0)::int+1 AS n FROM app.recovery_follow_up_reminder WHERE tenant_id=$1 AND follow_up_id=$2", [ctx.tenantId, followUpId])).rows[0]!.n);
      await db.$client.query("INSERT INTO app.recovery_follow_up_reminder(tenant_id,job_id,case_id,follow_up_id,period,attempt,message_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic_demo')",
        [ctx.tenantId, row.job_id, caseId, followUpId, RECOVERY_FOLLOW_UP_DUE_PERIOD, attempt, created!.id]);
      await this.event(db, ctx.tenantId, { id: followUpId, jobId: row.job_id, caseId }, "reminder_previewed", { commandId: input.commandId, requestHash, actor }, input.expectedRevision);
      await appendAuditBatch(db, [this.auditInput(actor.actorRef, followUpId, "reminder_previewed", { caseId, jobId: row.job_id, commandId: input.commandId, messageId: created!.id }, requestHash)]);
    }));
    return this.read(ctx, caseId);
  }

  // ---- approve_reminder: only an explicit approval of the exact reminder creates an authorization and an outbox action --------------------

  async approveReminder(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor): Promise<RecoveryFollowUpState> {
    caseId = uuidArg(caseId);
    const input = recoveryFollowUpCommandV1.parse(raw);
    if (input.action !== "approve_reminder") throw new z.ZodError([{ code: "custom", path: ["action"], message: "approve_reminder expected" }]);
    const followUpId = uuidArg(input.followUpId), messageId = uuidArg(input.messageId);
    const requestHash = requestHashOf({ caseId, membershipId: actor.membershipId, ...input, followUpId, messageId });
    // A replay is recognised before any freshness check: the first success already moved every revision on.
    const pre = await guarded(() => withTenant(this.pool, ctx, async db => {
      await this.lockCommand(db, ctx.tenantId, input.commandId);
      // The dispatcher owns this command's receipt (with its own request hash), so a replay is recognised by the event the first success wrote.
      const prior = (await db.$client.query<{ request_hash: string }>("SELECT request_hash FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND command_id=$2 AND kind='reminder_approved'", [ctx.tenantId, input.commandId])).rows[0];
      if (prior) { if (prior.request_hash !== requestHash) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT"); return { replayed: true as const }; }
      if ((await db.$client.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [ctx.tenantId, input.commandId])).rowCount) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
      await this.requireOwner(db, ctx.tenantId, actor);
      return { replayed: false as const, ...await this.reminderFor(db, ctx.tenantId, caseId, followUpId, messageId, input) };
    }));
    if (pre.replayed) return this.read(ctx, caseId);
    const outboxId = randomUUID(), authorizationId = randomUUID();
    const expiresAt = new Date(new Date(pre.message.created_at).getTime() + APPROVAL_LIFETIME_MS);
    const dueDecision = pre.dueDecisionId;
    const command: ConsequentialCommand = {
      version: "command.v1", commandId: input.commandId, commandType: "recovery.follow_up.approve_reminder", semanticKey: `recovery-follow-up-approve:${messageId}`,
      actorMembershipId: actor.membershipId, subjectType: dueDecision ? RECOVERY_FOLLOW_UP_DECISION_SUBJECT : "recovery_message",
      subjectRef: dueDecision ? followUpDecisionSubjectRef(followUpId) : messageId, ...(dueDecision ? { decisionId: dueDecision } : {}), authorizationId,
      action: { actionType: DUE_SUBJECT_ACTION, recipient: pre.message.recipient, contentHash: pre.message.content_hash, aggregateRevision: pre.message.case_revision, amountPence: Number(pre.message.amount_pence), currency: "GBP", policyVersion: RECOVERY_MESSAGE_POLICY, expiresAt },
    };
    const mutation: CommandMutation<{ messageId: string; outboxActionId: string; authorizationId: string }> = {
      mutate: async (db, authorised) => {
        // The dispatcher owns the receipt; take pack command identity before the case, matching M4-5-S's lock order.
        await this.refuseEvidencePackCommand(db, ctx.tenantId, input.commandId);
        await lockRecoveryCase(db, ctx.tenantId, caseId);
        const again = await this.reminderFor(db, ctx.tenantId, caseId, followUpId, messageId, input);
        const current = await inspectRecoveryMessageCase(db, ctx.tenantId, caseId);
        if (!current.ok || current.message.contentHash !== again.message.content_hash) fail("RECOVERY_FOLLOW_UP_CHANGED");
        await appendOutboundAction(db, ctx.tenantId, {
          version: "outbound-action.v1", id: outboxId, authorizationId: authorised.authorizationId!, adapter: RECOVERY_MESSAGE_ADAPTER,
          providerEffectKey: `${RECOVERY_MESSAGE_EFFECT_PREFIX}${messageId}`, actionType: RECOVERY_MESSAGE_ACTION, recipient: again.message.recipient, contentHash: again.message.content_hash,
          immutableContent: again.message.immutable_content, aggregateRevision: again.message.case_revision, amountPence: Number(again.message.amount_pence), currency: "GBP",
          policyVersion: RECOVERY_MESSAGE_POLICY, authorizationExpiresAt: authorised.action.expiresAt,
        });
        await db.$client.query("INSERT INTO app.recovery_message_approval(tenant_id,job_id,case_id,message_id,authorization_id,outbox_action_id,environment) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo')",
          [ctx.tenantId, again.message.job_id, caseId, messageId, authorised.authorizationId, outboxId]);
        await this.messageEvent(db, ctx.tenantId, { id: messageId, jobId: again.message.job_id, caseId }, actor, "approved", input.commandId, requestHash, input.expectedMessageRevision);
        await this.event(db, ctx.tenantId, { id: followUpId, jobId: again.message.job_id, caseId }, "reminder_approved", { commandId: input.commandId, requestHash, actor }, input.expectedRevision);
        return { messageId, outboxActionId: outboxId, authorizationId: authorised.authorizationId! };
      },
      auditEvents: () => [
        this.messageAuditInput(actor, messageId, "approved", { caseId, jobId: pre.message.job_id, commandId: input.commandId }, pre.message.content_hash, requestHash),
        this.auditInput(actor.actorRef, followUpId, "reminder_approved", { caseId, jobId: pre.message.job_id, commandId: input.commandId, messageId }, requestHash),
      ],
    };
    await guarded(() => new UserCommandDispatcher(this.pool).dispatch(ctx, command, mutation));
    // Shared semantic idempotency can return a different command's completed approval: only this exact command is a replay; another client's is stale.
    await guarded(() => withTenant(this.pool, ctx, async db => {
      const owned = await db.$client.query("SELECT 1 FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND follow_up_id=$2 AND command_id=$3 AND request_hash=$4 AND kind='reminder_approved'", [ctx.tenantId, followUpId, input.commandId, requestHash]);
      if (!owned.rowCount) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
    }));
    return this.read(ctx, caseId);
  }

  // ---- cancel: an immutable cancellation that shows Stopped ---------------------------------------------------------------------------------

  async cancel(ctx: VerifiedTenantContext, caseId: string, raw: unknown, actor: RecoveryMessageActor): Promise<RecoveryFollowUpState> {
    caseId = uuidArg(caseId);
    const input = recoveryFollowUpCommandV1.parse(raw);
    if (input.action !== "cancel") throw new z.ZodError([{ code: "custom", path: ["action"], message: "cancel expected" }]);
    const followUpId = uuidArg(input.followUpId);
    const requestHash = requestHashOf({ caseId, membershipId: actor.membershipId, ...input, followUpId });
    await guarded(() => withTenant(this.pool, ctx, async db => {
      const began = await this.begin(db, ctx.tenantId, caseId, input.commandId, actor, "cancel", requestHash);
      if (began.replayed) return;
      const row = await this.followUpRow(db, ctx.tenantId, caseId, followUpId);
      const facts = await this.factsOf(db, ctx.tenantId, row);
      if (facts.revision !== input.expectedRevision) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
      if (facts.delivered) fail("RECOVERY_FOLLOW_UP_COMPLETE");
      if (facts.stop) fail("RECOVERY_FOLLOW_UP_STOPPED");
      // An approved, queued or delivered reminder is an effect: it is revoked through the M4-5-S message path, never hidden behind a cancellation.
      if (facts.liveApproval) fail("RECOVERY_FOLLOW_UP_REMINDER_APPROVED");
      await this.event(db, ctx.tenantId, { id: followUpId, jobId: row.job_id, caseId }, "cancelled", { commandId: input.commandId, requestHash, actor }, input.expectedRevision);
      await appendAuditBatch(db, [this.auditInput(actor.actorRef, followUpId, "cancelled", { caseId, jobId: row.job_id, commandId: input.commandId }, requestHash)]);
    }));
    return this.read(ctx, caseId);
  }

  // ---- shared helpers ------------------------------------------------------------------------------------------------------------------------

  /** The command-identity lock M4-5-S commands take, so a follow-up command and a message command with one id can never interleave. */
  private lockCommand(db: TenantTransaction, tenantId: string, commandId: string) {
    return db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [tenantId, `recovery-message-command:${commandId}`]);
  }
  private async refuseEvidencePackCommand(db: TenantTransaction, tenantId: string, commandId: string) {
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [tenantId, `pack-command:${commandId}`]);
    const used = await db.$client.query(`SELECT 1 FROM app.evidence_pack_revision WHERE tenant_id=$1 AND command_id=$2
      UNION ALL SELECT 1 FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND command_id=$2 LIMIT 1`, [tenantId, commandId]);
    if (used.rowCount) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
  }
  private async requireOwner(db: TenantTransaction, tenantId: string, actor: RecoveryMessageActor) {
    // FOR SHARE keeps the owner from being revoked mid-command (jobguard_runtime holds UPDATE on app.membership, 0000_tenancy.sql).
    const owner = await db.$client.query(
      `SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`, [tenantId, actor.membershipId]);
    if (!owner.rowCount || actor.actorRef !== `membership:${actor.membershipId}`) fail("RECOVERY_FOLLOW_UP_FORBIDDEN");
  }
  /** Claims a new command id in the shared receipt table, in the same transaction as its first effect. A foreign family's receipt can never be replayed here. */
  private async claim(db: TenantTransaction, tenantId: string, commandId: string, action: string, requestHash: string, actor: RecoveryMessageActor): Promise<boolean> {
    const claimed = await db.$client.query(
      `INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
       VALUES($1,$2,$3,$4,$5,'succeeded',$6::jsonb,$7,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING command_id`,
      [commandId, tenantId, `recovery.follow_up.${action}`, commandId, requestHash, JSON.stringify({ recoveryFollowUpCommand: action }), actor.membershipId]);
    return !!claimed.rowCount;
  }
  /** A recorded command of this family with this exact request is a replay; any other use of the id, of any family, is a conflict. */
  private async isReplay(db: TenantTransaction, tenantId: string, commandId: string, action: string, requestHash: string): Promise<boolean> {
    const receipt = (await db.$client.query<{ command_type: string; request_hash: string }>("SELECT command_type,request_hash FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenantId, commandId])).rows[0];
    if (!receipt) return false;
    if (receipt.command_type !== `recovery.follow_up.${action}` || receipt.request_hash !== requestHash) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
    return true;
  }
  /**
   * Lock order matches the M4-5-S commands: command identity, owner, shared receipt, pack command identity, then the case; rows after; audit last.
   * Returns the case's job, and whether this command id had already been recorded (an exact replay).
   */
  private async begin(db: TenantTransaction, tenantId: string, caseId: string, commandId: string, actor: RecoveryMessageActor, action: string, requestHash: string): Promise<{ replayed: boolean; jobId: string }> {
    await this.lockCommand(db, tenantId, commandId);
    const found = (await db.$client.query<{ job_id: string }>("SELECT job_id FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [tenantId, caseId])).rows[0];
    if (!found) fail("RECOVERY_FOLLOW_UP_NOT_FOUND");
    await this.requireOwner(db, tenantId, actor);
    if (await this.isReplay(db, tenantId, commandId, action, requestHash)) return { replayed: true, jobId: found.job_id };
    await this.claimAfterChecks(db, tenantId, commandId, action, requestHash, actor);
    await this.refuseEvidencePackCommand(db, tenantId, commandId);
    await lockRecoveryCase(db, tenantId, caseId);
    return { replayed: false, jobId: found.job_id };
  }
  private async claimAfterChecks(db: TenantTransaction, tenantId: string, commandId: string, action: string, requestHash: string, actor: RecoveryMessageActor) {
    if (!(await this.claim(db, tenantId, commandId, action, requestHash, actor))) fail("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
  }
  /** begin() for a command whose validation already ran in an earlier transaction. */
  private async beginClaim(db: TenantTransaction, tenantId: string, caseId: string, commandId: string, actor: RecoveryMessageActor, action: string, requestHash: string) {
    await this.requireOwner(db, tenantId, actor);
    await this.claimAfterChecks(db, tenantId, commandId, action, requestHash, actor);
    await this.refuseEvidencePackCommand(db, tenantId, commandId);
    await lockRecoveryCase(db, tenantId, caseId);
  }

  private async recordedAdvance(db: TenantTransaction, tenantId: string, commandId: string) {
    return (await db.$client.query<{ request_hash: string; follow_up_id: string }>("SELECT request_hash,follow_up_id FROM app.recovery_follow_up_advance WHERE tenant_id=$1 AND command_id=$2", [tenantId, commandId])).rows[0];
  }

  private async event(db: TenantTransaction, tenantId: string, ref: { id: string; jobId: string; caseId: string }, kind: RecoveryFollowUpEventKind,
    who: { commandId: string; requestHash: string; actor: RecoveryMessageActor }, expectedPrevious: number) {
    const current = Number((await db.$client.query<{ n: number }>("SELECT coalesce(max(revision),0)::int AS n FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND follow_up_id=$2", [tenantId, ref.id])).rows[0]!.n);
    if (current !== expectedPrevious) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
    await db.$client.query(
      `INSERT INTO app.recovery_follow_up_event(id,tenant_id,job_id,case_id,follow_up_id,revision,kind,command_id,request_hash,actor_membership_id,environment)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo')`, [randomUUID(), tenantId, ref.jobId, ref.caseId, ref.id, expectedPrevious + 1, kind, who.commandId, who.requestHash, who.actor.membershipId]);
    return expectedPrevious + 1;
  }
  /** The M4-5-S message event an approval writes: the same row M4-5-S's own approve writes, so its history, status and guards read it unchanged. */
  private async messageEvent(db: TenantTransaction, tenantId: string, m: { id: string; jobId: string; caseId: string }, actor: RecoveryMessageActor, kind: "approved", commandId: string, requestHash: string, expectedPrevious: number) {
    const current = Number((await db.$client.query<{ n: number }>("SELECT coalesce(max(revision),0)::int AS n FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2", [tenantId, m.id])).rows[0]!.n);
    if (current !== expectedPrevious) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
    await db.$client.query(
      `INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo')`, [randomUUID(), tenantId, m.jobId, m.caseId, m.id, expectedPrevious + 1, kind, commandId, requestHash, actor.membershipId]);
  }

  private auditInput(actorRef: string, followUpId: string, kind: string, references: Record<string, string>, requestHash: string): AuditEventInput {
    // Identifiers and hashes only: no recipient, body, amount or free text ever enters the audit chain.
    return { id: randomUUID(), version: "audit.v1", actorRef, eventType: `recovery.follow_up.${kind}`, subjectType: "recovery_follow_up", subjectRef: followUpId,
      payload: { references, hashes: { request: requestHash }, classifications: { action: "commercial" } } };
  }
  private messageAuditInput(actor: RecoveryMessageActor, messageId: string, kind: string, references: Record<string, string>, contentHash: string, requestHash: string): AuditEventInput {
    return { id: randomUUID(), version: "audit.v1", actorRef: actor.actorRef, eventType: `recovery.message.${kind}`, subjectType: "recovery_message", subjectRef: messageId,
      payload: { references, hashes: { content: contentHash, request: requestHash }, classifications: { action: "commercial" } } };
  }

  /**
   * The due transition is written by the clock's own database trigger, which cannot append to the audit chain. Whichever command observes it
   * appends its audit event here, once, under an id the due row carries, so a retry or a second observer cannot duplicate or drop it.
   */
  private async settleDueAudits(db: TenantTransaction, tenantId: string, withEvents: readonly AuditEventInput[] = []) {
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('recovery-follow-up-audit'))", [tenantId]);
    const due = (await db.$client.query<{ follow_up_id: string; job_id: string; case_id: string; decision_id: string; audit_event_id: string }>(
      `SELECT d.follow_up_id,d.job_id,d.case_id,d.decision_id,d.audit_event_id FROM app.recovery_follow_up_due d
       WHERE d.tenant_id=$1 AND NOT EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=d.tenant_id AND a.id=d.audit_event_id) ORDER BY d.created_at,d.follow_up_id`, [tenantId])).rows;
    const events: AuditEventInput[] = [...withEvents, ...due.map((row): AuditEventInput => ({
      id: row.audit_event_id, version: "audit.v1", actorRef: SYSTEM_CLOCK_REF, eventType: "recovery.follow_up.became_due", subjectType: "recovery_follow_up", subjectRef: row.follow_up_id,
      payload: { references: { caseId: row.case_id, jobId: row.job_id, decisionId: row.decision_id }, hashes: {}, classifications: { action: "commercial" } },
    }))];
    if (events.length) await appendAuditBatch(db, events);
  }

  private async activeRun(db: TenantTransaction, tenantId: string, jobId: string) {
    const row = (await db.$client.query<{ id: string; tick: number }>(
      `SELECT r.id,app.recovery_follow_up_run_tick(r.tenant_id,r.id) AS tick FROM app.sandbox_run r
       JOIN app.job rj ON rj.tenant_id=r.tenant_id AND rj.id=r.job_id JOIN app.job cj ON cj.tenant_id=r.tenant_id AND cj.id=$2
       WHERE r.tenant_id=$1 AND rj.practice_session_digest IS NOT NULL AND rj.practice_session_digest=cj.practice_session_digest
        AND NOT EXISTS (SELECT 1 FROM app.sandbox_run_event e WHERE e.tenant_id=r.tenant_id AND e.run_id=r.id AND e.kind='archived')
       ORDER BY r.created_at DESC,r.id LIMIT 1`, [tenantId, jobId])).rows[0];
    return row ? { id: row.id, tick: Number(row.tick) } : null;
  }
  /** The newest APPROVED message of the case, and whether the practice provider has recorded it. */
  private async sourceMessage(db: TenantTransaction, tenantId: string, caseId: string) {
    const row = (await db.$client.query<{ id: string; case_sequence: number; delivered: boolean }>(
      `SELECT m.id,m.case_sequence,
        EXISTS (SELECT 1 FROM app.recovery_message_sink k JOIN app.recovery_message_approval a ON a.tenant_id=k.tenant_id AND a.message_id=k.message_id
          JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id WHERE k.tenant_id=m.tenant_id AND k.message_id=m.id AND o.status='succeeded') AS delivered
       FROM app.recovery_message m WHERE m.tenant_id=$1 AND m.case_id=$2
        AND EXISTS (SELECT 1 FROM app.recovery_message_approval a WHERE a.tenant_id=m.tenant_id AND a.message_id=m.id)
       ORDER BY m.case_sequence DESC LIMIT 1`, [tenantId, caseId])).rows[0];
    return row ? { id: row.id, sequence: Number(row.case_sequence), delivered: row.delivered } : null;
  }
  private async liveFollowUp(db: TenantTransaction, tenantId: string, caseId: string) {
    return (await db.$client.query("SELECT 1 FROM app.recovery_follow_up f WHERE f.tenant_id=$1 AND f.case_id=$2 AND app.recovery_follow_up_live(f.tenant_id,f.id) LIMIT 1", [tenantId, caseId])).rowCount !== 0;
  }
  private async followUpRow(db: TenantTransaction, tenantId: string, caseId: string, followUpId: string) {
    const row = (await db.$client.query<FollowUpRow>("SELECT * FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$2 AND id=$3", [tenantId, caseId, followUpId])).rows[0];
    return row ?? fail("RECOVERY_FOLLOW_UP_NOT_FOUND");
  }
  /** Every persisted fact about one follow-up, read the way the guards read it. */
  private async factsOf(db: TenantTransaction, tenantId: string, row: FollowUpRow) {
    const stop = (await db.$client.query<{ reason: string | null }>("SELECT app.recovery_follow_up_stop_reason($1,$2) AS reason", [tenantId, row.id])).rows[0]!.reason as RecoveryFollowUpStopReason | null;
    const last = (await db.$client.query<{ n: number }>("SELECT coalesce(max(revision),0)::int AS n FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND follow_up_id=$2", [tenantId, row.id])).rows[0]!;
    const due = (await db.$client.query<{ decision_id: string; resolved: boolean }>(
      `SELECT d.decision_id,EXISTS(SELECT 1 FROM app.decision_resolution r WHERE r.tenant_id=d.tenant_id AND r.decision_id=d.decision_id) AS resolved
       FROM app.recovery_follow_up_due d WHERE d.tenant_id=$1 AND d.follow_up_id=$2 AND d.period=1`, [tenantId, row.id])).rows[0];
    const approval = (await db.$client.query(
      `SELECT 1 FROM app.recovery_follow_up_reminder l JOIN app.recovery_message_approval a ON a.tenant_id=l.tenant_id AND a.message_id=l.message_id
       JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id WHERE l.tenant_id=$1 AND l.follow_up_id=$2 AND o.status<>'cancelled' LIMIT 1`, [tenantId, row.id])).rowCount !== 0;
    const delivered = (await db.$client.query<{ d: boolean }>("SELECT app.recovery_follow_up_delivered($1,$2) AS d", [tenantId, row.id])).rows[0]!.d;
    return { stop, revision: Number(last.n), due: !!due, dueDecisionId: due?.decision_id ?? null, dueResolved: due?.resolved ?? false, liveApproval: approval, delivered };
  }

  /** The newest linked reminder, checked against the exact command: the follow-up must be due, unstopped, and the message the newest preview, unchanged. */
  private async reminderFor(db: TenantTransaction, tenantId: string, caseId: string, followUpId: string, messageId: string,
    input: Extract<RecoveryFollowUpCommand, { action: "approve_reminder" }>) {
    const row = await this.followUpRow(db, tenantId, caseId, followUpId);
    const facts = await this.factsOf(db, tenantId, row);
    if (facts.delivered) fail("RECOVERY_FOLLOW_UP_COMPLETE");
    if (facts.stop) fail("RECOVERY_FOLLOW_UP_STOPPED");
    if (!facts.due) fail("RECOVERY_FOLLOW_UP_NOT_DUE");
    const link = (await db.$client.query<{ message_id: string }>("SELECT message_id FROM app.recovery_follow_up_reminder WHERE tenant_id=$1 AND follow_up_id=$2 ORDER BY attempt DESC LIMIT 1", [tenantId, followUpId])).rows[0];
    if (!link || link.message_id !== messageId) fail("RECOVERY_FOLLOW_UP_REMINDER_REQUIRED");
    if (facts.revision !== input.expectedRevision) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
    const message = (await db.$client.query<{
      id: string; job_id: string; case_id: string; case_revision: number; amount_pence: string; recipient: string; body: string; content_hash: string; immutable_content: string; created_at: Date; pack_id: string;
      case_sequence: number; approved: boolean; revision: number;
    }>(`SELECT m.id,m.job_id,m.case_id,m.case_revision,m.amount_pence,m.recipient,m.body,m.content_hash,m.immutable_content,m.created_at,m.pack_id,m.case_sequence,
        EXISTS(SELECT 1 FROM app.recovery_message_approval a WHERE a.tenant_id=m.tenant_id AND a.message_id=m.id) AS approved,
        (SELECT coalesce(max(e.revision),0)::int FROM app.recovery_message_event e WHERE e.tenant_id=m.tenant_id AND e.message_id=m.id) AS revision
       FROM app.recovery_message m WHERE m.tenant_id=$1 AND m.case_id=$2 AND m.id=$3`, [tenantId, caseId, messageId])).rows[0];
    if (!message) fail("RECOVERY_FOLLOW_UP_REMINDER_REQUIRED");
    const newest = Number((await db.$client.query<{ n: number }>("SELECT max(case_sequence)::int AS n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2", [tenantId, caseId])).rows[0]!.n);
    if (message!.approved || Number(message!.case_sequence) !== newest || Number(message!.revision) !== input.expectedMessageRevision) fail("RECOVERY_FOLLOW_UP_STALE_REVISION");
    let content;
    try { content = verifyRecoveryMessageContent(message!.immutable_content, message!.content_hash); } catch { return fail("RECOVERY_FOLLOW_UP_CHANGED"); }
    if (!matchesRecoveryMessageApproval(content, { ...input, version: "recovery-message-command.v1", action: "approve", messageId, expectedRevision: input.expectedMessageRevision })) fail("RECOVERY_FOLLOW_UP_CHANGED");
    // The first approval resolves the follow-up's own due Decision; after a revocation, a fresh approval makes a fresh Decision, never a second due one.
    return { message: message!, dueDecisionId: facts.due && !facts.dueResolved ? facts.dueDecisionId : null };
  }

  // ---- the answer ----------------------------------------------------------------------------------------------------------------------------

  private async state(db: TenantTransaction, tenantId: string, caseId: string, messages: RecoveryMessageState): Promise<RecoveryFollowUpState> {
    const rows = (await db.$client.query<FollowUpRow>("SELECT * FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$2 ORDER BY created_at,id", [tenantId, caseId])).rows;
    const events = (await db.$client.query<EventRow>("SELECT follow_up_id,revision,kind,created_at FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND case_id=$2 ORDER BY follow_up_id,revision", [tenantId, caseId])).rows;
    const links = (await db.$client.query<{ follow_up_id: string; attempt: number; message_id: string }>(
      "SELECT follow_up_id,attempt,message_id FROM app.recovery_follow_up_reminder WHERE tenant_id=$1 AND case_id=$2 ORDER BY follow_up_id,attempt", [tenantId, caseId])).rows;
    const jobId = messages.jobId;
    const run = await this.activeRun(db, tenantId, jobId);
    const views: RecoveryFollowUpView[] = [];
    for (const row of rows) {
      const facts = await this.factsOf(db, tenantId, row);
      const caseFacts = (await db.$client.query<{ reopened: boolean }>("SELECT reopened FROM app.recovery_follow_up_case_facts($1,$2,$3)", [tenantId, caseId, row.case_event_sequence])).rows[0]!;
      const own = links.filter(link => link.follow_up_id === row.id);
      const newest = own.at(-1) ?? null;
      const message = newest ? messages.messages.find(item => item.id === newest.message_id) ?? null : null;
      const status: RecoveryMessageStatus | null = message?.status ?? null;
      // The database reports the first reason a follow-up ended (its cancellation, then the first ending case fact, then an archived run);
      // the displayed state reads it back as the one flag it came from, so SQL and the pure rules cannot disagree.
      const shown = deriveRecoveryFollowUpState({
        cancelled: facts.stop === "cancelled", caseStop: (facts.stop === "case_cancelled" || facts.stop === "case_disputed" || facts.stop === "case_settled" ? facts.stop : null) as RecoveryFollowUpCaseStop | null,
        runArchived: facts.stop === "run_archived", due: facts.due, reminder: status ? { status } : null,
      });
      const history = events.filter(event => event.follow_up_id === row.id).map(event => ({ revision: Number(event.revision), kind: event.kind, at: new Date(event.created_at).toISOString() }));
      views.push({
        id: row.id, revision: facts.revision, state: shown.state, label: shown.label, stopReason: shown.stopReason, reopened: caseFacts.reopened && shown.state === "stopped",
        createdTick: Number(row.created_tick), dueTick: Number(row.due_tick), fixtureVersion: RECOVERY_FOLLOW_UP_FIXTURE_VERSION, owner: { kind: RECOVERY_FOLLOW_UP_OWNER, runId: row.run_id },
        sourceMessageId: row.source_message_id, caseRevision: Number(row.case_revision), changedSinceReview: Number(row.case_revision) !== messages.readiness.caseRevision,
        dueDecision: facts.dueDecisionId ? { id: facts.dueDecisionId, resolved: facts.dueResolved } : null,
        reminder: message && newest ? {
          messageId: message.id, attempt: Number(newest.attempt), status: message.status, label: RECOVERY_MESSAGE_STATUS_LABELS[message.status], revision: message.revision, changedSinceReview: message.changedSinceReview,
          caseRevision: message.message.caseRevision, amountPence: message.message.amountPence, recipient: message.message.recipient, body: message.message.body, contentHash: message.message.contentHash, packId: message.message.packId,
        } : null,
        newSimulatedMessages: own.filter(link => messages.sink.some(item => item.messageId === link.message_id)).length,
        history,
      });
    }
    const total = views.reduce((sum, view) => sum + view.newSimulatedMessages, 0);
    // What scheduling would meet right now, first reason first.
    const source = await this.sourceMessage(db, tenantId, caseId);
    // A follow-up needs only a synthetic case with something outstanding; a stale evidence pack is for the reminder's preview to ask about, not for scheduling.
    const snapshot = (await db.$client.query<{ synthetic: boolean; environment: string; outstanding_pence: string }>(
      "SELECT synthetic,environment,outstanding_pence FROM app.recovery_message_case_snapshot($1,$2,$3)", [tenantId, jobId, caseId])).rows[0];
    let reason: RecoveryFollowUpState["scheduling"]["reason"] = null;
    if (!source || !source.delivered) reason = "MESSAGE_NOT_DELIVERED";
    else if (!snapshot || !snapshot.synthetic || snapshot.environment !== "synthetic_demo" || Number(snapshot.outstanding_pence) <= 0) reason = "CASE_NOT_ELIGIBLE";
    else if (await this.liveFollowUp(db, tenantId, caseId)) reason = "ALREADY_ACTIVE";
    else if (!run) reason = "RUN_REQUIRED";
    else if (run.tick + RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS > RECOVERY_FOLLOW_UP_CLOCK_LIMIT) reason = "CLOCK_EXHAUSTED";
    return {
      version: RECOVERY_FOLLOW_UP_RESPONSE_VERSION, caseId, jobId,
      run: run ? { id: run.id, fakeClockTick: run.tick, clockLimit: RECOVERY_FOLLOW_UP_CLOCK_LIMIT, archived: false } : null,
      scheduling: { eligible: reason === null, reason, sourceMessageId: source?.id ?? null, caseRevision: messages.readiness.caseRevision },
      followUps: views, latest: views.at(-1) ?? null, newSimulatedMessages: total, realExternalActions: 0, environment: "synthetic_demo",
    };
  }
}
