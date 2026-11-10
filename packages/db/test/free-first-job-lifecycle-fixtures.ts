import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import type { TrialCompany } from "./free-first-job-admission-fixtures.js";
import { randomUUID } from "node:crypto";
import { meterCompany,verifyBusiness,workTenant,type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { keyParent,snapshot,store } from "./free-first-job-keys-fixtures.js";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { generatePracticePng } from "../src/practice-proof-image.js";

// Keep trial proof bytes independent of the contractor fixture graph. Playwright's
// filename-only transform cache can reuse its CJS transforms in this ESM journey.
class TrialProofStorage implements PrivateVersionedStorage {
 private readonly versions = new Map<string, StoredObject>();
 put(key: string, versionId: string, bytes: Uint8Array) {
  this.versions.set(`${key}:${versionId}`, { key, versionId, bytes, byteLength: bytes.length, contentType: "image/png" });
 }
 async createUploadUrl({ key }: { key: string }) { return `memory://upload/${key}`; }
 async createDownloadUrl({ key, versionId }: { key: string; versionId: string }) { return `memory://download/${key}/${versionId}`; }
 async readExactVersion(key: string, versionId: string) {
  const value = this.versions.get(`${key}:${versionId}`);
  if (!value) throw new Error("not found");
  return value;
 }
 async deleteExactVersion(key: string, versionId: string) { this.versions.delete(`${key}:${versionId}`); }
}
// Prerequisite activation parents are owner fixtures, not successful capacity/quote command proof.
export async function firstTrialFixture(f:WorkFixture,startedAt?:string){
 const a=await meterCompany(f),verification=await verifyBusiness(f,a),parent=await keyParent(f,a.tenantId),s=snapshot(parent);
 if(startedAt)await workTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.job_activation SET activated_at=$2::timestamptz WHERE tenant_id=$1 AND id=$3",[a.tenantId,startedAt,parent.activationId]);});
 await store(f,s);
 await workTenant(f.admin,a.tenantId,async db=>{
  const command=randomUUID();await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2::uuid,'ch4.fixture',($2::uuid)::text,$3,'succeeded',$4,'{}',clock_timestamp())",[a.tenantId,command,'a'.repeat(64),a.actorId]);
  await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO app.trial_admission(tenant_id,job_id,activation_id,snapshot_id,verification_id,command_id,admission_kind) VALUES($1,$2,$3,$4,$5,$6,'first')",[a.tenantId,parent.jobId,parent.activationId,s.id,verification,command]);
 });return {...a,jobId:parent.jobId,verification,trialId:s.id};
}
// Private synthetic source fixture ONLY. Like A's keyParent, predecessor
// commercial parent rows are installed with owner trigger bypass. This is not
// a command journey or a successful trial admission. The reader runs normally.
export async function exactTarget(f: WorkFixture, a: TrialCompany, large = false) {
 const documentId = randomUUID(), revisionId = randomUUID(), acceptanceId = randomUUID();
 const net = large ? 300000 : 100000, tax = large ? 60000 : 20000, total = net + tax;
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await seedSyntheticPartyFixture(db, a.tenantId, a.jobId);
  await db.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',$5,0,$5,$6,$7,true,'[]')", [revisionId,a.tenantId,a.jobId,randomUUID(),net,tax,total]);
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot,parties_snapshot)
   SELECT $1,$2,$3,$4,1,'ELIG-FIXTURE',$5,'synthetic/elig','fixture-v1',1,'{}','{}',jsonb_build_object('netPence',$6::integer,'totalPence',$7::integer),snapshot FROM app.job_party_snapshot WHERE tenant_id=$2 AND job_id=$3`, [documentId,a.tenantId,a.jobId,revisionId,'a'.repeat(64),net,total]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')", [documentId,a.tenantId,a.jobId,'a'.repeat(64),net]);
  await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
   VALUES($1,$2,$3,$4,1,$5,$7,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [acceptanceId,a.tenantId,a.jobId,documentId,'a'.repeat(64),a.actorId,total]);
  await db.query(`INSERT INTO app.quote_send(id,tenant_id,job_id,document_id,content_hash,authorization_id,outbox_action_id,recipients) VALUES($1,$2,$3,$4,$5,$6,$7,'["fixture@example.invalid"]')`, [randomUUID(),a.tenantId,a.jobId,documentId,'a'.repeat(64),randomUUID(),randomUUID()]);
  // The live seed may have an imported baseline; accepted quotes have no live baseline.
  await db.query("UPDATE app.job SET status='accepted',provenance='system_generated_quote',baseline_quote_version_id=NULL,accepted_net_value_pence=NULL,fee_policy_version=NULL,recovery_cap_pence=NULL,accepted_quote_version_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT(tenant_id,job_id) DO UPDATE SET provenance='backfilled_synthetic_fixture',source_id=NULL", [a.tenantId,a.jobId]);
 });
 return {documentId, revisionId, acceptanceId};
}


/** Fictional company prerequisites only; never seeds Final Check or money results.
 * Commercial history uses the same owner-only fixture bypass as exactTarget.
 * Trial activation and proof then run through the existing runtime commands.
 * Caller supplies JOBGUARD_ENV=synthetic_demo, as in the other trial tests.
 */
type TrialPreparationOptions = { description?: string; proofBytes?: Buffer; withTrial?: boolean };
type PreparedTrial = Awaited<ReturnType<typeof prepareTrial>>;
export function preparedTrialFixture(f: WorkFixture, options?: TrialPreparationOptions & { withTrial?: true }): Promise<PreparedTrial & { activation: NonNullable<PreparedTrial["activation"]> }>;
export function preparedTrialFixture(f: WorkFixture, options: TrialPreparationOptions): Promise<PreparedTrial>;
export function preparedTrialFixture(f: WorkFixture, options: TrialPreparationOptions = {}) { return prepareTrial(f, options); }
async function prepareTrial(f: WorkFixture, options: TrialPreparationOptions) {
 const { createHash } = await import("node:crypto");
 const { FreeFirstJobLifecycleRepository } = await import("../src/free-first-job-lifecycle-repository.js");
 const { EvidenceService } = await import("../src/evidence.js");
 const { ProofCommandService } = await import("../src/proof-repository.js");
 const a = await meterCompany(f), verification = await verifyBusiness(f, a);
 const draftId = randomUUID(), revisionId = randomUUID(), documentId = randomUUID();
 const scopeRevisionId = randomUUID(), lineId = randomUUID(), acceptanceId = randomUUID(), sendId = randomUUID();
 const description = options.description ?? "Fictional trial electrical installation", contentHash = "a".repeat(64);
 const documentSnapshot = { schemaVersion: "quote-document.v1", documentVersion: 1,
  reference: "SYN-TRIAL-PREP", quoteRevisionId: revisionId, currency: "GBP",
  issuer: { name: "Fictional trial builder", address: ["1 Fictional Street"], email: "builder@example.invalid" },
  customer: { name: "Fictional customer", address: ["2 Fictional Street"], email: "customer@example.invalid" },
  lines: [{ scopeItemId: a.scopeId, description, quantity: "1", unit: "item", netPence: 100000 }],
  exclusions: [], qualifications: ["Synthetic fixture only"], subtotalPence: 100000,
  discountPence: 0, netPence: 100000, taxPence: 20000, totalPence: 120000 };
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
   VALUES($1,$2,$3,$4,1,$5,'1','item',100000,100000)`, [scopeRevisionId,a.tenantId,a.jobId,a.scopeId,description]);
  await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId,a.tenantId,a.jobId]);
  await db.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
   VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',100000,0,100000,20000,120000,true,'[]')`, [revisionId,a.tenantId,a.jobId,draftId]);
  await db.query(`INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal)
   VALUES($1,$2,$3,$4,$5,$6,'human',$7,true,'1','item',100000,'0','standard_rate_20','entered',1)`, [lineId,a.tenantId,a.jobId,revisionId,a.scopeId,scopeRevisionId,description]);
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot,parties_snapshot)
   SELECT $1,$2,$3,$4,1,'SYN-TRIAL-PREP',$5,$6,'synthetic-v1',1,$7,$8,$9,snapshot
   FROM app.job_party_snapshot WHERE tenant_id=$2 AND job_id=$3`, [documentId,a.tenantId,a.jobId,revisionId,contentHash,`synthetic/trial/${documentId}.pdf`,JSON.stringify(documentSnapshot.issuer),JSON.stringify(documentSnapshot.customer),JSON.stringify(documentSnapshot)]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [documentId,a.tenantId,a.jobId,contentHash]);
  await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
   VALUES($1,$2,$3,$4,1,$5,120000,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [acceptanceId,a.tenantId,a.jobId,documentId,contentHash,a.actorId]);
  await db.query(`INSERT INTO app.quote_send(id,tenant_id,job_id,document_id,content_hash,authorization_id,outbox_action_id,recipients)
   VALUES($1,$2,$3,$4,$5,$6,$7,'["customer@example.invalid"]')`, [sendId,a.tenantId,a.jobId,documentId,contentHash,randomUUID(),randomUUID()]);
  // The live seed may have an imported baseline; accepted quotes have no live baseline.
  await db.query("UPDATE app.job SET status='accepted',provenance='system_generated_quote',baseline_quote_version_id=NULL,accepted_net_value_pence=NULL,fee_policy_version=NULL,recovery_cap_pence=NULL,accepted_quote_version_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
 });
 const lifecycle = new FreeFirstJobLifecycleRepository(f.runtime);
 const target = (await lifecycle.read(a.context, a.digest, a.jobId)).target;
 const activation = options.withTrial !== false ? await lifecycle.activate(a.context, a.digest, a.actorId, {
  version: "trial-switch-live.v1", commandId: randomUUID(), jobId: a.jobId, ...target,
 }) : await workTenant(f.admin, a.tenantId, async db => {
  // Ordinary control: accepted commercial parents only, no trial or check result.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.job SET status='live',baseline_quote_version_id=$3,accepted_net_value_pence=100000,fee_policy_version='reference_fee_policy_v3',recovery_cap_pence=NULL WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
  return null;
 });
 // Cover every confirmed scope, including the first scope required by assembly.
 const scopes = (await f.admin.query<{ id: string }>("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY created_at,id", [a.tenantId,a.jobId])).rows;
 await workTenant(f.admin, a.tenantId, async db => {
  for (const scope of scopes) await db.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'not_started') ON CONFLICT DO NOTHING", [a.tenantId,a.jobId,scope.id]);
 });
 const storage = new TrialProofStorage(), evidence = new EvidenceService(f.runtime, storage);
 const proof = new ProofCommandService(f.runtime, storage), bytes = options.proofBytes ?? generatePracticePng();
 const sha256 = createHash("sha256").update(bytes).digest("hex");
 const proofs = [];
 for (const scope of scopes) {
  const upload = await evidence.beginUpload(a.context, { jobId: a.jobId, scopeItemId: scope.id,
   expectedSha256: sha256, contentType: "image/png", maximumBytes: 100,
   retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3600000) });
  storage.put(upload.objectKey, "v1", bytes);
  await evidence.finalize(a.context, { commandId: randomUUID(), uploadId: upload.id,
   objectVersionId: "v1", evidenceType: "electrical_certificate" });
  const completion = await proof.complete(a.context, { version: "proof.complete.v1", commandId: randomUUID(),
   actorMembershipId: a.actorId, jobId: a.jobId, scopeItemId: scope.id, stage: "electrical-stage",
   evidenceId: upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null });
  proofs.push({ scopeId: scope.id, evidenceId: upload.id, completionId: completion.completionId,
   objectKey: upload.objectKey, objectVersionId: "v1", sha256, byteLength: bytes.length });
 }
 return { ...a, verification, draftId, revisionId, documentId, scopeRevisionId, lineId,
  acceptanceId, sendId, contentHash, activation, proofs, storage };
}
