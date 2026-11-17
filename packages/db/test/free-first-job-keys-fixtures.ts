import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
export { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture };
/** Isolated synthetic FK parent only, NOT successful command/admission proof.
 * Legacy parent scaffolding bypasses parent triggers; all new-table tests run normally. */
export async function keyParent(f: WorkFixture, tenantId?: Parameters<typeof seedWorkJob>[1]) {
 const a = await seedWorkJob(f, tenantId), activationId = randomUUID();
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
   VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',$6,clock_timestamp())`, [activationId,a.tenantId,a.jobId,randomUUID(),"a".repeat(64),a.actorId]);
 });
 return { tenantId: a.tenantId, jobId: a.jobId, activationId };
}
export function snapshot(parent: Awaited<ReturnType<typeof keyParent>>, suffix = randomUUID()) {
 return { ...parent, id: randomUUID(), company: `fictional_${suffix}`, phone: `demo_${suffix}`, fingerprint: `sim_fp_${suffix}`, provenance: randomUUID() };
}
export type KeySnapshot = ReturnType<typeof snapshot>;
export async function insertSnapshot(db: PoolClient, s: KeySnapshot) {
 await db.query(`INSERT INTO app.trial_identity_snapshot(tenant_id,id,job_id,activation_id,version,environment,verification_source,verification_id,verified_at,company_number,normalized_phone,card_fingerprint)
 VALUES($1,$2,$3,$4,'free-first-job-identity.v1','synthetic_demo','fictional_verified_fixture.v1',$5,'2026-10-18T10:00:00.123456Z',$6,$7,$8)`, [s.tenantId,s.id,s.jobId,s.activationId,s.provenance,s.company,s.phone,s.fingerprint]);
}
export async function store(f: WorkFixture, s: KeySnapshot) {
 return workTenant(f.admin,s.tenantId,async db => { await db.query("SET LOCAL ROLE jobguard_migration"); await insertSnapshot(db,s); });
}
export async function claimRows(f: WorkFixture, s: KeySnapshot) {
 return (await f.admin.query("SELECT identity_key FROM app.trial_identity_key_claim WHERE tenant_id=$1 AND snapshot_id=$2 ORDER BY identity_key COLLATE \"C\"",[s.tenantId,s.id])).rows.map(row=>row.identity_key as string);
}
