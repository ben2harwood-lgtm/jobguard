import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, boundaryLock, insertPhoto, type WorkFixture } from "./job-work-state-fixtures.js";
import { historicalAgreement, meterCompany } from "./subscription-persistence-fixtures.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";

// Real PostgreSQL in CI. No local listener or simulated database claim.
describe("CH-5 part 2 company imports through real MON-1 admission", () => {
 let f: WorkFixture;
 const originalMode = process.env.JOBGUARD_ENV;
 beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; f = await createWorkFixture(); }, 60000);
 afterAll(async () => {
  await closeWorkFixture(f);
  if (originalMode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = originalMode;
 });
 const repo = () => new JobImportV3Repository(f.runtime);
 async function company(places = 0, plan: "Solo" | "Builder" = "Solo") {
  const a = await meterCompany(f); await historicalAgreement(f, a, plan);
  await workTenant(f.admin, a.tenantId, db => seedSyntheticPartyFixture(db, a.tenantId, a.jobId));
  for (let i = 0; i < places; i++) await activateMeterJob(f, await seedWorkJob(f, a.tenantId));
  const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].binding_id;
  const preview = await repo().preview(a.context, a.digest, a.jobId, { version: "job-import-preview.v3", expectedBindingId: binding, fixtureId: "fictional-extension-v3", lifecyclePoint: "live" });
  const input = { version: "job-parties-import.v3", commandId: randomUUID(), expectedBindingId: binding, fixtureId: "fictional-extension-v3", lifecyclePoint: "live", previewHash: preview.previewHash, attest: true };
  return { ...a, input };
 }
 const adopt = (a: Awaited<ReturnType<typeof company>>) => repo().adopt(a.context, a.digest, a.jobId, a.input);
 const money = async (tenant: string) => {
  const result: unknown[] = [];
  for (const table of ["journal", "recovery_fee_journal", "platform_statement", "synthetic_obligation"])
   result.push((await f.admin.query(`SELECT to_jsonb(x) value FROM app.${table} x WHERE tenant_id=$1 ORDER BY to_jsonb(x)::text`, [tenant])).rows);
  return result;
 };
 it("Solo gets the sixth grace place, rejects a seventh, and never creates free-period or fee facts", async () => {
  const a = await company(5), before = await money(a.tenantId);
  const result = await adopt(a);
  expect(result.lifecyclePoint).toBe("live");
  const read = await repo().read(a.context, a.digest, String(result.jobId));
  expect(read.meter).toMatchObject({ reason: "ordinary_start_rule", admission: { outcome: "grace_place", sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/u) } });
  expect(read.snapshot.terms.policyVersion).toBe("reference_fee_policy_v3");
  const fresh = await seedWorkJob(f, a.tenantId), staged = await activateMeterJob(f, fresh, false, true);
  await f.admin.query("ALTER TABLE app.job_activation_terms ENABLE ALWAYS TRIGGER mon1_live_admission");
  try {
   await expect(workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'"); await db.query("SET LOCAL ROLE jobguard_migration");
    return db.query(staged.sql, staged.values);
   })).rejects.toThrow("METER_UPGRADE_REQUIRED");
  } finally { await f.admin.query("ALTER TABLE app.job_activation_terms ENABLE TRIGGER mon1_live_admission"); }
  expect(await money(a.tenantId)).toEqual(before);
 });
 it("an over-limit Solo import rolls back approvals, receipts, source and audit together", async () => {
  const a = await company(6);
  const counts = async () => (await f.admin.query(`SELECT
   (SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1) receipts,
   (SELECT count(*) FROM app.action_authorization WHERE tenant_id=$1) approvals,
   (SELECT count(*) FROM app.job_import_v3 WHERE tenant_id=$1) imports,
   (SELECT count(*) FROM app.audit_event WHERE tenant_id=$1) audits`, [a.tenantId])).rows;
  const before = await counts();
  for (let i = 0; i < 2; i++) await expect(adopt(a)).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
  expect(await counts()).toEqual(before);
 });
 it("a cap-free import cannot bypass admission with a session GUC and a direct row insert", async () => {
  const a = await company();
  await expect(workTenant(f.admin, a.tenantId, async db => {
   await db.query("SELECT set_config('app.import_command','enabled',true)");
   await db.query("INSERT INTO app.job(tenant_id,id,title,status,provenance,accepted_net_value_pence,fee_policy_version) VALUES($1,$2,'Fictional forged import','draft','imported',300000,'reference_fee_policy_v3')", [a.tenantId, randomUUID()]);
  })).rejects.toThrow("IMPORT_RECORD_REQUIRED");
 });
 it("Builder imports stay unblocked past grace and preserve their approved monthly maximum", async () => {
  const a = await company(13, "Builder"), before = await money(a.tenantId);
  const imported = await adopt(a);
  expect((await repo().read(a.context, a.digest, String(imported.jobId))).meter).toMatchObject({ admission: { outcome: "track_review_due" } });
  expect((await f.admin.query("SELECT maximum_pence::int maximum FROM app.subscription_agreement_revision WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ maximum: 16900 }]);
  expect(await money(a.tenantId)).toEqual(before);
 });
 it("concurrent duplicate requests replay original identities; changed content and foreign customers refuse", async () => {
  const a = await company(), b = await company();
  const results = await Promise.all([adopt(a), adopt(a)]);
  expect(results[0]).toEqual(results[1]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_import_v3 WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
  await expect(repo().adopt(a.context, a.digest, a.jobId, { ...a.input, lifecyclePoint: "invoiced" })).rejects.toThrow();
  await expect(repo().read(b.context, b.digest, String(results[0]!.jobId))).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(repo().adopt(b.context, b.digest, a.jobId, a.input)).rejects.toMatchObject({ code: "FORBIDDEN" });
 });
 it("closed imports release capacity; replay never reopens them and locks reject a restart", async () => {
  const a = await company(), result = await adopt(a), jobId = String(result.jobId);
  const work = new JobWorkStateRepository(f.runtime);
  const closed = await work.command(a.context, jobId, a.actorId, { version: "job-work-state-command.v1", commandId: randomUUID(), action: "close", expectedRevision: 0, reason: "other", note: "Fictional closure" });
  expect(await adopt(a)).toEqual(result);
  expect((await f.admin.query("SELECT id FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence", [a.tenantId, jobId])).rows.map(row => row.id)).toEqual(closed.events.map(event => event.id));
  await boundaryLock(f, { ...a, jobId });
  await expect(work.command(a.context, jobId, a.actorId, { version: "job-work-state-command.v1", commandId: randomUUID(), action: "reopen", expectedRevision: 1, closeEventId: closed.events[0]!.id })).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
 });
 it("an implicit v3 site restart competes for capacity after its quiet stop", async () => {
  const a = await company(5), imported = await adopt(a), jobId = String(imported.jobId);
  const baseline = imported.baseline as { lines: { scopeItemId: string }[] };
  const job = { ...a, jobId, scopeId: baseline.lines[0]!.scopeItemId };
  await insertPhoto(f, job, new Date().toISOString());
  // Explicit historical clock fixture only. The source receipt and first event
  // were created by the real evidence path; runtime cannot backdate them.
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job_import_v3 SET adopted_at=clock_timestamp()-interval '41 days' WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, jobId]);
   await db.query("UPDATE app.job_work_state_event SET fact_at=clock_timestamp()-interval '40 days',recorded_at=clock_timestamp()-interval '40 days' WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, jobId]);
  });
  await activateMeterJob(f, await seedWorkJob(f, a.tenantId));
  await expect(insertPhoto(f, job, new Date().toISOString())).rejects.toThrow("METER_UPGRADE_REQUIRED");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, jobId])).rows[0].n).toBe(1);
 });
 it("company sessions and helper privileges are checked on replay", async () => {
  const a = await company(), imported = await adopt(a);
  expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.ch5_import_actor(uuid,text)','EXECUTE') actor,has_function_privilege('jobguard_runtime','app.ch5_require_import_record()','EXECUTE') guard")).rows[0]).toEqual({ actor: true, guard: false });
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
  await expect(adopt(a)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(repo().read(a.context, a.digest, String(imported.jobId))).rejects.toMatchObject({ code: "FORBIDDEN" });
 });
 it("catch requests refuse repeatedly before hidden reads or allocations; locked-bill and allocation overrides fail", async () => {
  const a = await company(), result = await adopt(a), jobId = String(result.jobId), before = await money(a.tenantId);
  const input = { version: "import-catch-command.v1", commandId: randomUUID(), baselineId: result.baselineId };
  for (let i = 0; i < 2; i++) await expect(repo().assessCatch(a.context, a.digest, jobId, input)).rejects.toMatchObject({ code: "ATTRIBUTION_UNAVAILABLE" });
  for (const extra of [{ allocationPence: 1 }, { finalAccountRevisionId: randomUUID() }, { reversalId: randomUUID() }, { feePence: 0 }])
   await expect(repo().assessCatch(a.context, a.digest, jobId, { ...input, ...extra })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
  await expect(repo().assessCatch(a.context, a.digest, jobId, { ...input, baselineId: randomUUID() })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  expect(await money(a.tenantId)).toEqual(before);
 });
});
