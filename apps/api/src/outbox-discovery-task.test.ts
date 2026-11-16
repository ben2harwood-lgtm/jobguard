import { readFileSync } from "node:fs";
import type { Task, TaskList } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import { registerOutboxDiscoveryTask } from "./outbox-discovery-task.js";
import { sourceFixtureUrl } from "./source-fixture-url.js";

function setup(failAt?: string) {
  const rows = [{ action_id: "action-a", tenant_id: "tenant-a" }, { action_id: "action-b", tenant_id: "tenant-b" }];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (failAt && sql.includes(failAt)) throw new Error("synthetic failure");
    return { rows: sql.startsWith("SELECT action_id") ? rows : [] };
  });
  const addJob = vi.fn();
  const withPgClient = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const helpers = { withPgClient, addJob } as unknown as Parameters<Task>[1];
  const tasks: TaskList = {};
  registerOutboxDiscoveryTask(tasks);
  return { query, addJob, withPgClient, run: () => tasks.discover_outbox!({}, helpers) };
}

describe("registered durable outbox discovery", () => {
  it("rotates all signals in a bounded locked transaction using same-client enqueue", async () => {
    const s = setup(); await s.run();
    expect(s.withPgClient).toHaveBeenCalledTimes(1);
    const calls = s.query.mock.calls;
    expect(calls[0]).toEqual(["BEGIN"]);
    expect(calls[1]?.[0]).toContain("ORDER BY enqueued_at NULLS FIRST,created_at,action_id LIMIT 100 FOR UPDATE SKIP LOCKED");
    expect(calls[1]?.[0]).not.toContain("WHERE"); // Previously seen signals must remain eligible.
    for (const [index, suffix] of [[2, "a"], [4, "b"]] as const) {
      expect(calls[index]?.[0]).toContain("graphile_worker.add_job('execute_outbox'");
      expect(calls[index]?.[0]).toContain("job_key_mode := 'preserve_run_at'");
      expect(calls[index]?.[1]).toEqual([JSON.stringify({ actionId: `action-${suffix}`, tenantId: `tenant-${suffix}` }), `outbox:action-${suffix}`]);
      expect(calls[index + 1]).toEqual(["UPDATE infrastructure.outbox_signal SET enqueued_at=clock_timestamp() WHERE action_id=$1", [`action-${suffix}`]]);
    }
    expect(calls.at(-1)).toEqual(["COMMIT"]);
    expect(s.addJob).not.toHaveBeenCalled();
    const worker = readFileSync(sourceFixtureUrl("./worker.ts", import.meta.url), "utf8");
    expect(worker).toContain("registerOutboxDiscoveryTask(tasks);");
    expect(worker).not.toContain("async discover_outbox(");
  });
  it.each(["SELECT action_id", "graphile_worker.add_job", "UPDATE infrastructure.outbox_signal", "COMMIT"])("rolls back and propagates %s failure", async failure => {
    const s = setup(failure);
    await expect(s.run()).rejects.toThrow("synthetic failure");
    expect(s.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
    expect(s.addJob).not.toHaveBeenCalled();
  });
  it("commits an empty tick without enqueueing", async () => {
    const s = setup();
    s.query.mockImplementation(async () => ({ rows: [] }));
    await s.run();
    expect(s.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", expect.stringContaining("SELECT action_id"), "COMMIT"]);
  });
});
