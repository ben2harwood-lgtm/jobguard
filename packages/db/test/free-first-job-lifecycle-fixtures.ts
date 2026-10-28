import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import type { TrialCompany } from "./free-first-job-admission-fixtures.js";
import { randomUUID } from "node:crypto";
import { meterCompany,verifyBusiness,workTenant,type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { keyParent,snapshot,store } from "./free-first-job-keys-fixtures.js";
// Prerequisite activation parents are owner fixtures, not successful capacity/quote command proof.
export async function firstTrialFixture(f:WorkFixture,startedAt?:string){
 const a=await meterCompany(f),verification=await verifyBusiness(f,a),parent=await keyParent(f,a.tenantId),s=snapshot(parent);
 if(startedAt)await workTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.job_activation SET activated_at=$2::timestamptz WHERE tenant_id=$1 AND id=$3",[a.tenantId,startedAt,parent.activationId]);});
 await store(f,s);
 await workTenant(f.admin,a.tenantId,async db=>{
  const command=randomUUID();await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'ch4.fixture',$2::text,$3,'succeeded',$4,'{}',clock_timestamp())",[a.tenantId,command,'a'.repeat(64),a.actorId]);
  await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO app.trial_admission(tenant_id,job_id,activation_id,snapshot_id,verification_id,command_id,admission_kind) VALUES($1,$2,$3,$4,$5,$6,'first')",[a.tenantId,parent.jobId,parent.activationId,s.id,verification,command]);
 });return {...a,jobId:parent.jobId,verification,trialId:s.id};
}
// Private synthetic source fixture ONLY. Like A's keyParent, predecessor
// commercial parent rows are installed with owner trigger bypass. This is not
// a command journey or a successful trial admission. The reader runs normally.
export async function exactTarget(f: WorkFixture, a: TrialCompany) {
 const documentId = randomUUID(), revisionId = randomUUID(), acceptanceId = randomUUID();
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await seedSyntheticPartyFixture(db, a.tenantId, a.jobId);
  await db.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',100000,0,100000,20000,120000,true,'[]')", [revisionId,a.tenantId,a.jobId,randomUUID()]);
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot,parties_snapshot)
   SELECT $1,$2,$3,$4,1,'ELIG-FIXTURE',$5,'synthetic/elig','fixture-v1',1,'{}','{}','{"netPence":100000,"totalPence":120000}',snapshot FROM app.job_party_snapshot WHERE tenant_id=$2 AND job_id=$3`, [documentId,a.tenantId,a.jobId,revisionId,'a'.repeat(64)]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [documentId,a.tenantId,a.jobId,'a'.repeat(64)]);
  await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
   VALUES($1,$2,$3,$4,1,$5,120000,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [acceptanceId,a.tenantId,a.jobId,documentId,'a'.repeat(64),a.actorId]);
  await db.query(`INSERT INTO app.quote_send(id,tenant_id,job_id,document_id,content_hash,authorization_id,outbox_action_id,recipients) VALUES($1,$2,$3,$4,$5,$6,$7,'["fixture@example.invalid"]')`, [randomUUID(),a.tenantId,a.jobId,documentId,'a'.repeat(64),randomUUID(),randomUUID()]);
  await db.query("UPDATE app.job SET status='accepted',accepted_quote_version_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT(tenant_id,job_id) DO UPDATE SET provenance='backfilled_synthetic_fixture',source_id=NULL", [a.tenantId,a.jobId]);
 });
 return {documentId, revisionId, acceptanceId};
}

