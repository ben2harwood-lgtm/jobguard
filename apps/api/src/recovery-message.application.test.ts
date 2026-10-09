import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { PracticeAccessError, RecoveryMessageError } from "@jobguard/db";
import { RecoveryMessageApplication } from "./recovery-message.application.js";

const repository = vi.hoisted(() => ({ read: vi.fn(), preview: vi.fn(), command: vi.fn(), membership: vi.fn() }));
vi.mock("@jobguard/db", async original => ({
  ...(await original<typeof import("@jobguard/db")>()),
  RecoveryMessageRepository: class { read = repository.read; preview = repository.preview; command = repository.command; },
}));
const id = (n: number) => `19000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sessionId = id(1), caseId = id(2), messageId = id(3), commandId = id(4), packId = id(5), membershipId = id(6);
const strangerId = id(99);
const sessionQuery = vi.fn();
const pool = { query: sessionQuery, connect: async () => ({ query: repository.membership, release: vi.fn() }) } as unknown as Pool;
const hash = "a".repeat(64);
const state = { caseId, jobId: id(7), messages: [], latest: null, sink: [], sinkCount: 0, realExternalActions: 0, environment: "synthetic_demo" };
const preview = { version: "recovery-message-preview.v1", commandId, expectedCaseRevision: 1, packId };
const approve = { version: "recovery-message-command.v1", commandId, action: "approve", messageId, expectedRevision: 1, recipient: "practice-customer@example.invalid", body: "Practice message", amountPence: 32000, packId, contentHash: hash };

describe("recovery message API boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    repository.membership.mockResolvedValue({ rows: [{ id: membershipId }] });
    sessionQuery.mockImplementation(async (_sql, values) => ({ rows: values[0] === createHash("sha256").update(sessionId).digest("hex") || values[0] === createHash("sha256").update(strangerId).digest("hex")
      ? [{ tenant_id: id(10), membership_id: membershipId, identity_user_id: id(11) }] : [] }));
    for (const method of [repository.read, repository.preview, repository.command]) method.mockResolvedValue(state);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["production_billing", "pilot_no_charge", "provider_sandbox"])("refuses the synthetic message seam in %s before any database access", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    const app = new RecoveryMessageApplication(pool);
    await expect(app.read(sessionId, caseId)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(app.preview(sessionId, caseId, preview)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(app.command(sessionId, caseId, messageId, approve)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(repository.membership).not.toHaveBeenCalled();
    expect(repository.preview).not.toHaveBeenCalled();
  });

  it("refuses missing or malformed sessions before touching persisted state", async () => {
    const app = new RecoveryMessageApplication(pool);
    for (const session of [undefined, "forged", "not-a-uuid"]) {
      await expect(app.read(session, caseId)).rejects.toThrow("UNAUTHENTICATED");
      await expect(app.command(session, caseId, messageId, approve)).rejects.toThrow("UNAUTHENTICATED");
    }
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.command).not.toHaveBeenCalled();
  });

  it("denies a revoked or missing owner membership", async () => {
    sessionQuery.mockResolvedValue({ rows: [] });
    const app = new RecoveryMessageApplication(pool);
    await expect(app.read(sessionId, caseId)).rejects.toThrow("UNAUTHENTICATED");
    await expect(app.preview(sessionId, caseId, preview)).rejects.toThrow("UNAUTHENTICATED");
    expect(repository.read).not.toHaveBeenCalled();
  });

  it("derives the actor from the verified membership, never from the request, and labels the environment", async () => {
    const app = new RecoveryMessageApplication(pool);
    const response = await app.preview(sessionId, caseId, preview);
    expect(repository.preview).toHaveBeenCalledWith(expect.anything(), caseId, preview, { membershipId, actorRef: `membership:${membershipId}` });
    expect(response).toMatchObject({ version: "recovery-message-response.v1", environment: "synthetic_demo", realExternalActions: 0 });
    await expect(app.preview(id(98), caseId, preview)).rejects.toThrow("UNAUTHENTICATED");
    expect(repository.preview).toHaveBeenCalledTimes(1);
    await app.command(sessionId, caseId, messageId, approve);
    expect(repository.command).toHaveBeenCalledWith(expect.anything(), caseId, approve, { membershipId, actorRef: `membership:${membershipId}` });
  });

  it("rejects invented authority, a real recipient and a path that disagrees with the body", async () => {
    const app = new RecoveryMessageApplication(pool);
    for (const extra of [{ tenantId: id(9) }, { actorRef: "forged" }, { environment: "production" }, { mode: "live" }, { approved: true }]) {
      await expect(app.preview(sessionId, caseId, { ...preview, ...extra })).rejects.toThrow();
      await expect(app.command(sessionId, caseId, messageId, { ...approve, ...extra })).rejects.toThrow();
    }
    await expect(app.command(sessionId, caseId, messageId, { ...approve, recipient: "real.person@gmail.com" })).rejects.toThrow();
    await expect(app.command(sessionId, caseId, id(8), approve)).rejects.toThrow();
    await expect(app.command(sessionId, caseId, messageId, { ...approve, action: "send_for_real" })).rejects.toThrow();
    expect(repository.preview).not.toHaveBeenCalled();
    expect(repository.command).not.toHaveBeenCalled();
  });

  it("hides a nonexistent or foreign message behind the same practice NOT_FOUND", async () => {
    repository.command.mockRejectedValue(new RecoveryMessageError("RECOVERY_MESSAGE_NOT_FOUND"));
    const app = new RecoveryMessageApplication(pool);
    await expect(app.command(sessionId, caseId, messageId, approve)).rejects.toEqual(new PracticeAccessError("NOT_FOUND"));
  });

  it("passes only the closed, versioned delivery outcomes", async () => {
    const app = new RecoveryMessageApplication(pool);
    const advance = { version: "recovery-message-command.v1", commandId, action: "advance", messageId, expectedRevision: 2, outcome: "success" };
    for (const outcome of ["success", "response_lost", "no_response", "definite_failure"]) await app.command(sessionId, caseId, messageId, { ...advance, outcome });
    expect(repository.command).toHaveBeenCalledTimes(4);
    await expect(app.command(sessionId, caseId, messageId, { ...advance, outcome: "delivered_for_real" })).rejects.toThrow();
    expect(repository.command).toHaveBeenCalledTimes(4);
  });
});

const actions = ["read/list", "draft", "approve", "advance", "reconcile", "revoke"] as const;
describe("SBOX recovery-message ownership for every action", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); });
  afterEach(() => vi.unstubAllEnvs());
  const invoke = (action: typeof actions[number], session: string | undefined) => {
    const app = new RecoveryMessageApplication(pool);
    if (action === "read/list") return app.read(session, caseId);
    if (action === "draft") return app.preview(session, caseId, preview);
    return app.command(session, caseId, messageId, action === "approve" ? approve : {
      version: "recovery-message-command.v1", commandId, messageId, expectedRevision: 2, action,
      ...(action === "advance" ? { outcome: "success" } : {}),
    });
  };
  it.each(actions)("%s hides another session's case just like a missing case", async action => {
    sessionQuery.mockResolvedValue({ rows: [{ tenant_id: id(10), membership_id: membershipId, identity_user_id: id(11) }] });
    repository.membership.mockResolvedValue({ rows: [] }); // immutable ownership lookup has no match
    await expect(invoke(action, strangerId)).rejects.toEqual(new PracticeAccessError("NOT_FOUND"));
    expect(repository.read).not.toHaveBeenCalled(); expect(repository.preview).not.toHaveBeenCalled(); expect(repository.command).not.toHaveBeenCalled();
    expect(repository.membership).toHaveBeenCalledWith(expect.stringContaining("practice_session_digest=$3"), [id(10), caseId, createHash("sha256").update(strangerId).digest("hex")]);
  });
  it.each(actions)("%s refuses a missing session before any database access", async action => {
    await expect(invoke(action, undefined)).rejects.toEqual(new PracticeAccessError("UNAUTHENTICATED"));
    expect(sessionQuery).not.toHaveBeenCalled(); expect(repository.membership).not.toHaveBeenCalled();
    expect(repository.read).not.toHaveBeenCalled(); expect(repository.preview).not.toHaveBeenCalled(); expect(repository.command).not.toHaveBeenCalled();
  });
});
