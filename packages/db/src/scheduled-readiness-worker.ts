import type { Pool } from "pg";
import { outboundWorkerPool } from "./worker-pool.js";

export async function runScheduledReadinessWork(
  runtime: Pool,
  scope: { tenantId: string; jobId: string; taskId: string },
  operation: "load" | "load_job" | "record",
  proposal?: unknown,
) {
  const worker = await outboundWorkerPool(runtime);
  return (await worker.query<{ result: unknown }>(
    "SELECT app.lp11_readiness_worker($1,$2,$3,$4,$5::jsonb) AS result",
    [scope.tenantId, scope.jobId, scope.taskId, operation, proposal === undefined ? null : JSON.stringify(proposal)],
  )).rows[0]?.result;
}
