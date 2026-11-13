import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserCommandDispatcher } from "../src/commands.js";
import { AdoptInFlightJobMutation } from "../src/job-import-repository.js";
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

  it("keeps a real v1 parties import owned through its succeeded command receipt", async () => {
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

  it("ignores a stranger's pre-planted v1 attestation and keeps the owner's import", async () => {
    const { JobPartiesApplication } = await import("../../../apps/api/src/job-parties.application.js");
    const owner = await seedWorkPractice(f), stranger = await seedWorkPractice(f);
    const tenantId = owner.auth.context.tenantId, commandId = randomUUID();
    const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",
      [tenantId, owner.jobId])).rows[0].binding_id as string;
    // Match the public API's deterministic IDs so the forged event arrives before the real adoption.
    const deterministicId = (kind: string) => {
      const h = createHash("sha256").update(`${tenantId}|${commandId}|${kind}`).digest("hex");
      return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
    };
    const jobId = deterministicId("job"), baselineId = deterministicId("baseline");
    const baselineHash = createHash("sha256").update(JSON.stringify({
      sourceJobId: owner.jobId, bindingId: binding,
      baselineDescription: "Supplied fictional decorating job already under way — synthetic builder attestation only",
      netPence: 100000,
    })).digest("hex");
    await withTenant(f.runtime, stranger.auth.context, db => appendAuditBatch(db, [{
      id: randomUUID(), version: "audit.v1", actorRef: `membership:${stranger.auth.membershipId}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: jobId,
      payload: { references: { sourceJobId: stranger.jobId, baselineId }, hashes: { baselineHash } },
    }]));
    const result = await new JobPartiesApplication(f.runtime).adopt({ sessionId: owner.sessionId }, owner.jobId,
      { version: "job-parties-import.v1", commandId, expectedBindingId: binding });
    expect(result.jobId).toBe(jobId);
    expect((await f.admin.query(`SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2
      AND event_type='job.imported_baseline_attested' ORDER BY sequence LIMIT 1`, [tenantId, jobId])).rows[0].payload)
      .toMatchObject({ references: { sourceJobId: stranger.jobId, baselineId }, hashes: { baselineHash } });
    expect((await f.admin.query(`SELECT status, result->>'sourceJobId' AS source FROM app.command_receipt
      WHERE tenant_id=$1 AND command_id=$2`, [tenantId, commandId])).rows[0])
      .toEqual({ status: "succeeded", source: owner.jobId });
    expect((await authorizePracticeJob(f.runtime, owner.sessionId, jobId)).digest).toBe(owner.auth.digest);
    await expect(authorizePracticeJob(f.runtime, stranger.sessionId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses legacy v1 event-only ownership claims with arbitrary hashes", async () => {
    const owner = await seedWorkPractice(f), stranger = await seedWorkPractice(f);
    const tenantId = owner.auth.context.tenantId, jobId = randomUUID(), baselineId = randomUUID();
    const parties = (await f.admin.query(`SELECT customer_revision_id AS "customerRevisionId",
      site_revision_id AS "siteRevisionId", paying_party_revision_id AS "payingPartyRevisionId"
      FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1`,
    [tenantId, owner.jobId])).rows[0];
    // The controlled v1 contract accepts arbitrary baseline hashes, as CH-3a's original adoption does.
    const baselineHash = createHash("sha256").update("Fictional inherited ownership").digest("hex");
    const mutation = new AdoptInFlightJobMutation(tenantId, "synthetic_candidate", {
      version: "adopt-job.v1", jobId, baselineId, title: "Fictional legacy import", lifecyclePoint: "live",
      provenance: "imported", lineageStrength: "builder_attested_weaker", baselineHash,
      baselineDescription: "Fictional baseline", acceptedNetValuePence: 100000, recoveryCapPence: 1500,
      acceptedValueSource: "builder_attestation", attestedByMembershipId: owner.auth.membershipId,
      attestedAt: new Date(0), importTermsVersion: "synthetic_import_terms_candidate.v1",
      feePolicyVersion: "reference_fee_policy_v1", mode: "synthetic_candidate", parties,
    });
    await new UserCommandDispatcher(f.runtime).dispatch(owner.auth.context, {
      version: "command.v1", commandId: randomUUID(), commandType: "job.adopt_in_flight", semanticKey: `import:${jobId}`,
      actorMembershipId: owner.auth.membershipId, subjectType: "job", subjectRef: jobId,
      action: { actionType: "job.adopt_in_flight", recipient: null, contentHash: baselineHash, aggregateRevision: 0,
        amountPence: 100000, currency: "GBP", policyVersion: "synthetic_import_terms_candidate.v1",
        expiresAt: new Date(Date.now() + 300000) },
    }, { mutate: mutation.mutate.bind(mutation), auditEvents: (result, command) => mutation.auditEvents(result, command).map(event => ({
      ...event, payload: { ...event.payload, references: { ...event.payload.references, sourceJobId: owner.jobId } },
    })) });
    await expect(authorizePracticeJob(f.runtime, owner.sessionId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await withTenant(f.runtime, stranger.auth.context, db => appendAuditBatch(db, [{
      id: randomUUID(), version: "audit.v1", actorRef: `membership:${stranger.auth.membershipId}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: jobId,
      payload: { references: { sourceJobId: stranger.jobId, baselineId }, hashes: { baselineHash } },
    }]));
    await expect(authorizePracticeJob(f.runtime, stranger.sessionId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(authorizePracticeJob(f.runtime, owner.sessionId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

});
