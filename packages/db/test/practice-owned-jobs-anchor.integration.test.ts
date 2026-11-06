import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch } from "../src/audit.js";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { authorizePracticeJob } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";
import { createImportFixture, closeWorkFixture, freshIntent, type ImportFixture } from "./job-import-v3-fixtures.js";
import { seedWorkPractice } from "./job-work-state-fixtures.js";

describe("practice ownership uses the trusted import source — PostgreSQL", () => {
  let f: ImportFixture;
  const priorEnvironment = process.env.JOBGUARD_ENV;
  beforeAll(async () => { f = await createImportFixture(); }, 60000);
  afterAll(async () => {
    try { await closeWorkFixture(f); }
    finally {
      if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV;
      else process.env.JOBGUARD_ENV = priorEnvironment;
    }
  });

  it("keeps a real adopted child owned and refuses a runtime-forged source link", async () => {
    const owner = f.practice, { auth } = owner, repo = new JobImportV3Repository(f.runtime);
    const preview = await repo.preview(auth.context, auth.digest, owner.jobId, { ...f.request, lifecyclePoint: "invoiced" });
    const imported = await repo.adopt(auth.context, auth.digest, owner.jobId,
      freshIntent(f.request.expectedBindingId, preview.previewHash, "invoiced"));
    const jobId = String(imported.jobId), tenantId = auth.context.tenantId;
    expect((await authorizePracticeJob(f.runtime, owner.sessionId, jobId)).digest).toBe(auth.digest);
    expect((await f.admin.query("SELECT source_job_id FROM app.job_import_v3 WHERE tenant_id=$1 AND job_id=$2",
      [tenantId, jobId])).rows).toEqual([{ source_job_id: owner.jobId }]);

    const stranger = await seedWorkPractice(f);
    await expect(authorizePracticeJob(f.runtime, stranger.sessionId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The runtime can append an attestation, but cannot rewrite the controlled import aggregate.
    await withTenant(f.runtime, stranger.auth.context, async db => {
      const events = await appendAuditBatch(db, [{
        id: randomUUID(), version: "audit.v1", actorRef: `membership:${stranger.auth.membershipId}`,
        eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: jobId,
        payload: { references: { sourceJobId: stranger.jobId } },
      }]);
      expect(events).toHaveLength(1);
    });
    expect((await f.admin.query("SELECT count(*)::int n FROM app.job_import_v3 WHERE tenant_id=$1 AND job_id=$2 AND source_job_id=$3",
      [tenantId, jobId, stranger.jobId])).rows[0].n).toBe(0);
    await expect(authorizePracticeJob(f.runtime, stranger.sessionId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await authorizePracticeJob(f.runtime, owner.sessionId, jobId)).digest).toBe(auth.digest);
  });

  it("keeps a real v1 parties import owned through its source-bound baseline hash", async () => {
    const { JobPartiesApplication } = await import("../../../apps/api/src/job-parties.application.js");
    const owner = await seedWorkPractice(f), stranger = await seedWorkPractice(f);
    const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",
      [owner.auth.context.tenantId, owner.jobId])).rows[0].binding_id as string;
    const result = await new JobPartiesApplication(f.runtime).adopt({ sessionId: owner.sessionId }, owner.jobId,
      { version: "job-parties-import.v1", commandId: randomUUID(), expectedBindingId: binding });
    expect((await authorizePracticeJob(f.runtime, owner.sessionId, result.jobId)).digest).toBe(owner.auth.digest);
    await withTenant(f.runtime, stranger.auth.context, db => appendAuditBatch(db, [{
      id: randomUUID(), version: "audit.v1", actorRef: `membership:${stranger.auth.membershipId}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: result.jobId,
      payload: { references: { sourceJobId: stranger.jobId } },
    }]));
    await expect(authorizePracticeJob(f.runtime, stranger.sessionId, result.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
