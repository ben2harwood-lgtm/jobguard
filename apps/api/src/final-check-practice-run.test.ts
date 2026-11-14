import { sourceFixtureUrl } from "./source-fixture-url.js";
const { testTenantContext: recoveryContext } = await import(sourceFixtureUrl("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { expect, it, vi } from "vitest";
import { FinalCheckRepository } from "@jobguard/db";
import { discoverFinalCheckRequests, executePracticeFinalCheck } from "./final-check-practice-run.js";

const row = () => ({ tenant_id: randomUUID(), job_id: randomUUID(), lock_id: randomUUID(), manifest_id: randomUUID(), attempt: 1, cycle_id: randomUUID(), executions: 0, enqueued_at: null });
it("inserts a three-delivery job and acknowledges the exact cycle in one transaction", async () => {
  const r = row(), query = vi.fn(async (sql: string) => ({ rows: sql.includes("FROM infrastructure.final_check_request") ? [r] : sql.includes("pg_try") ? [{ locked: true }] : [] }));
  await discoverFinalCheckRequests({ query } as unknown as PoolClient);
  expect(query.mock.calls[0]![0]).toBe("BEGIN");
  expect(query.mock.calls.at(-1)![0]).toBe("COMMIT");
  const add = query.mock.calls.find(([sql]) => sql.includes("add_job"))!;
  expect(add[0]).toContain("max_attempts := 3");
  expect(query.mock.calls.findIndex(([sql]) => sql.includes("add_job"))).toBeLessThan(query.mock.calls.findIndex(([sql]) => sql.includes("SET enqueued_at")));
});
it("rolls back a failed queue admission rather than acknowledge it", async () => {
  const r = row(), query = vi.fn(async (sql: string) => {
    if (sql.includes("add_job")) throw new Error("unavailable");
    return { rows: sql.includes("FROM infrastructure") ? [r] : [{ locked: true }] };
  });
  await expect(discoverFinalCheckRequests({ query } as unknown as PoolClient)).rejects.toThrow("unavailable");
  expect(query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  expect(query.mock.calls.some(([sql]) => sql.includes("SET enqueued_at"))).toBe(false);
});
it.each([undefined, { attempts: 3, max_attempts: 3, locked_at: null }, { attempts: 3, max_attempts: 3, locked_at: "dead worker" }])("rests missing/exhausted queue work without rescheduling: %j", async job => {
  const r = { ...row(), executions: 3, enqueued_at: "saved" }, query = vi.fn(async (sql: string) => ({ rows: sql.includes("FROM infrastructure") ? [r] : sql.includes("pg_try") ? [{ locked: true }] : sql.includes("FROM graphile") ? job ? [job] : [] : [] }));
  await discoverFinalCheckRequests({ query } as unknown as PoolClient);
  expect(query.mock.calls.some(([sql]) => sql.includes("cycle_exhausted"))).toBe(true);
  expect(query.mock.calls.some(([sql]) => sql.includes("add_job"))).toBe(false);
});
it("does not exhaust an active retry or wait behind a running cycle", async () => {
  for (const locked of [true, false]) {
    const r = { ...row(), enqueued_at: "saved" }, query = vi.fn(async (sql: string) => ({ rows: sql.includes("FROM infrastructure") ? [r] : sql.includes("pg_try") ? [{ locked }] : [{ attempts: 1, max_attempts: 3, locked_at: null }] }));
    await discoverFinalCheckRequests({ query } as unknown as PoolClient);
    expect(query.mock.calls.some(([sql]) => sql.includes("cycle_exhausted") || sql.includes("add_job"))).toBe(false);
  }
});
function delivery() {
  const r = row();
  const task = { version: "final-check-practice-run.v1", tenantId: r.tenant_id, jobId: r.job_id, lockId: r.lock_id, manifestId: r.manifest_id, attempt: 1, cycleId: r.cycle_id };
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("cycle_claim") ? [{ claimed: true }] : [] })), release = vi.fn();
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  return { task, query, release, pool };
}
it("records failure before begin completes and never publishes it", async () => {
  const f = delivery(), ports = vi.fn();
  const spy = vi.spyOn(FinalCheckRepository.prototype, "begin").mockRejectedValue(new Error("database unavailable"));
  try {
    await expect(executePracticeFinalCheck(recoveryContext((f.task).tenantId), f.task, f.pool, ports, "synthetic_demo")).rejects.toThrow("database unavailable");
    expect(f.query.mock.calls.some(([sql]) => sql.includes("cycle_finish") && sql.includes("false"))).toBe(true);
    expect(ports).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
  } finally { spy.mockRestore(); }
});
it("fences stale deliveries before any manifest or publication work", async () => {
  const f = delivery(), ports = vi.fn();
  f.query.mockImplementation(async () => ({ rows: [{ claimed: false }] }));
  const begin = vi.spyOn(FinalCheckRepository.prototype, "begin");
  try {
    await executePracticeFinalCheck(recoveryContext((f.task).tenantId), f.task, f.pool, ports, "synthetic_demo");
    expect(begin).not.toHaveBeenCalled(); expect(ports).not.toHaveBeenCalled();
  } finally { begin.mockRestore(); }
});
it("retires legacy payloads and refuses non-synthetic execution", async () => {
  const f = delivery(), ports = vi.fn(), { cycleId: _cycle, ...old } = f.task;
  await executePracticeFinalCheck(recoveryContext((old).tenantId), old, f.pool, ports, "synthetic_demo");
  expect(f.query).not.toHaveBeenCalled();
  await expect(executePracticeFinalCheck(recoveryContext((f.task).tenantId), f.task, f.pool, ports, "disabled")).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
});

it("database unavailability never becomes a fabricated source-failure record", async () => {
  const { availabilitySafeFinalCheckPorts } = await import("./final-check-practice-run.js");
  const { FinalCheckWorker } = await import("./final-check.worker.js");
  const { verifiedTenantContextForQueuedJob } = await import("@jobguard/db");
  const r = row(), unavailable = Object.assign(new Error("offline"), { code: "ECONNREFUSED" });
  const source = { id: randomUUID(), evidenceId: randomUUID(), sourceKind: "job_diary_text", status: "pending", inputHash: "a".repeat(64) };
  const manifest = { id: r.manifest_id, comparisons: { tenantId: r.tenant_id, jobId: r.job_id }, sources: [source] };
  const record = vi.fn(), reconcile = vi.fn();
  const ports = availabilitySafeFinalCheckPorts({ read: vi.fn().mockResolvedValue(manifest), process: vi.fn().mockRejectedValue(unavailable), record, reconcile });
  const worker = new FinalCheckWorker(ports, "synthetic_demo");
  await expect(worker.execute(verifiedTenantContextForQueuedJob(r.tenant_id), { version: "final-check.task.v1", jobId: r.job_id, manifestId: r.manifest_id })).rejects.toBe(unavailable);
  expect(record).not.toHaveBeenCalled(); expect(reconcile).not.toHaveBeenCalled();
});

it("refuses task/context tenant disagreement before claiming", async () => {
  const f = delivery();
  await expect(executePracticeFinalCheck(recoveryContext(randomUUID()), f.task, f.pool, vi.fn(), "synthetic_demo")).rejects.toMatchObject({ code: "FINAL_CHECK_TASK_TENANT_MISMATCH" });
  expect(f.query).not.toHaveBeenCalled();
});
