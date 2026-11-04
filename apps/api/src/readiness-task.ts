import type { JobHelpers, TaskList } from "graphile-worker";
import type { Pool } from "pg";
import { z } from "zod";
import { FixtureReadinessAdapters, scopeV1, type ReadinessAdapters } from "./readiness-adapters.js";
import { DarkReadinessScheduler, type ReadinessSchedulePorts } from "./readiness-scheduler.js";
import { DurableReadinessStore } from "./readiness-store.js";

const scheduleTaskV1 = z.object({ version: z.literal("readiness-schedule-task.v1"), scope: scopeV1 }).strict();
/** Labelled fictional 2026 data; NOT a real forecast or bank-holiday calendar. No network. */
export const syntheticTimerAdapters: ReadinessAdapters = {
  async weather({ scope, date }) {
    return { version: "readiness-weather.v1", synthetic: true, revision: "generated-timer-fiction.v1", scope, date,
      observedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z", suitable: true };
  },
  async holidays(region) {
    return new FixtureReadinessAdapters({ weather: [], holidays: [{
      version: "readiness-holidays.v1", synthetic: true, revision: "generated-timer-fiction.v1", jurisdiction: region,
      observedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z", from: "2026-01-01", through: "2026-12-31",
      holidays: region === "scotland" ? ["2026-01-02"] : region === "northern-ireland" ? ["2026-07-13"] : [],
    }] }).holidays(region);
  },
};

/** The caller supplies the worker's existing queueContext; this module never mints authority. */
export function readinessTasks(pool: Pool, mode: string, bindStore: (store: DurableReadinessStore, scope: z.infer<typeof scopeV1>) => ReadinessSchedulePorts,
  clock = () => new Date().toISOString()) : { tasks: TaskList; crontab: string } {
  const tasks: TaskList = {};
  if (mode !== "synthetic_demo") return { tasks, crontab: "" };
  const store = new DurableReadinessStore(pool, mode);
  tasks.discover_readiness_plans = async (_raw, helpers) => {
    const now = clock();
    const bucket = Math.floor(Date.parse(now) / 60_000);
    const rows = await helpers.withPgClient(client => client.query<{ tenant_id: string; job_id: string; task_id: string }>(
      "SELECT tenant_id,job_id,task_id FROM infrastructure.discover_readiness_plans()"));
    for (const row of rows.rows) {
      const scope = scopeV1.parse({ tenantId: row.tenant_id, jobId: row.job_id, taskId: row.task_id });
      await helpers.addJob("readiness_schedule", { version: "readiness-schedule-task.v1", scope },
        { jobKey: `readiness-schedule:${scope.tenantId}:${scope.jobId}:${scope.taskId}:${bucket}`, jobKeyMode: "preserve_run_at" });
    }
  };
  tasks.readiness_schedule = async (raw, helpers) => {
    const task = scheduleTaskV1.parse(raw);
    const scheduler = new DarkReadinessScheduler(syntheticTimerAdapters, bindStore(store, task.scope), mode);
    await scheduler.schedule(task.scope, clock(), helpers);
  };
  // Reuse the scheduler's strict evaluation schema and registration, binding ports per queued scope.
  tasks.readiness_evaluate = async (raw, helpers: JobHelpers) => {
    const scope = scopeV1.parse(z.object({ scope: scopeV1 }).parse(raw).scope);
    const scheduler = new DarkReadinessScheduler(syntheticTimerAdapters, bindStore(store, scope), mode);
    const registered: TaskList = {};
    scheduler.register(registered, clock);
    await registered.readiness_evaluate!(raw, helpers);
  };
  return { tasks, crontab: "\n*/1 * * * * discover_readiness_plans" };
}
