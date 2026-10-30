import type { Pool, PoolClient } from "pg";
import { withTenant, type VerifiedTenantContext } from "@jobguard/db";
import {
  RecoveryTimelineError, requireSyntheticTimeline, type RecoveryTimelineRef, type RecoveryTimelineSignal,
  type RecoveryWorkflowStore, type TimelineState,
} from "./recovery-timeline.workflow.js";

/** The activity's sequential repository transactions become savepoints on the history connection.
 * No inner commit/release may commit or return the outer connection to the pool. */
function activityPool(pool: Pool, client: PoolClient): Pool {
  let sequence = 0;
  return new Proxy(pool, {
    get(target, property) {
      if (property === "query") return client.query.bind(client);
      if (property === "connect") return async () => {
        const savepoint = `timeline_activity_${++sequence}`;
        return new Proxy(client, {
          get(connection, key) {
            if (key === "release") return () => undefined;
            if (key === "query") return (sql: string, values?: unknown[]) => {
              if (sql === "BEGIN") return connection.query(`SAVEPOINT ${savepoint}`);
              if (sql === "COMMIT") return connection.query(`RELEASE SAVEPOINT ${savepoint}`);
              if (sql === "ROLLBACK") return connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              return connection.query(sql, values);
            };
            const value = Reflect.get(connection, key);
            return typeof value === "function" ? value.bind(connection) : value;
          },
        });
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Dark synthetic history only. Authentication is resolved afresh before reading any history. */
export class PostgresRecoveryWorkflowStore implements RecoveryWorkflowStore {
  constructor(private readonly pool: Pool,
    private readonly contextFor: (ref: RecoveryTimelineRef) => Promise<VerifiedTenantContext>,
    private readonly environment = "disabled") {}

  async apply(signal: RecoveryTimelineSignal, update: (state: TimelineState, transactionPool?: Pool) => Promise<TimelineState>): Promise<TimelineState> {
    requireSyntheticTimeline(this.environment);
    let context: VerifiedTenantContext;
    try { context = await this.contextFor(signal.ref); }
    catch { throw new RecoveryTimelineError("ACTIVITY_FAILED"); }
    if (context.tenantId !== signal.ref.tenantId) throw new RecoveryTimelineError("NOT_FOUND");
    const { tenantId, jobId, caseId, runId, followUpId } = signal.ref;
    return withTenant(this.pool, context, async db => {
      // All instances take signal then intent locks before the activity takes business/audit locks.
      for (const lock of [`signal:${signal.signalId}`, `intent:${followUpId}`]) {
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`recovery-timeline:${tenantId}:${lock}`]);
      }
      const run = (await db.$client.query<{ state: TimelineState; job_id: string; case_id: string; run_id: string }>(
        "SELECT state,job_id,case_id,run_id FROM app.recovery_timeline_run WHERE tenant_id=$1 AND follow_up_id=$2", [tenantId, followUpId])).rows[0];
      if (run && (run.job_id !== jobId || run.case_id !== caseId || run.run_id !== runId)) throw new RecoveryTimelineError("CONFLICT");
      // Check the whole reference before activities; composite FKs preserve it at commit too.
      const target = await db.$client.query(
        "SELECT 1 FROM app.recovery_follow_up WHERE tenant_id=$1 AND id=$2 AND job_id=$3 AND case_id=$4 AND run_id=$5",
        [tenantId, followUpId, jobId, caseId, runId]);
      if (!target.rowCount) throw new RecoveryTimelineError("NOT_FOUND");
      // Always re-execute the authorized, idempotent activity, including duplicates and early timers.
      // Savepoints keep its effect and history atomic; retry uses the same derived command identity.
      await update(run?.state ?? "waiting", activityPool(this.pool, db.$client));
      try {
        const result = await db.$client.query<{ state: TimelineState }>(
          "SELECT app.apply_recovery_timeline_signal($1,$2::jsonb) AS state", [tenantId, JSON.stringify(signal)]);
        return result.rows[0]!.state;
      } catch (error) {
        // Conflict rolls the activity back with history; no rejected signal has a business effect.
        if (error instanceof Error && error.message === "RECOVERY_TIMELINE_CONFLICT") throw new RecoveryTimelineError("CONFLICT");
        throw error;
      }
    });
  }
}
