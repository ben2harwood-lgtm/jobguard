import { parsePilotOperations, pilotQueueSchema, requireG1ForPilot, requirePilotResources } from "@jobguard/config";
import { assertPilotConnection } from "@jobguard/db";
import { run, type Logger, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { pilotQueueStatus, pilotWorkerHealth, pilotWorkerHeartbeat } from "./pilot-worker-health.js";

/** No real execution port exists in this slice. These are the effect task
 * names a copied or previously populated queue might try to replay. */
export const pilotWorkerTasks = (): TaskList => {
  const refuse = async () => { throw new Error("PILOT_QUEUE_EXECUTION_REFUSED"); };
  return { execute_outbox: refuse, final_check: refuse, final_check_practice_run: refuse,
    detect_shadow_evidence: refuse, hold_demo_sources: refuse, build_evidence_pack_v3: refuse };
};

export async function startPilotWorker(env: NodeJS.ProcessEnv, logger: Logger): Promise<void> {
  const binding = requirePilotResources(env, "worker");
  requireG1ForPilot(env.JOBGUARD_ENV, env);
  if (!binding.worker || !binding.queue) throw new Error("PILOT_QUEUE_BINDING_REFUSED");
  for (const connectionString of [binding.runtime, binding.identity, binding.worker, binding.queue]) {
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 });
    try { await assertPilotConnection(pool, connectionString); }
    finally { await pool.end(); }
  }
  const { PILOT_WORKER_HEALTH_PORT: port, PILOT_QUEUE_BACKLOG_SECONDS: backlogSeconds } = parsePilotOperations(env);
  const runner = await run({
    connectionString: binding.queue,
    schema: pilotQueueSchema,
    logger,
    taskList: pilotWorkerTasks(),
  });
  if (port === undefined) return runner.promise;

  const pool = new Pool({ connectionString: binding.queue, max: 1, connectionTimeoutMillis: 2_000,
    statement_timeout: 2_000, idleTimeoutMillis: 0 });
  // A lost idle monitoring connection is reflected in the next probe.
  pool.on("error", () => {});
  const heartbeat = pilotWorkerHeartbeat(runner.events);
  const health = pilotWorkerHealth(heartbeat, () => pilotQueueStatus(pool, backlogSeconds));
  try {
    await Promise.race([
      new Promise<never>((_, reject) => {
        health.on("error", reject);
        health.listen(port, "0.0.0.0");
      }),
      runner.promise,
    ]);
  } catch (error) {
    await runner.stop().catch(() => {});
    throw error;
  } finally {
    health.close();
    health.closeAllConnections();
    await pool.end();
  }
}
