import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { PracticeAccessError, RecoveryFollowUpError, RecoveryMessageError } from "@jobguard/db";
import { RecoveryFollowUpApplication, recoveryFollowUpFailure } from "./recovery-follow-up.application.js";

const repository = vi.hoisted(() => ({ read: vi.fn(), schedule: vi.fn(), advanceTime: vi.fn(), openReview: vi.fn(), approveReminder: vi.fn(), cancel: vi.fn(), membership: vi.fn(), sandboxAdvance: vi.fn() }));
vi.mock("@jobguard/db", async original => ({
  ...(await original<typeof import("@jobguard/db")>()),
  RecoveryMessageRepository: class {},
  RecoveryFollowUpRepository: class {
    read = repository.read; schedule = repository.schedule; advanceTime = repository.advanceTime; openReview = repository.openReview; approveReminder = repository.approveReminder; cancel = repository.cancel;
  },
  SandboxRepository: class { advance = repository.sandboxAdvance; },
}));
const id = (n: number) => `29000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sessionId = id(1), caseId = id(2), followUpId = id(3), commandId = id(4), packId = id(5), membershipId = id(6), messageId = id(7), strangerId = id(99);
const sessionQuery = vi.fn();
const pool = { query: sessionQuery, connect: async () => ({ query: repository.membership, release: vi.fn() }) } as unknown as Pool;
const hash = "a".repeat(64);
const V = "recovery-follow-up-command.v1";
const state = { version: "recovery-follow-up-response.v1", caseId, followUps: [], latest: null, newSimulatedMessages: 0, realExternalActions: 0, environment: "synthetic_demo" };
const schedule = { version: V, action: "schedule", commandId, sourceMessageId: messageId, expectedCaseRevision: 2 };
const advance = { version: V, action: "advance_time", commandId, followUpId };
const review = { version: V, action: "open_review", commandId, followUpId, expectedRevision: 2, expectedCaseRevision: 2, packId };
const approve = { version: V, action: "approve_reminder", commandId, followUpId, expectedRevision: 3, messageId, expectedMessageRevision: 1, recipient: "practice-customer@example.invalid", body: "Practice message", amountPence: 32000, packId, contentHash: hash };
const cancel = { version: V, action: "cancel", commandId, followUpId, expectedRevision: 2 };
const actor = { membershipId, actorRef: `membership:${membershipId}` };

describe("recovery follow-up API boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    repository.membership.mockResolvedValue({ rows: [{ id: membershipId }] });
    sessionQuery.mockImplementation(async (_sql, values) => ({ rows: values[0] === createHash("sha256").update(sessionId).digest("hex") || values[0] === createHash("sha256").update(strangerId).digest("hex")
      ? [{ tenant_id: id(10), membership_id: membershipId, identity_user_id: id(11) }] : [] }));
    for (const method of [repository.read, repository.schedule, repository.advanceTime, repository.openReview, repository.approveReminder, repository.cancel]) method.mockResolvedValue(state);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["production_billing", "pilot_no_charge", "provider_sandbox"])("refuses the synthetic follow-up seam in %s before any database access", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    const app = new RecoveryFollowUpApplication(pool);
    await expect(app.read(sessionId, caseId)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(app.schedule(sessionId, caseId, schedule)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(app.command(sessionId, caseId, followUpId, advance)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(repository.membership).not.toHaveBeenCalled();
    for (const method of [repository.schedule, repository.advanceTime, repository.approveReminder]) expect(method).not.toHaveBeenCalled();
  });

  it("refuses missing or malformed sessions before touching persisted state", async () => {
    const app = new RecoveryFollowUpApplication(pool);
    for (const session of [undefined, "forged", "not-a-uuid"]) {
      await expect(app.read(session, caseId)).rejects.toThrow("UNAUTHENTICATED");
      await expect(app.schedule(session, caseId, schedule)).rejects.toThrow("UNAUTHENTICATED");
      await expect(app.command(session, caseId, followUpId, advance)).rejects.toThrow("UNAUTHENTICATED");
    }
    expect(repository.read).not.toHaveBeenCalled(); expect(repository.advanceTime).not.toHaveBeenCalled();
  });

  it("derives the actor from the verified membership, never from the request, and routes each action to its own repository method", async () => {
    const app = new RecoveryFollowUpApplication(pool);
    await app.schedule(sessionId, caseId, schedule);
    expect(repository.schedule).toHaveBeenCalledWith(expect.anything(), caseId, schedule, actor);
    await app.command(sessionId, caseId, followUpId, review);
    expect(repository.openReview).toHaveBeenCalledWith(expect.anything(), caseId, review, actor);
    await app.command(sessionId, caseId, followUpId, approve);
    expect(repository.approveReminder).toHaveBeenCalledWith(expect.anything(), caseId, approve, actor);
    await app.command(sessionId, caseId, followUpId, cancel);
    expect(repository.cancel).toHaveBeenCalledWith(expect.anything(), caseId, cancel, actor);
    await expect(app.schedule(id(98), caseId, schedule)).rejects.toThrow("UNAUTHENTICATED");
    expect(repository.schedule).toHaveBeenCalledTimes(1);
  });

  it("moves the practice clock only through SBOX-2's own advance on the caller's session", async () => {
    const app = new RecoveryFollowUpApplication(pool);
    await app.command(sessionId, caseId, followUpId, advance);
    expect(repository.advanceTime).toHaveBeenCalledWith(expect.anything(), caseId, advance, actor, expect.any(Function));
    const move = repository.advanceTime.mock.calls[0]![4] as (runId: string, command: string) => Promise<unknown>;
    await move(id(20), commandId);
    expect(repository.sandboxAdvance).toHaveBeenCalledWith(sessionId, id(20), commandId);
  });

  it("rejects invented authority, a real recipient, a due time, a wall-clock time and a path that disagrees with the body", async () => {
    const app = new RecoveryFollowUpApplication(pool);
    for (const extra of [{ tenantId: id(9) }, { actorRef: "forged" }, { environment: "production" }, { mode: "live" }, { approved: true }, { dueTick: 0 }, { now: "2026-10-09T00:00:00Z" }]) {
      await expect(app.schedule(sessionId, caseId, { ...schedule, ...extra })).rejects.toThrow();
      for (const command of [advance, review, approve, cancel]) await expect(app.command(sessionId, caseId, followUpId, { ...command, ...extra })).rejects.toThrow();
    }
    await expect(app.command(sessionId, caseId, followUpId, { ...approve, recipient: "real.person@gmail.com" })).rejects.toThrow();
    await expect(app.command(sessionId, caseId, id(8), advance)).rejects.toThrow();
    await expect(app.command(sessionId, caseId, followUpId, { ...advance, action: "send_now" })).rejects.toThrow();
    await expect(app.command(sessionId, caseId, followUpId, schedule)).rejects.toThrow();
    for (const method of [repository.schedule, repository.advanceTime, repository.openReview, repository.approveReminder, repository.cancel]) expect(method).not.toHaveBeenCalled();
  });

  it("hides a nonexistent or foreign case or follow-up behind the same practice NOT_FOUND", async () => {
    const app = new RecoveryFollowUpApplication(pool);
    repository.cancel.mockRejectedValue(new RecoveryFollowUpError("RECOVERY_FOLLOW_UP_NOT_FOUND"));
    await expect(app.command(sessionId, caseId, followUpId, cancel)).rejects.toEqual(new PracticeAccessError("NOT_FOUND"));
    repository.read.mockRejectedValue(new RecoveryMessageError("RECOVERY_MESSAGE_NOT_FOUND"));
    await expect(app.read(sessionId, caseId)).rejects.toEqual(new PracticeAccessError("NOT_FOUND"));
  });
});

const actions = ["read", "schedule", "advance_time", "open_review", "approve_reminder", "cancel"] as const;
describe("SBOX recovery-follow-up ownership for every action", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); });
  afterEach(() => vi.unstubAllEnvs());
  const commands = { advance_time: advance, open_review: review, approve_reminder: approve, cancel } as const;
  const invoke = (action: typeof actions[number], session: string | undefined) => {
    const app = new RecoveryFollowUpApplication(pool);
    if (action === "read") return app.read(session, caseId);
    if (action === "schedule") return app.schedule(session, caseId, schedule);
    return app.command(session, caseId, followUpId, commands[action]);
  };
  it.each(actions)("%s hides another session's case just like a missing case", async action => {
    sessionQuery.mockResolvedValue({ rows: [{ tenant_id: id(10), membership_id: membershipId, identity_user_id: id(11) }] });
    repository.membership.mockResolvedValue({ rows: [] }); // immutable ownership lookup has no match
    await expect(invoke(action, strangerId)).rejects.toEqual(new PracticeAccessError("NOT_FOUND"));
    for (const method of [repository.read, repository.schedule, repository.advanceTime, repository.openReview, repository.approveReminder, repository.cancel, repository.sandboxAdvance]) expect(method).not.toHaveBeenCalled();
    expect(repository.membership).toHaveBeenCalledWith(expect.stringContaining("practice_session_digest=$3"), [id(10), caseId, createHash("sha256").update(strangerId).digest("hex")]);
  });
  it.each(actions)("%s refuses a missing session before any database access", async action => {
    await expect(invoke(action, undefined)).rejects.toEqual(new PracticeAccessError("UNAUTHENTICATED"));
    expect(sessionQuery).not.toHaveBeenCalled(); expect(repository.membership).not.toHaveBeenCalled();
    for (const method of [repository.read, repository.schedule, repository.advanceTime, repository.openReview, repository.approveReminder, repository.cancel]) expect(method).not.toHaveBeenCalled();
  });
});

describe("recovery follow-up failure mapping", () => {
  it.each([
    ["RECOVERY_FOLLOW_UP_NOT_FOUND", 404], ["RECOVERY_FOLLOW_UP_FORBIDDEN", 403],
    ["RECOVERY_FOLLOW_UP_RUN_REQUIRED", 409], ["RECOVERY_FOLLOW_UP_RUN_ARCHIVED", 409], ["RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED", 409], ["RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED", 409],
    ["RECOVERY_FOLLOW_UP_CASE_NOT_ELIGIBLE", 409], ["RECOVERY_FOLLOW_UP_CHANGED", 409], ["RECOVERY_FOLLOW_UP_ALREADY_ACTIVE", 409], ["RECOVERY_FOLLOW_UP_STALE_REVISION", 409],
    ["RECOVERY_FOLLOW_UP_COMMAND_CONFLICT", 409], ["RECOVERY_FOLLOW_UP_STOPPED", 409], ["RECOVERY_FOLLOW_UP_NOT_DUE", 409], ["RECOVERY_FOLLOW_UP_REMINDER_REQUIRED", 409],
    ["RECOVERY_FOLLOW_UP_REMINDER_APPROVED", 409], ["RECOVERY_FOLLOW_UP_COMPLETE", 409],
  ] as const)("keeps the typed code %s as HTTP %i", (code, status) => {
    expect(recoveryFollowUpFailure(new RecoveryFollowUpError(code))).toEqual({ status, code });
    expect(recoveryFollowUpFailure(new Error(code))).toEqual({ status, code });
  });
  it("keeps an M4-5-S refusal made while previewing the reminder as that message's own code", () => {
    expect(recoveryFollowUpFailure(new RecoveryMessageError("RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED"))).toEqual({ status: 409, code: "RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED" });
    expect(recoveryFollowUpFailure(new RecoveryMessageError("RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE"))).toEqual({ status: 409, code: "RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE" });
  });
  it("maps malformed commands to a fixed INVALID_COMMAND 400 and anything unrecognised to a fixed INTERNAL_ERROR 500 without its text", () => {
    expect(recoveryFollowUpFailure(new ZodError([]))).toEqual({ status: 400, code: "INVALID_COMMAND" });
    expect(recoveryFollowUpFailure(new SyntaxError("Unexpected token } in JSON at position 41"))).toEqual({ status: 400, code: "INVALID_COMMAND" });
    for (const error of [new Error("connect ECONNREFUSED 10.0.0.5:5432"), Object.assign(new Error("permission denied for table recovery_follow_up"), { code: "42501" }), new Error("RECOVERY_FOLLOW_UP_SOMETHING_NEW"), "a thrown string", undefined]) {
      expect(recoveryFollowUpFailure(error)).toEqual({ status: 500, code: "INTERNAL_ERROR" });
    }
  });
});
