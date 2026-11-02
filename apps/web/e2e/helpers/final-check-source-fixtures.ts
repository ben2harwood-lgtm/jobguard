import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "@playwright/test";
import type { Pool } from "pg";

/** Finalized fictional connector originals, not a live email/message integration. */
export async function sourceFixture(admin: Pool, tenantId: string, jobId: string, kind: "email" | "message" | "completion_photo") {
 const evidenceId = randomUUID(), uploadId = randomUUID(), objectVersionId = randomUUID();
 const text = "Outside tap fitted", sha256 = createHash("sha256").update(text).digest("hex");
 const db = await admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
   VALUES($1,$2,$3,$4,$5,'text/plain',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp())`,
   [uploadId,tenantId,jobId,`synthetic/${evidenceId}`,sha256,objectVersionId]);
  const row = (await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at,device_captured_at)
   VALUES($1,$2,$3,$4,'original',$5,$6,$7,$8,$9,'text/plain','standard_evidence',clock_timestamp(),clock_timestamp(),'2020-01-01') RETURNING to_char(server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received`,
   [evidenceId,tenantId,uploadId,jobId,kind,`synthetic/${evidenceId}`,objectVersionId,sha256,Buffer.byteLength(text)])).rows[0];
  await db.query("COMMIT");
  return { version:"observation.v1",tenantId,jobId,kind:kind === "completion_photo" ? "completion_photo" : "note_or_voice",
   evidence:{id:evidenceId,objectVersionId,sha256,serverReceivedAt:row.received},text,
   facts:{workReference:"synthetic-outside-tap",scopeArea:"job",description:"Outside tap",status:"completed",estimatedValuePence:null,
    safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,
    silenceMateriallyWorsensDispute:false,disclosureDuty:false},citations:[{start:0,end:text.length,quote:text}] };
 } catch(error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}

/** Production detector, source proof writer and reconciliation with an explicit fictional decoder.
 * Does not seed classifications, reconciliation results, approvals, cases or fee facts. */
export async function reconcileSourceFixtures(shadow: Pool, admin: Pool, tenantId: string, jobId: string, observations: Awaited<ReturnType<typeof sourceFixture>>[]) {
 const nativeImport = new Function("specifier", "return import(specifier)");
 const db: typeof import("@jobguard/db") = await nativeImport(pathToFileURL(join(process.cwd(),"../../packages/db/dist/index.js")).href);
 const core: typeof import("@jobguard/core") = await nativeImport(pathToFileURL(join(process.cwd(),"../../packages/core/dist/index.js")).href);
 const { FinalCheckWorker }: typeof import("../../../api/src/final-check.worker") = await nativeImport(pathToFileURL(join(process.cwd(),"../api/dist/final-check.worker.js")).href);
 const context = db.verifiedTenantContextForQueuedJob(tenantId);
 const repo = new db.FinalCheckRepository(shadow), manifest = await repo.begin(context,jobId);
 const sink = new db.ShadowDetectionRepository(shadow), reader = new db.FinalCheckSourceReader(repo,observations);
 const photo = (await admin.query("SELECT sha256 FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND evidence_type='completion_photo' AND content_type='image/png' LIMIT 1",[context.tenantId,jobId])).rows[0];
 const ports = db.practiceFinalCheckPorts(shadow,admin,photo.sha256);
 const worker = new FinalCheckWorker({...ports, async process(ctx,m,s) {
  if (!observations.some(o=>o.evidence.id===s.evidenceId)) return ports.process(ctx,m,s);
  const decoded = (await reader.read(ctx,{version:"final-check.task.v1",jobId,manifestId:m.id})).sources.find(x=>x.source.id===s.id)!;
  expect(decoded.failureCode).toBeNull();
  const observation = decoded.observation!;
  const captures = m.comparisons.captures.map(c=>core.shadowCaptureV1.parse(c));
  await sink.persist(ctx,{version:"shadow-detection-batch.v1",jobId,observations:[observation],captures,
   proposals:core.detectShadowObservations([observation],captures,new Date().toISOString())});
  const fresh = await repo.manifest(ctx,jobId,m.id);
  return {version:"final-check.source-result.v1",inputHash:s.inputHash,status:"detected",failureCode:null,
   signalIds:fresh.signals.filter(x=>x.evidenceIds.includes(s.evidenceId!)).map(x=>x.signalId)};
 }},"synthetic_demo");
 const task = {version:"final-check.task.v1",jobId,manifestId:manifest.id};
 const first = await worker.execute(context,task);
 expect(await worker.execute(context,task)).toEqual(first);
}
