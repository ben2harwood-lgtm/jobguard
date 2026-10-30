import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "@jobguard/db";
import {
  RecoveryTimelineError, requireSyntheticTimeline, type RecoveryTimelineRef, type RecoveryTimelineSignal,
  type RecoveryWorkflowStore, type TimelineState,
} from "./recovery-timeline.workflow.js";

/** Dark synthetic history only. Authentication is resolved afresh before reading any history. */
export class PostgresRecoveryWorkflowStore implements RecoveryWorkflowStore {
  constructor(private readonly pool: Pool,
    private readonly contextFor: (ref: RecoveryTimelineRef) => Promise<VerifiedTenantContext>,
    private readonly environment = "disabled") {}

  async apply(signal: RecoveryTimelineSignal, update: (state: TimelineState) => Promise<TimelineState>): Promise<TimelineState> {
    requireSyntheticTimeline(this.environment);
    let context: VerifiedTenantContext;
    try { context = await this.contextFor(signal.ref); }
    catch { throw new RecoveryTimelineError("ACTIVITY_FAILED"); }
    if (context.tenantId !== signal.ref.tenantId) throw new RecoveryTimelineError("NOT_FOUND");
    const { tenantId, jobId, caseId, runId, followUpId } = signal.ref;
    const fingerprint = createHash("sha256").update(JSON.stringify(signal)).digest("hex");
    return withTenant(this.pool, context, async db => {
      // All instances take signal then intent locks. Activities use separate transactions and never acquire these locks.
      for (const lock of [`signal:${signal.signalId}`, `intent:${followUpId}`]) {
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`recovery-timeline:${tenantId}:${lock}`]);
      }
      const previous = (await db.$client.query<{ fingerprint: string }>(
        "SELECT fingerprint FROM app.recovery_timeline_signal WHERE tenant_id=$1 AND signal_id=$2", [tenantId, signal.signalId])).rows[0];
      if (previous && previous.fingerprint !== fingerprint) throw new RecoveryTimelineError("CONFLICT");
      const run = (await db.$client.query<{ state: TimelineState; job_id: string; case_id: string; run_id: string }>(
        "SELECT state,job_id,case_id,run_id FROM app.recovery_timeline_run WHERE tenant_id=$1 AND follow_up_id=$2", [tenantId, followUpId])).rows[0];
      if (run && (run.job_id !== jobId || run.case_id !== caseId || run.run_id !== runId)) throw new RecoveryTimelineError("CONFLICT");
      // Check the whole reference before activities; composite FKs preserve it at commit too.
      const target = await db.$client.query(
        "SELECT 1 FROM app.recovery_follow_up WHERE tenant_id=$1 AND id=$2 AND job_id=$3 AND case_id=$4 AND run_id=$5",
        [tenantId, followUpId, jobId, caseId, runId]);
      if (!target.rowCount) throw new RecoveryTimelineError("NOT_FOUND");
      // Always re-execute the authorized, idempotent activity, including duplicates and early timers.
      // A crash after its commit rolls history back; retry uses the same derived command identity.
      const state = await update(run?.state ?? "waiting");
      await db.$client.query(`INSERT INTO app.recovery_timeline_run(tenant_id,follow_up_id,job_id,case_id,run_id,state)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,follow_up_id) DO UPDATE SET state=excluded.state`,
      [tenantId, followUpId, jobId, caseId, runId, state]);
      if (!previous) await db.$client.query(`INSERT INTO app.recovery_timeline_signal(tenant_id,signal_id,follow_up_id,fingerprint)
        VALUES($1,$2,$3,$4)`, [tenantId, signal.signalId, followUpId, fingerprint]);
      return state;
    });
  }
}
