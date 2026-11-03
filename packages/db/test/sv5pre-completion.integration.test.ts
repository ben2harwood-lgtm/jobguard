import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLockFixture, closeLockFixture, seedAccount, prepareLock, asFixtureTenant, publishFixtureCompletion, LOCK_OWNER, LOCK_HASH } from "./sv5pre-fixtures.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { FinalCheckCompletionRepository } from "../src/shadow-detection-repository.js";

describe("SV5PRE authoritative completion", () => {
 let f: Awaited<ReturnType<typeof createLockFixture>>;
 beforeAll(async () => { f = await createLockFixture(); }, 60000);
 afterAll(async () => { if (f) await closeLockFixture(f); });
 // Canonical PostgreSQL JSON text preserves timestamps and bytes; every snapshot is tenant-scoped.
 async function rows(tenantId: string, relation: string) {
  return (await f.admin.query(`SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb)::text snapshot FROM (SELECT to_jsonb(t) value FROM ${relation} t WHERE tenant_id=$1) q`, [tenantId])).rows[0].snapshot as string;
 }
 async function commercialEffects(tenantId: string) {
  const snapshot: Record<string, string> = {};
  for (const table of ['job','final_account_revision','final_account_line','final_account_lock','customer_invoice_sequence','customer_invoice','customer_invoice_evidence','final_account_invoice_binding','final_account_invoiced_line','decision','decision_resolution','action_authorization','action_outbox','command_receipt','customer_payment','landing_allocation','recovery_fee_derivation','recovery_fee_journal','recovery_eligibility_revision','journal']) {
   snapshot[table] = await rows(tenantId, `app.${table}`);
  }
  snapshot.outbox_signal = await rows(tenantId, 'infrastructure.outbox_signal');
  return snapshot;
 }
 async function auditEffects(tenantId: string) {
  return { events: await rows(tenantId, 'app.audit_event'), head: await rows(tenantId, 'audit_control.audit_head') };
 }
 async function locked() { const a=await seedAccount(f.admin); const repo=await prepareLock(f,a); await repo.lock(a.context,a.input); return a; }
 it("PRE-Q5-R1 the lock refuses while a pre-lock site photo is still pending, and succeeds once it is checked (per C135)",async()=>{
  const a=await seedAccount(f.admin),uploadId=randomUUID(),repo=await prepareLock(f,a);
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,repeat('a',64),'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')",[a.tenantId,a.jobId,uploadId,a.scopeItemId,`sv5pre/${uploadId}`]));
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId]));
  await repo.lock(a.context,a.input);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(1);
 });
 it("C244 a live pending non-photo upload blocks the lock",async()=>{
  const a=await seedAccount(f.admin),uploadId=randomUUID(),repo=await prepareLock(f,a);
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day')",[a.tenantId,a.jobId,uploadId,a.scopeItemId,`c244/${uploadId}`]));
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId]));
  await repo.lock(a.context,a.input);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(1);
 });
 it("C204 rejected and expired-unswept uploads are excluded and recorded; pending and quarantined scans block until checked",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),ids={rejected:randomUUID(),quarantined:randomUUID(),expired:randomUUID(),live:randomUUID()};
  const upload=(id:string,state:string,expires:string,extra="")=>asFixtureTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state${extra?",rejection_code":""}) VALUES($1,$2,$3,$4,$5,repeat('a',64),'image/png',100,'standard_evidence',${expires},$6${extra?",'SYNTHETIC'":""})`,[a.tenantId,a.jobId,id,a.scopeItemId,`c204/${id}`,state]));
  await upload(ids.rejected,"rejected","clock_timestamp()+interval '1 day'","x");
  await upload(ids.quarantined,"quarantined","clock_timestamp()+interval '1 day'");
  await upload(ids.expired,"pending","clock_timestamp()+interval '1 millisecond'");
  await upload(ids.live,"pending","clock_timestamp()+interval '1 day'");
  await new Promise(r=>setTimeout(r,50));
  // Pending and mid-scan uploads block; quarantine has no final-state discriminator.
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state='quarantined' WHERE tenant_id=$1 AND id=$2",[a.tenantId,ids.live]));
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=ANY($2::uuid[])",[a.tenantId,[ids.quarantined,ids.live]]));
  await repo.lock(a.context,a.input);
  await publishFixtureCompletion(f.shadow,f.admin,a.tenantId,a.jobId);
  const manifest=(await f.admin.query("SELECT id,source_count FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];
  expect(manifest.source_count).toBe(4);
  const rows=(await f.admin.query("SELECT upload_id,excluded_state,excluded_reason FROM app.final_check_manifest_source WHERE tenant_id=$1 AND manifest_id=$2 ORDER BY excluded_state,upload_id",[a.tenantId,manifest.id])).rows;
  expect(rows.map(r=>r.excluded_state).sort()).toEqual(["expired","rejected","rejected","rejected"]);
  expect(rows.find(r=>r.upload_id===ids.rejected)).toMatchObject({excluded_state:"rejected",excluded_reason:"SYNTHETIC"});
  expect(rows.find(r=>r.upload_id===ids.expired)).toMatchObject({excluded_state:"expired",excluded_reason:"expired_unswept"});
  const audit=(await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='final_check.sources_excluded'",[a.tenantId])).rows;
  expect(audit).toHaveLength(1);
  const exclusions=rows.map(r=>({uploadId:r.upload_id,state:r.excluded_state,reason:r.excluded_reason})).sort((a,b)=>a.uploadId.localeCompare(b.uploadId));
  expect(exclusions).toHaveLength(4);
  const binding=(await f.admin.query("SELECT lock_id,app.final_lock_hash($3::jsonb) digest FROM app.final_check_manifest WHERE tenant_id=$1 AND id=$2",[a.tenantId,manifest.id,JSON.stringify(exclusions)])).rows[0];
  expect(audit).toEqual([{payload:{references:{auditTrust:"checked_operation",manifestId:manifest.id,lockId:binding.lock_id},hashes:{exclusions:binding.digest}}}]);
  const issued=await repo.issueInvoice(a.context,{jobId:a.jobId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:LOCK_HASH,invoiceKind:"final",recipient:"practice-customer@example.invalid",issuedOn:"2026-10-20"});
  expect(issued.invoiceId).toBeTruthy();
 });
 it("C204 a lock timeout that no upload caused is FINAL_ACCOUNT_LOCK_BUSY, not an uploads-in-progress refusal",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),holder=await f.admin.connect();
  try {
   await holder.query("BEGIN");
   await holder.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
   await holder.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 FOR SHARE",[a.tenantId,a.jobId]);
   await expect(new FinalAccountLockRepository(f.runtime,300).lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_LOCK_BUSY"});
  } finally { await holder.query("ROLLBACK"); holder.release(); }
  await repo.lock(a.context,a.input);
 });
 it("C238 a mid-scan photo blocks the lock even after expiry, then its verified original is retained",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),uploadId=randomUUID(),evidenceId=randomUUID();
  await asFixtureTenant(f.runtime,a.tenantId,async db=>{
   await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,repeat('a',64),'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')",[a.tenantId,a.jobId,uploadId,a.scopeItemId,`mid-scan/${uploadId}`]);
   await db.query("UPDATE app.evidence_upload SET state='quarantined' WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId]);
  });
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId]));
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  await asFixtureTenant(f.runtime,a.tenantId,async db=>{
   await db.query("UPDATE app.evidence_upload SET state='verified',server_verified_at=clock_timestamp(),object_version_id='scan.v1' WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId]);
   await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) SELECT tenant_id,job_id,$3,id,scope_item_id,'original','site_photo',object_key,object_version_id,expected_sha256,1,expected_content_type,retention_class,server_received_at,server_verified_at FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId,evidenceId]);
  });
  await repo.lock(a.context,a.input);
  // Test the database boundary as runtime, before the manifest could silently lose this original.
  for(const state of ["rejected","quarantined","expired"]) {
   await expect(asFixtureTenant(f.runtime,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state=$3,rejection_code='SYNTHETIC',server_verified_at=NULL WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId,state]))).rejects.toThrow(state==="quarantined" ? "POST_LOCK_WORK_REQUIRES_LINKED_JOB" : "FINAL_CHECK_VERIFIED_SOURCE_LOCKED");
  }
  expect((await f.admin.query("SELECT state FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId])).rows).toEqual([{state:"verified"}]);
  await publishFixtureCompletion(f.shadow,f.admin,a.tenantId,a.jobId);
  expect((await f.admin.query("SELECT upload_id,evidence_id,excluded_state,excluded_reason FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{upload_id:uploadId,evidence_id:evidenceId,excluded_state:null,excluded_reason:null}]);
 });
 it.each(["rejected","quarantined","expired"])("C238 the database guard refuses verified -> %s after lock independently of the photo guard",async state=>{
  const x=await sourceFixture();await finalize(x);
  await expect(asFixtureTenant(f.runtime,x.a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state=$3,rejection_code='SYNTHETIC',server_verified_at=NULL WHERE tenant_id=$1 AND id=$2",[x.a.tenantId,x.uploadId,state]))).rejects.toThrow("FINAL_CHECK_VERIFIED_SOURCE_LOCKED");
  expect((await f.admin.query("SELECT state FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2",[x.a.tenantId,x.uploadId])).rows).toEqual([{state:"verified"}]);
 });
 it("C238 another tenant's in-flight upload cannot affect this tenant's lock or busy code",async()=>{
  const a=await seedAccount(f.admin),b=await seedAccount(f.admin),repo=await prepareLock(f,a);
  await prepareLock(f,b);
  const upload=await openUpload(b);
  const busy=await seedAccount(f.admin,a.tenantId),holder=await f.admin.connect();
  await prepareLock(f,busy);
  try {
   await repo.lock(a.context,a.input);
   await holder.query("BEGIN");
   await holder.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
   await holder.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 FOR SHARE",[a.tenantId,busy.jobId]);
   await expect(new FinalAccountLockRepository(f.runtime,300).lock(busy.context,busy.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_LOCK_BUSY"});
   await expect(new FinalAccountLockRepository(f.runtime,300).lock(b.context,b.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
  } finally {
   await holder.query("ROLLBACK");holder.release();
   await upload.db.query("ROLLBACK");upload.db.release();
  }
 });
 it("PRE-Q5-01 a completed string without a run is refused", async () => {
  const a=await locked(); await expect(asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,status) VALUES($1,$2,$3,'completed')",[a.tenantId,a.jobId,randomUUID()]))).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
 });
 it("PRE-Q5-02 the reconciliation default is not completion evidence", async () => {
  const a=await locked(),run=randomUUID(); const cutoff=(await f.admin.query('SELECT locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].cutoff;await asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at) VALUES($1,$2,$3,'synthetic.v1',$4::timestamptz)",[a.tenantId,a.jobId,run,cutoff]));
  await expect(new FinalCheckCompletionRepository(f.shadow).publish(a.context,{version:"final-check-publication.v1",jobId:a.jobId,runId:run,checkId:randomUUID()})).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");
 });
 it("PRE-Q5-07 explicit zero results survive a fresh connection", async () => {
  const a=await locked(),repo=new FinalCheckCompletionRepository(f.shadow);
  const manifest=await repo.freeze(a.context,{version:"final-check-manifest.v1",jobId:a.jobId,manifestId:randomUUID(),detectorVersion:"synthetic.v1",reconciliationVersion:"synthetic.v1"});
  expect(manifest.sourceCount).toBe(0);
  const runId=randomUUID(); await repo.bindEmptyRun(a.context,{version:"final-check-empty-run.v1",jobId:a.jobId,manifestId:manifest.id,runId,executionId:randomUUID()});
  const checkId=randomUUID(); await repo.publish(a.context,{version:"final-check-publication.v1",jobId:a.jobId,runId,checkId});
  const connection=await f.admin.connect(); try { expect((await connection.query("SELECT check_id,run_id FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{check_id:checkId,run_id:runId}]); } finally { connection.release(); }
 });
 it("PRE-Q5-12 publication retries preserve identity and failure history", async () => {
  const x = await sourceFixture(), { a, repo, runId } = x, checkId = randomUUID();
  await runWithZero(x);
  const source = (await repo.sources(a.context, a.jobId, x.manifest.id))[0]!;
  const failure = { version: "final-check-attempt.v1" as const, jobId: a.jobId, manifestId: x.manifest.id,
   sourceId: source.id, attemptId: randomUUID(), executionId: x.executionId, stage: 'detection' as const,
   processingVersion: 'synthetic.v1', inputHash: source.frozen_input_hash, outcome: 'failed' as const,
   failureCode: 'INPUT_UNAVAILABLE', resultHash: null, resultSignalIds: [], evidenceId: null,
   objectVersionId: null, sha256: null, sourceReceivedAt: null };
  await repo.recordAttempt(a.context, failure);
  const publication = { version: "final-check-publication.v1" as const, jobId: a.jobId, runId, checkId };
  const commercialBefore = await commercialEffects(a.tenantId), auditBefore = await auditEffects(a.tenantId);
  await expect(repo.publish(a.context, publication)).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  expect(await auditEffects(a.tenantId)).toEqual(auditBefore);
  const evidence = await finalize(x);
  await attempt(x, evidence, 'detection'); await attempt(x, evidence, 'reconciliation');
  await repo.publish(a.context, publication);
  const publishedAudit = await auditEffects(a.tenantId), certificate = await rows(a.tenantId, 'app.shadow_final_check_completion');
  await repo.publish(a.context, publication);
  expect(await rows(a.tenantId, 'app.shadow_final_check_completion')).toBe(certificate);
  expect(await auditEffects(a.tenantId)).toEqual(publishedAudit);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='final_check.completed' AND subject_ref=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  await expect(repo.publish(a.context, { ...publication, runId: randomUUID() })).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');
  expect(await rows(a.tenantId, 'app.shadow_final_check_completion')).toBe(certificate);
  expect(await auditEffects(a.tenantId)).toEqual(publishedAudit);
  // A later failed attempt cannot be erased by replaying the old successful publication.
  const laterFailure = { ...failure, attemptId: randomUUID() };
  await repo.recordAttempt(a.context, laterFailure);
  const attemptsBeforeReplay = await rows(a.tenantId, 'app.shadow_final_check_source_attempt');
  await repo.publish(a.context, publication);
  expect(await rows(a.tenantId, 'app.shadow_final_check_source_attempt')).toBe(attemptsBeforeReplay);
  expect((await f.admin.query("SELECT id FROM app.shadow_final_check_source_attempt WHERE tenant_id=$1 AND outcome='failed' ORDER BY id", [a.tenantId])).rows).toEqual([failure.attemptId, laterFailure.attemptId].sort().map(id => ({ id })));
  await expect(repo.publish(a.context, { ...publication, checkId: randomUUID() })).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  await expect(new FinalAccountLockRepository(f.runtime).issueInvoice(a.context, { jobId: a.jobId,
   actorMembershipId: a.input.actorMembershipId, commandId: randomUUID(), finalAccountRevisionId: a.revisionId,
   expectedSourceHash: 'a'.repeat(64), invoiceKind: 'final', recipient: 'practice-customer@example.invalid', issuedOn: '2026-10-13' })).rejects.toMatchObject({ code: 'FINAL_CHECK_NOT_COMPLETE' });
  expect(await commercialEffects(a.tenantId)).toEqual(commercialBefore);
  expect(await rows(a.tenantId, 'app.shadow_final_check_completion')).toBe(certificate);
  expect(await auditEffects(a.tenantId)).toEqual(publishedAudit);
 });
 it("S3 non-empty fixture commits inventory before recording both stages and completion", async () => {
  const a=await seedAccount(f.admin),uploadId=randomUUID(),evidenceId=randomUUID();
  await asFixtureTenant(f.admin,a.tenantId,async db=>{
   await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day')",[a.tenantId,a.jobId,uploadId,a.scopeItemId,`sv5pre/${uploadId}`]);
   await db.query("UPDATE app.evidence_upload SET state='verified',server_verified_at=clock_timestamp(),object_version_id='immutable.v1' WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId]);
   await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) SELECT tenant_id,job_id,$3,id,scope_item_id,'original','photo',object_key,object_version_id,expected_sha256,1,'application/pdf',retention_class,server_received_at,server_verified_at FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2",[a.tenantId,uploadId,evidenceId]);
  });
  const lock=await prepareLock(f,a);await lock.lock(a.context,a.input);
  const checkId=await publishFixtureCompletion(f.shadow,f.admin,a.tenantId,a.jobId);
  const source=(await f.admin.query("SELECT id,manifest_id FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows;
  expect(source).toHaveLength(1);
  const attempts=(await f.admin.query("SELECT source_id,manifest_id,stage,outcome,evidence_id FROM app.shadow_final_check_source_attempt WHERE tenant_id=$1 AND job_id=$2 ORDER BY stage",[a.tenantId,a.jobId])).rows;
  expect(attempts).toEqual(["detection","reconciliation"].map(stage=>({source_id:source[0].id,manifest_id:source[0].manifest_id,stage,outcome:"succeeded",evidence_id:evidenceId})));
  expect((await f.admin.query("SELECT check_id,manifest_id FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{check_id:checkId,manifest_id:source[0].manifest_id}]);
 });
 async function sourceFixture(){
  const a=await seedAccount(f.admin),uploadId=randomUUID();
  // Set-up only (C245): terminal upload before lock; finalize() supplies the original later.
  await asFixtureTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,server_verified_at,object_version_id) VALUES($1,$2,$3,$4,$5,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',clock_timestamp(),'immutable.v1')",[a.tenantId,a.jobId,uploadId,a.scopeItemId,`sv5pre/${uploadId}`]));
  const lock=await prepareLock(f,a);await lock.lock(a.context,a.input);const repo=new FinalCheckCompletionRepository(f.shadow);
  const manifest=await repo.freeze(a.context,{version:"final-check-manifest.v1",jobId:a.jobId,manifestId:randomUUID(),detectorVersion:"synthetic.v1",reconciliationVersion:"synthetic.v1"});
  return {a,uploadId,repo,manifest,executionId:randomUUID(),runId:randomUUID()};
 }
 async function runWithZero(x:Awaited<ReturnType<typeof sourceFixture>>){
  await asFixtureTenant(f.shadow,x.a.tenantId,async db=>{
   await db.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at) VALUES($1,$2,$3,'synthetic.v1',$4)",[x.a.tenantId,x.a.jobId,x.runId,x.manifest.cutoff]);
   await db.query("INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor) VALUES($1,$2,$3,$3,'final-check-result.v1',$4)",[x.a.tenantId,x.a.jobId,x.runId,{version:"final-check-result.v1",outcome:"zero_result"}]);
   await db.query("INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic.v1','synthetic.v1')",[x.a.tenantId,x.a.jobId,x.runId,x.manifest.id,x.manifest.lockId,x.manifest.cutoff,x.executionId]);
  });
 }
 async function finalize(x:Awaited<ReturnType<typeof sourceFixture>>,receivedAt:string|null=null){
  const evidenceId=randomUUID();await asFixtureTenant(f.admin,x.a.tenantId,async db=>{
   await db.query("UPDATE app.evidence_upload SET state='verified',server_verified_at=clock_timestamp(),object_version_id='immutable.v1' WHERE tenant_id=$1 AND id=$2",[x.a.tenantId,x.uploadId]);
   await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','photo',$6,'immutable.v1',repeat('a',64),1,'application/pdf','standard_evidence',coalesce($7::timestamptz,(SELECT server_received_at FROM app.evidence_upload WHERE tenant_id=$1 AND id=$4)),clock_timestamp())",[x.a.tenantId,x.a.jobId,evidenceId,x.uploadId,x.a.scopeItemId,`sv5pre/${x.uploadId}`,receivedAt]);
  });return evidenceId;
 }
 async function attempt(x:Awaited<ReturnType<typeof sourceFixture>>,evidenceId:string,stage:"detection"|"reconciliation"){
  const source=(await x.repo.sources(x.a.context,x.a.jobId,x.manifest.id))[0]!;
  const received=(await f.admin.query("SELECT to_char(server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') received FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",[x.a.tenantId,evidenceId])).rows[0].received;
  await x.repo.recordAttempt(x.a.context,{version:"final-check-attempt.v1",jobId:x.a.jobId,manifestId:x.manifest.id,sourceId:source.id,attemptId:randomUUID(),executionId:x.executionId,stage,processingVersion:"synthetic.v1",inputHash:stage==='detection'?source.frozen_input_hash:'b'.repeat(64),outcome:'succeeded',failureCode:null,resultHash:'b'.repeat(64),resultSignalIds:[],evidenceId,objectVersionId:'immutable.v1',sha256:'a'.repeat(64),sourceReceivedAt:received});
 }
 it("PRE-Q5-03 r1 preserves supplied upload and object times and their composite identity",async()=>{
  const a=await seedAccount(f.admin),uploadId=randomUUID(),evidenceId=randomUUID();
  const uploadTime='2026-09-30T10:00:00.000001Z',objectTime='2026-09-30T10:00:00.000002Z';
  await asFixtureTenant(f.admin,a.tenantId,async db=>{
   await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,server_received_at,state,server_verified_at,object_version_id) VALUES($1,$2,$3,$4,$5,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day',$6::timestamptz,'verified',clock_timestamp(),'immutable.v1')",[a.tenantId,a.jobId,uploadId,a.scopeItemId,`sv5pre/${uploadId}`,uploadTime]);
   await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','photo',$6,'immutable.v1',repeat('a',64),1,'application/pdf','standard_evidence',$7::timestamptz,clock_timestamp())",[a.tenantId,a.jobId,evidenceId,uploadId,a.scopeItemId,`sv5pre/${uploadId}`,objectTime]);
  });
  expect((await f.admin.query("SELECT u.server_received_at=$3::timestamptz upload_time_exact,e.server_received_at=$4::timestamptz object_time_exact FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id) WHERE u.tenant_id=$1 AND u.id=$2",[a.tenantId,uploadId,uploadTime,objectTime])).rows).toEqual([{upload_time_exact:true,object_time_exact:true}]);
  const lock=await prepareLock(f,a);await lock.lock(a.context,a.input);const repo=new FinalCheckCompletionRepository(f.shadow);
  const manifest=await repo.freeze(a.context,{version:"final-check-manifest.v1",jobId:a.jobId,manifestId:randomUUID(),detectorVersion:"synthetic.v1",reconciliationVersion:"synthetic.v1"});
  expect(manifest.sourceCount).toBe(1);
  expect((await f.admin.query("SELECT source_received_at=$3::timestamptz upload_time_exact,evidence_received_at=$4::timestamptz object_time_exact,evidence_id FROM app.final_check_manifest_source WHERE tenant_id=$1 AND manifest_id=$2",[a.tenantId,manifest.id,uploadTime,objectTime])).rows).toEqual([{upload_time_exact:true,object_time_exact:true,evidence_id:evidenceId}]);
  const x={a,uploadId,repo,manifest,executionId:randomUUID(),runId:randomUUID()};
  await attempt(x,evidenceId,'detection');await attempt(x,evidenceId,'reconciliation');await runWithZero(x);
  const checkId=randomUUID();await repo.publish(a.context,{version:"final-check-publication.v1",jobId:a.jobId,runId:x.runId,checkId});
  expect((await f.admin.query("SELECT check_id FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{check_id:checkId}]);
 });
 it("PRE-Q5-04 r1 a post-cutoff object cannot pass as pre-lock evidence",async()=>{
  const x=await sourceFixture(),evidenceId=await finalize(x,'2099-01-01T00:00:00.000001Z');
  await expect(attempt(x,evidenceId,'detection')).rejects.toThrow('FINAL_CHECK_INPUT_UNAVAILABLE');
  await runWithZero(x);
  await expect(x.repo.publish(x.a.context,{version:"final-check-publication.v1",jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[x.a.tenantId,x.a.jobId])).rows[0].n).toBe(0);
 });
 it("PRE-Q5-03 r1 a pre-cutoff object outside the frozen upload inventory blocks completion",async()=>{
  const x=await sourceFixture(),laterUpload=randomUUID(),laterEvidence=randomUUID();
  await asFixtureTenant(f.admin,x.a.tenantId,async db=>{
   await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,server_verified_at,object_version_id) VALUES($1,$2,$3,$4,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',clock_timestamp(),'immutable.v1')",[x.a.tenantId,x.a.jobId,laterUpload,`sv5pre/${laterUpload}`]);
   await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','photo',$5,'immutable.v1',repeat('a',64),1,'application/pdf','standard_evidence','2026-09-30T10:00:00Z',clock_timestamp())",[x.a.tenantId,x.a.jobId,laterEvidence,laterUpload,`sv5pre/${laterUpload}`]);
  });
  const evidence=await finalize(x);await attempt(x,evidence,'detection');await attempt(x,evidence,'reconciliation');await runWithZero(x);
  await expect(x.repo.publish(x.a.context,{version:"final-check-publication.v1",jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_INVENTORY_INCOMPLETE');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[x.a.tenantId,x.a.jobId])).rows[0].n).toBe(0);
 });
 it("PRE-Q5-03 r1 refuses a post-lock upload backdated into the frozen inventory",async()=>{
  const x=await sourceFixture();
  await expect(asFixtureTenant(f.admin,x.a.tenantId,db=>db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,server_received_at) VALUES($1,$2,$3,$4,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day',$5::timestamptz)",[x.a.tenantId,x.a.jobId,randomUUID(),`sv5pre/${randomUUID()}`,x.manifest.cutoff]))).rejects.toThrow('FINAL_CHECK_SOURCE_IDENTITY_CHANGED');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2",[x.a.tenantId,x.a.jobId])).rows[0].n).toBe(1);
 });
 it("PRE-Q5-03 the manifest inventories sources rather than existing signals",async()=>{
  const x=await sourceFixture();expect(x.manifest.sourceCount).toBe(1);const sources=await x.repo.sources(x.a.context,x.a.jobId,x.manifest.id);expect(sources).toHaveLength(1);expect(sources[0]).toMatchObject({id:x.uploadId,upload_id:x.uploadId,evidence_id:null});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE tenant_id=$1",[x.a.tenantId])).rows[0].n).toBe(0);
 });
 it("PRE-Q5-04 a delayed pre-lock source blocks both invoice paths until processed",async()=>{
  const x=await sourceFixture();await runWithZero(x);
  await expect(asFixtureTenant(f.runtime,x.a.tenantId,db=>db.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,'practice-customer@example.invalid','2026-10-13'::date)",[x.a.tenantId,x.a.jobId,x.a.revisionId,x.a.input.actorMembershipId,randomUUID()]))).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  for(const kind of ['final','supplementary'])await expect(asFixtureTenant(f.runtime,x.a.tenantId,db=>db.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,$6,'practice-customer@example.invalid','2026-10-13'::date,$7)",[x.a.tenantId,x.a.jobId,x.a.revisionId,x.a.input.actorMembershipId,randomUUID(),kind,'a'.repeat(64)]))).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  await expect(x.repo.publish(x.a.context,{version:"final-check-publication.v1",jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  const evidence=await finalize(x);await attempt(x,evidence,'detection');await attempt(x,evidence,'reconciliation');await x.repo.publish(x.a.context,{version:"final-check-publication.v1",jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1",[x.a.tenantId])).rows[0].n).toBe(1);
 });
 it("PRE-Q5-05 unprocessable sources never count as successful empty output",async()=>{
  const x=await sourceFixture();await runWithZero(x);
  for(const outcome of ['pending','failed','invalidated']as const){await x.repo.recordAttempt(x.a.context,{version:"final-check-attempt.v1",jobId:x.a.jobId,manifestId:x.manifest.id,sourceId:x.uploadId,attemptId:randomUUID(),executionId:x.executionId,stage:'detection',processingVersion:'synthetic.v1',inputHash:(await x.repo.sources(x.a.context,x.a.jobId,x.manifest.id))[0]!.frozen_input_hash,outcome,failureCode:'INPUT_UNAVAILABLE',resultHash:null,resultSignalIds:[],evidenceId:null,objectVersionId:null,sha256:null,sourceReceivedAt:null});await expect(x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');}
 });
 it("PRE-Q5-06 both processing stages are required for every manifest source",async()=>{
  const x=await sourceFixture();await runWithZero(x);const evidence=await finalize(x);await attempt(x,evidence,'detection');await expect(x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');await attempt(x,evidence,'reconciliation');await x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()});
 });
 it("PRE-Q5-08 completion preserves qualified identity and microsecond cutoff",async()=>{
  const a=await locked(),lock=(await f.admin.query('SELECT id,locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0];
  await expect(asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,run_id,status) VALUES($1,$2,$3,$4,$5::timestamptz+interval '1 microsecond',$6,'completed')",[a.tenantId,a.jobId,randomUUID(),lock.id,lock.cutoff,randomUUID()]))).rejects.toMatchObject({code:'23503'});
 });
 it("PRE-Q5-09 classification and persisted result availability precede completion",async()=>{
  const x=await sourceFixture(),evidence=await finalize(x);await attempt(x,evidence,'detection');await attempt(x,evidence,'reconciliation');
  await asFixtureTenant(f.shadow,x.a.tenantId,async db=>{await db.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at) VALUES($1,$2,$3,'synthetic.v1',$4)",[x.a.tenantId,x.a.jobId,x.runId,x.manifest.cutoff]);await db.query("INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic.v1','synthetic.v1')",[x.a.tenantId,x.a.jobId,x.runId,x.manifest.id,x.manifest.lockId,x.manifest.cutoff,x.executionId]);});
  await expect(x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_RESULT_UNAVAILABLE');
 });
 it("r11 concurrent evidence writers keep compatible live locks and exclude final locking until both commit", async () => {
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);
  const writers=await Promise.all([f.runtime.connect(),f.runtime.connect()]),probe=await f.admin.connect();
  try {
   for(const db of writers) {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query("SELECT app.require_watchdog_live($1)",[a.jobId]);
   }
   // Both already hold the merged live guard's SHARE lock. An UPDATE upgrade cannot succeed here.
   // The merged recovery_message_source_write trigger (0107) also takes ONE tenant-wide exclusive advisory
   // lock per evidence_upload write, held to commit, so two writers in one tenant serialise: the second INSERT
   // waits for the first COMMIT. Start both, prove the second is still waiting, then commit in order.
   const insert=(db:typeof writers[number])=>db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3::uuid,$3::text,repeat('a',64),'image/png',100,'standard_evidence','2099-01-01')",[a.tenantId,a.jobId,randomUUID()]);
   await insert(writers[0]!);
   const second=insert(writers[1]!);
   let secondDone=false;second.then(()=>{secondDone=true;},()=>{secondDone=true;});
   await new Promise(r=>setTimeout(r,200));
   expect(secondDone).toBe(false);
   const exclusive=()=>probe.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT",[a.tenantId,a.jobId]);
   await expect(exclusive()).rejects.toMatchObject({code:'55P03'});
   await writers[0]!.query("COMMIT");
   await second;
   await expect(exclusive()).rejects.toMatchObject({code:'55P03'});
   await writers[1]!.query("COMMIT");
   expect((await exclusive()).rowCount).toBe(1);
   // Was: the lock succeeded straight away. Per C135 it is refused while the two photo uploads are still pending.
   await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:"FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"});
   await asFixtureTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND job_id=$2 AND state='pending'",[a.tenantId,a.jobId]));
   await repo.lock(a.context,a.input);
   const manifest=await new FinalCheckCompletionRepository(f.shadow).freeze(a.context,{version:'final-check-manifest.v1',jobId:a.jobId,manifestId:randomUUID(),detectorVersion:'synthetic.v1',reconciliationVersion:'synthetic.v1'});
   expect(manifest.sourceCount).toBe(2);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
  } finally {
   for(const db of writers) { await db.query("ROLLBACK"); db.release(); }
   probe.release();
  }
 });

 // Decision 17 (Ben, 14 Oct): the lock WAITS (bounded) for uploads already in progress; nothing slips past it.
 async function openUpload(a: { tenantId: string; jobId: string }) {
  const db = await f.runtime.connect();
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
  const id = randomUUID();
  try { await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3::uuid,$3::text,repeat('a',64),'image/png',100,'standard_evidence','2099-01-01')", [a.tenantId, a.jobId, id]); }
  catch (error) { await db.query("ROLLBACK"); db.release(); throw error; }
  return { db, id };
 }
 it("D17-a an upload started before the lock finishes first, then the lock completes and the upload is in the frozen check", async () => {
  const a = await seedAccount(f.admin), repo = await prepareLock(f, a), w = await openUpload(a);
  try {
   const lock = repo.lock(a.context, a.input);
   let done = false; lock.then(() => { done = true; }, () => { done = true; });
   await new Promise(r => setTimeout(r, 300));
   expect(done).toBe(false);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
   await w.db.query("COMMIT");
   // Was: the lock completed once the upload committed. Per C135 it is refused while that photo is pending, and completes once it is checked.
   await expect(lock).rejects.toMatchObject({ code: "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS" });
   await asFixtureTenant(f.admin, a.tenantId, db => db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=$2", [a.tenantId, w.id]));
   const locked = await repo.lock(a.context, a.input);
   const manifest = await new FinalCheckCompletionRepository(f.shadow).freeze(a.context, { version: 'final-check-manifest.v1', jobId: a.jobId, manifestId: randomUUID(), detectorVersion: 'synthetic.v1', reconciliationVersion: 'synthetic.v1' });
   expect(manifest.sourceCount).toBe(1);
   const src = (await f.admin.query("SELECT upload_id, source_received_at <= $3::timestamptz ok FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId, (await f.admin.query("SELECT locked_at::text t FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].t])).rows;
   expect(src).toEqual([{ upload_id: w.id, ok: true }]);
   expect(locked.id).toBeTruthy();
  } finally { await w.db.query("ROLLBACK"); w.db.release(); }
 });
 it("D17-b an upload started after the lock is refused", async () => {
  const a = await locked();
  await expect(openUpload(a)).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
 });
 it("D17-c the lock is not blocked forever by an upload that never finishes", async () => {
  const a = await seedAccount(f.admin), repo = await prepareLock(f, a), w = await openUpload(a);
  try {
   const bounded = new FinalAccountLockRepository(f.runtime, 400), started = Date.now();
   await expect(bounded.lock(a.context, a.input)).rejects.toMatchObject({ code: "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS" });
   expect(Date.now() - started).toBeLessThan(5000);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
   await w.db.query("COMMIT");
   // Was: the lock then succeeded. Per C135 a committed but still pending photo keeps refusing it until the photo is checked.
   await expect(repo.lock(a.context, a.input)).rejects.toMatchObject({ code: "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS" });
   await asFixtureTenant(f.admin, a.tenantId, db => db.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=$2", [a.tenantId, w.id]));
   await repo.lock(a.context, a.input);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  } finally { await w.db.query("ROLLBACK"); w.db.release(); }
 });
 it("PRE-Q5-13 completion and issue serialize around authoritative publication",async()=>{
  const a=await locked(),repo=new FinalCheckCompletionRepository(f.shadow),m=await repo.freeze(a.context,{version:'final-check-manifest.v1',jobId:a.jobId,manifestId:randomUUID(),detectorVersion:'synthetic.v1',reconciliationVersion:'synthetic.v1'}),runId=randomUUID();await repo.bindEmptyRun(a.context,{version:'final-check-empty-run.v1',jobId:a.jobId,manifestId:m.id,runId,executionId:randomUUID()});
  const results=await Promise.allSettled([repo.publish(a.context,{version:'final-check-publication.v1',jobId:a.jobId,runId,checkId:randomUUID()}),new FinalAccountLockRepository(f.runtime).issueInvoice(a.context,{jobId:a.jobId,actorMembershipId:a.input.actorMembershipId,commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:'a'.repeat(64),invoiceKind:'final',recipient:'practice-customer@example.invalid',issuedOn:'2026-10-13'})]);expect(results[0].status).toBe('fulfilled');if(results[1].status==='rejected')expect(results[1].reason).toMatchObject({code:'FINAL_CHECK_NOT_COMPLETE'});
  const rows=(await f.admin.query("SELECT i.id,c.check_id FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) LEFT JOIN app.shadow_final_check_completion c ON(c.tenant_id,c.job_id,c.check_id)=(b.tenant_id,b.job_id,b.check_id) WHERE i.tenant_id=$1",[a.tenantId])).rows;for(const row of rows)expect(row.check_id).not.toBeNull();
 });
 it("PRE-NOFEE-01 prerequisites create no fee entitlement or settlement effect",async()=>{
  const a=await locked(),repo=new FinalCheckCompletionRepository(f.shadow),m=await repo.freeze(a.context,{version:'final-check-manifest.v1',jobId:a.jobId,manifestId:randomUUID(),detectorVersion:'synthetic.v1',reconciliationVersion:'synthetic.v1'}),runId=randomUUID();await repo.bindEmptyRun(a.context,{version:'final-check-empty-run.v1',jobId:a.jobId,manifestId:m.id,runId,executionId:randomUUID()});await repo.publish(a.context,{version:'final-check-publication.v1',jobId:a.jobId,runId,checkId:randomUUID()});
  for(const table of ['customer_payment','customer_invoice','landing_allocation','recovery_fee_derivation','recovery_fee_journal','recovery_eligibility_revision'])expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n).toBe(0);
 });

 it("PRE-Q5-14 audit failure rolls back completion and its certificate",async()=>{
  const a=await locked(),repo=new FinalCheckCompletionRepository(f.shadow),m=await repo.freeze(a.context,{version:'final-check-manifest.v1',jobId:a.jobId,manifestId:randomUUID(),detectorVersion:'synthetic.v1',reconciliationVersion:'synthetic.v1'}),runId=randomUUID(),checkId=randomUUID();await repo.bindEmptyRun(a.context,{version:'final-check-empty-run.v1',jobId:a.jobId,manifestId:m.id,runId,executionId:randomUUID()});
  const suffix=randomUUID().replaceAll('-','');
  await f.admin.query(`CREATE FUNCTION app.sv5pre_audit_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='${a.tenantId}'::uuid AND current_setting('app.sv5pre_refuse_audit',true)='yes' THEN RAISE EXCEPTION 'SV5PRE_AUDIT_REFUSED';END IF;RETURN NEW;END $$`);
  await f.admin.query(`CREATE TRIGGER sv5pre_audit_${suffix} BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sv5pre_audit_${suffix}()`);
  const commercialBefore = await commercialEffects(a.tenantId), auditBefore = await auditEffects(a.tenantId);
  await expect(asFixtureTenant(f.shadow,a.tenantId,async db=>{await db.query("SELECT set_config('app.sv5pre_refuse_audit','yes',true)");await db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,run_id,status) VALUES($1,$2,$3,$4,'completed')",[a.tenantId,a.jobId,checkId,runId]);})).rejects.toThrow('SV5PRE_AUDIT_REFUSED');
  for(const table of ['shadow_final_check_completion','final_account_lock_check'])expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  expect(await commercialEffects(a.tenantId)).toEqual(commercialBefore);
  expect(await auditEffects(a.tenantId)).toEqual(auditBefore);
  await repo.publish(a.context,{version:'final-check-publication.v1',jobId:a.jobId,runId,checkId});expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2", [a.tenantId,a.jobId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='final_check.completed'", [a.tenantId])).rows[0].n).toBe(1);
  expect(await commercialEffects(a.tenantId)).toEqual(commercialBefore);
  await f.admin.query(`DROP TRIGGER sv5pre_audit_${suffix} ON app.audit_event`);
  await f.admin.query(`DROP FUNCTION app.sv5pre_audit_${suffix}()`);

 });

 it("PRE-Q5-14 invoice audit failure rolls back all commercial effects and the same command retries once", async () => {
  const a = await locked(); await publishFixtureCompletion(f.shadow, f.admin, a.tenantId, a.jobId);
  const repo = new FinalAccountLockRepository(f.runtime);
  const input = { jobId: a.jobId, actorMembershipId: a.input.actorMembershipId, commandId: randomUUID(),
   finalAccountRevisionId: a.revisionId, expectedSourceHash: 'a'.repeat(64), invoiceKind: 'final' as const,
   recipient: 'practice-customer@example.invalid', issuedOn: '2026-10-13' };
  const before = await commercialEffects(a.tenantId), auditBefore = await auditEffects(a.tenantId);
  const certificate = await rows(a.tenantId, 'app.shadow_final_check_completion');
  const suffix = randomUUID().replaceAll('-', '');
  await f.admin.query(`CREATE FUNCTION app.sv5pre_invoice_audit_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='${a.tenantId}'::uuid AND NEW.event_type='customer_invoice.lock_bound_issued' THEN RAISE EXCEPTION 'SV5PRE_INVOICE_AUDIT_REFUSED'; END IF; RETURN NEW; END $$`);
  await f.admin.query(`CREATE TRIGGER sv5pre_invoice_audit_${suffix} BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sv5pre_invoice_audit_${suffix}()`);
  try {
   await expect(repo.issueInvoice(a.context, input)).rejects.toThrow('SV5PRE_INVOICE_AUDIT_REFUSED');
   expect(await commercialEffects(a.tenantId)).toEqual(before);
   expect(await auditEffects(a.tenantId)).toEqual(auditBefore);
   expect(await rows(a.tenantId, 'app.shadow_final_check_completion')).toBe(certificate);
  } finally {
   await f.admin.query(`DROP TRIGGER sv5pre_invoice_audit_${suffix} ON app.audit_event`);
   await f.admin.query(`DROP FUNCTION app.sv5pre_invoice_audit_${suffix}()`);
  }
  const result = await repo.issueInvoice(a.context, input);
  expect(result).toMatchObject({ invoiceNumber: 'DEMO-CUST-000001', netPence: 3360000, taxPence: 672000, totalPence: 4032000 });
  for (const table of ['customer_invoice','final_account_invoice_binding','final_account_invoiced_line','decision','decision_resolution','action_authorization','action_outbox']) {
   expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [a.tenantId])).rows[0].n).toBe(1);
  }
  expect((await f.admin.query("SELECT next_number::int n FROM app.customer_invoice_sequence WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ n: 2 }]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId,input.commandId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_invoice.lock_bound_issued'", [a.tenantId])).rows[0].n).toBe(1);
  const issued = await commercialEffects(a.tenantId), issuedAudit = await auditEffects(a.tenantId);
  expect(await repo.issueInvoice(a.context, input)).toEqual(result);
  expect(await commercialEffects(a.tenantId)).toEqual(issued);
  expect(await auditEffects(a.tenantId)).toEqual(issuedAudit);
  expect(await rows(a.tenantId, 'app.shadow_final_check_completion')).toBe(certificate);
  for (const table of ['customer_payment','landing_allocation','recovery_fee_derivation','recovery_fee_journal','recovery_eligibility_revision','journal']) {
   expect(await rows(a.tenantId, `app.${table}`)).toBe(before[table]);
  }
 });

 it("PRE-Q5-05 invalidation after successful completion refuses issue and publication",async()=>{
  const x=await sourceFixture(),evidence=await finalize(x);await runWithZero(x);await attempt(x,evidence,'detection');await attempt(x,evidence,'reconciliation');await x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()});
  await asFixtureTenant(f.admin,x.a.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.a.tenantId,evidence,x.a.input.actorMembershipId]));
  await expect(x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_INPUT_UNAVAILABLE');
  await expect(asFixtureTenant(f.runtime,x.a.tenantId,db=>db.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,'practice-customer@example.invalid','2026-10-13'::date)",[x.a.tenantId,x.a.jobId,x.a.revisionId,x.a.input.actorMembershipId,randomUUID()]))).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1",[x.a.tenantId])).rows[0].n).toBe(0);
 });

 it.each(['', randomUUID()])("r10 privileged invalidation preserves prior context %s while runtime isolation and invoice refusal hold", async prior => {
  const x = await sourceFixture(), evidence = await finalize(x);
  await runWithZero(x); await attempt(x, evidence, 'detection'); await attempt(x, evidence, 'reconciliation');
  await x.repo.publish(x.a.context, { version: 'final-check-publication.v1', jobId: x.a.jobId, runId: x.runId, checkId: randomUUID() });
  const insert = "INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'object_revoked')";
  const args = [randomUUID(), x.a.tenantId, evidence, x.a.input.actorMembershipId];
  const certificate = await rows(x.a.tenantId, 'app.shadow_final_check_completion');
  const originals = await rows(x.a.tenantId, 'app.evidence_object');
  await expect(f.runtime.query(insert, args)).rejects.toThrow('FORBIDDEN');
  await expect(asFixtureTenant(f.runtime, randomUUID(), db => db.query(insert, args))).rejects.toThrow('FORBIDDEN');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.evidence_invalidation WHERE tenant_id=$1", [x.a.tenantId])).rows[0].n).toBe(0);
  const admin = await f.admin.connect();
  try {
   await admin.query('BEGIN');
   await admin.query("SELECT set_config('app.tenant_id',$1,true)", [prior]);
   await admin.query(insert, args);
   expect((await admin.query("SELECT current_setting('app.tenant_id',true) AS tenant")).rows).toEqual([{ tenant: prior }]);
   await admin.query('COMMIT');
  } finally { await admin.query('ROLLBACK'); admin.release(); }
  expect(await rows(x.a.tenantId, 'app.evidence_object')).toBe(originals);
  expect(await rows(x.a.tenantId, 'app.shadow_final_check_completion')).toBe(certificate);
  await expect(x.repo.publish(x.a.context, { version: 'final-check-publication.v1', jobId: x.a.jobId, runId: x.runId, checkId: randomUUID() })).rejects.toThrow('FINAL_CHECK_INPUT_UNAVAILABLE');
  for (const kind of ['final', 'supplementary']) await expect(asFixtureTenant(f.runtime, x.a.tenantId, db => db.query(
   "SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,$6,'practice-customer@example.invalid','2026-10-13'::date,$7)",
   [x.a.tenantId,x.a.jobId,x.a.revisionId,x.a.input.actorMembershipId,randomUUID(),kind,'a'.repeat(64)]))).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  await expect(asFixtureTenant(f.runtime, x.a.tenantId, db => db.query(
   "SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,'practice-customer@example.invalid','2026-10-13'::date)",
   [x.a.tenantId,x.a.jobId,x.a.revisionId,x.a.input.actorMembershipId,randomUUID()]))).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1", [x.a.tenantId])).rows[0].n).toBe(0);
 });

 it("PRE-Q5-09 a pre-lock signal missing its classification prevents a zero result",async()=>{
  const x=await sourceFixture(),evidence=await finalize(x);await runWithZero(x);await attempt(x,evidence,'detection');await attempt(x,evidence,'reconciliation');
  const signal=randomUUID();await asFixtureTenant(f.shadow,x.a.tenantId,async db=>{
   await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',$5,'Fictional test signal','low')",[x.a.tenantId,x.a.jobId,signal,randomUUID(),x.manifest.cutoff]);
   await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'immutable.v1',repeat('a',64),$5)",[x.a.tenantId,x.a.jobId,signal,evidence,(await x.repo.sources(x.a.context,x.a.jobId,x.manifest.id))[0]!.source_received_at]);
  });await expect(x.repo.publish(x.a.context,{version:'final-check-publication.v1',jobId:x.a.jobId,runId:x.runId,checkId:randomUUID()})).rejects.toThrow('FINAL_CHECK_RESULT_UNAVAILABLE');
 });

});
