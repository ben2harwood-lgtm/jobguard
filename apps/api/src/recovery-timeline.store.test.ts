import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { verifiedTenantContextForQueuedJob, type VerifiedTenantContext } from "@jobguard/db";
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

describe("single-connection activity transaction", () => {
  function singleConnection() {
    const statements: string[] = [];
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.startsWith("SELECT state,job_id")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT app.apply_recovery_timeline_signal")) return { rows: [{ state: "review" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const connect = vi.fn(async () => ({ query, release }));
    const pool = { connect } as unknown as Pool;
    const store = new PostgresRecoveryWorkflowStore(pool,
      async () => verifiedTenantContextForQueuedJob(signal.ref.tenantId), "synthetic_demo");
    return { pool, store, connect, release, statements, query };
  }
  it("runs activity queries and nested transactions on the one history connection", async () => {
    const f = singleConnection();
    const runtime = new StoredRecoveryWorkflowRuntime({ async execute(_activity, pool) {
      expect(pool).toBeDefined();
      await pool!.query("SELECT synthetic_authentication");
      for (let i = 0; i < 2; i++) {
        const client = await pool!.connect();
        await client.query("BEGIN");
        await client.query("SELECT synthetic_effect");
        await client.query("COMMIT");
        client.release();
        expect(f.release).not.toHaveBeenCalled();
      }
      return "review";
    } }, f.store, "synthetic_demo");
    await expect(runtime.signal(signal)).resolves.toBe("review");
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.statements.filter(sql => sql === "BEGIN")).toHaveLength(1);
    expect(f.statements.filter(sql => sql === "COMMIT")).toHaveLength(1);
    expect(f.statements).toContain("SAVEPOINT timeline_activity_1");
    expect(f.statements).toContain("RELEASE SAVEPOINT timeline_activity_2");
    expect(f.statements).toContain("SELECT app.apply_recovery_timeline_signal($1,$2::jsonb) AS state");
  });
  it("maps a database fingerprint conflict and rolls back the activity transaction", async () => {
    const f = singleConnection();
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => {
      if (sql.startsWith("SELECT app.apply_recovery_timeline_signal")) throw new Error("RECOVERY_TIMELINE_CONFLICT");
      return original(sql);
    });
    const execute = vi.fn(async () => "review" as const);
    const runtime = new StoredRecoveryWorkflowRuntime({ execute }, f.store, "synthetic_demo");
    await expect(runtime.signal(signal)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(execute).toHaveBeenCalledOnce();
    expect(f.statements.at(-1)).toBe("ROLLBACK");
    expect(f.statements).not.toContain("COMMIT");
  });
  it("rolls back the activity and history when the activity fails", async () => {
    const f = singleConnection();
    const runtime = new StoredRecoveryWorkflowRuntime({ async execute(_activity, pool) {
      const client = await pool!.connect();
      await client.query("BEGIN");
      await client.query("SELECT synthetic_effect");
      await client.query("ROLLBACK");
      client.release();
      throw new Error("synthetic crash");
    } }, f.store, "synthetic_demo");
    await expect(runtime.signal(signal)).rejects.toThrow("ACTIVITY_FAILED");
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.statements).toContain("ROLLBACK TO SAVEPOINT timeline_activity_1");
    expect(f.statements.at(-1)).toBe("ROLLBACK");
    expect(f.statements).not.toContain("COMMIT");
  });
});
