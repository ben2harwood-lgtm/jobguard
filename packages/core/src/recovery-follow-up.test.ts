import { describe, expect, it } from "vitest";
import {
  RECOVERY_FOLLOW_UP_CASE_STOP_EVENTS, RECOVERY_FOLLOW_UP_CLOCK_LIMIT, RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS, RECOVERY_FOLLOW_UP_FIXTURE_VERSION,
  RECOVERY_FOLLOW_UP_LABELS, RECOVERY_FOLLOW_UP_OWNER, RECOVERY_FOLLOW_UP_REOPEN_EVENTS, RECOVERY_FOLLOW_UP_STOP_REASONS,
  RECOVERY_MESSAGE_ACTION, RECOVERY_MESSAGE_STATUSES, RECOVERY_MESSAGE_STATUS_LABELS,
  deriveRecoveryFollowUpState, evaluateRecoveryFollowUpClock, followUpCaseFacts, followUpDecisionSubjectRef, followUpDueTick,
  recoveryFollowUpCommandV1, recoveryFollowUpScheduleCommandV1, recoveryFollowUpStateV1,
  type FollowUpFacts, type RecoveryMessageStatus,
} from "./index.js";

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const none: FollowUpFacts = { cancelled: false, caseStop: null, runArchived: false, due: false, reminder: null };
const withReminder = (status: RecoveryMessageStatus, over: Partial<FollowUpFacts> = {}): FollowUpFacts => ({ ...none, due: true, reminder: { status }, ...over });

describe("M4-6-S fixture and clock rules", () => {
  it("records one explicit, versioned synthetic due interval and no statutory deadline", () => {
    expect(RECOVERY_FOLLOW_UP_FIXTURE_VERSION).toBe("recovery-follow-up-fixture.v1");
    expect(RECOVERY_FOLLOW_UP_DUE_AFTER_TICKS).toBe(1);
    expect(RECOVERY_FOLLOW_UP_CLOCK_LIMIT).toBe(3);
    expect(RECOVERY_FOLLOW_UP_OWNER).toBe("practice_fake_clock");
    expect(followUpDueTick(0)).toBe(1);
    expect(followUpDueTick(2)).toBe(3);
  });

  it("refuses to schedule a due time the bounded practice clock can never reach", () => {
    expect(() => followUpDueTick(3)).toThrow("RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED");
    expect(() => followUpDueTick(-1)).toThrow();
    expect(() => followUpDueTick(1.5)).toThrow();
  });

  it("lets elapsed time produce a due review item and nothing else", () => {
    const outcomes = new Set<string>();
    for (let tick = 0; tick <= 4; tick++) for (const dueTick of [1, 2, 3]) for (const due of [false, true]) for (const stopped of [false, true]) for (const runArchived of [false, true]) {
      outcomes.add(evaluateRecoveryFollowUpClock({ tick, dueTick, due, stopped, runArchived }));
    }
    // Closed vocabulary: no outcome names an approval, an authorization, a send or consent.
    expect([...outcomes].sort()).toEqual(["due_review", "none", "wait"]);
  });

  it("is due exactly once, only at or after the due tick, and never for a stopped or archived intent", () => {
    expect(evaluateRecoveryFollowUpClock({ tick: 0, dueTick: 1, due: false, stopped: false, runArchived: false })).toBe("wait");
    expect(evaluateRecoveryFollowUpClock({ tick: 1, dueTick: 1, due: false, stopped: false, runArchived: false })).toBe("due_review");
    expect(evaluateRecoveryFollowUpClock({ tick: 3, dueTick: 1, due: false, stopped: false, runArchived: false })).toBe("due_review");
    expect(evaluateRecoveryFollowUpClock({ tick: 3, dueTick: 1, due: true, stopped: false, runArchived: false })).toBe("none");
    expect(evaluateRecoveryFollowUpClock({ tick: 3, dueTick: 1, due: false, stopped: true, runArchived: false })).toBe("none");
    expect(evaluateRecoveryFollowUpClock({ tick: 3, dueTick: 1, due: false, stopped: false, runArchived: true })).toBe("none");
  });

  it("names the due Decision by its intent and period", () => {
    expect(followUpDecisionSubjectRef(id(1))).toBe(`${id(1)}:1`);
    expect(followUpDecisionSubjectRef(id(1), 1)).toBe(`${id(1)}:1`);
  });
});

describe("M4-6-S displayed states", () => {
  it("renders the three exact card labels", () => {
    expect(RECOVERY_FOLLOW_UP_LABELS.review_reminder).toBe("Review reminder");
    expect(RECOVERY_FOLLOW_UP_LABELS.stopped).toBe("Stopped");
    expect(RECOVERY_FOLLOW_UP_LABELS.approval_needed).toBe("Approval needed again");
  });

  it("waits, then asks for review once due; time alone never leaves the review state", () => {
    expect(deriveRecoveryFollowUpState(none)).toMatchObject({ state: "waiting", label: "Waiting for the due time", stopReason: null });
    expect(deriveRecoveryFollowUpState({ ...none, due: true })).toMatchObject({ state: "review_reminder", label: "Review reminder" });
    expect(deriveRecoveryFollowUpState(withReminder("previewed"))).toMatchObject({ state: "review_reminder", label: "Review reminder" });
  });

  it("shows Stopped for a cancellation, and for each case fact that ends the follow-up", () => {
    expect(deriveRecoveryFollowUpState({ ...none, cancelled: true })).toMatchObject({ state: "stopped", label: "Stopped", stopReason: "cancelled" });
    for (const caseStop of ["case_cancelled", "case_disputed", "case_settled"] as const) {
      expect(deriveRecoveryFollowUpState({ ...none, due: true, caseStop })).toMatchObject({ state: "stopped", label: "Stopped", stopReason: caseStop });
    }
    expect(deriveRecoveryFollowUpState({ ...none, runArchived: true })).toMatchObject({ state: "stopped", stopReason: "run_archived" });
  });

  it("shows Approval needed again after a revoked or blocked reminder approval", () => {
    expect(deriveRecoveryFollowUpState(withReminder("revoked"))).toMatchObject({ state: "approval_needed", label: "Approval needed again" });
    expect(deriveRecoveryFollowUpState(withReminder("blocked"))).toMatchObject({ state: "approval_needed", label: "Approval needed again" });
  });

  it("reuses the M4-5-S wording for an approved reminder's delivery states", () => {
    for (const status of ["queued", "executing", "outcome_unknown", "retryable", "failed", "simulated_delivery"] as const) {
      expect(deriveRecoveryFollowUpState(withReminder(status)).label).toBe(RECOVERY_MESSAGE_STATUS_LABELS[status]);
    }
    expect(deriveRecoveryFollowUpState(withReminder("simulated_delivery")).state).toBe("delivered");
  });

  it("never hides a delivered, running or unknown effect behind Stopped, but stops a merely queued or retryable one", () => {
    for (const status of ["simulated_delivery", "executing", "outcome_unknown"] as const) {
      expect(deriveRecoveryFollowUpState(withReminder(status, { cancelled: true })).state).not.toBe("stopped");
      expect(deriveRecoveryFollowUpState(withReminder(status, { caseStop: "case_disputed" })).state).not.toBe("stopped");
    }
    for (const status of ["queued", "retryable", "previewed", "revoked", "blocked"] as const) {
      expect(deriveRecoveryFollowUpState(withReminder(status, { caseStop: "case_settled" })).state).toBe("stopped");
    }
  });

  it("gives every message status a state so no combination is unhandled", () => {
    for (const status of RECOVERY_MESSAGE_STATUSES) expect(deriveRecoveryFollowUpState(withReminder(status)).label).toBeTruthy();
  });
});

describe("M4-6-S case facts (Q3 mapping)", () => {
  it("maps dispute, settlement and cancellation exactly as the coordinator ruled", () => {
    expect(RECOVERY_FOLLOW_UP_CASE_STOP_EVENTS).toEqual({
      dispute: "case_disputed", close_recovered: "case_settled", close_no_recovery: "case_cancelled", write_off: "case_cancelled", prevent: "case_cancelled",
    });
    expect([...RECOVERY_FOLLOW_UP_REOPEN_EVENTS]).toEqual(["resume_pursuit", "reverse_landing"]);
    expect([...RECOVERY_FOLLOW_UP_STOP_REASONS]).toEqual(["cancelled", "case_cancelled", "case_disputed", "case_settled", "run_archived"]);
  });

  it("takes only facts after the reviewed point, earliest stop first", () => {
    const events = [
      { sequence: 1, eventType: "opened" }, { sequence: 2, eventType: "assemble_evidence" }, { sequence: 3, eventType: "close_no_recovery" },
      { sequence: 4, eventType: "dispute" }, { sequence: 5, eventType: "resume_pursuit" },
    ];
    expect(followUpCaseFacts(events, 5)).toEqual({ stopReason: null, reopened: false });
    expect(followUpCaseFacts(events, 2)).toEqual({ stopReason: "case_cancelled", reopened: true });
    expect(followUpCaseFacts(events, 3)).toEqual({ stopReason: "case_disputed", reopened: true });
    expect(followUpCaseFacts(events, 0)).toEqual({ stopReason: "case_cancelled", reopened: true });
  });

  it("calls a case reopened only by resuming or reversing AFTER it was stopped", () => {
    expect(followUpCaseFacts([{ sequence: 3, eventType: "resume_pursuit" }], 2)).toEqual({ stopReason: null, reopened: false });
    expect(followUpCaseFacts([{ sequence: 3, eventType: "reverse_landing" }], 2)).toEqual({ stopReason: null, reopened: false });
    expect(followUpCaseFacts([{ sequence: 3, eventType: "close_recovered" }, { sequence: 4, eventType: "reverse_landing" }], 2)).toEqual({ stopReason: "case_settled", reopened: true });
    expect(followUpCaseFacts([{ sequence: 3, eventType: "close_recovered" }, { sequence: 4, eventType: "resume_pursuit" }], 3)).toEqual({ stopReason: null, reopened: false });
  });

  it("ignores landings, amendments and other non-ending events", () => {
    const events = ["record_landing", "start_negotiation", "start_pursuit", "claim_amended"].map((eventType, i) => ({ sequence: i + 3, eventType }));
    expect(followUpCaseFacts(events, 2)).toEqual({ stopReason: null, reopened: false });
  });
});

describe("M4-6-S strict versioned commands", () => {
  const schedule = { version: "recovery-follow-up-command.v1", action: "schedule", commandId: id(1), sourceMessageId: id(2), expectedCaseRevision: 3 };
  const advance = { version: "recovery-follow-up-command.v1", action: "advance_time", commandId: id(3), followUpId: id(4) };
  const review = { version: "recovery-follow-up-command.v1", action: "open_review", commandId: id(5), followUpId: id(4), expectedRevision: 2, expectedCaseRevision: 3, packId: id(6) };
  const approve = {
    version: "recovery-follow-up-command.v1", action: "approve_reminder", commandId: id(7), followUpId: id(4), expectedRevision: 3, messageId: id(8), expectedMessageRevision: 1,
    recipient: "practice-customer@example.invalid", body: "Practice message — not sent.", amountPence: 32000, packId: id(6), contentHash: "a".repeat(64),
  };
  const cancel = { version: "recovery-follow-up-command.v1", action: "cancel", commandId: id(9), followUpId: id(4), expectedRevision: 2 };

  it("accepts each exact command shape", () => {
    expect(recoveryFollowUpScheduleCommandV1.parse(schedule)).toMatchObject({ action: "schedule" });
    for (const command of [advance, review, approve, cancel]) expect(recoveryFollowUpCommandV1.parse(command)).toMatchObject({ action: command.action });
  });

  it("refuses unknown, forged and cross-family fields", () => {
    for (const forged of [{ tenantId: id(50) }, { actorRef: "forged" }, { mode: "production" }, { environment: "pilot_no_charge" }, { dueTick: 0 }, { now: "2026-10-09T00:00:00Z" }, { approved: true }]) {
      expect(recoveryFollowUpScheduleCommandV1.safeParse({ ...schedule, ...forged }).success).toBe(false);
      for (const command of [advance, review, approve, cancel]) expect(recoveryFollowUpCommandV1.safeParse({ ...command, ...forged }).success).toBe(false);
    }
    expect(recoveryFollowUpCommandV1.safeParse(schedule).success).toBe(false);
    expect(recoveryFollowUpScheduleCommandV1.safeParse(advance).success).toBe(false);
  });

  it("binds the reminder approval to a real practice recipient and the exact message fields", () => {
    expect(recoveryFollowUpCommandV1.safeParse({ ...approve, recipient: "real.person@gmail.com" }).success).toBe(false);
    expect(recoveryFollowUpCommandV1.safeParse({ ...approve, contentHash: "short" }).success).toBe(false);
    expect(recoveryFollowUpCommandV1.safeParse({ ...approve, amountPence: 0 }).success).toBe(false);
    expect(RECOVERY_MESSAGE_ACTION).toBe("recovery.message.simulate");
  });
});

describe("M4-6-S response contract", () => {
  const view = {
    id: id(4), revision: 2, state: "review_reminder", label: "Review reminder", stopReason: null, reopened: false,
    createdTick: 0, dueTick: 1, fixtureVersion: RECOVERY_FOLLOW_UP_FIXTURE_VERSION, owner: { kind: "practice_fake_clock", runId: id(10) },
    sourceMessageId: id(2), caseRevision: 3, changedSinceReview: false, dueDecision: { id: id(11), resolved: false }, reminder: null, newSimulatedMessages: 0,
    history: [{ revision: 1, kind: "scheduled", at: "2026-10-09T10:00:00.000Z" }, { revision: 2, kind: "became_due", at: "2026-10-09T10:01:00.000Z" }],
  };
  const state = {
    version: "recovery-follow-up-response.v1", caseId: id(20), jobId: id(21), run: { id: id(10), fakeClockTick: 1, clockLimit: 3, archived: false },
    scheduling: { eligible: false, reason: "ALREADY_ACTIVE", sourceMessageId: id(2), caseRevision: 3 }, followUps: [view], latest: view,
    newSimulatedMessages: 0, realExternalActions: 0, environment: "synthetic_demo",
  };

  it("accepts a well-formed answer and refuses any claim of a real external action", () => {
    expect(recoveryFollowUpStateV1.safeParse(state).success).toBe(true);
    expect(recoveryFollowUpStateV1.safeParse({ ...state, realExternalActions: 1 }).success).toBe(false);
    expect(recoveryFollowUpStateV1.safeParse({ ...state, environment: "production" }).success).toBe(false);
    expect(recoveryFollowUpStateV1.safeParse({ ...state, followUps: [{ ...view, state: "approved_by_time" }] }).success).toBe(false);
  });
});
