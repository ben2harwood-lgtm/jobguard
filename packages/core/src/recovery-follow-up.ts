import { z } from "zod";
import { RECOVERY_MESSAGE_STATUSES, RECOVERY_MESSAGE_STATUS_LABELS, recoveryMessageRecipientV1, type RecoveryMessageStatus } from "./recovery-message.js";

/**
 * M4-6-S: a persisted, practice-only follow-up for a delivered recovery message.
 *
 * Pure domain code. The follow-up lives on the practice run's own fake clock (SBOX-2's `fake_clock_tick`); wall-clock time is never
 * read to decide whether anything is due. Passing the due tick can produce exactly one thing: a due review item (a pending Decision).
 * It cannot approve, authorize, queue or send anything. Only a builder's explicit approval of the exact reminder does that, through the
 * same Decision, authorization and outbox path every M4-5-S message uses.
 */
/** The explicit, versioned synthetic due interval. It is a fixture value for the practice clock, not a deadline from any statute or contract. */
export const RECOVERY_FOLLOW_UP_FIXTURE_VERSION = "recovery-follow-up-fixture.v1" as const;
export const RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS = 1 as const;
/** SBOX-2's practice clock is bounded: it ticks 0..3 and stops. A follow-up that could never come due is refused when it is scheduled. */
export const RECOVERY_FOLLOW_UP_CLOCK_LIMIT = 3 as const;
/** The one persisted scheduling owner the synthetic slice knows. A workflow engine is a later, separate owner and is not representable here. */
export const RECOVERY_FOLLOW_UP_OWNER = "practice_fake_clock" as const;
export const RECOVERY_FOLLOW_UP_DUE_PERIOD = 1 as const;
export const RECOVERY_FOLLOW_UP_DECISION_SUBJECT = "recovery_follow_up" as const;
export const RECOVERY_FOLLOW_UP_RESPONSE_VERSION = "recovery-follow-up-response.v1" as const;
export const RECOVERY_FOLLOW_UP_COMMAND_VERSION = "recovery-follow-up-command.v1" as const;

export class RecoveryFollowUpClockExhausted extends Error {
  readonly code = "RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED";
  constructor() { super("RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED"); this.name = "RecoveryFollowUpClockExhausted"; }
}

/** The tick at which a follow-up scheduled at `createdTick` comes due. */
export function followUpDueTick(createdTick: number): number {
  const tick = z.number().int().safe().nonnegative().parse(createdTick);
  const due = tick + RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS;
  if (due > RECOVERY_FOLLOW_UP_CLOCK_LIMIT) throw new RecoveryFollowUpClockExhausted();
  return due;
}

/** The due Decision's subject: one per intent and due period, so a repeated signal can only meet the same one. */
export const followUpDecisionSubjectRef = (followUpId: string, period: number = RECOVERY_FOLLOW_UP_DUE_PERIOD): string => `${followUpId}:${period}`;

/**
 * What the passing of practice time can do. The vocabulary is closed on purpose: it has no word for approval, consent, authorization or
 * sending, so no caller can read elapsed time as any of them.
 */
export type FollowUpClockOutcome = "wait" | "due_review" | "none";
export function evaluateRecoveryFollowUpClock(input: Readonly<{ tick: number; dueTick: number; due: boolean; stopped: boolean; runArchived: boolean }>): FollowUpClockOutcome {
  if (input.due || input.stopped || input.runArchived) return "none";
  return input.tick >= input.dueTick ? "due_review" : "wait";
}

// ---- Facts that end a follow-up (Q3, coordinator ruling round 5, verified against recovery-case.ts and 0034 `event_type`) ----------------

export const RECOVERY_FOLLOW_UP_STOP_REASONS = ["cancelled", "case_cancelled", "case_disputed", "case_settled", "run_archived"] as const;
export type RecoveryFollowUpStopReason = (typeof RECOVERY_FOLLOW_UP_STOP_REASONS)[number];
export type RecoveryFollowUpCaseStop = Extract<RecoveryFollowUpStopReason, "case_cancelled" | "case_disputed" | "case_settled">;

/** M4-1-S case events that end a follow-up: dispute = `dispute`; settlement = `close_recovered`; cancel = `close_no_recovery` / `write_off` / `prevent`. */
export const RECOVERY_FOLLOW_UP_CASE_STOP_EVENTS: Readonly<Record<string, RecoveryFollowUpCaseStop>> = Object.freeze({
  dispute: "case_disputed", close_recovered: "case_settled", close_no_recovery: "case_cancelled", write_off: "case_cancelled", prevent: "case_cancelled",
});
/** Reopened = `resume_pursuit` or `reverse_landing` after one of the events above. A reopened case never revives the stopped intent. */
export const RECOVERY_FOLLOW_UP_REOPEN_EVENTS = ["resume_pursuit", "reverse_landing"] as const;

/**
 * The case facts that matter to a follow-up reviewed after case event `afterSequence`: the earliest ending event since then, and whether
 * the case was reopened after it. The database mirrors this exactly (`app.recovery_follow_up_case_facts`); a test runs both on every event type.
 */
export function followUpCaseFacts(events: ReadonlyArray<Readonly<{ sequence: number; eventType: string }>>, afterSequence: number): { stopReason: RecoveryFollowUpCaseStop | null; reopened: boolean } {
  const later = events.filter(event => event.sequence > afterSequence).sort((a, b) => a.sequence - b.sequence);
  const stop = later.find(event => Object.hasOwn(RECOVERY_FOLLOW_UP_CASE_STOP_EVENTS, event.eventType));
  if (!stop) return { stopReason: null, reopened: false };
  const reopened = later.some(event => event.sequence > stop.sequence && (RECOVERY_FOLLOW_UP_REOPEN_EVENTS as readonly string[]).includes(event.eventType));
  return { stopReason: RECOVERY_FOLLOW_UP_CASE_STOP_EVENTS[stop.eventType]!, reopened };
}

// ---- The displayed state ---------------------------------------------------------------------------------------------------------------

export const RECOVERY_FOLLOW_UP_STATES = [
  "waiting", "review_reminder", "approval_needed", "stopped", "reminder_queued", "reminder_in_progress", "outcome_unknown", "delivery_retryable", "delivery_failed", "delivered",
] as const;
export type RecoveryFollowUpStateKind = (typeof RECOVERY_FOLLOW_UP_STATES)[number];
export const RECOVERY_FOLLOW_UP_LABELS: Readonly<Record<RecoveryFollowUpStateKind, string>> = Object.freeze({
  waiting: "Waiting for the due time",
  review_reminder: "Review reminder",
  approval_needed: "Approval needed again",
  stopped: "Stopped",
  reminder_queued: RECOVERY_MESSAGE_STATUS_LABELS.queued,
  reminder_in_progress: RECOVERY_MESSAGE_STATUS_LABELS.executing,
  outcome_unknown: RECOVERY_MESSAGE_STATUS_LABELS.outcome_unknown,
  delivery_retryable: RECOVERY_MESSAGE_STATUS_LABELS.retryable,
  delivery_failed: RECOVERY_MESSAGE_STATUS_LABELS.failed,
  delivered: RECOVERY_MESSAGE_STATUS_LABELS.simulated_delivery,
});

export type FollowUpFacts = Readonly<{
  cancelled: boolean;
  caseStop: RecoveryFollowUpCaseStop | null;
  runArchived: boolean;
  /** A due Decision exists for this intent. */
  due: boolean;
  /** The newest reminder message previewed for this intent, as M4-5-S derives its status. */
  reminder: Readonly<{ status: RecoveryMessageStatus }> | null;
}>;
export type FollowUpDisplay = { state: RecoveryFollowUpStateKind; label: string; stopReason: RecoveryFollowUpStopReason | null };

const display = (state: RecoveryFollowUpStateKind, stopReason: RecoveryFollowUpStopReason | null = null): FollowUpDisplay => ({ state, label: RECOVERY_FOLLOW_UP_LABELS[state], stopReason });

/**
 * One reading of every fact, in one order. A delivered, running or unknown effect is never hidden behind `Stopped`; anything not yet
 * an effect (a preview, a queued or retryable action, a revoked approval) is ended by a cancellation, a case fact or an archived run.
 */
export function deriveRecoveryFollowUpState(facts: FollowUpFacts): FollowUpDisplay {
  const status = facts.reminder?.status ?? null;
  if (status === "simulated_delivery") return display("delivered");
  if (status === "executing") return display("reminder_in_progress");
  if (status === "outcome_unknown") return display("outcome_unknown");
  const stopReason: RecoveryFollowUpStopReason | null = facts.cancelled ? "cancelled" : facts.caseStop ?? (facts.runArchived ? "run_archived" : null);
  if (stopReason) return display("stopped", stopReason);
  switch (status) {
    case "revoked": case "blocked": return display("approval_needed");
    case "queued": return display("reminder_queued");
    case "retryable": return display("delivery_retryable");
    case "failed": return display("delivery_failed");
    default: return facts.due ? display("review_reminder") : display("waiting");
  }
}

// ---- Commands ---------------------------------------------------------------------------------------------------------------------------

const id = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().safe().positive();
const amount = z.number().int().safe().positive().max(1_000_000_000_000);
const version = z.literal(RECOVERY_FOLLOW_UP_COMMAND_VERSION);

/** Scheduling a follow-up is itself a reviewed act: the builder names the delivered message and the case revision they reviewed. */
export const recoveryFollowUpScheduleCommandV1 = z.object({
  version, action: z.literal("schedule"), commandId: id, sourceMessageId: id, expectedCaseRevision: revision,
}).strict();
export type RecoveryFollowUpScheduleCommand = z.infer<typeof recoveryFollowUpScheduleCommandV1>;

export const recoveryFollowUpCommandV1 = z.discriminatedUnion("action", [
  z.object({ version, action: z.literal("advance_time"), commandId: id, followUpId: id }).strict(),
  z.object({ version, action: z.literal("open_review"), commandId: id, followUpId: id, expectedRevision: revision, expectedCaseRevision: revision, packId: id }).strict(),
  z.object({
    version, action: z.literal("approve_reminder"), commandId: id, followUpId: id, expectedRevision: revision, messageId: id, expectedMessageRevision: revision,
    recipient: recoveryMessageRecipientV1, body: z.string().min(1).max(2000), amountPence: amount, packId: id, contentHash: digest,
  }).strict(),
  z.object({ version, action: z.literal("cancel"), commandId: id, followUpId: id, expectedRevision: revision }).strict(),
]);
export type RecoveryFollowUpCommand = z.infer<typeof recoveryFollowUpCommandV1>;

// ---- Events and the answer --------------------------------------------------------------------------------------------------------------

export const RECOVERY_FOLLOW_UP_EVENT_KINDS = ["scheduled", "became_due", "reminder_previewed", "reminder_approved", "cancelled"] as const;
export type RecoveryFollowUpEventKind = (typeof RECOVERY_FOLLOW_UP_EVENT_KINDS)[number];
export const RECOVERY_FOLLOW_UP_EVENT_LABELS: Readonly<Record<RecoveryFollowUpEventKind, string>> = Object.freeze({
  scheduled: "Follow-up scheduled — nothing authorized",
  became_due: "Practice time reached — a reminder is ready to review",
  reminder_previewed: "Reminder previewed — nothing authorized",
  reminder_approved: "Reminder approved — this exact message only",
  cancelled: "Follow-up cancelled",
});

const view = z.object({
  id, revision: revision, state: z.enum(RECOVERY_FOLLOW_UP_STATES), label: z.string().min(1), stopReason: z.enum(RECOVERY_FOLLOW_UP_STOP_REASONS).nullable(), reopened: z.boolean(),
  createdTick: z.number().int().nonnegative(), dueTick: z.number().int().positive(), fixtureVersion: z.literal(RECOVERY_FOLLOW_UP_FIXTURE_VERSION),
  owner: z.object({ kind: z.literal(RECOVERY_FOLLOW_UP_OWNER), runId: id }).strict(),
  sourceMessageId: id, caseRevision: revision, changedSinceReview: z.boolean(),
  dueDecision: z.object({ id, resolved: z.boolean() }).strict().nullable(),
  reminder: z.object({
    messageId: id, attempt: revision, status: z.enum(RECOVERY_MESSAGE_STATUSES), label: z.string(), revision: z.number().int().nonnegative(), changedSinceReview: z.boolean(),
    caseRevision: revision, amountPence: z.number().int().nonnegative(), recipient: z.string(), body: z.string(), contentHash: digest, packId: id,
  }).strict().nullable(),
  newSimulatedMessages: z.number().int().nonnegative(),
  history: z.array(z.object({ revision, kind: z.enum(RECOVERY_FOLLOW_UP_EVENT_KINDS), at: z.string() }).strict()),
}).strict();
export type RecoveryFollowUpViewShape = z.infer<typeof view>;

export const RECOVERY_FOLLOW_UP_SCHEDULING_REASONS = ["RUN_REQUIRED", "CLOCK_EXHAUSTED", "MESSAGE_NOT_DELIVERED", "ALREADY_ACTIVE", "CASE_NOT_ELIGIBLE"] as const;
export const recoveryFollowUpStateV1 = z.object({
  version: z.literal(RECOVERY_FOLLOW_UP_RESPONSE_VERSION), caseId: id, jobId: id,
  run: z.object({ id, fakeClockTick: z.number().int().nonnegative(), clockLimit: z.literal(RECOVERY_FOLLOW_UP_CLOCK_LIMIT), archived: z.boolean() }).strict().nullable(),
  scheduling: z.object({ eligible: z.boolean(), reason: z.enum(RECOVERY_FOLLOW_UP_SCHEDULING_REASONS).nullable(), sourceMessageId: id.nullable(), caseRevision: z.number().int().nonnegative() }).strict(),
  followUps: z.array(view), latest: view.nullable(),
  newSimulatedMessages: z.number().int().nonnegative(), realExternalActions: z.literal(0), environment: z.literal("synthetic_demo"),
}).strict();
export type RecoveryFollowUpStateShape = z.infer<typeof recoveryFollowUpStateV1>;
