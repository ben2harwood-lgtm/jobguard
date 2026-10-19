// LP-2 ruling 103 (Q3): explicit OWNER fixture for a practice-home job INSERT.
// Migration 0198 admits a practice-home job only through an exact one-use permit created in the SAME transaction as the INSERT.
// This helper writes only that permit. The original INSERT statement stays at each call site, unchanged, and runs right after it
// on the same owner connection. It is never a runtime capability: the runtime login cannot read, write or execute the permit.
import type { PoolClient } from "pg";

export async function permitPracticeHomeJob(db: Pick<PoolClient, "query">, job: {
  tenantId: string; jobId: string; title: string; practiceSessionDigest: string; actorMembershipId: string; status?: string;
}): Promise<void> {
  await db.query(`INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,
    insert_shape,actor_membership_id)
    VALUES($1,$2,pg_backend_pid(),pg_current_xact_id(),'practice_home',
     app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object(
      'tenant_id',$1::uuid,'id',$2::uuid,'title',$3::text,'status',$4::text,'revision',0,
      'practice_session_digest',$5::text,'practice_scenario','home','provenance','system_generated_quote'))),$6)`,
    [job.tenantId, job.jobId, job.title, job.status ?? "draft", job.practiceSessionDigest, job.actorMembershipId]);
}
