import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { withTenant } from "../src/tenant-context.js";
import { permitImportedJob } from "./lp-practice-home-job-fixture.js";
export { cluster };
export type { Cluster };
export async function fixture(c: Cluster) {
 const tenant = randomUUID(), user = randomUUID(), account = randomUUID(), membershipId = randomUUID(), job = randomUUID();
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
 await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
 await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`mon9-${user}@fictional.invalid`,user]);
 const sessionDigest = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
 await c.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'synthetic-csrf',clock_timestamp()+interval '1 day','synthetic_demo')", [randomUUID(),user,sessionDigest]);
 const context = testTenantContext(tenant);
 await withTenant(c.admin, context, async db => {
  await db.$client.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional MON-9')", [tenant,account]);
  await db.$client.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant,membershipId,account,user]);
  await permitImportedJob(db.$client, {tenantId:tenant,jobId:job,actorMembershipId:membershipId,title:'Fictional MON-9',
   feePolicyVersion:'reference_fee_policy_v3',netPence:100000,capPence:1500});
  await db.$client.query("INSERT INTO app.job(tenant_id,id,title,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional MON-9','imported',100000,'reference_fee_policy_v3',1500)", [tenant,job]);
  await db.$client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','adoption_import')", [tenant,job]);
 });
 await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user,tenant,membershipId]);
 return { tenant, job, context, sessionDigest, actor: { membershipId, identityUserId: user } };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export async function newCase(c: Cluster, f: Fixture, caseType: 'withheld_customer_payment' | 'merchant_overcharge' = 'withheld_customer_payment') {
 const id = randomUUID();
 await withTenant(c.admin, f.context, db => db.$client.query(`INSERT INTO app.recovery_case
  (tenant_id,id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
  VALUES($1,$2,$3,32000,'GBP','identified',0,true,$4,'Fictional customer',$5,$6,'[]')`,
  [f.tenant,id,f.job,caseType,caseType==='merchant_overcharge'?'supplier_cost':'builder_customer',caseType==='merchant_overcharge'?'supplier_documents':'customer_invoice']));
 return id;
}
export const command = (caseId: string) => ({ version: "managed-recovery-election-command.v1", commandId: randomUUID(), caseId,
 termsVersion: "managed-recovery.synthetic-terms.v1", selection: { service: "drafted_for_you", points: 5 } });
export async function start(c: Cluster, f: Fixture, caseId: string, client?: PoolClient) {
 const query = (db: PoolClient) => db.query(`INSERT INTO app.recovery_case_event
  (tenant_id,id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash)
  VALUES($1,$2,$3,$4,1,'start_pursuit','evidence_assembled','pursuing','synthetic-owner',$5,$6)`,
 [f.tenant,randomUUID(),f.job,caseId,randomUUID(),"a".repeat(64)]);
 return client ? query(client) : withTenant(c.runtime, f.context, db => query(db.$client));
}
export async function counts(c: Cluster) {
 const tables = ['managed_recovery_election','managed_recovery_pursuit','command_receipt','action_authorization','audit_event','recovery_fee_derivation','journal'];
 return Object.fromEntries(await Promise.all(tables.map(async t => [t,(await c.admin.query(`SELECT count(*)::int n FROM app.${t}`)).rows[0].n])));
}
/** Privileged synthetic source fixture, not an allocator/provider integration claim.
 * Keep the consumer's join/filter proof independent of the allocation producer.
 */
export async function qualifyingAllocation(c: Cluster, f: Fixture, caseId: string) {
 const allocation=randomUUID(),evidence=randomUUID(),upload=randomUUID(),movement=randomUUID(),payment=randomUUID(),account=randomUUID();
 const db=await c.admin.connect(),h='b'.repeat(64);
 try {
  await db.query('BEGIN'); await db.query("SELECT set_config('app.tenant_id',$1,true)",[f.tenant]);
  await db.query('SET LOCAL session_replication_role=replica');
  await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)
   VALUES($1,$2::uuid,$3,($2::uuid)::text,$4,'text/plain',100,'standard_evidence','verified','synthetic-v1',clock_timestamp(),clock_timestamp()+interval '1 day')`,[f.tenant,upload,f.job,h]);
  await db.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2,$3::uuid,$4,'original','payment_proof',($3::uuid)::text,'synthetic-v1',$5,1,'text/plain','standard_evidence',clock_timestamp(),clock_timestamp())`,[f.tenant,evidence,upload,f.job,h]);
  await db.query(`INSERT INTO app.practice_feed_event(tenant_id,id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
   VALUES($1,$2,$3,$4,$5,'settled','receipt-384','settled-receipt-384','identified','feed',38400,'GBP','settled','synthetic_demo','practice-feed-event.v1',$6)`,[f.tenant,movement,f.job,account,randomUUID(),h]);
  await db.query(`INSERT INTO app.recovery_eligibility_revision(tenant_id,id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)
   VALUES($1,$2,$3,$4,1,1,1,'reference-d03.v1',1,'synthetic','eligible_for_review',32000,'GBP','Synthetic consumer fixture','[]','approved','synthetic-owner',$5,$6)`,[f.tenant,randomUUID(),f.job,caseId,randomUUID(),h]);
  await db.query(`INSERT INTO app.recovery_case_allocation(tenant_id,id,job_id,case_id,payment_id,invoice_id,command_id,review_id,authorization_id,gross_pence,eligible_net_pence,tax_pence,currency,evidence_id,object_version_id,evidence_hash,evidence_server_received_at,policy_version,reviewer_ref,movement_id,movement_hash,account_id,settled_event_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,38400,32000,6400,'GBP',$10,'synthetic-v1',$11,(SELECT server_received_at FROM app.evidence_object WHERE tenant_id=$1 AND id=$10),'reference-d03.v1','synthetic-owner',$12,$11,$13,'settled-receipt-384')`,
  [f.tenant,allocation,f.job,caseId,payment,randomUUID(),randomUUID(),randomUUID(),randomUUID(),evidence,h,movement,account]);
  await db.query('COMMIT'); return {allocation,evidence,payment};
 } catch(error) { await db.query('ROLLBACK');throw error; } finally { db.release(); }
}
