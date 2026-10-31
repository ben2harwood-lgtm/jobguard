import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PracticeRecoveryTimelineActivities } from "./recovery-timeline.activities.js";

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), command: vi.fn(), due: vi.fn(), material: vi.fn() }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { case = mocks.access; } }));
vi.mock("./recovery-follow-up.application.js", () => ({ RecoveryFollowUpApplication: class { read = mocks.read; command = mocks.command; } }));
vi.mock("@jobguard/db", () => ({
  RecoveryFollowUpRepository: class { signalDue = mocks.due; }, RecoveryMessageRepository: class {}, practiceMaterialPool: mocks.material,
}));
const id = (n: number) => `29000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ref = { tenantId: id(1), jobId: id(2), caseId: id(3), runId: id(4), followUpId: id(5) };
const followUp = () => ({ id: ref.followUpId, revision: 2, owner: { runId: ref.runId }, stopReason: null, dueDecision: null });
const state = () => ({ jobId: ref.jobId, run: { id: ref.runId, archived: false }, followUps: [followUp()] });
const pool = {} as Pool;
const session = vi.fn(async () => "server-only-session");
const create = (env = "synthetic_demo") => new PracticeRecoveryTimelineActivities(pool, session, env);
const activity = (kind: "timer" | "builder_response" | "evidence_complete" | "cancel" | "close" = "timer") => ({ ref, kind, commandId: id(8) });

describe("M4-6 activities reuse authorized application services", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.access.mockResolvedValue({ context: { tenantId: ref.tenantId }, digest: "server-only-digest" });
    mocks.read.mockResolvedValue(state()); mocks.command.mockResolvedValue(state()); mocks.due.mockResolvedValue(1);
  });
  it("defaults off, refuses production before resolving a session", async () => {
    for (const adapter of [new PracticeRecoveryTimelineActivities(pool, session), create("production")]) {
      await expect(adapter.execute(activity())).rejects.toThrow("DISABLED");
    }
    expect(session).not.toHaveBeenCalled();
  });
  it("a timer evaluates persisted due facts only; no clock advance, approval, send or money command", async () => {
    mocks.read.mockResolvedValueOnce(state()).mockResolvedValueOnce({ ...state(), followUps: [{ ...followUp(), dueDecision: { id: id(9) } }] });
    await expect(create().execute(activity())).resolves.toBe("review");
    expect(mocks.due).toHaveBeenCalledExactlyOnceWith({ tenantId: ref.tenantId }, ref.runId);
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.material).toHaveBeenCalledWith(pool, "server-only-digest");
  });
  it.each(["tenantId", "jobId", "caseId", "runId", "followUpId"])("wrong %s never evaluates or cancels", async field => {
    if (field === "caseId") mocks.access.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(create().execute({ ...activity(), ref: { ...ref, [field]: id(99) } })).rejects.toThrow();
    expect(mocks.due).not.toHaveBeenCalled(); expect(mocks.command).not.toHaveBeenCalled();
  });
  it.each(["builder_response", "evidence_complete"] as const)("%s only reads current validated facts", async kind => {
    await expect(create().execute(activity(kind))).resolves.toBe("waiting");
    expect(mocks.due).not.toHaveBeenCalled(); expect(mocks.command).not.toHaveBeenCalled();
  });
  it.each(["cancel", "close"] as const)("%s calls the existing idempotent cancel command with current revision", async kind => {
    await expect(create().execute(activity(kind))).resolves.toBe("stopped");
    expect(mocks.command).toHaveBeenCalledExactlyOnceWith("server-only-session", ref.caseId, ref.followUpId, {
      version: "recovery-follow-up-command.v1", action: "cancel", commandId: id(8), followUpId: ref.followUpId, expectedRevision: 2,
    });
    expect(mocks.due).not.toHaveBeenCalled();
  });
  it("revoked membership/consent prevents commands even after a successful wakeup", async () => {
    await create().execute(activity());
    mocks.access.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(create().execute(activity("cancel"))).rejects.toThrow();
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("archival/cancellation and reopened old intents stay stopped", async () => {
    for (const s of [{ ...state(), run: { id: ref.runId, archived: true } },
      { ...state(), followUps: [{ ...followUp(), stopReason: "case_settled" }] }]) {
      mocks.read.mockResolvedValue(s);
      await expect(create().execute(activity())).resolves.toBe("stopped");
    }
    expect(mocks.due).not.toHaveBeenCalled();
  });
});
