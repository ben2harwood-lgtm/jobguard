import { createServer } from "node:http";
import { pilotQueueSchema } from "@jobguard/config";
import type { WorkerEvents } from "graphile-worker";
import type { Pool } from "pg";

export const workerHeartbeatTimeoutMs = 60_000;

export function pilotWorkerHeartbeat(events: WorkerEvents, now = () => performance.now()) {
  let lastSuccessfulPoll = -Infinity;
  const beat = () => { lastSuccessfulPoll = now(); };
  events.on("worker:getJob:empty", beat);
  events.on("job:start", beat);
  events.on("job:complete", beat);
  return () => now() - lastSuccessfulPoll < workerHeartbeatTimeoutMs;
}

export async function pilotQueueStatus(pool: Pool, backlogSeconds: number) {
  const { rows: [row] } = await pool.query<{ backlog: boolean; failed: boolean }>(`
    SELECT
      EXISTS(SELECT FROM ${pilotQueueSchema}.jobs
        WHERE attempts < max_attempts AND locked_at IS NULL
          AND run_at < now() - $1::int * interval '1 second') AS backlog,
      EXISTS(SELECT FROM ${pilotQueueSchema}.jobs
        WHERE attempts >= max_attempts AND locked_at IS NULL) AS failed
  `, [backlogSeconds]);
  if (!row) throw new Error("PILOT_QUEUE_STATUS_UNAVAILABLE");
  return row;
}

export function pilotWorkerHealth(heartbeat: () => boolean, queueStatus: () => Promise<{ backlog: boolean; failed: boolean }>) {
  return createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
      response.writeHead(404).end();
      return;
    }
    try {
      const { backlog, failed } = await queueStatus();
      const healthy = heartbeat();
      response.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ heartbeat: healthy, queueAvailable: true, backlog, failed }));
    } catch {
      response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ heartbeat: false, queueAvailable: false }));
    }
  });
}
