import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorBundleCheckApplication } from "../../../apps/api/src/evidence-bundle.application.js";
import { EvidenceService, ExtraApprovalRepository, SiteExtraRepository, withTenant } from "../src/index.js";
import { NorthsidePhotoStorage } from "../src/northside-photo-storage.js";
import { chainWorld, cluster, approveInput, type Cluster } from "./extra-approval-chain-fixtures.js";
import { pngBytes, v3 } from "./site-extra-evidence-fixtures.js";

let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type World = Awaited<ReturnType<typeof chainWorld>>;
async function attach(w: World, scopeItemId: string | null = null) {
  const context = await w.ctx, bytes = pngBytes(139), store = new NorthsidePhotoStorage(c.runtime, context, w.jobId);
  const service = new EvidenceService(c.runtime, store);
  const upload = await service.beginUpload(context, { jobId: w.jobId, scopeItemId, expectedSha256: digest(bytes),
    contentType: "image/png", maximumBytes: 10_000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3_600_000) },
  (db, pending) => store.put(db, pending, "v1", bytes));
  await service.finalize(context, { uploadId: upload.id, objectVersionId: "v1", evidenceType: scopeItemId ? "electrical_certificate" : "site_photo" });
  return { upload, bytes, store, context };
}

it("a job-level Northside photo survives a fresh store and yields an intact approved-extra bundle; other tenants/jobs/versions cannot read it", async () => {
  const w = await chainWorld(c), p = await attach(w);
  const original = (await c.admin.query("SELECT scope_item_id FROM app.synthetic_evidence_original WHERE tenant_id=$1 AND upload_id=$2", [p.context.tenantId, p.upload.id])).rows[0];
  expect(original).toEqual({ scope_item_id: null });
  const raised = await new SiteExtraRepository(c.runtime).logSiteExtra(p.context, w.members.supervisor.member, v3(w, { photoEvidenceId: p.upload.id }));
  const approvals = new ExtraApprovalRepository(c.runtime), extraId = raised.variationId;
  await approvals.priceExtra(p.context, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: w.jobId, extraId, netPence: 40000 });
  const request = await approvals.submitExtra(p.context, w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId: w.jobId, extraId });
  await approvals.approveExtraStep(p.context, w.members.supervisor.member, approveInput({ jobId: w.jobId, requestId: request.requestId as string, hash: request.revisionHash as string, net: 40000 }, 0));
  // No process-level registry is passed from capture: only PostgreSQL can supply this original.
  const fresh = new NorthsidePhotoStorage(c.runtime, p.context, w.jobId);
  expect((await fresh.readExactVersion(p.upload.objectKey, "v1")).bytes).toEqual(p.bytes);
  const result = await new ContractorBundleCheckApplication(c.runtime, fresh).check(p.context, w.members.surveyor.member,
    { version: "contractor-bundle-query.v1", jobId: w.jobId, extraId, requestId: request.requestId });
  expect(result.reason).toBeNull();
  expect(result.sections).toContainEqual({ name: "proof", state: "present" });
  expect(result.report).toMatchObject({ content: "intact" });
  const other = await chainWorld(c), otherContext = await other.ctx;
  await expect(new NorthsidePhotoStorage(c.runtime, otherContext, w.jobId).readExactVersion(p.upload.objectKey, "v1")).rejects.toThrow("missing original");
  // Raw ordinary-runtime SELECT also proves RLS, independently of the store's tenant predicate.
  expect(await withTenant(c.runtime, otherContext, async db => (await db.$client.query("SELECT bytes FROM app.synthetic_evidence_original WHERE upload_id=$1", [p.upload.id])).rows)).toEqual([]);
  await expect(new NorthsidePhotoStorage(c.runtime, p.context, w.otherJob).readExactVersion(p.upload.objectKey, "v1")).rejects.toThrow("missing original");
  await expect(fresh.readExactVersion(p.upload.objectKey, "v2")).rejects.toThrow("missing original");
  await withTenant(c.runtime, p.context, db => fresh.put(db, p.upload, "v1", p.bytes));
  await expect(withTenant(c.runtime, p.context, db => fresh.put(db, p.upload, "v1", pngBytes(140)))).rejects.toThrow("immutable synthetic original conflict");
  expect((await fresh.readExactVersion(p.upload.objectKey, "v1")).bytes).toEqual(p.bytes);
}, 180_000);

it("keeps the scope FK for non-null rows and the proof original/finalization path unchanged", async () => {
  const w = await chainWorld(c), context = await w.ctx;
  const scope = (await c.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [context.tenantId, w.jobId])).rows[0].id as string;
  const proof = await attach(w, scope);
  expect((await c.admin.query("SELECT scope_item_id FROM app.synthetic_evidence_original WHERE tenant_id=$1 AND upload_id=$2", [context.tenantId, proof.upload.id])).rows[0].scope_item_id).toBe(scope);
  expect((await c.admin.query("SELECT scope_item_id,evidence_type FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2", [context.tenantId, proof.upload.id])).rows[0]).toMatchObject({ scope_item_id: scope, evidence_type: "electrical_certificate" });
  const wrongScope = (await c.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [context.tenantId, w.otherJob])).rows[0].id as string;
  const bytes = pngBytes(141), service = new EvidenceService(c.runtime, new NorthsidePhotoStorage(c.runtime, context, w.jobId));
  const upload = await service.beginUpload(context, { jobId: w.jobId, scopeItemId: null, expectedSha256: digest(bytes), contentType: "image/png", maximumBytes: 10_000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3_600_000) });
  await expect(withTenant(c.runtime, context, db => db.$client.query(`INSERT INTO app.synthetic_evidence_original
    (tenant_id,job_id,upload_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
    VALUES($1,$2,$3,$4,$5,'v1','synthetic_demo','image/png',$6)`, [context.tenantId, w.jobId, upload.id, wrongScope, upload.objectKey, bytes]))).rejects.toMatchObject({ code: "23503" });
}, 180_000);

it("rolls back the upload and its bytes together when the original callback fails", async () => {
  const w = await chainWorld(c), context = await w.ctx, id = randomUUID(), bytes = pngBytes(142);
  const store = new NorthsidePhotoStorage(c.runtime, context, w.jobId), service = new EvidenceService(c.runtime, store);
  await expect(service.beginUpload(context, { id, jobId: w.jobId, scopeItemId: null, expectedSha256: digest(bytes), contentType: "image/png", maximumBytes: 10_000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3_600_000) }, async (db, upload) => {
    await store.put(db, upload, "v1", bytes);
    throw new Error("rollback fixture");
  })).rejects.toThrow("rollback fixture");
  for (const table of ["evidence_upload", "synthetic_evidence_original"]) {
    const column = table === "evidence_upload" ? "id" : "upload_id";
    expect((await c.admin.query(`SELECT 1 FROM app.${table} WHERE tenant_id=$1 AND ${column}=$2`, [context.tenantId, id])).rows).toEqual([]);
  }
}, 180_000);
