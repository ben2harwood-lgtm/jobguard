// LP-2 ruling 103 (Q3): explicit OWNER fixture for a practice-home job INSERT.
// Migration 0344 admits a practice-home job only through an exact one-use permit created in the SAME transaction as the INSERT.
// This helper writes only that permit. The original INSERT statement stays at each call site, unchanged, and runs right after it
// on the same owner connection. It is never a runtime capability: the runtime login cannot read, write or execute the permit.
import { randomUUID } from "node:crypto";
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

// Explicit owner-only setup for historical imported jobs whose policy/state is under test.
// The caller retains its original INSERT in this same transaction; no product grant is added.
export async function permitImportedJob(db: Pick<PoolClient, "query">, job: {
 tenantId: string; jobId: string; actorMembershipId: string; title: string;
 feePolicyVersion: string; netPence: number; capPence: number;
 practiceSessionDigest?: string; practiceScenario?: string;
}): Promise<void> {
 const command = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
 await db.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
  VALUES($1,$2,'job.adopt_in_flight',$3,$4,'processing',$5)`,
  [job.tenantId,command,`import:${job.jobId}`,"a".repeat(64),job.actorMembershipId]);
 await db.query(`INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type)
  VALUES($1,$2,'job',$3,'job.adopt_in_flight')`,[job.tenantId,decision,job.jobId]);
 await db.query(`INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id)
  VALUES($1,$2,$3,'approved',$4)`,[job.tenantId,resolution,decision,job.actorMembershipId]);
 await db.query(`INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,
  action_type,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
  VALUES($1,$2,$3,$4,$5,'job.adopt_in_flight',$6,0,$7,'GBP','synthetic_import_terms_candidate.v1',clock_timestamp()+interval '5 minutes')`,
  [job.tenantId,authorization,decision,resolution,job.actorMembershipId,"a".repeat(64),job.netPence]);
 await db.query(`INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,
  insert_shape,actor_membership_id,command_id,authorization_id)
  VALUES($1,$2,pg_backend_pid(),pg_current_xact_id(),'adoption',
   app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object(
    'tenant_id',$1::uuid,'id',$2::uuid,'title',$3::text,'status','draft','revision',0,'provenance','imported',
    'accepted_net_value_pence',$4::bigint,'fee_policy_version',$5::text,'recovery_cap_pence',$6::bigint,
    'practice_session_digest',$10::text,'practice_scenario',$11::text))),$7,$8,$9)`,
  [job.tenantId,job.jobId,job.title,job.netPence,job.feePolicyVersion,job.capPence,job.actorMembershipId,command,authorization,job.practiceSessionDigest??null,job.practiceScenario??null]);
 await db.query(`UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp()
  WHERE tenant_id=$1 AND command_id=$2`,[job.tenantId,command]);
}
