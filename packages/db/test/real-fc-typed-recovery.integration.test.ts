import { testTenantContext } from "./tenant-context-test-utils.js";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { generatePracticePng } from "../src/practice-proof-image.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import type { AuthenticatedMembership } from "../src/tenant-context.js";
import { withTenant } from "../src/tenant-context.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { availabilitySafeFinalCheckPorts, discoverFinalCheckRequests, executePracticeFinalCheck, registerPracticeFinalCheckTasks } from "../../../apps/api/src/final-check-practice-run.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { jobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { Pool } from "pg";
import type { FinalCheckExecutionPorts } from "../../../apps/api/src/final-check-task-executor.js";
const { makeWorkerUtils, run } = createRequire(new URL("../../../apps/api/package.json", import.meta.url))("graphile-worker");
let f: FinalCheckFixture;
let infrastructure: Pool;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture();
  const login = `recovery_infrastructure_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
  const ddl = await f.admin.query("SELECT format('CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE jobguard_infrastructure PASSWORD %L',$1::text,$2::text) ddl", [login,password]);
  await f.admin.query(ddl.rows[0].ddl);
  await f.admin.query(`CREATE SCHEMA graphile_worker AUTHORIZATION ${login}`);
  infrastructure = new Pool({ ...f.admin.options, user: login, password, max: 2 });
  // As sv5pre-worker-execution: CREATE is temporary and confined to this disposable test database.
  await f.admin.query(`GRANT CREATE ON DATABASE ${(await f.admin.query("SELECT current_database() d")).rows[0].d} TO ${login}`);
  const utils = await makeWorkerUtils({ pgPool: infrastructure }); await utils.migrate(); await utils.release();
  await f.admin.query(`REVOKE CREATE ON DATABASE ${(await f.admin.query("SELECT current_database() d")).rows[0].d} FROM ${login}`);
}, 300000);
afterAll(async () => { await infrastructure?.end(); await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });
const recoveryContext = (tenantId: string) => testTenantContext(tenantId, { bound: false });
const repo = () => new FinalCheckRepository(f.runtime);
const requestRow = async (jobId: string) => (await f.admin.query("SELECT * FROM infrastructure.final_check_request WHERE job_id=$1 ORDER BY attempt DESC LIMIT 1", [jobId])).rows[0];
async function discover() { const client = await infrastructure.connect(); try { await discoverFinalCheckRequests(client); } finally { client.release(); } }
function factory(fault: () => boolean, publicationFault = () => false, reverseSources = false): (pool: Pool) => FinalCheckExecutionPorts {
  return pool => {
    const repository = new FinalCheckRepository(pool), ports = practiceFinalCheckPorts(pool, f.runtime, createHash("sha256").update(generatePracticePng()).digest("hex"));
    const worker = new FinalCheckWorker(availabilitySafeFinalCheckPorts({ ...ports, read: async (...args) => { const m = await ports.read(...args); return reverseSources ? { ...m, sources: [...m.sources].reverse() } : m; }, process: async (...args) => { if (fault()) throw new Error("isolated transient processing fault"); return ports.process(...args); } }), "synthetic_demo");
    const completion = new FinalCheckCompletionRepository(pool);
    return { read: repository.manifest.bind(repository), execute: worker.execute.bind(worker), publish: async (...args) => { if (publicationFault()) throw new Error("isolated publication fault"); return completion.publish(...args); } };
  };
}
async function setup(notes = ["also painted the hallway ceiling, customer asked. Estimated extra 150 pounds."]) {
  const a = await seedFinalCheckJob(f), sources = new JobSourceRepository(f.runtime);
  await sources.intake(a.context, a.jobId, a.digest, "customer_message", { version: "customer-message-input.v1", commandId: randomUUID(), fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Example" }, text: "Please paint the hallway ceiling as an extra." });
  for (const text of notes) await sources.intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text });
  const lock = await a.lock(); await repo().requestRun(a.context, a.jobId, a.digest); await discover();
  return { ...a, lock };
}
async function payload(jobId: string) {
  const q = await requestRow(jobId);
  return { version: "final-check-practice-run.v1", tenantId: q.tenant_id, jobId, lockId: q.lock_id, manifestId: q.manifest_id, attempt: q.attempt, cycleId: q.cycle_id };
}
async function issue(a: Pick<Awaited<ReturnType<typeof seedFinalCheckJob>>, "tenantId" | "jobId" | "revisionId" | "digest" | "context">, commandId: string, runtime: Pool = f.runtime) {
  return withTenant(practiceMaterialPool(runtime, a.digest), a.context, db => db.$client.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,'final','fictional@example.invalid','2026-11-10'::date,$6)", [a.tenantId, a.jobId, a.revisionId, FINAL_CHECK_ACTOR, commandId, "a".repeat(64)]));
}
it("three failed executions stop; owner restart completes the same bill", async () => {
  const a = await setup(), original = await requestRow(a.jobId), stale = await payload(a.jobId);
  let failing = true; const tasks = {};
  registerPracticeFinalCheckTasks(tasks, task => executePracticeFinalCheck(recoveryContext(task.tenantId), task, f.shadow, factory(() => failing), "synthetic_demo"));
  const runner = await run({ pgPool: infrastructure, taskList: tasks, concurrency: 1, pollInterval: 50, noHandleSignals: true });
  try {
    await expect.poll(async () => (await requestRow(a.jobId)).cycle_state, { timeout: 90000 }).toBe("failed");
    expect((await requestRow(a.jobId)).executions).toBe(3);
    const manifest = await new FinalCheckRepository(f.shadow).manifest(a.workerContext, a.jobId, original.manifest_id);
    const history = (await f.admin.query("SELECT * FROM app.final_check_source_attempt WHERE manifest_id=$1 ORDER BY id", [manifest.id])).rows;
    expect(history.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 4; i++) await discover();
    await executePracticeFinalCheck(recoveryContext((stale).tenantId), stale, f.shadow, factory(() => failing), "synthetic_demo");
    expect((await requestRow(a.jobId)).executions).toBe(3);
    expect(await repo().read(a.context, a.jobId, a.digest)).toMatchObject({ state: "failed", items: [] });
    const command = randomUUID(); await expect(issue(a, command)).rejects.toThrow(/FINAL_CHECK/);
    failing = false;
    const results = await Promise.allSettled([repo().requestRun(a.context, a.jobId, a.digest), repo().requestRun(a.context, a.jobId, a.digest)]);
    expect(results.filter(r => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "FINAL_CHECK_PENDING" });
      else expect(result.value).toMatchObject({ manifestId: original.manifest_id, attempt: original.attempt });
    }
    const restarted = await requestRow(a.jobId);
    expect(restarted.cycle_id).not.toBe(original.cycle_id); expect(restarted.manifest_id).toBe(original.manifest_id); expect(restarted.attempt).toBe(original.attempt);
    await discover();
    await expect.poll(async () => (await requestRow(a.jobId)).cycle_state, { timeout: 30000 }).toBe("completed");
    expect((await requestRow(a.jobId)).executions).toBe(1);
    const after = await new FinalCheckRepository(f.shadow).manifest(a.workerContext, a.jobId, manifest.id);
    expect([after.id, after.lockId, after.cutoff, after.hash, after.sources.map(s => s.id)]).toEqual([manifest.id, manifest.lockId, manifest.cutoff, manifest.hash, manifest.sources.map(s => s.id)]);
    const view = await repo().read(a.context, a.jobId, a.digest);
    expect(view).toMatchObject({ state: "completed", items: [{ estimatedValuePence: 15000 }] });
    await issue(a, command); await issue(a, command);
    await executePracticeFinalCheck(recoveryContext((stale).tenantId), stale, f.shadow, factory(() => false), "synthetic_demo");
    await executePracticeFinalCheck(recoveryContext((await payload(a.jobId)).tenantId), await payload(a.jobId), f.shadow, factory(() => false), "synthetic_demo");
    for (const succeeded of [false, true]) await withTenant(f.shadow, a.workerContext, db => db.$client.query("SELECT app.final_check_cycle_finish($1,$2,$3,$4,$5,$6,$7)", [a.tenantId, a.jobId, stale.lockId, stale.manifestId, stale.attempt, stale.cycleId, succeeded]));
    expect((await requestRow(a.jobId)).cycle_state).toBe("completed");
    expect((await requestRow(a.jobId)).executions).toBe(1);
    expect((await requestRow(a.jobId)).cycle_history).toHaveLength(1);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE job_id=$1", [a.jobId])).rows[0].n).toBe(1);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE job_id=$1", [a.jobId])).rows[0].n).toBe(1);
    expect((await f.admin.query("SELECT * FROM app.final_check_source_attempt WHERE manifest_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [manifest.id, history.map(x => x.id)])).rows).toEqual(history);
  } finally { await runner.stop(); }
}, 150000);
it("publication failure stays pending until exhaustion, and resumes persisted successful sources", async () => {
  const a = await setup(), task = await payload(a.jobId);
  for (let i = 0; i < 3; i++) {
    await expect(executePracticeFinalCheck(recoveryContext((task).tenantId), task, f.shadow, factory(() => false, () => true), "synthetic_demo")).rejects.toThrow("publication fault");
    expect((await repo().read(a.context, a.jobId, a.digest)).state).toBe(i === 2 ? "failed" : "pending");
    if (i<2) {
      const before=await requestRow(a.jobId);
      await expect(repo().requestRun(a.context,a.jobId,a.digest)).rejects.toMatchObject({code:"FINAL_CHECK_PENDING"});
      expect(await requestRow(a.jobId)).toEqual(before);
    }
  }
  const attempts = (await f.admin.query("SELECT count(*)::int n FROM app.final_check_source_attempt WHERE manifest_id=$1", [task.manifestId])).rows[0].n;
  await repo().requestRun(a.context, a.jobId, a.digest);
  const restarted = await requestRow(a.jobId);
  expect(restarted.enqueued_at).toBeNull(); expect(restarted.cycle_history).toHaveLength(1);
  expect((await repo().read(a.context, a.jobId, a.digest)).state).toBe("pending");
  await expect(issue(a, randomUUID())).rejects.toThrow(/FINAL_CHECK/);
  await expect(repo().requestRun(a.context, a.jobId, a.digest)).rejects.toMatchObject({ code: "FINAL_CHECK_PENDING" });
  expect((await requestRow(a.jobId)).cycle_id).toBe(restarted.cycle_id);
  await discover();
  await executePracticeFinalCheck(recoveryContext((await payload(a.jobId)).tenantId), await payload(a.jobId), f.shadow, factory(() => false), "synthetic_demo");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_check_source_attempt WHERE manifest_id=$1", [task.manifestId])).rows[0].n).toBe(attempts);
  expect((await repo().read(a.context, a.jobId, a.digest)).state).toBe("completed");
});
it("discovery reconciles process-death exhaustion and stale terminal writes cannot affect a restarted cycle", async () => {
  const a = await setup(), old = await payload(a.jobId);
  // Simulate a process dying after the third durable claim, before terminal recording.
  await f.admin.query("UPDATE infrastructure.final_check_request SET executions=3,cycle_state='active' WHERE job_id=$1", [a.jobId]);
  await f.admin.query("UPDATE graphile_worker._private_jobs SET attempts=3,locked_at=clock_timestamp(),locked_by='dead-recovery-worker' WHERE key=$1", [`final-check-practice:${old.manifestId}:${old.cycleId}`]);
  await discover(); expect((await requestRow(a.jobId)).cycle_state).toBe("failed");
  await repo().requestRun(a.context, a.jobId, a.digest);
  await executePracticeFinalCheck(recoveryContext((old).tenantId), old, f.shadow, factory(() => false), "synthetic_demo");
  expect((await requestRow(a.jobId)).executions).toBe(0);
  expect((await requestRow(a.jobId)).cycle_state).toBe("requested");
});
it("another firm/session and another tenant cannot restart; revocation prevents admission", async () => {
  const a = await setup(), b = await seedFinalCheckJob(f);
  await expect(repo().requestRun(a.context, a.jobId, b.digest)).rejects.toThrow();
  const { testTenantContext } = await import("./tenant-context-test-utils.js");
  await expect(repo().requestRun(testTenantContext(randomUUID()), a.jobId, a.digest)).rejects.toThrow();
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [a.digest]);
  await expect(repo().requestRun(a.context, a.jobId, a.digest)).rejects.toThrow();
  await expect(repo().read(a.context, a.jobId, a.digest)).rejects.toThrow();
});
it.each([[150, 150, 15000], [150, 200, null]])("coalesced estimates are order independent and never summed: %s/%s", async (one, two, expected) => {
  for (const [order, amounts] of [[one, two], [two, one]].entries()) {
    const a = await setup(amounts.map(amount => `also painted the hallway ceiling, customer asked. Estimated extra ${amount} pounds.`));
    await executePracticeFinalCheck(recoveryContext((await payload(a.jobId)).tenantId), await payload(a.jobId), f.shadow, factory(() => false, () => false, order === 1), "synthetic_demo");
    expect((await repo().read(a.context, a.jobId, a.digest)).items).toMatchObject([{ estimatedValuePence: expected }]);
  }
});
it("upgrade preserves historical records and ACLs, rests legacy queued work and does not revive completed work", async () => {
  const db = await jobDoorsDatabase(true, "0732_final_check_typed_recovery.sql");
  try {
    await installLegacySyntheticPartyFixtures(db.owner);
    // Reuse the existing runtime fixture; generated shadow login has no extra business grants.
    const ddl = await db.owner.query("SELECT format('CREATE ROLE recovery_upgrade_shadow LOGIN INHERIT IN ROLE jobguard_shadow PASSWORD %L',$1::text) ddl", [db.owner.options.password]);
    await db.owner.query(ddl.rows[0].ddl);
    const shadow = new (await import("pg")).Pool({ ...db.owner.options, user: "recovery_upgrade_shadow", password: db.owner.options.password });
    try {
      const fixture = { ...f, admin: db.owner, runtime: db.runtime, shadow }, a = await seedFinalCheckJob(fixture);
      await a.lock();
      const worker = new FinalCheckRepository(shadow), m = await worker.begin(a.workerContext, a.jobId);
      const ports = practiceFinalCheckPorts(shadow, db.runtime, "f".repeat(64));
      await new FinalCheckWorker(ports, "synthetic_demo").execute(a.workerContext, { version: "final-check.task.v1", jobId: a.jobId, manifestId: m.id });
      const result = await worker.manifest(a.workerContext, a.jobId, m.id);
      await new FinalCheckCompletionRepository(shadow).publish(a.workerContext, { version: "final-check-publication.v1", jobId: a.jobId, runId: result.result!.runId, checkId: m.id });
      const invalidated = await seedFinalCheckJob(fixture);
      await new JobSourceRepository(db.runtime).intake(invalidated.context,invalidated.jobId,invalidated.digest,"diary",{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:false,text:"Fictional ordinary work note."});
      await invalidated.lock();
      const bad = await worker.begin(invalidated.workerContext,invalidated.jobId);
      await new FinalCheckWorker(ports,"synthetic_demo").execute(invalidated.workerContext,{version:"final-check.task.v1",jobId:invalidated.jobId,manifestId:bad.id});
      const badResult=await worker.manifest(invalidated.workerContext,invalidated.jobId,bad.id);
      await new FinalCheckCompletionRepository(shadow).publish(invalidated.workerContext,{version:"final-check-publication.v1",jobId:invalidated.jobId,runId:badResult.result!.runId,checkId:bad.id});
      // 0666: locked manifest evidence can be withdrawn only after the final invoice is issued.
      await issue(invalidated,randomUUID(),db.runtime);
      await finalCheckTenant(db.runtime,invalidated.tenantId,client=>client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),invalidated.tenantId,badResult.sources.find(x=>x.evidenceId)!.evidenceId,FINAL_CHECK_ACTOR]));
      const pending = await seedFinalCheckJob(fixture); await pending.lock();
      await db.owner.query("UPDATE infrastructure.final_check_request SET enqueued_at=clock_timestamp()");
      const unqueued=await seedFinalCheckJob(fixture); await unqueued.lock();
      const certificates=async()=>(await db.owner.query("SELECT to_jsonb(c) data FROM app.shadow_final_check_completion c ORDER BY check_id")).rows;
      const certificateHistory=await certificates();
      const snapshot = async () => (await db.owner.query("SELECT to_jsonb(m) data FROM app.final_check_manifest m ORDER BY id")).rows;
      const before = await snapshot();
      const acl = async () => (await db.owner.query("SELECT relacl::text,relowner::regrole::text FROM pg_class WHERE oid='infrastructure.final_check_request'::regclass")).rows;
      const grants = await acl();
      await db.owner.query(await readFile(new URL("../migrations/0732_final_check_typed_recovery.sql", import.meta.url), "utf8"));
      expect(await snapshot()).toEqual(before); expect(await acl()).toEqual(grants); expect(await certificates()).toEqual(certificateHistory);
      expect((await db.owner.query("SELECT job_id,cycle_state FROM infrastructure.final_check_request ORDER BY job_id")).rows).toEqual(expect.arrayContaining([{ job_id: a.jobId, cycle_state: "completed" }, { job_id: pending.jobId, cycle_state: "failed" }, { job_id: invalidated.jobId, cycle_state: "failed" }, { job_id: unqueued.jobId, cycle_state: "requested" }]));
      const runtimeRepo=new FinalCheckRepository(db.runtime);
      // An invalidated historical certificate cannot become a recovery cycle.
      await runtimeRepo.requestRun(invalidated.context,invalidated.jobId,invalidated.digest);
      const invalidatedRequests=(await db.owner.query("SELECT attempt,cycle_history FROM infrastructure.final_check_request WHERE job_id=$1 ORDER BY attempt",[invalidated.jobId])).rows;
      expect(invalidatedRequests).toEqual([{attempt:1,cycle_history:[]},{attempt:2,cycle_history:[]}]);
      await runtimeRepo.requestRun(pending.context,pending.jobId,pending.digest);
      const restarted=(await db.owner.query("SELECT enqueued_at,cycle_history FROM infrastructure.final_check_request WHERE job_id=$1",[pending.jobId])).rows[0];
      expect(restarted.enqueued_at).toBeNull(); expect(restarted.cycle_history).toHaveLength(1);
      expect((await runtimeRepo.read(pending.context,pending.jobId,pending.digest)).state).toBe("pending");
      await expect(runtimeRepo.requestRun(a.context,a.jobId,a.digest)).rejects.toMatchObject({code:"FINAL_CHECK_SOURCE_CHANGED"});
    } finally { await shadow.end(); }
  } finally { await db.close(); }
}, 300000);

it("company routine path permits a fixed unlocked read without terms, then bounds recovery through the same checked worker", async () => {
  const { preparedTrialFixture } = await import("./free-first-job-lifecycle-fixtures.js");
  const { CompanyFinalCheckRepository } = await import("../src/company-final-check-repository.js");
  const { FinalAccountCommandService } = await import("../src/final-account-repository.js");
  const { verifiedTenantContextFromMembership } = await import("../src/tenant-context.js");
  const { testTenantContext } = await import("./tenant-context-test-utils.js");
  const a = await preparedTrialFixture({ ...f, waitForConnectionEnds: async () => undefined });
  expect((await f.admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId])).rows[0].practice_session_digest).toBeNull();
  const user = (await f.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId])).rows[0].identity_user_id;
  const context = verifiedTenantContextFromMembership({ tenantId: a.tenantId, membershipId: a.actorId, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential: a.digest });
  const company = new CompanyFinalCheckRepository(f.runtime), job = { version: "company-final-check.v1" as const, jobId: a.jobId };
  expect(await company.reveal(context, job)).toEqual({ state: "unlocked", items: [] });
  await expect(company.requestRun(context, job)).rejects.toThrow();
  const draft = await new FinalAccountCommandService(f.runtime).assemble(context, { version: "final-account.assemble.v1", commandId: randomUUID(), jobId: a.jobId, actorMembershipId: a.actorId, expectedRevision: 0 });
  await company.acceptTerms(context, { ...job, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  for (const scope of (await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed'", [a.tenantId, a.jobId])).rows) await company.disposition(context, { ...job, commandId: randomUUID(), scopeItemId: scope.id, disposition: "done" });
  await company.lock(context, { ...job, commandId: randomUUID(), finalAccountRevisionId: draft.id, expectedRevision: Number(draft.revision), declarationVersion: "final_account_declaration.v1" });
  await company.requestRun(context, job); await discover();
  const task = await payload(a.jobId);
  await f.admin.query(`CREATE FUNCTION public.recovery_pre_manifest_fault() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN IF NEW.job_id='${a.jobId}'::uuid THEN RAISE EXCEPTION 'pre-manifest transient fault'; END IF; RETURN NEW; END $body$;
    CREATE TRIGGER recovery_pre_manifest_fault BEFORE INSERT ON app.final_check_manifest FOR EACH ROW EXECUTE FUNCTION public.recovery_pre_manifest_fault()`);
  try {
    for (let i = 0; i < 3; i++) await expect(executePracticeFinalCheck(recoveryContext((task).tenantId), task, f.shadow, factory(() => false), "synthetic_demo")).rejects.toThrow("pre-manifest transient fault");
  } finally { await f.admin.query("DROP TRIGGER recovery_pre_manifest_fault ON app.final_check_manifest; DROP FUNCTION public.recovery_pre_manifest_fault()"); }
  expect((await company.reveal(context, job)).state).toBe("failed");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_check_manifest WHERE id=$1", [task.manifestId])).rows[0].n).toBe(0);
  await Promise.all([company.requestRun(context, job), company.requestRun(context, job)]); await discover();
  await executePracticeFinalCheck(recoveryContext((await payload(a.jobId)).tenantId), await payload(a.jobId), f.shadow, factory(() => false), "synthetic_demo");
  expect(await company.reveal(context, job)).toMatchObject({ state: "completed", items: [] });
  const completed = await new FinalCheckRepository(f.shadow).manifest(testTenantContext(a.tenantId), a.jobId, task.manifestId);
  expect(completed.id).toBe(task.manifestId);
  const certificates = completed.sources.filter(source => source.sourceKind === "electrical_certificate");
  expect(certificates).toHaveLength(a.proofs.length);
  expect(certificates.length).toBeGreaterThan(0);
  expect(certificates.every(source => source.status === "zero_result" && source.sha256 === a.proofs[0]!.sha256)).toBe(true);
  expect(completed.signals).toEqual([]);
});

it("company intake originals retain both evidence identities and the price through the checked worker", async () => {
  const { preparedTrialFixture } = await import("./free-first-job-lifecycle-fixtures.js");
  const { CompanyFinalCheckRepository } = await import("../src/company-final-check-repository.js");
  const { FinalAccountCommandService } = await import("../src/final-account-repository.js");
  const a = await preparedTrialFixture({ ...f, waitForConnectionEnds: async () => undefined });
  expect((await f.admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId])).rows[0].practice_session_digest).toBeNull();
  const sources = new JobSourceRepository(f.runtime);
  const noteText = "also painted the hallway ceiling, customer asked. Estimated extra 150 pounds.";
  const messageText = "Please paint the hallway ceiling as an extra.";
  const note = await sources.intake(a.context, a.jobId, a.actorId, "diary", {
    version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: noteText,
  });
  const message = await sources.intake(a.context, a.jobId, a.actorId, "customer_message", {
    version: "customer-message-input.v1", commandId: randomUUID(),
    fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Example" }, text: messageText,
  });
  const originalIds = [note.record.evidence.id, message.record.evidence.id].sort();
  expect(new Set(originalIds).size).toBe(2);
  expect(note.record.actualTesterMembershipId).toBe(a.actorId);
  expect(message.record.actualTesterMembershipId).toBe(a.actorId);
  const company = new CompanyFinalCheckRepository(f.runtime), job = { version: "company-final-check.v1" as const, jobId: a.jobId };
  const draft = await new FinalAccountCommandService(f.runtime).assemble(a.context, {
    version: "final-account.assemble.v1", commandId: randomUUID(), jobId: a.jobId, actorMembershipId: a.actorId, expectedRevision: 0,
  });
  await company.acceptTerms(a.context, { ...job, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  for (const scope of (await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed'", [a.tenantId,a.jobId])).rows)
    await company.disposition(a.context, { ...job, commandId: randomUUID(), scopeItemId: scope.id, disposition: "done" });
  await company.lock(a.context, { ...job, commandId: randomUUID(), finalAccountRevisionId: draft.id,
    expectedRevision: Number(draft.revision), declarationVersion: "final_account_declaration.v1" });
  await company.requestRun(a.context, job); await discover();
  const task = await payload(a.jobId);
  await executePracticeFinalCheck(recoveryContext(task.tenantId), task, f.shadow, factory(() => false), "synthetic_demo");
  const view = await company.reveal(a.context, job);
  expect(view).toMatchObject({ state: "completed", items: [{ description: "hallway ceiling", estimatedValuePence: 15000 }] });
  const items = view.items as { evidence: { id: string }[] }[];
  expect(items).toHaveLength(1);
  expect(items[0]!.evidence.map(evidence => evidence.id).sort()).toEqual(originalIds);
  const originals = (await f.admin.query("SELECT evidence_id,bytes FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2 ORDER BY evidence_id", [a.tenantId,a.jobId])).rows;
  expect(originals.map(row => row.evidence_id)).toEqual(originalIds);
  expect(originals.map(row => row.bytes.toString("utf8")).sort()).toEqual([noteText,messageText].sort());
});

it("keeps completed-invalidated reruns under separate manifest-attempt authority", async () => {
  const a = await setup(), originalTask = await payload(a.jobId);
  await executePracticeFinalCheck(recoveryContext((originalTask).tenantId), originalTask, f.shadow, factory(() => false), "synthetic_demo");
  await issue(a, randomUUID());
  const worker = new FinalCheckRepository(f.shadow), original = await worker.manifest(a.workerContext, a.jobId, originalTask.manifestId);
  await expect(repo().requestRun(a.context, a.jobId, a.digest)).rejects.toMatchObject({ code: "FINAL_CHECK_SOURCE_CHANGED" });
  const evidence = original.sources.find(s => s.evidenceId !== null)!;
  const { finalCheckTenant } = await import("./final-check-fixture.js");
  await finalCheckTenant(f.runtime, a.tenantId, db => db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), a.tenantId, evidence.evidenceId, FINAL_CHECK_ACTOR]));
  expect((await repo().read(a.context, a.jobId, a.digest)).state).toBe("failed");
  await repo().requestRun(a.context, a.jobId, a.digest); const next = await requestRow(a.jobId);
  expect(next.attempt).toBe(originalTask.attempt + 1); expect(next.manifest_id).not.toBe(originalTask.manifestId);
  await discover(); await executePracticeFinalCheck(recoveryContext((await payload(a.jobId)).tenantId), await payload(a.jobId), f.shadow, factory(() => false), "synthetic_demo");
  const current = await worker.manifest(a.workerContext, a.jobId, next.manifest_id);
  expect([current.lockId, current.cutoff]).toEqual([original.lockId, original.cutoff]);
  expect((await requestRow(a.jobId)).cycle_state).toBe("completed");
  expect((await worker.manifest(a.workerContext, a.jobId, original.id)).hash).toBe(original.hash);
});

it("closed jobs refuse admission and execution, and lifecycle grants remain narrow", async () => {
  const a = await setup(), task = await payload(a.jobId);
  const { finalCheckTenant } = await import("./final-check-fixture.js");
  await finalCheckTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,close_reason,close_note,request_hash,audit_event_id) SELECT $1,$2,$3,coalesce(max(sequence),0)+1,'closed',clock_timestamp(),$4,$5,'other','Fictional recovery closure',repeat('a',64),$6 FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId, randomUUID(), FINAL_CHECK_ACTOR, randomUUID(), randomUUID()]);
  });
  await expect(repo().requestRun(a.context, a.jobId, a.digest)).rejects.toMatchObject({ code: "JOB_WORK_CLOSED" });
  await expect(executePracticeFinalCheck(recoveryContext((task).tenantId), task, f.shadow, factory(() => false), "synthetic_demo")).rejects.toThrow("JOB_WORK_CLOSED");
  const grants = (await f.admin.query(`SELECT
    has_table_privilege('jobguard_infrastructure','infrastructure.final_check_request','UPDATE') broad,
    has_column_privilege('jobguard_infrastructure','infrastructure.final_check_request','enqueued_at','UPDATE') enqueue,
    has_column_privilege('jobguard_infrastructure','infrastructure.final_check_request','cycle_state','UPDATE') lifecycle,
    has_function_privilege('jobguard_runtime','app.final_check_cycle_claim(uuid,uuid,uuid,uuid,integer,uuid)','EXECUTE') runtime_claim,
    has_function_privilege('jobguard_infrastructure','infrastructure.final_check_cycle_exhausted(uuid,uuid,uuid)','EXECUTE') scheduler_terminal,
    has_schema_privilege('jobguard_infrastructure','app','USAGE') app_usage`)).rows[0];
  expect(grants).toEqual({ broad: false, enqueue: true, lifecycle: false, runtime_claim: false, scheduler_terminal: true, app_usage: false });
});

it("a lost publication response reconciles its checked certificate without duplicate publication", async () => {
  const a = await setup(), task = await payload(a.jobId), normal = factory(() => false);
  await expect(executePracticeFinalCheck(recoveryContext((task).tenantId), task, f.shadow, pool => {
    const ports = normal(pool);
    return { ...ports, publish: async (...args) => { await ports.publish(...args); throw new Error("lost publication response"); } };
  }, "synthetic_demo")).rejects.toThrow("lost publication response");
  expect((await requestRow(a.jobId)).cycle_state).toBe("completed");
  expect((await repo().read(a.context, a.jobId, a.digest)).state).toBe("completed");
  await executePracticeFinalCheck(recoveryContext((task).tenantId), task, f.shadow, normal, "synthetic_demo");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE job_id=$1", [a.jobId])).rows[0].n).toBe(1);
});

it("an unpriced persisted detection reveals a null estimate", async () => {
  const a = await setup([]);
  await executePracticeFinalCheck(recoveryContext((await payload(a.jobId)).tenantId), await payload(a.jobId), f.shadow, factory(() => false), "synthetic_demo");
  expect((await repo().read(a.context, a.jobId, a.digest)).items).toMatchObject([{ estimatedValuePence: null }]);
});

it("practice unlocked reads stay fixed with missing terms and zero/many hidden signals; mutations still require terms", async () => {
  const a = await seedFinalCheckJob(f), client = await f.admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    // Rollback-only fault setup models an owner who has not accepted terms.
    // No historical acceptance is removed from the fixture after this test.
    await client.query("SET LOCAL session_replication_role='replica'");
    await client.query("DELETE FROM app.final_check_terms_acceptance WHERE tenant_id=$1", [a.tenantId]);
    await client.query("SET LOCAL session_replication_role='origin'");
    await client.query("SET LOCAL ROLE jobguard_runtime");
    const read = async () => (await client.query("SELECT app.read_final_check_reveal($1,$2,$3) result", [a.tenantId, a.jobId, a.digest])).rows[0].result;
    expect(await read()).toEqual({ state: "unlocked", items: [] });
    await client.query("RESET ROLE");
    await client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,estimated_value_pence,confidence_band) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Hidden fictional work',15000,'low')", [a.tenantId, a.jobId, randomUUID(), randomUUID()]);
    await client.query("SET LOCAL ROLE jobguard_runtime");
    expect(await read()).toEqual({ state: "unlocked", items: [] });
    await expect(client.query("SELECT app.request_final_check_run($1,$2,$3)", [a.tenantId, a.jobId, a.digest])).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("unqueued direct reconciliation retains completed semantics until actual enqueue", async () => {
  const a = await seedFinalCheckJob(f); await a.lock();
  const request = await requestRow(a.jobId);
  expect(request.enqueued_at).toBeNull(); expect(request.cycle_history).toEqual([]);
  const worker = new FinalCheckRepository(f.shadow), context = recoveryContext(a.tenantId);
  const manifest = await worker.begin(context,a.jobId);
  await new FinalCheckWorker(practiceFinalCheckPorts(f.shadow,f.runtime,"f".repeat(64)),"synthetic_demo").execute(context,{version:"final-check.task.v1",jobId:a.jobId,manifestId:manifest.id});
  expect((await repo().read(a.context,a.jobId,a.digest)).state).toBe("completed");
  await expect(issue(a,randomUUID())).rejects.toThrow(/FINAL_CHECK/);
  // Management starts only on atomic enqueue, never from the reconciled result.
  await discover();
  expect((await repo().read(a.context,a.jobId,a.digest)).state).toBe("pending");
  expect((await requestRow(a.jobId)).enqueued_at).not.toBeNull();
});
it("pre-manifest concurrent requests replay without replacing the cycle", async () => {
  const a = await seedFinalCheckJob(f); await a.lock();
  const original = await requestRow(a.jobId);
  const results = await Promise.all([repo().requestRun(a.context,a.jobId,a.digest),repo().requestRun(a.context,a.jobId,a.digest)]);
  expect(results[0]).toEqual(results[1]);
  expect(await requestRow(a.jobId)).toEqual(original);
});
it("restricted lifecycle executors have exact signatures, bodies, owners, search paths and ACLs", async () => {
  const sql = await readFile(new URL("../migrations/0732_final_check_typed_recovery.sql",import.meta.url),"utf8");
  for (const [schema,name,args,executor] of [
    ["app","final_check_cycle_claim","uuid,uuid,uuid,uuid,integer,uuid","jobguard_shadow"],
    ["app","final_check_cycle_finish","uuid,uuid,uuid,uuid,integer,uuid,boolean","jobguard_shadow"],
    ["infrastructure","final_check_cycle_exhausted","uuid,uuid,uuid","jobguard_infrastructure"],
  ]) {
    const signature=`${schema}.${name}(${args})`;
    const row=(await f.admin.query(`SELECT p.proowner::regrole::text owner,p.prosecdef,p.proconfig,p.proacl::text acl,p.prosrc body FROM pg_proc p WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
    expect(row).toEqual({owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog, app, infrastructure"],acl:`{jobguard_migration=X/jobguard_migration,${executor}=X/jobguard_migration}`,body:sql.split(`FUNCTION ${schema}.${name}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]});
    for (const role of ["jobguard_runtime","jobguard_identity","jobguard_shadow_emergency_access", executor === "jobguard_shadow" ? "jobguard_infrastructure" : "jobguard_shadow"]) {
      expect((await f.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed).toBe(false);
    }
    const argumentsSql=name === "final_check_cycle_finish" ? "NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid,1,NULL::uuid,false" : name === "final_check_cycle_claim" ? "NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid,1,NULL::uuid" : "NULL::uuid,NULL::uuid,NULL::uuid";
    await expect(f.runtime.query(`SELECT ${schema}.${name}(${argumentsSql})`)).rejects.toThrow(/permission denied/);
    await expect((executor === "jobguard_shadow" ? infrastructure : f.shadow).query(`SELECT ${schema}.${name}(${argumentsSql})`)).rejects.toThrow(/permission denied/);
  }
});

it("reset sessions cannot restart managed failed work or change its history", async () => {
  const a=await setup();
  await f.admin.query("UPDATE infrastructure.final_check_request SET cycle_state='failed',executions=3 WHERE job_id=$1",[a.jobId]);
  const before=await requestRow(a.jobId);
  const replacement=await seedFinalCheckJob(f);
  await expect(repo().requestRun(a.context,a.jobId,replacement.digest)).rejects.toThrow();
  expect(await requestRow(a.jobId)).toEqual(before);
});

it("unmanaged published-invalidated work retains the original pending-rerun projection", async () => {
  const a=await seedFinalCheckJob(f),context=recoveryContext(a.tenantId);
  await new JobSourceRepository(f.runtime).intake(a.context,a.jobId,a.digest,"diary",{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:false,text:"Fictional ordinary work note."});
  await a.lock();
  const worker=new FinalCheckRepository(f.shadow),manifest=await worker.begin(context,a.jobId);
  await new FinalCheckWorker(practiceFinalCheckPorts(f.shadow,f.runtime,"f".repeat(64)),"synthetic_demo").execute(context,{version:"final-check.task.v1",jobId:a.jobId,manifestId:manifest.id});
  const result=await worker.manifest(context,a.jobId,manifest.id);
  await new FinalCheckCompletionRepository(f.shadow).publish(context,{version:"final-check-publication.v1",jobId:a.jobId,runId:result.result!.runId,checkId:manifest.id});
  expect((await repo().read(a.context,a.jobId,a.digest)).state).toBe("completed");
  // 0666: locked manifest evidence can be withdrawn only after the final invoice is issued.
  await issue(a,randomUUID());
  await finalCheckTenant(f.runtime,a.tenantId,client=>client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),a.tenantId,result.sources.find(x=>x.evidenceId)!.evidenceId,FINAL_CHECK_ACTOR]));
  expect((await repo().read(a.context,a.jobId,a.digest)).state).toBe("failed");
  await repo().requestRun(a.context,a.jobId,a.digest);
  const request=await requestRow(a.jobId);
  expect(request.attempt).toBe(2);expect(request.enqueued_at).toBeNull();expect(request.cycle_history).toEqual([]);
  expect((await repo().read(a.context,a.jobId,a.digest)).state).toBe("failed");
});
