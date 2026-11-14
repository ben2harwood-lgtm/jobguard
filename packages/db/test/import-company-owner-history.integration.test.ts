import { testBoundTenantContext, bindOwnSession } from "./tenant-context-test-utils.js";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ImportPreAdoptionRepository } from "../src/import-pre-adoption-repository.js";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { createWorkFixture, closeWorkFixture, insertPhoto, seedWorkPractice, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { freshIntent } from "./job-import-v3-fixtures.js";
import { historicalAgreement, meterCompany } from "./subscription-persistence-fixtures.js";

let f: WorkFixture;
const originalMode = process.env.JOBGUARD_ENV;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; f = await createWorkFixture(); }, 60000);
afterAll(async () => {
  await closeWorkFixture(f);
  if (originalMode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = originalMode;
});

it("LATER-SAFETY-118 company history follows current owners across sign-in, with practice still session-bound", async () => {
  const imports = new JobImportV3Repository(f.runtime), history = new ImportPreAdoptionRepository(f.runtime);
  const a = await meterCompany(f);
  await historicalAgreement(f, a, "Solo");
  const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].binding_id as string;
  const preview = await imports.preview(a.context, a.digest, a.jobId, { version: "job-import-preview.v3", expectedBindingId: binding, fixtureId: "fictional-extension-v3", lifecyclePoint: "live" });
  const adopted = await imports.adopt(a.context, a.digest, a.jobId, freshIntent(binding, preview.previewHash));
  const jobId = String(adopted.jobId), scopeId = (adopted.baseline as { lines: { scopeItemId: string }[] }).lines[0]!.scopeItemId;
  const evidenceId = await insertPhoto(f, { ...a, jobId, scopeId } as Parameters<typeof insertPhoto>[1], "2026-10-13T10:00:00Z", "site_photo", "2020-01-01T00:00:00Z", true);
  const command = { version: "import-history-command.v1", commandId: randomUUID(), evidenceId };
  const catchCommand = { version: "import-catch-command.v2", commandId: command.commandId, baselineId: adopted.baselineId, evidenceId };
  const digest = createHash("sha256").update(randomUUID()).digest("hex");
  await f.admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    SELECT $1,user_id,environment,$2,$3,expires_at FROM identity.session WHERE id=$4`, [randomUUID(), digest, randomUUID(), a.sessionId]);
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);

  const resumedContext = await testBoundTenantContext(f.admin, a.tenantId, a.actorId, digest);

  // Scratch database definition: reverting only the company branch must reject S2.
  // Transaction rollback restores the real routine even when an assertion fails.
  const sql = readFileSync(new URL("../migrations/0668_import_company_owner_history.sql", import.meta.url), "utf8");
  const companyBranch = "(t<>'11111111-1111-4111-8111-111111111111'::uuid OR i.session_digest=d)";
  expect(sql).toContain(companyBranch);
  const scratch = await f.admin.connect();
  try {
    await scratch.query("BEGIN");
    await scratch.query(sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"), sql.lastIndexOf("COMMIT;")).replace(companyBranch, "i.session_digest=d"));
    await scratch.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    await scratch.query("SET LOCAL ROLE jobguard_runtime");
    // LP-6d: the raw call is the named session's own bound request; the body's company branch still refuses.
    await bindOwnSession(scratch, digest);
    await expect(scratch.query("SELECT app.ch5_write_history($1,$2,$3,$4,$5,$6)", [a.tenantId, jobId, digest, command.commandId, evidenceId, randomUUID()])).rejects.toThrow("FORBIDDEN");
  } finally { await scratch.query("ROLLBACK"); scratch.release(); }

  const written = await history.write(resumedContext, digest, jobId, command);
  expect((await imports.read(resumedContext, digest, jobId)).result.jobId).toBe(jobId);
  expect(await imports.assessCatch(resumedContext, digest, jobId, catchCommand)).toMatchObject({ catchId: written.historyId, fee: { pence: 0, currency: "GBP" } });
  const second = await meterCompany(f, a.tenantId);
  const secondEvidence = await insertPhoto(f, { ...a, jobId, scopeId } as Parameters<typeof insertPhoto>[1], "2026-10-13T11:00:00Z", "site_photo", "2020-01-02T00:00:00Z", true);
  const secondCommand = { ...command, commandId: randomUUID(), evidenceId: secondEvidence };
  const secondCatch = { ...catchCommand, commandId: secondCommand.commandId, evidenceId: secondEvidence };
  const secondWritten = await history.write(second.context, second.digest, jobId, secondCommand);
  expect(await imports.assessCatch(second.context, second.digest, jobId, secondCatch)).toMatchObject({ catchId: secondWritten.historyId });
  expect(await imports.assessCatch(second.context, second.digest, jobId, catchCommand)).toMatchObject({ catchId: written.historyId });
  const actors = (await f.admin.query("SELECT actor_id FROM app.import_pre_adoption_evidence WHERE tenant_id=$1 AND job_id=$2 ORDER BY actor_id", [a.tenantId, jobId])).rows.map(row => row.actor_id).sort();
  expect(actors).toEqual([a.actorId, second.actorId].sort());

  async function refused(context: typeof a.context, d: string) {
    await expect(history.write(context, d, jobId, command)).rejects.toThrow("FORBIDDEN");
    await expect(history.assess(context, d, jobId, catchCommand)).rejects.toThrow("FORBIDDEN");
    await expect(imports.read(context, d, jobId)).rejects.toThrow("FORBIDDEN");
    await expect(imports.assessCatch(context, d, jobId, catchCommand)).rejects.toThrow("FORBIDDEN");
  }
  const nonOwner = await meterCompany(f, a.tenantId);
  // Admin is deliberately insufficient, even with an otherwise valid session.
  await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [a.tenantId, nonOwner.actorId]);
  await refused(nonOwner.context, nonOwner.digest);
  await f.admin.query("UPDATE app.membership SET role='member' WHERE tenant_id=$1 AND id=$2", [a.tenantId, nonOwner.actorId]);
  await refused(nonOwner.context, nonOwner.digest);
  const other = await meterCompany(f);
  await refused(other.context, other.digest);
  await refused(a.context, other.digest);
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, second.actorId]);
  await refused(second.context, second.digest);
  await refused(a.context, a.digest); // signed-out S1 stays refused
  await expect(history.write(resumedContext, digest, jobId, command)).resolves.toEqual(written);

  const practice = await seedWorkPractice(f), foreignPractice = await seedWorkPractice(f);
  const p = practice.auth;
  const practiceBinding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [p.context.tenantId, practice.jobId])).rows[0].binding_id as string;
  const pp = await imports.preview(p.context, p.digest, practice.jobId, { version: "job-import-preview.v3", expectedBindingId: practiceBinding, fixtureId: "fictional-extension-v3", lifecyclePoint: "invoiced" });
  const pi = await imports.adopt(p.context, p.digest, practice.jobId, freshIntent(practiceBinding, pp.previewHash, "invoiced"));
  const pj = String(pi.jobId), ps = (pi.baseline as { lines: { scopeItemId: string }[] }).lines[0]!.scopeItemId;
  const pe = await insertPhoto(f, { tenantId: p.context.tenantId, jobId: pj, scopeId: ps } as Parameters<typeof insertPhoto>[1], "2026-10-13T10:00:00Z", "site_photo", "2020-01-01T00:00:00Z", true);
  const pc = { ...command, commandId: randomUUID(), evidenceId: pe };
  await history.write(p.context, p.digest, pj, pc);
  const pcatch = { ...catchCommand, commandId: pc.commandId, baselineId: pi.baselineId, evidenceId: pe };
  await expect(history.assess(p.context, p.digest, pj, pcatch)).resolves.toMatchObject({ evidenceId: pe });
  await expect(history.write(p.context, foreignPractice.auth.digest, pj, pc)).rejects.toThrow("FORBIDDEN");
  await expect(history.assess(p.context, foreignPractice.auth.digest, pj, pcatch)).rejects.toThrow("FORBIDDEN");
  await expect(imports.read(p.context, foreignPractice.auth.digest, pj)).rejects.toThrow("FORBIDDEN");
});
