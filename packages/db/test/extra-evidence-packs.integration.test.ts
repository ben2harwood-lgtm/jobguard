import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildExtraSourcePack, inspectExtraSourcePack, residentConfirmationStatementV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "../src/index.js";
import { loadExtraEvidenceSources } from "../src/extra-evidence-pack-sources.js";
import { assembleExtraSourcePack } from "../src/extra-evidence-pack-repository.js";
import { approvalFixture, cluster, storage, ownerTx, type Cluster } from "./extra-approval-fixtures.js";
import { invalidate } from "./site-extra-evidence-fixtures.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("E5-18 extra sources and shared verifier — issued sources only", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  const loaded = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId }));
  const captured = await assembleExtraSourcePack(loaded, storage);
  await expect(assembleExtraSourcePack(loaded, { ...storage, readExactVersion: async () => { throw new Error("exact version unavailable"); }, createUploadUrl: storage.createUploadUrl, createDownloadUrl: storage.createDownloadUrl, deleteExactVersion: storage.deleteExactVersion })).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  expect(captured.integrity.sources.map(s => s.sourceId.split(":")[0])).toEqual(expect.arrayContaining(["extra_origin", "evidence_object"]));
  expect(captured.integrity.sources.some(s => s.label.includes(residentConfirmationStatementV1))).toBe(true);
  expect(captured.completeApprovalPack).toBe(false);
  const priced = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.priced.variationId }));
  expect(priced.sources.map(s => s.sourceId.split(":")[0])).toEqual(expect.arrayContaining(["extra_sor_revision", "extra_pricing_basis"]));
  const pack = buildExtraSourcePack(f.jobId, f.priced.variationId, priced.sources, priced.omissions);
  expect(inspectExtraSourcePack(pack, priced.sources.slice(1)).findings).toContain("Missing original source");
  expect(inspectExtraSourcePack(pack, priced.sources.map((s, i) => i ? s : { ...s, content: "tampered" })).findings).toContain("Content hash mismatch");
  expect(inspectExtraSourcePack(pack, priced.sources.map((s, i) => i ? s : { ...s, version: 2 })).findings).toContain("Wrong source version");
  // A fresh storage read and transaction re-loads real rows, never a template or in-memory projection.
  const loadedAgain = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId }));
  const again = await assembleExtraSourcePack(loadedAgain, storage);
  expect(again).toEqual(captured);
  const raw = (await c.admin.query("SELECT net_pence::text n FROM app.extra_sor_revision WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, f.priced.variationId])).rows[0]!.n;
  expect(priced.sources.find(s => s.sourceId.startsWith("extra_sor_revision:"))!.content).toContain(raw);
});
it("E5-19 pending rejected foreign and wrong-version source controls refuse", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  for (const sql of ["UPDATE app.evidence_upload SET state='pending', server_verified_at=NULL WHERE tenant_id=$1 AND id=$2", "UPDATE app.evidence_upload SET state='rejected', rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=$2", "UPDATE app.evidence_object SET job_id=$3 WHERE tenant_id=$1 AND id=$2", "UPDATE app.evidence_object SET object_version_id='wrong-version' WHERE tenant_id=$1 AND id=$2"]) {
    await expect(withTenant(c.admin, context, async db => {
      await db.$client.query("SET LOCAL session_replication_role=replica");
      // Specimen rolled back when the source check refuses; never visible to a runtime success path.
      await db.$client.query(sql, sql.includes("$3") ? [f.p.tenantId, f.original.id, f.otherJob] : [f.p.tenantId, f.original.id]);
      return loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId });
    })).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  }
});
it("E5-19 evidence lifecycle and confirmation limits — issued sources only", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  const query = { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId };
  await expect(withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { ...query, jobId: f.otherJob }))).rejects.toMatchObject({ code: "EXTRA_SOURCE_NOT_FOUND" });
  const priced = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { ...query, extraId: f.priced.variationId }));
  expect(priced.omissions).toContain("Optional photo absent"); expect(priced.omissions).toContain("Optional confirmation absent");
  await invalidate(c, f, f.original.id);
  await expect(withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, query))).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
});
it("E5-18 tampered stored sources are detected through persisted hashes", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  const db = await c.admin.connect();
  try {
    await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role=replica");
    await db.query("UPDATE app.extra_sor_revision SET quantity='999' WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, f.priced.variationId]);
    await db.query("COMMIT"); // isolated specimen cluster; never a business write
    await expect(withTenant(c.runtime, context, tx => loadExtraEvidenceSources(tx, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.priced.variationId }))).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  } finally { await db.query("ROLLBACK"); db.release(); }
  // No subsequent success case uses the specimen.
  expect(await ownerTx(c, f.p.tenantId, tx => tx.$client.query("SELECT id FROM app.extra_sor_revision WHERE variation_id=$1", [f.priced.variationId]))).toBeDefined();
});
