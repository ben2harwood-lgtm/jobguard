import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkJob, prepareWorkAccount, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { firstTrialFixture, exactTarget } from "./free-first-job-lifecycle-fixtures.js";
import { requestCard, verifyBusiness } from "./free-first-job-admission-fixtures.js";
import { meterCompany, command, terms, historicalAgreement, rows, approvedSimulation, readSubscription, storeMeter, calendarInput } from "./subscription-persistence-fixtures.js";
import { companyService, request, changeTrack, retained, retainedExport } from "./plan-entitlement-lifecycle-fixtures.js";
import { FreeFirstJobLifecycleRepository } from "../src/free-first-job-lifecycle-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
let f: WorkFixture;
const environment = process.env.JOBGUARD_ENV;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; f = await createWorkFixture(); }, 120000);
afterAll(async () => { await closeWorkFixture(f); if (environment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = environment; });

it("effective MON-2A upgrade alone supplies terms; replay is harmless and conflicting command reuse refuses", async () => {
  const bound = await companyService(f, await meterCompany(f)), { a, app } = bound;
  const exports = await retainedExport(f, a), before = await retained(f, a, exports);
  expect(await app.check(request("invoices", a.jobId))).toMatchObject({ executable: false });
  await historicalAgreement(f, a, "Solo", "2000-01-01");
  const solo = await app.require(request("invoices", a.jobId));
  const upgrade = { ...terms(a, "Builder", 1), kind: "change" }, id = randomUUID();
  const applied = await command(f, a, upgrade, id);
  expect(await command(f, a, upgrade, id)).toEqual(applied);
  await expect(command(f, a, { ...upgrade, plan: "Solo" }, id)).rejects.toThrow();
  expect((await rows(f, a, "subscription_agreement_revision")).find(row => row.revision === 2)).toMatchObject({ plan: "Builder" });
  const effectivePlan = () => workTenant(f.admin, a.tenantId, async db => (await db.query("SELECT plan FROM app.subscription_agreement_revision WHERE tenant_id=$1 AND effective_date<=(clock_timestamp() AT TIME ZONE 'Europe/London')::date ORDER BY effective_date DESC,revision DESC LIMIT 1", [a.tenantId])).rows[0].plan);
  expect(await effectivePlan()).toBe("Builder");
  const downgrade = await command(f, a, { ...terms(a, "Solo", 2), kind: "change" });
  expect((await rows(f, a, "subscription_agreement_revision"))).toHaveLength(2);
  expect(await effectivePlan()).toBe("Builder");
  expect(await app.require(request("invoices", a.jobId))).toEqual(solo);
  // Existing privileged MON-2A calendar fixture brings the due boundary into
  // the past; the actual apply command must create the effective revision.
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1", [a.tenantId]);
    await db.query("UPDATE app.subscription_agreement_revision SET effective_date='2026-09-01' WHERE tenant_id=$1", [a.tenantId]);
  });
  const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, 4, 9));
  const apply = { version: "subscription-command.v1", kind: "apply_change", changeId: downgrade.changeId, sourceId, expectedRevision: 2 }, applyId = randomUUID();
  expect(await command(f, a, apply, applyId)).toMatchObject({ outcome: "applied" });
  expect(await command(f, a, apply, applyId)).toMatchObject({ outcome: "applied" });
  expect(await effectivePlan()).toBe("Solo");
  expect(await app.require(request("invoices", a.jobId))).toEqual(solo);
  await command(f, a, { ...terms(a, "Builder", 3), kind: "change" });
  expect(await effectivePlan()).toBe("Builder");
  expect(await retained(f, a, exports)).toEqual(before);
});

it("a future-only agreement cannot grant job access until its effective date", async () => {
  const { a, app } = await companyService(f, await meterCompany(f)); await command(f, a, terms(a));
  const date = async (offset: number) => workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.subscription_agreement_revision SET effective_date=(clock_timestamp() AT TIME ZONE 'Europe/London')::date+$2::int WHERE tenant_id=$1", [a.tenantId, offset]);
  });
  await date(1); expect(await app.check(request("invoices", a.jobId))).toMatchObject({ executable: false });
  await date(0); expect(await app.require(request("invoices", a.jobId))).toMatchObject({ executable: true });
});

it.each(["lock", "close", "day_90"] as const)("persisted trial %s end preserves its job access and identical documents/exports without subscription terms", async kind => {
  // First-admission parents are explicitly synthetic fixture storage. The lock
  // and close below are real runtime commands, not reducer-only end simulations.
  const trial = await firstTrialFixture(f, kind === "day_90" ? "2000-01-01T12:00:00.000000Z" : undefined);
  const { a, app } = await companyService(f, trial), lifecycle = new FreeFirstJobLifecycleRepository(f.runtime);
  const scopeId = (await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].id;
  await prepareWorkAccount(f, { ...a, scopeId });
  const exports = await retainedExport(f, a), before = await retained(f, a, exports);
  expect(await rows(f, a, "subscription_agreement_revision")).toEqual([]);
  for (const feature of ["final_check", "invoices"]) expect(await app.require(request(feature, a.jobId))).toMatchObject({ executable: true });
  if (kind === "lock") {
    const lock = new FinalAccountLockRepository(f.runtime);
    await lock.acceptTerms(a.context, { actorMembershipId: a.actorId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
    await lock.disposition(a.context, { jobId: a.jobId, actorMembershipId: a.actorId, commandId: randomUUID(), scopeItemId: scopeId, disposition: "done" });
    const revision = (await rows(f, a, "final_account_revision"))[0].id;
    const input = { jobId: a.jobId, actorMembershipId: a.actorId, commandId: randomUUID(), finalAccountRevisionId: revision, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" as const };
    const locked = await lock.lock(a.context, input);
    expect(await lock.lock(a.context, input)).toEqual(locked);
  } else if (kind === "close") {
    const repo = new JobWorkStateRepository(f.runtime), input = { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "close", reason: "completed_outside_jobguard", note: "Fictional completion" };
    const closed = await repo.command(a.context, a.jobId, a.actorId, input);
    expect(await repo.command(a.context, a.jobId, a.actorId, input)).toEqual(closed);
  }
  const view = await lifecycle.read(a.context, a.digest, a.jobId);
  expect(view.timeline?.active).toBe(false);
  if (kind !== "day_90") expect((await rows(f, a, "trial_end_source")).map(row => row.kind)).toEqual([kind]);
  for (const feature of ["final_check", "invoices"]) expect(await app.require(request(feature, a.jobId))).toMatchObject({ executable: true });
  for (const feature of ["pay_now", "accounting_export"]) expect(await app.check(request(feature, a.jobId))).toMatchObject({ entitlement: "included", executable: false, reason: "feature_disabled" });
  await changeTrack(f, a, "contractor", 0);
  for (const feature of ["final_check", "invoices"]) expect(await app.require(request(feature, a.jobId))).toMatchObject({ executable: true });
  await changeTrack(f, a, "small_builder", 1);
  const other = await seedWorkJob(f, a.tenantId);
  expect(await app.check(request("invoices", other.jobId))).toMatchObject({ executable: false, entitlement: "held" });
  expect(await app.check(request())).toMatchObject({ executable: false, entitlement: "held" });
  // The newly created control job is excluded from the before/after comparison.
  const after = await retained(f, a, exports);
  after.data.job = (after.data.job as { bytes: string }[]).filter(row => JSON.parse(row.bytes).id !== other.jobId);
  expect(after).toEqual(before);
});

it("a real second activation ends the trial once and preserves the first job's documents and export", async () => {
  const original = await meterCompany(f); await verifyBusiness(f, original); await exactTarget(f, original);
  const { a, app } = await companyService(f, original), lifecycle = new FreeFirstJobLifecycleRepository(f.runtime);
  const second = await seedWorkJob(f, a.tenantId); await exactTarget(f, { ...a, jobId: second.jobId });
  const activate = async (jobId: string, commandId = randomUUID()) => lifecycle.activate(a.context, a.digest, a.actorId,
    { version: "trial-switch-live.v1", commandId, jobId, ...(await lifecycle.read(a.context, a.digest, jobId)).target });
  await activate(a.jobId);
  const exports = await retainedExport(f, a);
  // Second activation requires real persisted terms and a simulated card; no
  // provider or normal-company commercial route is added by this proof.
  const card = randomUUID(); await requestCard(f, a, card);
  await lifecycle.simulateCard(a.context, a.digest, card, { version: "trial-card-simulate.v1" });
  await historicalAgreement(f, a);
  const before = await retained(f, a, exports);
  const input = { version: "trial-switch-live.v1", commandId: randomUUID(), jobId: second.jobId, ...(await lifecycle.read(a.context, a.digest, second.jobId)).target };
  const activated = await lifecycle.activate(a.context, a.digest, a.actorId, input);
  expect(await lifecycle.activate(a.context, a.digest, a.actorId, input)).toEqual(activated);
  // Replay must use the originally approved target, not its now-live revision.
  expect(activated).toMatchObject({ jobId: second.jobId, state: "live" });
  expect((await rows(f, a, "trial_end_source")).map(row => row.kind)).toEqual(["second_activation"]);
  expect((await lifecycle.read(a.context, a.digest, a.jobId)).timeline?.active).toBe(false);
  for (const feature of ["final_check", "invoices"]) expect(await app.require(request(feature, a.jobId))).toMatchObject({ executable: true });
  const after = await retained(f, a, exports);
  // Activation intentionally changes only the second job. The trial job and all
  // pre-existing documents/exports must be byte-identical.
  for (const value of [before, after]) value.data.job = (value.data.job as { bytes: string }[]).filter(row => JSON.parse(row.bytes).id !== second.jobId);
  expect(after).toEqual(before);
});

it("failed simulated payment and duplicate result change no decision or retained statement/job/export", async () => {
  const prepared = await approvedSimulation(f), { a, app } = await companyService(f, prepared.a);
  const exports = await retainedExport(f, a), before = await retained(f, a, exports), statements = (await readSubscription(f, a)).statements;
  const decision = await app.require(request("invoices", a.jobId));
  await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: prepared.approved.workId, expectedRevision: 1 });
  const failed = { version: "subscription-command.v1", kind: "record_simulation", workId: prepared.approved.workId, resultId: randomUUID(), outcome: "failed", expectedRevision: 1 }, id = randomUUID();
  const result = await command(f, a, failed, id); expect(await command(f, a, failed, id)).toEqual(result);
  expect(await app.require(request("invoices", a.jobId))).toEqual(decision);
  expect((await readSubscription(f, a)).statements).toEqual(statements);
  expect(await retained(f, a, exports)).toEqual(before);
});

it("job track survives company move and reversal; a job never widens contractor authority", async () => {
  const { a, app } = await companyService(f, await meterCompany(f)); await command(f, a, terms(a));
  const contractor = await seedWorkJob(f, a.tenantId);
  // Owner-only immutable contractor-job fixture, not a runtime track mutation.
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.job_commercial_track SET job_track='contractor' WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, contractor.jobId]);
  });
  const exports = await retainedExport(f, a), before = await retained(f, a, exports);
  for (const [index, track] of ["small_builder", "contractor", "small_builder"].entries()) {
    if (index) await changeTrack(f, a, track, index - 1);
    for (const feature of ["watchdog", "final_check", "invoices", "recovery_cases"]) {
      expect(await app.require(request(feature, a.jobId))).toMatchObject({ executable: true });
      expect(await app.check(request(feature, contractor.jobId))).toMatchObject({ executable: false, reason: "track_forbidden" });
    }
    for (const feature of ["operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"]) {
      expect(await app.check(request(feature, a.jobId))).toMatchObject({ executable: false, reason: "track_forbidden" });
      expect(await app.check(request(feature, contractor.jobId))).toEqual(await app.check(request(feature)));
      expect((await app.check(request(feature, contractor.jobId))).executable).toBe(false);
    }
    expect(await retained(f, a, exports)).toEqual(before);
    if (track === "contractor") {
      // Owner-only active agreement status fixture, per the 29 October ruling.
      await workTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
        SELECT tenant_id,$2,id,1,'active','contractor-agreement-status.v1','synthetic_demo','fictional-fixture:'||gen_random_uuid()
        FROM app.commercial_track_assignment WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1`, [a.tenantId, randomUUID()]));
      expect(await app.require(request("work_orders", contractor.jobId))).toMatchObject({ executable: true });
      expect(await app.check(request("work_orders", a.jobId))).toMatchObject({ executable: false, reason: "track_forbidden" });
    }
  }
});

it("missing, foreign and untracked jobs refuse without a decision; forged authority fields fail before consumption", async () => {
  const { a, app } = await companyService(f, await meterCompany(f)), b = await meterCompany(f); await command(f, a, terms(a));
  const untracked = await seedWorkJob(f, a.tenantId);
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("DELETE FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, untracked.jobId]);
  });
  for (const job of [randomUUID(), b.jobId, untracked.jobId]) {
    await expect(app.check(request("invoices", job))).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT app.mon8_company_feature($1,'invoices',$2)", [a.digest, job]))).rejects.toThrow("FORBIDDEN");
  }
  for (const feature of ["watchdog", "final_check", "invoices", "recovery_cases", "pay_now", "accounting_export", "operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"]) {
    for (const field of ["plan", "track", "trial", "payment"]) await expect(app.check({ ...request(feature, a.jobId), [field]: true })).rejects.toMatchObject({ code: "INVALID_ENTITLEMENT_INPUT" });
  }
});

it("company service refuses a session revoked during the subscription lock wait", async () => {
  const { a, app } = await companyService(f, await firstTrialFixture(f)), writer = await f.admin.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await writer.query("BEGIN"); await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [a.tenantId]);
    pending = app.check(request("final_check", a.jobId)).then(value => ({ value }), error => ({ error }));
    let waiting = false;
    for (let i = 0; i < 200; i++) {
      waiting = (await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0].waiting;
      if (waiting) break; await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await writer.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
    await writer.query("COMMIT"); expect(await pending).toMatchObject({ error: { code: "ENTITLEMENT_UNAVAILABLE" } });
  } finally { await writer.query("ROLLBACK"); writer.release(); await pending; }
});
