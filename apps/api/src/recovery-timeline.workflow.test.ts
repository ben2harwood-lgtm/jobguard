import { describe, expect, it } from "vitest";
import {
  InMemoryRecoveryWorkflowRuntime, InMemoryRecoveryWorkflowStore, RECOVERY_SCHEDULING_OWNERS,
  assertRecoverySchedulingOwner, type RecoveryTimelineActivities, type TimelineActivity, type TimelineState,
} from "./recovery-timeline.workflow.js";

const id = (n: number) => `29000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ref = { tenantId: id(1), jobId: id(2), caseId: id(3), runId: id(4), followUpId: id(5) };
const signal = (kind = "timer", n = 6) => ({ version: "recovery-timeline-signal.v1", signalId: id(n), ref, kind, eventId: id(n + 100) });
function fixture() {
  let permitted = true, due = true, stopped = false, failAfterCommit = false;
  const effects = new Set<string>(), commands: TimelineActivity[] = [];
  let decisions = 0, transitions = 0;
  const activities: RecoveryTimelineActivities = { async execute(activity) {
    commands.push(activity);
    if (!permitted || JSON.stringify(activity.ref) !== JSON.stringify(ref)) throw new Error("sensitive provider/session detail");
    if (activity.kind === "cancel" || activity.kind === "close") {
      if (!stopped) { stopped = true; transitions++; }
    } else if (activity.kind === "timer" && !stopped && due && !effects.has(activity.commandId)) {
      effects.add(activity.commandId); decisions++;
    }
    if (failAfterCommit) { failAfterCommit = false; throw new Error("crash after idempotent command"); }
    return stopped ? "stopped" : decisions ? "review" : "waiting";
  } };
  const store = new InMemoryRecoveryWorkflowStore();
  const restart = () => new InMemoryRecoveryWorkflowRuntime(activities, store, "synthetic_demo");
  return { restart, store, commands, effects, decisions: () => decisions, transitions: () => transitions,
    revoke: () => { permitted = false; }, early: () => { due = false; }, due: () => { due = true; }, crash: () => { failAfterCommit = true; } };
}

describe("M4-6 dark recovery workflow", () => {
  it("refuses default/live modes before activities and rejects bodies, money, approval and hidden data", async () => {
    const f = fixture();
    expect(() => new InMemoryRecoveryWorkflowRuntime({ execute: async () => "waiting" }).signal(signal())).toThrow("DISABLED");
    expect(() => new InMemoryRecoveryWorkflowRuntime({ execute: async () => "waiting" }, f.store, "production").signal(signal())).toThrow("DISABLED");
    for (const fields of [{ body: "secret" }, { amountPence: 0 }, { amountPence: -1 }, { amountPence: 1_000_000_000_001 },
      { amountPence: 1.5 }, { approval: "approved" }, { lockedBillId: id(8) }, { finalAccountRevision: 2 }, { shadowSignalId: id(9) }]) {
      expect(() => f.restart().signal({ ...signal(), ...fields })).toThrow("INVALID_INPUT");
    }
    expect(f.commands).toHaveLength(0);
  });

  it("replays, restarts, concurrent duplicates and v1 to v2 upgrades keep one due effect and stable command ID", async () => {
    const f = fixture();
    await Promise.all([f.restart().signal(signal()), f.restart().signal(signal())]);
    await f.restart().signal({ ...signal(), version: "recovery-timeline-signal.v2" });
    await f.restart().signal(signal("timer", 8));
    expect(f.decisions()).toBe(1);
    expect(new Set(f.commands.map(c => c.commandId)).size).toBe(1);
    expect(f.transitions()).toBe(0);
    expect(JSON.stringify([...f.store.signals])).not.toContain("secret");
  });

  it("retries a crash after the command effect with the same key", async () => {
    const f = fixture(); f.crash();
    await expect(f.restart().signal(signal())).rejects.toThrow("ACTIVITY_FAILED");
    expect(f.store.signals.size).toBe(0);
    await expect(f.restart().signal(signal())).resolves.toBe("review");
    expect(f.decisions()).toBe(1);
    expect(f.commands[0]?.commandId).toBe(f.commands[1]?.commandId);
  });

  it("early timers can be redelivered when the authoritative clock is due", async () => {
    const f = fixture(); f.early();
    await expect(f.restart().signal(signal())).resolves.toBe("waiting");
    f.due();
    await expect(f.restart().signal(signal())).resolves.toBe("review");
    expect(f.decisions()).toBe(1);
  });

  it.each([true, false])("cancel before/after timer and delayed responses never revive an intent (%s)", async first => {
    const f = fixture();
    if (!first) await f.restart().signal(signal());
    await f.restart().signal(signal("cancel", 7));
    for (const event of [signal(), signal("close", 8), signal("builder_response", 9), signal("evidence_complete", 10), signal("cancel", 7)]) {
      await expect(f.restart().signal(event)).resolves.toBe("stopped");
    }
    expect(f.transitions()).toBe(1);
    expect(f.decisions()).toBe(first ? 0 : 1);
  });

  it("cancel replay after a post-command crash has no duplicate transition", async () => {
    const f = fixture(); f.crash();
    await expect(f.restart().signal(signal("cancel"))).rejects.toThrow("ACTIVITY_FAILED");
    await expect(f.restart().signal(signal("cancel"))).resolves.toBe("stopped");
    expect(f.transitions()).toBe(1);
  });

  it("same signal ID with changed input conflicts; cross-tenant and wrong-job IDs reveal no activity details", async () => {
    const f = fixture(); await f.restart().signal(signal());
    await expect(f.restart().signal({ ...signal(), kind: "cancel" })).rejects.toThrow("CONFLICT");
    for (const field of ["tenantId", "jobId", "caseId", "runId", "followUpId"]) {
      await expect(f.restart().signal({ ...signal("timer", 9), ref: { ...ref, [field]: id(99) } })).rejects.toThrow(/^RECOVERY_TIMELINE_ACTIVITY_FAILED$/);
    }
    expect(f.decisions()).toBe(1);
  });

  it("rechecks revoked permissions even for a completed replay", async () => {
    const f = fixture(); await f.restart().signal(signal()); f.revoke();
    await expect(f.restart().signal(signal())).rejects.toThrow("ACTIVITY_FAILED");
    expect(f.decisions()).toBe(1);
  });

  it("each action has one owner and neither scheduler may schedule the other's actions", () => {
    for (const [action, owner] of Object.entries(RECOVERY_SCHEDULING_OWNERS)) {
      const name = action as keyof typeof RECOVERY_SCHEDULING_OWNERS;
      expect(() => assertRecoverySchedulingOwner(name, owner)).not.toThrow();
      expect(() => assertRecoverySchedulingOwner(name, owner === "graphile" ? "recovery_timeline" : "graphile")).toThrow("OWNER_MISMATCH");
    }
  });
});
