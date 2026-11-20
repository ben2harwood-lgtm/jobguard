import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProofApplication } from "../../../apps/api/src/proof/proof.application.js";
import { workStateView } from "../../../apps/web/app/ui/job-work-state-view.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { VariationRepository } from "../src/variation-repository.js";
import { closeWorkFixture, createWorkFixture, fixtureLifecycle, insertPhoto, seedWorkJob, workEvents, workTenant, CH4_HASH, type WorkFixture } from "./job-work-state-fixtures.js";
import { practiceWorkJob, seedWorkPractice } from "./job-work-state-command-fixtures.js";

// Real PostgreSQL only. The proof command reads actual generated originals from
// synthetic_evidence_original; no trigger, privilege or audit guard is bypassed.
describe("REAL-PROOF-KEEPS-FINISHED", () => {
 let f: WorkFixture;
 beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createWorkFixture(); }, 240_000);
 afterAll(async () => { await closeWorkFixture(f); vi.unstubAllEnvs(); });
 async function prepared(electrical = false) {
  const p = await seedWorkPractice(f), scope = randomUUID();
  // Test-only: the fixture's live practice job has no scope item; seed one confirmed, in-progress item.
  await workTenant(f.admin, p.auth.context.tenantId, async db => {
   await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, p.auth.context.tenantId, p.jobId]);
   await db.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'in_progress')", [p.auth.context.tenantId, p.jobId, scope]);
  });
  const a = await practiceWorkJob(f, p);
  const proof = new ProofApplication(f.runtime, p.sessionId), work = new JobWorkStateRepository(f.runtime);
  await proof.command(p.jobId, { version: "practice-proof-command.v1", action: "answer_statement", commandId: randomUUID(), includesElectricalWork: electrical });
  const before = await work.read(p.auth.context, p.jobId, p.auth.digest);
  await work.finish(p.auth.context, p.jobId, p.auth.digest, { version: "job-work-state-command.v1", action: "finish", commandId: randomUUID(), expectedRevision: workStateView(before).revision });
  return { p, a, proof, work };
 }
 const snapshots = async (jobId: string) => {
  const rows: Record<string, unknown> = {};
  for (const table of ["evidence_object", "job_site_source_receipt", "job_work_state_event", "stage_completion", "proof_application_response"])
   rows[table] = (await f.admin.query(`SELECT to_jsonb(x) row FROM app.${table} x WHERE job_id=$1 ORDER BY to_jsonb(x)::text`, [jobId])).rows;
  rows.audit = (await f.admin.query("SELECT to_jsonb(x) row FROM app.audit_event x WHERE tenant_id=(SELECT tenant_id FROM app.job WHERE id=$1) ORDER BY sequence", [jobId])).rows;
  return rows;
 };
 it.each([false, true])("retains finished state, all proof facts and audit, and exact finalise/completion replays (electrical=%s)", async electrical => {
  const { p, a, proof, work } = await prepared(electrical);
  const initial = await proof.get(p.jobId);
  const selected = await proof.command(p.jobId, { version: "practice-proof-command.v1", action: "select_generated", commandId: randomUUID(), scopeItemId: initial.scopeItemId, fixture: "completion-photo" });
  if (!("upload" in selected)) throw new Error("expected proof selection response");
  const upload = selected.upload!;
  const finalize = { version: "practice-proof-command.v1", action: "finalize", commandId: randomUUID(), uploadId: upload.id, objectVersionId: upload.objectVersionId };
  const beforeInvalid = await snapshots(p.jobId);
  await expect(proof.command(p.jobId, { ...finalize, proof: true })).rejects.toThrow("INVALID_COMMAND");
  expect(await snapshots(p.jobId)).toEqual(beforeInvalid);
  const finalised = await proof.command(p.jobId, finalize);
  if (!("upload" in finalised)) throw new Error("expected proof finalisation response");
  expect(workStateView(await work.read(p.auth.context, p.jobId, p.auth.digest)).finishedMarkerId).not.toBeNull();
  const complete = { version: "practice-proof-command.v1", action: "complete", commandId: randomUUID(), scopeItemId: initial.scopeItemId, evidenceId: finalised.upload!.evidenceId };
  const completed = await proof.command(p.jobId, complete);
  if (!("completion" in completed)) throw new Error("expected proof completion response");
  expect(completed.completion).not.toBeNull();
  const events = await workEvents(f, a);
  expect(events.filter(e => e.kind === "finished_cancelled")).toEqual([]);
  expect(events.slice(-2).map(e => e.kind)).toEqual(["first_site_evidence", "site_activity"]);
  expect(workStateView(await work.read(p.auth.context, p.jobId, p.auth.digest)).finishedMarkerId).not.toBeNull();
  const sources = (await f.admin.query("SELECT source_kind,fact_key FROM app.job_site_source_receipt WHERE job_id=$1 AND (upload_id=$2 OR stage_completion_id=$3) ORDER BY source_kind", [p.jobId, upload.id, completed.completion!.id])).rows;
  expect(sources).toEqual([{ source_kind: "photo", fact_key: `photo:${upload.id}` }, { source_kind: "stage_completion", fact_key: `stage_completion:${completed.completion!.id}` }]);
  const audits = (await f.admin.query("SELECT subject_ref FROM app.audit_event WHERE tenant_id=$1 AND id=ANY($2::uuid[])", [a.tenantId, (await f.admin.query("SELECT audit_event_id FROM app.job_work_state_event WHERE job_id=$1", [p.jobId])).rows.map(r => r.audit_event_id)])).rows;
  expect(audits).toHaveLength(events.length);
  expect((await f.admin.query("SELECT 1 FROM app.audit_event WHERE event_type='proof.completed' AND payload#>>'{references,completionId}'=$1",[completed.completion!.id])).rows).toHaveLength(1);
  expect((await f.admin.query("SELECT action FROM app.proof_application_response WHERE job_id=$1 ORDER BY action",[p.jobId])).rows).toEqual([{action:"complete"},{action:"finalize"},{action:"select_generated"}]);
  const beforeReplay = await snapshots(p.jobId);
  expect(await proof.command(p.jobId, finalize)).toEqual(finalised);
  expect(await proof.command(p.jobId, complete)).toEqual(completed);
  expect(await snapshots(p.jobId)).toEqual(beforeReplay);
  // The proof path never reserves a company place, including on replay.
  expect((await f.admin.query("SELECT 1 FROM app.meter_work_ledger WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([]);
  await new JobSourceRepository(f.runtime).intake(a.context, a.jobId, a.actorId, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: true, text: "Fictional renewed work after proof." });
  expect((await workEvents(f, a)).filter(e => e.kind === "finished_cancelled")).toHaveLength(1);
  expect(workStateView(await work.read(p.auth.context, p.jobId, p.auth.digest)).finishedMarkerId).toBeNull();
  expect((await f.admin.query("SELECT 1 FROM app.meter_work_ledger WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([]);
 });
 it("an on-site diary note independently cancels a finished marker", async () => {
  const {p,a,work}=await prepared();
  await new JobSourceRepository(f.runtime).intake(a.context,a.jobId,a.actorId,"diary",{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:true,text:"Fictional renewed site work."});
  expect((await workEvents(f,a)).filter(e=>e.kind==="finished_cancelled")).toHaveLength(1);
  expect(workStateView(await work.read(p.auth.context,p.jobId,p.auth.digest)).finishedMarkerId).toBeNull();
 });
 it("preassigned snagging keeps its existing no-activity behaviour", async () => {
  const a=await seedWorkJob(f),id=randomUUID(),version=randomUUID(),command=randomUUID();
  await fixtureLifecycle(f,a,"finished_on_site");
  // Q-03 snagging admission remains held: owner-only fixture preassigns the
  // existing purpose. The original insertion then runs all ordinary triggers.
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'ch4.fixture',$2::uuid::text,$3,'succeeded',$4,'{}',clock_timestamp())",[a.tenantId,command,CH4_HASH,a.actorId]);
   await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$1::uuid::text,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp(),clock_timestamp())",[id,a.tenantId,a.jobId,a.scopeId,CH4_HASH,version]);
   await db.query("INSERT INTO app.job_photo_purpose(tenant_id,job_id,upload_id,evidence_id,purpose,object_version_id,sha256,actor_membership_id,command_id) VALUES($1,$2,$3,$3,'snagging',$4,$5,$6,$7)",[a.tenantId,a.jobId,id,version,CH4_HASH,a.actorId,command]);
   await db.query("SET LOCAL session_replication_role='origin'");
   await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) SELECT id,tenant_id,id,job_id,scope_item_id,'original','completion_photo',object_key,object_version_id,expected_sha256,80,expected_content_type,retention_class,server_received_at,server_verified_at FROM app.evidence_upload WHERE id=$1",[id]);
  },{membershipId:a.actorId});
  expect((await workEvents(f,a)).map(e=>e.kind)).toEqual(["finished_on_site"]);
  expect((await f.admin.query("SELECT 1 FROM app.job_site_source_receipt WHERE job_id=$1",[a.jobId])).rows).toEqual([]);
 });
 it.each(["pre_cover_photo", "completion_photo", "electrical_certificate"])("an ordinary %s without server proof purpose still cancels finished", async type => {
  const a = await seedWorkJob(f); await fixtureLifecycle(f, a, "finished_on_site");
  await insertPhoto(f, a, new Date(Date.now() + 1000).toISOString().replace("Z", "000Z"), type);
  expect((await workEvents(f, a)).map(e => e.kind)).toEqual(["finished_on_site", "finished_cancelled", "first_site_evidence"]);
 });
 it("a builder-logged extra still cancels finished", async () => {
  const a = await seedWorkJob(f); await fixtureLifecycle(f, a, "finished_on_site");
  await new VariationRepository(f.runtime).logBuilderExtra(a.context, { version: "log-builder-extra.v1", actorMembershipId: a.actorId, deviceId: null, deviceCapturedAt: null, price: null, proposal: { version: "variation-proposal.v1", id: randomUUID(), jobId: a.jobId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional extra", description: "Fictional extra", suggestion: null } });
  expect((await workEvents(f, a)).map(e => e.kind)).toEqual(["finished_on_site", "finished_cancelled", "site_activity"]);
 });
 it.each(["delivery", "invoice"])("a genuine %s goods source still cancels finished", async kind => {
  const a = await seedWorkJob(f), document = randomUUID(), order = randomUUID();
  await fixtureLifecycle(f, a, "finished_on_site");
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'fictional',$4,$5,'ready')", [document, a.tenantId, a.jobId, kind, CH4_HASH]);
   await db.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'text/plain',80,$5,1)", [randomUUID(), a.tenantId, a.jobId, document, CH4_HASH]);
   if (kind === "invoice") {
    // FK parent only; the goods receipt under test runs every real trigger.
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("INSERT INTO app.purchase_order_draft(id,tenant_id,job_id,requirement_id) VALUES($1,$2,$3,$4)", [order, a.tenantId, a.jobId, randomUUID()]);
    await db.query("SET LOCAL session_replication_role='origin'");
    await db.query("INSERT INTO app.goods_receipt(id,tenant_id,job_id,order_draft_id,document_id,revision,ordered_quantity,delivered_quantity,accepted_quantity,rejected_quantity,missing_quantity,unit) VALUES($1,$2,$3,$4,$5,1,1,1,1,0,0,'each')", [randomUUID(), a.tenantId, a.jobId, order, document]);
   }
  }, { membershipId: a.actorId });
  expect((await workEvents(f, a)).map(e => e.kind)).toEqual(["finished_on_site", "finished_cancelled", "first_site_evidence"]);
 });
});
