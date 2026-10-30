import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ImportPreAdoptionRepository } from "../src/import-pre-adoption-repository.js";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { migrate } from "../src/migrate.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createImportFixture, closeWorkFixture, freshIntent, type ImportFixture } from "./job-import-v3-fixtures.js";
import { insertPhoto, seedWorkPractice, workTenant } from "./job-work-state-fixtures.js";

let f: ImportFixture;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; f = await createImportFixture(); }, 60000);
afterAll(async () => { await closeWorkFixture(f); });
it("CH-5 persists historical provenance once, returns GBP 0 and refuses scope, replay and relabelling attacks", async () => {
  const { auth, jobId: source } = f.practice, t = auth.context.tenantId;
  const imports = new JobImportV3Repository(f.runtime), repo = new ImportPreAdoptionRepository(f.runtime);
  const p = await imports.preview(auth.context, auth.digest, source, { ...f.request, lifecyclePoint: "invoiced" });
  const adopted = await imports.adopt(auth.context, auth.digest, source, freshIntent(f.request.expectedBindingId, p.previewHash, "invoiced"));
  const jobId = String(adopted.jobId), scopeId = String((adopted.baseline as { lines: { scopeItemId: string }[] }).lines[0]!.scopeItemId);
  const evidenceId = await insertPhoto(f, { tenantId: t, jobId, scopeId } as Parameters<typeof insertPhoto>[1], "2026-10-13T10:00:00Z", "site_photo", "2020-01-01T00:00:00Z");
  const command = { version: "import-history-command.v1", commandId: randomUUID(), evidenceId };
  const [a, b] = await Promise.all([repo.write(auth.context, auth.digest, jobId, command), repo.write(auth.context, auth.digest, jobId, command)]);
  expect(b).toEqual(a);
  const catchCommand = { version: "import-catch-command.v2", commandId: command.commandId, baselineId: adopted.baselineId, evidenceId };
  const result = await imports.assessCatch(auth.context, auth.digest, jobId, catchCommand);
  expect(result).toMatchObject({ catchId: a.historyId, evidenceId, fee: { pence: 0, currency: "GBP" }, reason: "pre_adoption_evidence" });
  expect(await imports.assessCatch(auth.context, auth.digest, jobId, catchCommand)).toEqual(result);
  // Even a shadow caller that omits the historical label cannot create a fee source.
  // BEFORE trigger fires before the forged signal's FK, isolating this refusal.
  await expect(workTenant(f.admin, t, db => db.query(`INSERT INTO app.shadow_signal_evidence
    (tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at)
    SELECT tenant_id,job_id,$3,id,object_version_id,sha256,server_received_at FROM app.evidence_object WHERE tenant_id=$1 AND id=$2`,
    [t, evidenceId, randomUUID()]))).rejects.toThrow("PRE_ADOPTION_SOURCE_EXCLUDED");
  const relabelled = await insertPhoto(f, { tenantId: t, jobId, scopeId } as Parameters<typeof insertPhoto>[1], "2099-02-01T00:00:00Z", "site_photo", "2099-01-01T00:00:00Z");
  await expect(workTenant(f.admin, t, db => db.query(`INSERT INTO app.shadow_signal_evidence
    (tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at)
    SELECT tenant_id,job_id,$3,id,object_version_id,sha256,server_received_at FROM app.evidence_object WHERE tenant_id=$1 AND id=$2`,
    [t, relabelled, randomUUID()]))).rejects.toThrow("PRE_ADOPTION_SOURCE_EXCLUDED");
  const sourceScope = (await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [t, source])).rows[0].id as string;
  const foreignEvidence = await insertPhoto(f, { tenantId: t, jobId: source, scopeId: sourceScope } as Parameters<typeof insertPhoto>[1], "2026-10-13T10:00:00Z", "site_photo", "2020-01-01T00:00:00Z");
  await expect(repo.write(auth.context, auth.digest, jobId, { ...command, commandId: randomUUID(), evidenceId: foreignEvidence })).rejects.toThrow("PRE_ADOPTION_SOURCE_REQUIRED");
  for (const capturedAt of [null, "2099-01-01T00:00:00Z"]) {
    const unusable = await insertPhoto(f, { tenantId: t, jobId, scopeId } as Parameters<typeof insertPhoto>[1], "2026-10-13T10:00:00Z", "site_photo", capturedAt);
    await expect(repo.write(auth.context, auth.digest, jobId, { ...command, commandId: randomUUID(), evidenceId: unusable })).rejects.toThrow("PRE_ADOPTION_SOURCE_REQUIRED");
  }
  const unaudited = await insertPhoto(f, { tenantId: t, jobId, scopeId } as Parameters<typeof insertPhoto>[1], "2026-10-13T10:00:00Z", "site_photo", "2020-01-01T00:00:00Z");
  await expect(withTenant(f.runtime, auth.context, db => db.$client.query("SELECT app.ch5_write_history($1,$2,$3,$4,$5,$6)",
    [t, jobId, auth.digest, randomUUID(), unaudited, randomUUID()]))).rejects.toThrow(/foreign key|IMPORT_HISTORY_AUDIT_REQUIRED/u);
  const unrelatedAudit = (await f.admin.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 AND event_type='job.imported_baseline_attested' LIMIT 1", [t])).rows[0].id as string;
  await expect(withTenant(f.runtime, auth.context, db => db.$client.query("SELECT app.ch5_write_history($1,$2,$3,$4,$5,$6)",
    [t, jobId, auth.digest, randomUUID(), unaudited, unrelatedAudit]))).rejects.toThrow("IMPORT_HISTORY_AUDIT_REQUIRED");
  await expect(repo.write(auth.context, auth.digest, jobId, { ...command, evidenceId: randomUUID() })).rejects.toThrow("COMMAND_CONFLICT");
  await expect(repo.write(auth.context, auth.digest, jobId, { ...command, commandId: randomUUID() })).rejects.toThrow("IMPORT_HISTORY_ALREADY_RECORDED");
  await expect(repo.write(auth.context, auth.digest, jobId, { ...command, classification: "not_pre_adoption_by_timing" })).rejects.toThrow();
  await expect(repo.assess(auth.context, auth.digest, jobId, { ...catchCommand, baselineId: randomUUID() })).rejects.toThrow("REVISION_CONFLICT");
  await expect(repo.assess(auth.context, auth.digest, jobId, { ...catchCommand, evidenceId: randomUUID() })).rejects.toThrow("COMMAND_CONFLICT");
  await expect(repo.assess(auth.context, auth.digest, jobId, { ...catchCommand, commandId: randomUUID() })).rejects.toThrow("PRE_ADOPTION_SOURCE_REQUIRED");
  await expect(repo.write(auth.context, auth.digest, source, { ...command, commandId: randomUUID() })).rejects.toThrow("FORBIDDEN");
  const other = await seedWorkPractice(f);
  for (const [context, d] of [[auth.context, other.auth.digest], [testTenantContext(randomUUID()), auth.digest]] as const)
    await expect(repo.assess(context, d, jobId, catchCommand)).rejects.toThrow("FORBIDDEN");
  for (const sql of ["SELECT * FROM app.import_pre_adoption_evidence", "UPDATE app.import_pre_adoption_evidence SET classification='not_pre_adoption_by_timing'", "TRUNCATE app.import_pre_adoption_evidence"])
    await expect(withTenant(f.runtime, auth.context, db => db.$client.query(sql))).rejects.toThrow("permission denied");
  await expect(workTenant(f.admin, t, db => db.query("UPDATE app.import_pre_adoption_evidence SET fee_pence=1"))).rejects.toThrow();
  expect((await f.admin.query("SELECT count(*)::int n FROM app.import_pre_adoption_evidence WHERE tenant_id=$1 AND job_id=$2", [t, jobId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='job.imported_historical_evidence'", [t, jobId])).rows[0].n).toBe(1);
  for (const table of ["recovery_fee_journal", "recovery_case", "customer_invoice"])
    expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [t, jobId])).rows[0].n).toBe(0);
  await migrate(f.admin);
  expect(await repo.assess(auth.context, auth.digest, jobId, catchCommand)).toEqual(result);
  await workTenant(f.admin, t, db => db.query(`INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)
    VALUES($1,$2,$3,$4,'object_revoked')`, [randomUUID(), t, evidenceId, auth.membershipId]));
  await expect(repo.write(auth.context, auth.digest, jobId, command)).rejects.toThrow("PRE_ADOPTION_SOURCE_REQUIRED");
  await expect(repo.assess(auth.context, auth.digest, jobId, catchCommand)).rejects.toThrow("PRE_ADOPTION_SOURCE_REQUIRED");
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [auth.digest]);
  await expect(repo.write(auth.context, auth.digest, jobId, command)).rejects.toThrow();
  await expect(repo.assess(auth.context, auth.digest, jobId, catchCommand)).rejects.toThrow();
});
