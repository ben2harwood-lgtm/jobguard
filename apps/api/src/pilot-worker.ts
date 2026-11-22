import { createHmac } from "node:crypto";
import { commercialEmailEnabled, parsePilotOperations, pilotQueueSchema, requireG1ForPilot, requirePilotResources } from "@jobguard/config";
import { assertPilotConnection, CommercialEmailOutbox } from "@jobguard/db";
import { run, type Logger, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { commercialEmailAdapter, fixtureEmailRecipient } from "./effects/commercial-email.js";
import { FakeEmail } from "./effects/fake-email.js";
import { pilotQueueStatus, pilotWorkerHealth, pilotWorkerHeartbeat } from "./pilot-worker-health.js";
import { redactingTasks } from "./safe-logging.js";

/** Default task handlers refuse queued effects. Startup supplies only the checked fake email handlers. */
export const pilotWorkerTasks = (): TaskList => {
  const refuse = async () => { throw new Error("PILOT_QUEUE_EXECUTION_REFUSED"); };
  return { execute_outbox: refuse, final_check: refuse, final_check_practice_run: refuse,
    detect_shadow_evidence: refuse, hold_demo_sources: refuse, build_evidence_pack_v3: refuse };
};

export function pilotCommercialEmailTasks(env: NodeJS.ProcessEnv, outbox: Pick<CommercialEmailOutbox, "discover" | "execute">): TaskList {
  const canRun = () => commercialEmailEnabled("pilot_no_charge", env) &&
    (env.JOBGUARD_COMMERCIAL_OUTBOUND ?? "enabled") === "enabled";
  return {
    async execute_outbox(payload) {
      if (!canRun()) throw new Error("PILOT_QUEUE_EXECUTION_REFUSED");
      await outbox.execute(payload);
    },
    async discover_outbox(_payload, helpers) {
      if (!canRun()) return;
      for (const job of await outbox.discover()) {
        await helpers.addJob("execute_outbox", job, { jobKey: `outbox:${job.actionId}`, jobKeyMode: "preserve_run_at" });
      }
    },
  };
}

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
  const worker = new Pool({ connectionString: binding.worker, connectionTimeoutMillis: 10_000 });
  const adapters = (["fake_quote_delivery", "fake_invoice_delivery", "fake_email"] as const).map(name =>
    [name, commercialEmailAdapter(name, "pilot_no_charge", new FakeEmail([], false).commercial())] as const);
  const outbox = new CommercialEmailOutbox(worker, new Map(adapters),
    { emit: (event, fields) => logger.info(event, fields) },
    value => createHmac("sha256", env.AUTH_CODE_SECRET!).update(value).digest("hex"),
    action => commercialEmailEnabled("pilot_no_charge", env) && fixtureEmailRecipient(action));
  const runner = await run({
    connectionString: binding.queue,
    schema: pilotQueueSchema,
    logger,
    taskList: redactingTasks({ ...pilotWorkerTasks(), ...pilotCommercialEmailTasks(env, outbox) }),
    crontab: "*/1 * * * * discover_outbox",
  }).catch(async error => {
    await worker.end();
    throw error;
  });
  if (port === undefined) return runner.promise.finally(() => worker.end());

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
    await worker.end();
  }
}
