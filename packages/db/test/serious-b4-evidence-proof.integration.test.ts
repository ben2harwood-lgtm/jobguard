import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { EvidenceService, withTenant } from "../src/index.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const h = createWatchdogHarness("serious-b4", 62300);
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());
const complete = (job: string, evidenceId: string, commandId = randomUUID()) => ({
  version: "proof.complete.v1", commandId, actorMembershipId: h.member, jobId: job, scopeItemId: h.st(job).scope,
  stage: "electrical-stage", evidenceId, requiredEvidenceType: "electrical_certificate", deriveDecision: true,
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

describe("SERIOUS-B4 real PostgreSQL evidence and proof regressions (CI)", () => {
  it.each(["v1", "missing-v0"])("S12 a late failed %s finalizer cannot reject concurrently verified proof", async failedVersion => {
    const job = await h.live(), upload = await h.pre.upload(job), started = deferred(), resume = deferred();
    const service = new EvidenceService(h.runtime, {
      createUploadUrl: input => h.storage.createUploadUrl(input), createDownloadUrl: input => h.storage.createDownloadUrl(input),
      deleteExactVersion: () => h.storage.deleteExactVersion(),
      readExactVersion: async () => { started.resolve(); await resume.promise; throw new Error("delayed missing version"); },
    });
    const delayed = service.finalize(h.ctx, { commandId: randomUUID(), uploadId: upload.id, objectVersionId: failedVersion, evidenceType: "electrical_certificate" }).catch(error => error);
    await started.promise;
    try { await h.pre.evidence(job); } finally { resume.resolve(); }
    expect(await delayed).toMatchObject({ code: "OBJECT_INVALID" });
    const saved = (await h.admin.query("SELECT state,object_version_id,expected_sha256 FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2", [h.tenant, upload.id])).rows[0];
    expect(saved).toMatchObject({ state: "verified", object_version_id: "v1", expected_sha256: h.pngHash });
    expect((await h.admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2", [h.tenant, upload.id])).rows).toEqual([{ id: upload.id }]);
    await expect(h.repos.proof.complete(h.ctx, complete(job, upload.id))).resolves.toMatchObject({ state: "complete" });
  });

  it("S13 same-stage replacement preserves historical receipts and rework while its current revision completes", async () => {
    const job = await h.live(); await h.pre.evidence(job);
    const oldEvidence = h.st(job).upload.id as string, originalCommand = complete(job, oldEvidence);
    const first = await h.repos.proof.complete(h.ctx, originalCommand) as { completionId: string };
    await h.repos.proof.invalidate(h.ctx, { version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: h.member, evidenceId: oldEvidence, reasonCode: "verification_invalid" });
    const decision = (await h.admin.query("SELECT decision_id FROM app.job_finding WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at DESC LIMIT 1", [h.tenant, job])).rows[0].decision_id;
    delete h.st(job).upload; delete h.st(job).evidence; await h.pre.evidence(job);
    const evidence = h.st(job).upload.id as string, replacement = complete(job, evidence);
    const [a, b] = await Promise.all([h.repos.proof.complete(h.ctx, replacement), h.repos.proof.complete(h.ctx, replacement)]);
    const saved = a as { completionId: string };
    expect(a).toEqual(b);
    expect(a).toMatchObject({ evidenceId: evidence, state: "complete", decisionId: decision });
    expect(await h.repos.proof.complete(h.ctx, originalCommand)).toEqual(first);
    expect(await h.repos.proof.complete(h.ctx, replacement)).toEqual(a);
    await expect(h.repos.proof.complete(h.ctx, { ...replacement, commandId: randomUUID() })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(h.repos.proof.complete(h.ctx, { ...replacement, evidenceId: oldEvidence })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    const history = (await h.admin.query("SELECT id,supersedes_completion_id FROM app.stage_completion WHERE tenant_id=$1 AND job_id=$2", [h.tenant, job])).rows;
    expect(history).toEqual(expect.arrayContaining([{ id: first.completionId, supersedes_completion_id: null }, { id: saved.completionId, supersedes_completion_id: first.completionId }]));
    expect(history).toHaveLength(2);
    expect((await h.admin.query("SELECT 1 FROM app.stage_review_event WHERE tenant_id=$1 AND stage_completion_id=$2", [h.tenant, first.completionId])).rowCount).toBe(1);
    expect((await h.admin.query("SELECT resolution FROM app.decision_resolution WHERE tenant_id=$1 AND decision_id=$2", [h.tenant, decision])).rows).toEqual([{ resolution: "approved" }]);
    expect((await h.admin.query("SELECT s.id,EXISTS(SELECT 1 FROM app.stage_review_event r WHERE (r.tenant_id,r.stage_completion_id)=(s.tenant_id,s.id)) review FROM app.stage_completion s WHERE s.tenant_id=$1 AND s.job_id=$2 AND NOT EXISTS(SELECT 1 FROM app.stage_completion next WHERE (next.tenant_id,next.supersedes_completion_id)=(s.tenant_id,s.id))", [h.tenant, job])).rows).toEqual([{ id: saved.completionId, review: false }]);
    await withTenant(h.runtime, testTenantContext(randomUUID()), async db => expect((await db.$client.query("SELECT id FROM app.stage_completion WHERE job_id=$1", [job])).rows).toEqual([]));
    for (const sql of ["UPDATE app.stage_completion SET stage=stage", "DELETE FROM app.stage_completion", "TRUNCATE app.stage_completion"])
      await expect(withTenant(h.runtime, h.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
  });
});
