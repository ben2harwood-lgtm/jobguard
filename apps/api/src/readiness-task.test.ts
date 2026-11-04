import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { JobHelpers } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import { readinessTasks } from "./readiness-task.js";
import type { ScheduledPlan } from "./readiness-scheduler.js";

const scope = { tenantId: randomUUID(), jobId: randomUUID(), taskId: randomUUID() };
const plan: ScheduledPlan = { version: "readiness-scheduled-plan.v1", synthetic: true, scope, factRevision: 1,
  ruleRevision: "readiness-scheduled.v1", status: "confirmed", plannedDate: "2026-03-30", jurisdiction: "scotland",
  localTime: "09:00", timeZone: "Europe/London", predecessors: [], edges: [], material: { requiredUnits: 1, landedUnits: 1 }, access: "unknown", crew: true };
function harness() {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT payload") ? [{ payload: plan }] : [] }));
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  // No context construction in this test: the scheduling boundary is tested with a
  // genuine queued context supplied by the test-only bridge below.
  return { pool, query };
}
import { verifiedTenantContextForQueuedJob } from "@jobguard/db";
const context = (store: import("./readiness-store.js").DurableReadinessStore, scope: typeof plan.scope) => {
  const context = verifiedTenantContextForQueuedJob(scope.tenantId);
  return { load: (raw: unknown) => store.load(context, raw), recordProposal: (raw: unknown) => store.recordProposal(context, raw) };
};

describe("synthetic readiness worker timer", () => {
  it("registers nothing, including no crontab, outside synthetic_demo", () => {
    for (const mode of ["disabled", "production", "pilot_no_charge", "provider_sandbox"]) {
      expect(readinessTasks({} as Pool, mode, context)).toEqual({ tasks: {}, crontab: "" });
    }
  });
  it("discovers identifier-only jobs with tenant-qualified minute-bucket keys", async () => {
    const { pool } = harness();
    const { tasks } = readinessTasks(pool, "synthetic_demo", context, () => "2026-03-27T08:00:00.000Z");
    const addJob = vi.fn(async () => ({}));
    const helpers = { addJob, withPgClient: async (fn: (client: unknown) => unknown) => fn({ query: async () => ({ rows: [{ tenant_id: scope.tenantId, job_id: scope.jobId, task_id: scope.taskId }] }) }) } as unknown as JobHelpers;
    await tasks.discover_readiness_plans!(null, helpers);
    await tasks.discover_readiness_plans!(null, helpers);
    expect(addJob.mock.calls[0]).toEqual(addJob.mock.calls[1]);
    expect(addJob.mock.calls[0]).toEqual(["readiness_schedule", { version: "readiness-schedule-task.v1", scope },
      { jobKey: `readiness-schedule:${scope.tenantId}:${scope.jobId}:${scope.taskId}:${Math.floor(Date.parse("2026-03-27T08:00:00Z") / 60000)}`, jobKeyMode: "preserve_run_at" }]);
  });
  it("queues the configured local time on the workday BEFORE work across the clock change", async () => {
    const { pool } = harness();
    const { tasks } = readinessTasks(pool, "synthetic_demo", context, () => "2026-03-27T08:00:00.000Z");
    const addJob = vi.fn(async () => ({}));
    await tasks.readiness_schedule!({ version: "readiness-schedule-task.v1", scope }, { addJob } as unknown as JobHelpers);
    expect(addJob).toHaveBeenCalledWith("readiness_evaluate", expect.anything(), expect.objectContaining({ runAt: new Date("2026-03-27T09:00:00.000Z") }));
  });
});
