import { randomUUID } from "node:crypto";
import { parsePilotOperations, pilotQueueSchema, requireG1ForPilot, requirePilotResources } from "@jobguard/config";
import { FinalCheckError } from "@jobguard/core";
import { assertPilotConnection, FinalCheckRepository, type VerifiedTenantContext } from "@jobguard/db";
import { run, type Logger, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { executeFinalCheckTask, type FinalCheckExecutionPorts } from "./final-check-task-executor.js";
import { withFinalCheckWorkerConnection } from "./final-check-worker-connection.js";
import { FinalCheckWorker, type FinalCheckWorkerPorts } from "./final-check.worker.js";
import { pilotQueueStatus, pilotWorkerHealth, pilotWorkerHeartbeat } from "./pilot-worker-health.js";
import { parseFinalCheckTask, registerFinalCheckTask, type FinalCheckTask } from "./worker-task-extensions.js";
import { redactingTasks } from "./safe-logging.js";

export const pilotWorkerTasks = (execute?: (task: FinalCheckTask) => Promise<void>): TaskList => {
  const refuse = async () => { throw new Error("PILOT_QUEUE_EXECUTION_REFUSED"); };
  const tasks: TaskList = { execute_outbox: refuse, final_check_practice_run: refuse,
    detect_shadow_evidence: refuse, hold_demo_sources: refuse, build_evidence_pack_v3: refuse };
  if (execute) registerFinalCheckTask(tasks, execute);
  else tasks.final_check = refuse;
  return tasks;
};

type PilotTaskFactory = (pool: Pool, gate: () => void) => (task: FinalCheckTask) => Promise<void>;

type PilotExecutionPorts = (pool: Pool) => { worker: FinalCheckWorkerPorts; publish: FinalCheckExecutionPorts["publish"] };

export function pilotFinalCheckExecutor(shadow: Pool, gate: () => void, portsFor: PilotExecutionPorts) {
  return async (context: VerifiedTenantContext, task: FinalCheckTask) => {
    gate();
    if (context.tenantId !== task.tenantId) throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
    await withFinalCheckWorkerConnection(shadow, `pilot-final-check:${task.tenantId}:${task.jobId}`, async pinned => {
      gate();
      const repository = new FinalCheckRepository(pinned);
      const ports = portsFor(pinned);
      const manifest = await repository.begin(context, task.jobId, "pilot-final-check-fixture.v1", task.manifestId, 1, task.lockId);
      if (manifest.id !== task.manifestId || manifest.lockId !== task.lockId ||
          manifest.comparisons.tenantId !== task.tenantId || manifest.comparisons.jobId !== task.jobId) {
        throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
      }
      const worker = new FinalCheckWorker(ports.worker, "pilot_no_charge", (request) => {
        gate();
        if (request.jobId !== task.jobId || request.manifestId !== manifest.id) {
          throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
        }
      });
      await executeFinalCheckTask(context, task, {
        environment: "pilot_no_charge",
        read: repository.manifest.bind(repository),
        execute: worker.execute.bind(worker),
        publish: (bound, request) => {
          gate();
          return ports.publish(bound, request);
        },
      }, "pilot_no_charge");
    });
  };
}

export function pilotFinalCheckDiscovery(shadow: Pool, gate: () => void): NonNullable<TaskList[string]> {
  return async (payload, helpers) => {
    if (payload === null || typeof payload !== "object" || Object.keys(payload).some(key => key !== "_cron")) {
      throw new Error("PILOT_QUEUE_EXECUTION_REFUSED");
    }
    gate();
    const { rows } = await shadow.query<{ tenant_id: string; job_id: string; lock_id: string; manifest_id: string }>(
      "SELECT * FROM app.pilot_final_check_requests()");
    for (const row of rows) {
      gate();
      const task = parseFinalCheckTask({ version: "final-check-task.v1", tenantId: row.tenant_id,
        jobId: row.job_id, lockId: row.lock_id, manifestId: row.manifest_id, executionId: randomUUID() });
      await helpers.addJob("final_check", task, { jobKey: `pilot-final-check:${task.manifestId}`, jobKeyMode: "preserve_run_at" });
      gate();
      await shadow.query("SELECT app.pilot_final_check_ack($1,$2,$3,$4)", [task.tenantId, task.jobId, task.lockId, task.manifestId]);
    }
  };
}

export async function startPilotWorker(env: NodeJS.ProcessEnv, logger: Logger, configureFinalCheck: PilotTaskFactory): Promise<void> {
  const binding = requirePilotResources(env, "worker");
  requireG1ForPilot(env.JOBGUARD_ENV, env);
  if (!binding.worker || !binding.queue) throw new Error("PILOT_QUEUE_BINDING_REFUSED");
  for (const connectionString of [binding.runtime, binding.identity, binding.worker, binding.queue]) {
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 });
    try {
      await assertPilotConnection(pool, connectionString);
      if (connectionString === binding.queue && (await pool.query<{ isolated: boolean }>(`
        SELECT NOT EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=session_user)
          AS isolated`)).rows[0]?.isolated !== true) throw new Error("PILOT_QUEUE_BINDING_REFUSED");
    } finally { await pool.end(); }
  }
  const { PILOT_WORKER_HEALTH_PORT: port, PILOT_QUEUE_BACKLOG_SECONDS: backlogSeconds } = parsePilotOperations(env);
  const shadow = binding.shadow ? new Pool({ connectionString: binding.shadow, connectionTimeoutMillis: 10_000 }) : undefined;
  shadow?.on("error", () => {});
  const gate = () => requireG1ForPilot("pilot_no_charge", env);
  try {
    if (shadow && binding.shadow) {
      await assertPilotConnection(shadow, binding.shadow);
      const posture = await shadow.query<{ safe: boolean }>(`
        SELECT app.pilot_final_check_login() AND NOT EXISTS(
          SELECT 1 FROM pg_roles WHERE rolname='jobguard_pilot_queue_login'
            AND has_database_privilege(oid,current_database(),'CONNECT')
        ) AS safe`);
      if (posture.rows[0]?.safe !== true) {
        throw new Error("PILOT_DATABASE_BINDING_REFUSED");
      }
    }
    const taskList = pilotWorkerTasks(shadow && configureFinalCheck(shadow, gate));
    if (shadow) Object.assign(taskList, redactingTasks({
      final_check: taskList.final_check!,
      discover_pilot_final_checks: pilotFinalCheckDiscovery(shadow, gate),
    }));
    await runPilotQueue(binding.queue, logger, taskList, shadow !== undefined, port, backlogSeconds);
  } finally {
    await shadow?.end();
  }
}

async function runPilotQueue(queue: string, logger: Logger, taskList: TaskList, discovery: boolean,
  port: number | undefined, backlogSeconds: number): Promise<void> {
  const runner = await run({
    connectionString: queue,
    schema: pilotQueueSchema,
    logger,
    taskList,
    ...(discovery ? { crontab: "* * * * * discover_pilot_final_checks" } : {}),
  });
  if (port === undefined) return runner.promise;

  const pool = new Pool({ connectionString: queue, max: 1, connectionTimeoutMillis: 2_000,
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
