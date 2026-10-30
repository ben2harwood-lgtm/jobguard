import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "@jobguard/db";
import { PostgresRecoveryWorkflowStore } from "./recovery-timeline.store.js";
import { StoredRecoveryWorkflowRuntime } from "./recovery-timeline.workflow.js";

const id = (n: number) => `29000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const signal = { version: "recovery-timeline-signal.v1", signalId: id(1), eventId: id(2), kind: "timer",
  ref: { tenantId: id(3), jobId: id(4), caseId: id(5), runId: id(6), followUpId: id(7) } };
function fixture(environment?: string) {
  const connect = vi.fn(), context = vi.fn(), execute = vi.fn();
  const store = new PostgresRecoveryWorkflowStore({ connect } as unknown as Pool, context, environment);
  return { connect, context, execute, runtime: new StoredRecoveryWorkflowRuntime({ execute }, store, "synthetic_demo") };
}
describe("PostgreSQL timeline authentication boundary", () => {
  it.each([undefined, "production"])("refuses %s store mode before authentication or history reads", async mode => {
    const f = fixture(mode);
    await expect(f.runtime.signal(signal)).rejects.toThrow("DISABLED");
    expect(f.context).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("redacts a revoked authentication failure before reading saved history", async () => {
    const f = fixture("synthetic_demo"); f.context.mockRejectedValue(new Error("private session material"));
    await expect(f.runtime.signal(signal)).rejects.toThrow(/^RECOVERY_TIMELINE_ACTIVITY_FAILED$/);
    expect(f.connect).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("never uses a signal tenant in place of the authenticated context", async () => {
    const f = fixture("synthetic_demo"); f.context.mockResolvedValue({ tenantId: id(99) } as VerifiedTenantContext);
    await expect(f.runtime.signal(signal)).rejects.toThrow("NOT_FOUND");
    expect(f.connect).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
});
