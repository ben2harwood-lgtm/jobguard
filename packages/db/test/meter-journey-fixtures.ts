import { randomUUID } from "node:crypto";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { workTenant, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";

export async function activateMeterJob(f: WorkFixture, a: WorkJob, small = false, stage = false) {
  let staged!: {sql:string;values:unknown[]};
  await workTenant(f.admin, a.tenantId, async db => {
   await seedSyntheticPartyFixture(db, a.tenantId, a.jobId);
   await db.query("SET LOCAL session_replication_role='replica'");
   const binding = (await db.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].binding_id;
   const activationId = randomUUID(), baseline = randomUUID();
   await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING", [a.tenantId, a.jobId]);
   await db.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at,party_binding_id)
    VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',$6,clock_timestamp(),$7)`, [activationId, a.tenantId, a.jobId, baseline, "a".repeat(64), a.actorId, binding]);
   staged={sql:`INSERT INTO app.job_activation_terms(id,tenant_id,job_id,activation_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash,accepted_net_pence,highest_sent_net_pence,small_job,policy_version,commercial_track,trial_plan_context)
    VALUES($1,$2,$3,$4,$5,1,$6,$7,$7,$8,'reference_fee_policy_v3','small_builder','none_recorded_pre_mon2a')`,values:[randomUUID(), a.tenantId, a.jobId, activationId, baseline, "a".repeat(64), small ? 100000 : 300000, small]};
   if (!stage) await db.query(staged.sql,staged.values);
  });
  return staged;
 }
