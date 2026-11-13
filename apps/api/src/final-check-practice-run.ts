import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import type { TaskList } from "graphile-worker";
import { FinalCheckRepository } from "@jobguard/db";
import type { VerifiedTenantContext } from "@jobguard/db";
import type { FinalCheckWorkerPorts } from "./final-check.worker.js";
import { FinalCheckError } from "@jobguard/core";
import { executeFinalCheckTask, FinalCheckTaskError, type FinalCheckExecutionPorts } from "./final-check-task-executor.js";

const taskV1 = z.object({
  version: z.literal("final-check-practice-run.v1"), tenantId: z.string().uuid(), jobId: z.string().uuid(),
  lockId: z.string().uuid(), manifestId: z.string().uuid().optional(), attempt: z.number().int().positive().optional(),
  cycleId: z.string().uuid().optional(),
}).strict().refine(v => (v.manifestId === undefined) === (v.attempt === undefined));
type RequestRow = { tenant_id: string; job_id: string; lock_id: string; manifest_id: string; attempt: number; cycle_id: string; executions: number; enqueued_at: unknown };
const cycleKey = (t: string, j: string) => `final-check-cycle:${t}:${j}`;
const jobKey = (row: RequestRow) => `final-check-practice:${row.manifest_id}:${row.cycle_id}`;

/** Existing discovery owner, atomic queue admission and acknowledgment. */
export async function discoverFinalCheckRequests(client: PoolClient): Promise<void> {
  await client.query("BEGIN");
  try {
    const rows = await client.query<RequestRow>(`SELECT tenant_id,job_id,lock_id,manifest_id,attempt,cycle_id,executions,enqueued_at
      FROM infrastructure.final_check_request WHERE cycle_state IN('requested','active')
      ORDER BY requested_at LIMIT 100 FOR UPDATE SKIP LOCKED`);
    for (const row of rows.rows) {
      // Never wait while holding a request-row lock; admission takes the advisory lock first.
      const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended($1,1430)) locked", [cycleKey(row.tenant_id, row.job_id)]);
      if (!locked.rows[0]?.locked) continue;
      if (row.enqueued_at !== null) {
        const queued = await client.query<{ attempts: number; max_attempts: number; locked_at: unknown }>(
          "SELECT attempts,max_attempts,locked_at FROM graphile_worker._private_jobs WHERE key=$1", [jobKey(row)]);
        const job = queued.rows[0];
        // Includes process death on the last delivery and lost completion acknowledgment.
        // A running delivery owns the advisory lock, so this cannot race publication.
        if (!job || (job.attempts >= job.max_attempts && (job.locked_at === null || row.executions >= 3))) {
          await client.query("SELECT infrastructure.final_check_cycle_exhausted($1,$2,$3)", [row.lock_id, row.manifest_id, row.cycle_id]);
        }
        continue;
      }
      // Graphile 0.16's exponential delay with max_attempts=3 is bounded by exp(3) seconds.
      await client.query("SELECT graphile_worker.add_job('final_check_practice_run',$1::json,max_attempts := 3,job_key := $2)", [
        JSON.stringify({ version: "final-check-practice-run.v1", tenantId: row.tenant_id, jobId: row.job_id,
          lockId: row.lock_id, manifestId: row.manifest_id, attempt: row.attempt, cycleId: row.cycle_id }), jobKey(row),
      ]);
      await client.query("UPDATE infrastructure.final_check_request SET enqueued_at=clock_timestamp() WHERE lock_id=$1 AND manifest_id=$2 AND cycle_id=$3 AND enqueued_at IS NULL", [row.lock_id, row.manifest_id, row.cycle_id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

/** Pin ALL shadow mutations/publication to the connection holding the cycle lock.
 * Connection loss fences further writes, even while a runtime source read is in flight.
 * The pool facade only borrows this connection; the outer owner releases it once.
 */
export async function executePracticeFinalCheck(context: VerifiedTenantContext, raw: unknown, shadowPool: Pool,
  portsFor: (pinned: Pool) => FinalCheckExecutionPorts, environment: string): Promise<void> {
  const task = taskV1.parse(raw);
  if (environment !== "synthetic_demo") throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
  if (context.tenantId !== task.tenantId) throw new FinalCheckTaskError("FINAL_CHECK_TASK_TENANT_MISMATCH");
  // Pre-upgrade deliveries have no admitted cycle. Upgrade rests them durably.
  if (!task.cycleId || !task.manifestId || !task.attempt) return;
  const client = await shadowPool.connect(), key = cycleKey(task.tenantId, task.jobId);
  const borrowed = new Proxy(client, { get(target, property) {
    if (property === "release") return () => undefined;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const pinned = { connect: async () => borrowed, query: client.query.bind(client) } as unknown as Pool;

  const args = [task.tenantId, task.jobId, task.lockId, task.manifestId, task.attempt, task.cycleId];
  async function lifecycle(sql: string, values: unknown[]) {
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [task.tenantId]);
      const result = await client.query(sql, values); await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1,1430))", [key]);
    const claim = await lifecycle("SELECT app.final_check_cycle_claim($1,$2,$3,$4,$5,$6) claimed", args);
    if (!claim.rows[0]?.claimed) return;
    try {
      const manifest = await new FinalCheckRepository(pinned).begin(context, task.jobId, "shadow-detection.v1", task.manifestId, task.attempt, task.lockId);
      if (manifest.lockId !== task.lockId || manifest.id !== task.manifestId) throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
      await executeFinalCheckTask(context, { version: "final-check-task.v1", tenantId: task.tenantId, jobId: task.jobId,
        lockId: task.lockId, manifestId: manifest.id, executionId: manifest.id }, portsFor(pinned), environment);
      await lifecycle("SELECT app.final_check_cycle_finish($1,$2,$3,$4,$5,$6,true)", args);
    } catch (error) {
      await lifecycle("SELECT app.final_check_cycle_finish($1,$2,$3,$4,$5,$6,false)", args);
      throw error;
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1,1430))", [key]); }
    finally { client.release(); }
  }
}

export function registerPracticeFinalCheckTasks(tasks: TaskList,
  execute: (task: z.infer<typeof taskV1>) => Promise<void>): void {
  tasks.discover_final_check_requests = async (_payload, helpers) => helpers.withPgClient(discoverFinalCheckRequests);
  tasks.final_check_practice_run = async payload => execute(taskV1.parse(payload));
}

/** Source availability is not evidence that a source failed examination. The
 * existing worker catches processing errors; prevent its subsequent failure
 * record when that error actually came from an unavailable database connection.
 * One wrapper belongs to one serial execution, never shared across deliveries.
 */
export function availabilitySafeFinalCheckPorts(ports: FinalCheckWorkerPorts): FinalCheckWorkerPorts {
  let unavailable: unknown;
  return { ...ports,
    async process(...args) {
      unavailable = undefined;
      try { return await ports.process(...args); }
      catch (error) {
        const value = error as { code?: string; message?: string };
        if (/^(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|08[0-9A-Z]{3}|57P0[123]|53300)$/u.test(value.code ?? "") ||
          value.message === "Connection terminated unexpectedly" || value.message === "Connection terminated") unavailable = error;
        throw error;
      }
    },
    async record(...args) {
      if (unavailable !== undefined) throw unavailable;
      return ports.record(...args);
    },
  };
}
