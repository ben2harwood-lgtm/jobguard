import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CompanyFinalCheckRepository } from "../src/company-final-check-repository.js";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { seedWorkPractice, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { createFinalCheckFixture, closeFinalCheckFixture, type FinalCheckFixture } from "./final-check-fixture.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { executeFinalCheckTask } from "../../../apps/api/src/final-check-task-executor.js";
import { FinalCheckCompletionRepository } from "../src/shadow-detection-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { permitImportedJob } from "./lp-practice-home-job-fixture.js";
import { preparedTrialFixture } from "./free-first-job-lifecycle-fixtures.js";

let f: WorkFixture;
let fixture: FinalCheckFixture;
let repository: CompanyFinalCheckRepository;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  fixture = await createFinalCheckFixture();
  f = { ...fixture, waitForConnectionEnds: async () => undefined }; repository = new CompanyFinalCheckRepository(f.runtime);
}, 300_000);
afterAll(async () => { await closeFinalCheckFixture(fixture); vi.unstubAllEnvs(); });
async function company(assemble = true) {
  const a = await preparedTrialFixture(f);
  const user = (await f.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId])).rows[0].identity_user_id;
  const context = verifiedTenantContextFromMembership({ tenantId: a.tenantId, membershipId: a.actorId,
    identityUserId: user } as AuthenticatedMembership, { kind: "real", credential: a.digest });
  // Existing assembler is fixture preparation ONLY, not proof of a new company assemble entry point.
  const draft = assemble ? await new FinalAccountCommandService(f.runtime).assemble(context, {
    version: "final-account.assemble.v1", commandId: randomUUID(), jobId: a.jobId, actorMembershipId: a.actorId, expectedRevision: 0,
  }) : null;
  return { ...a, context, draft };
}
const job = (a: { jobId: string }) => ({ version: "company-final-check.v1", jobId: a.jobId });
async function ready(a: Awaited<ReturnType<typeof company>>) {
  await repository.acceptTerms(a.context, { ...job(a), commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  if (!a.draft) return;
  const scopes = (await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed'", [a.tenantId, a.jobId])).rows;
  for (const scope of scopes) await repository.disposition(a.context, { ...job(a), commandId: randomUUID(), scopeItemId: scope.id, disposition: "done" });
}
const lock = (a: Awaited<ReturnType<typeof company>>) => ({ ...job(a), commandId: randomUUID(),
  finalAccountRevisionId: a.draft!.id, expectedRevision: Number(a.draft!.revision), declarationVersion: "final_account_declaration.v1" });
async function bound(client: PoolClient, a: Awaited<ReturnType<typeof company>>) {
  await client.query("BEGIN");
  await client.query("SELECT app.bind_request('real',$1,$2)", [a.digest, a.tenantId]);
  await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
}
async function financialSnapshot() {
  const relations = (await f.admin.query(`SELECT n.nspname,c.relname,c.relacl::text FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','infrastructure')
    AND c.relname ~ '(attribution|fee|statement|collection)' ORDER BY n.nspname,c.relname`)).rows;
  const counts = [];
  for (const r of relations) counts.push({ ...r, n: (await f.admin.query(`SELECT count(*)::text n FROM "${r.nspname}"."${r.relname}"`)).rows[0].n });
  return counts;
}
it("reads company state, locks with exact replay/conflict, queues after lock and reveals only a completed run without money authority", async () => {
  const a = await company();
  const before = await financialSnapshot();
  await ready(a);
  expect((await repository.read(a.context, job(a))).draft).toMatchObject({ id: a.draft!.id });
  await expect(repository.requestRun(a.context, job(a))).rejects.toMatchObject({ code: "FINAL_ACCOUNT_LOCK_REQUIRED" });
  expect(await repository.reveal(a.context, job(a))).toEqual({ state: "unlocked", items: [] });
  const input = lock(a), first = await repository.lock(a.context, input);
  expect(await repository.lock(a.context, input)).toEqual(first);
  const replayClient = await f.runtime.connect();
  try {
    await bound(replayClient, a); await replayClient.query("SET LOCAL timezone='Pacific/Auckland'");
    expect((await replayClient.query("SELECT app.company_final_check_lock($1,$2,$3,$4,$5) result",
      [a.jobId, input.commandId, input.finalAccountRevisionId, input.expectedRevision, input.declarationVersion])).rows[0].result).toEqual(first);
  } finally { await replayClient.query("ROLLBACK"); replayClient.release(); }
  await expect(repository.lock(a.context, { ...input, expectedRevision: input.expectedRevision + 1 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(await repository.requestRun(a.context, job(a))).toMatchObject({ lockId: first.id, state: "requested" });
  expect(await repository.requestRun(a.context, job(a))).toMatchObject({ lockId: first.id, state: "requested" });
  expect(await repository.reveal(a.context, job(a))).toMatchObject({ state: "pending", items: [] });
  const worker = new FinalCheckRepository(fixture.shadow), workerContext = testTenantContext(a.tenantId);
  const manifest = await worker.begin(workerContext, a.jobId);
  await expect(worker.reconcile(workerContext, a.jobId, manifest.id, [])).rejects.toMatchObject({ code: "FINAL_CHECK_PENDING" });
  for (const source of manifest.sources) {
    if (source.sourceKind === "builder_capture_not_scanned") continue;
    expect(source.processable).toBe(true);
    await worker.record(workerContext, a.jobId, manifest.id, source.id, randomUUID(), {
      version: "final-check.source-result.v1", inputHash: source.inputHash, status: "zero_result", failureCode: null, signalIds: [],
    });
  }
  await worker.reconcile(workerContext, a.jobId, manifest.id, []);
  expect(await repository.reveal(a.context, job(a))).toMatchObject({ state: "completed", items: [], lockedLines: expect.any(Array) });
  expect(await repository.reveal(a.context, job(a))).toEqual(await repository.reveal(a.context, job(a)));
  expect(await financialSnapshot()).toEqual(before);
});
it("gives concurrent distinct locks exactly one winner", async () => {
  const a = await company(); await ready(a);
  const results = await Promise.allSettled([repository.lock(a.context, lock(a)), repository.lock(a.context, lock(a))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "FINAL_ACCOUNT_ALREADY_LOCKED" });
});
it("refuses forged, expired and revoked sessions plus stale membership and cross-tenant jobs", async () => {
  const a = await company(false), other = await company(false);
  await expect(repository.read(a.context, job(other))).rejects.toMatchObject({ code: "COMPANY_FINAL_CHECK_FORBIDDEN" });
  for (const change of ["forged", "expired", "revoked", "member_revoked", "member_expired"] as const) {
    const b = await company(false);
    if (change === "expired") await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [b.sessionId]);
    if (change === "revoked") await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [b.sessionId]);
    if (change.startsWith("member_")) await workTenant(f.admin, b.tenantId, client => client.query(
      change === "member_revoked" ? "UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2" :
        "UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [b.tenantId, b.actorId]));
    if (change === "forged") {
      const client = await f.runtime.connect();
      try {
        await client.query("BEGIN");
        await expect(client.query("SELECT app.bind_request('real',$1,$2)", ["f".repeat(64), b.tenantId])).rejects.toMatchObject({ code: "42501" });
      } finally { await client.query("ROLLBACK"); client.release(); }
    } else await expect(repository.read(b.context, job(b))).rejects.toMatchObject({ code: expect.stringMatching(/REFUSED|FORBIDDEN/u) });
  }
});
it("ignores forged actor/kind settings, refuses forged tenant settings, unbound and expired bindings", async () => {
  const a = await company(false), client = await f.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),set_config('app.credential_kind','real',true)", [a.tenantId, a.actorId]);
    await expect(client.query("SELECT app.company_final_check_read($1)", [a.jobId])).rejects.toMatchObject({ code: "42501" });
    await client.query("ROLLBACK"); await bound(client, a);
    await client.query("SELECT set_config('app.actor_id',$1,true),set_config('app.credential_kind','practice',true)", [randomUUID()]);
    expect((await client.query("SELECT app.company_final_check_read($1) r", [a.jobId])).rows[0].r.draft).toBeNull();
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [randomUUID()]);
    await expect(client.query("SELECT app.company_final_check_read($1)", [a.jobId])).rejects.toMatchObject({ code: "42501" });
  } finally { await client.query("ROLLBACK"); client.release(); }
  const owner = await f.admin.connect();
  try {
    await owner.query("BEGIN; SET LOCAL ROLE jobguard_runtime");
    await owner.query("SELECT app.bind_request('real',$1,$2)", [a.digest, a.tenantId]);
    await owner.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    await owner.query("RESET ROLE");
    await owner.query("UPDATE control_plane.request_binding SET expires_at=clock_timestamp()-interval '1 second' WHERE transaction_id=pg_current_xact_id()");
    await owner.query("SET LOCAL ROLE jobguard_runtime");
    await expect(owner.query("SELECT app.company_final_check_read($1)", [a.jobId])).rejects.toMatchObject({ code: "42501" });
  } finally { await owner.query("ROLLBACK"); owner.release(); }
});
it.each(["revoked", "expired"])("rechecks %s membership after waiting for the job lock", async state => {
  const a = await company(false), holder = await f.admin.connect(), waiting = await f.runtime.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT * FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [a.tenantId, a.jobId]);
    await bound(waiting, a);
    const pid = (await waiting.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    const result = waiting.query("SELECT app.company_final_check_read($1)", [a.jobId]);
    const refusal = expect(result).rejects.toMatchObject({ code: "42501" });
    await vi.waitFor(async () => expect((await f.admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.wait_event_type).toBe("Lock"));
    await holder.query(state === "revoked" ? "UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2" :
      "UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
    await holder.query("COMMIT"); await refusal;
  } finally { await holder.query("ROLLBACK"); await waiting.query("ROLLBACK"); holder.release(); waiting.release(); }
});
it("refuses practice-owned jobs and imported descendants, including company-session access", async () => {
  const a = await company(false), child = randomUUID();
  const practice = await seedWorkPractice(f), parent = practice.jobId;
  await workTenant(f.admin, a.tenantId, async client => {
    await permitImportedJob(client, { tenantId: a.tenantId, jobId: child, actorMembershipId: a.actorId,
      title: "Fictional imported child", feePolicyVersion: "reference_fee_policy_v3", netPence: 100000, capPence: 1500 });
    await client.query("INSERT INTO app.job(tenant_id,id,title,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional imported child','imported',100000,'reference_fee_policy_v3',1500)", [a.tenantId, child]);
    await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [a.tenantId, child]);
    // An external parent must fail closed without reading the other tenant's job.
    await client.query("SELECT app.append_final_check_audit($1,$2,$3,'job.imported_baseline_attested',$4::jsonb)",
      [randomUUID(), `membership:${a.actorId}`, child, JSON.stringify({ sourceJobId: parent })]);
  });
  for (const id of [parent, child]) await expect(repository.read(a.context, job({ jobId: id }))).rejects.toMatchObject({ code: "COMPANY_FINAL_CHECK_FORBIDDEN" });
});
it("keeps pre-lock responses, errors and row counts identical with or without held signals", async () => {
  const a = await company(false); await ready(a);
  const read = await repository.read(a.context, job(a)), reveal = await repository.reveal(a.context, job(a));
  const counts = async () => (await f.admin.query("SELECT (SELECT count(*) FROM app.final_check_reveal_proof)::text proofs,(SELECT count(*) FROM infrastructure.final_check_request)::text requests")).rows;
  const before = await counts();
  await expect(repository.requestRun(a.context, job(a))).rejects.toMatchObject({ code: "FINAL_ACCOUNT_LOCK_REQUIRED" });
  await workTenant(f.admin, a.tenantId, client => client.query(`INSERT INTO app.shadow_commercial_signal
    (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
    VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Fictional held work','low','held_for_final_check')`, [a.tenantId, a.jobId, randomUUID(), randomUUID()]));
  expect(await repository.read(a.context, job(a))).toEqual(read);
  expect(await repository.reveal(a.context, job(a))).toEqual(reveal);
  await expect(repository.requestRun(a.context, job(a))).rejects.toMatchObject({ code: "FINAL_ACCOUNT_LOCK_REQUIRED" });
  expect(await counts()).toEqual(before);
});

it("refuses an authentic home-practice binding even with supplied real-kind settings", async () => {
  const tenant = "11111111-1111-4111-8111-111111111111", actor = "d1500000-0000-4000-8000-000000000003";
  const person = "d1500000-0000-4000-8000-000000000001", digest = "b".repeat(64);
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [person]);
  await workTenant(f.admin, tenant, async client => {
    const account = randomUUID();
    await client.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional practice')", [tenant, account]);
    await client.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [tenant, actor, account, person]);
  });
  await f.admin.query("SELECT app.issue_practice_session($1)", [digest]);
  const client = await f.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT app.bind_request('practice',$1,$2)", [digest, tenant]);
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.credential_kind','real',true)", [tenant]);
    await expect(client.query("SELECT app.company_final_check_read($1)", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("uses LS-142 request identities and reveals the latest completed attempt on the same company lock", async () => {
  const a = await company(); await ready(a);
  const locked = await repository.lock(a.context, lock(a));
  const workerContext = testTenantContext(a.tenantId);
  const workerRepository = new FinalCheckRepository(fixture.shadow);
  const completion = new FinalCheckCompletionRepository(fixture.shadow);
  const worker = new FinalCheckWorker({
    read: (context, task) => workerRepository.manifest(context, task.jobId, task.manifestId),
    async process(_context, manifest, source) {
      return { version: "final-check.source-result.v1", inputHash: source.inputHash,
        status: "zero_result", failureCode: null, signalIds: [] };
    },
    record: (context, manifest, source, result) => workerRepository.record(context,
      manifest.comparisons.jobId, manifest.id, source.id, randomUUID(), result),
    reconcile: (context, manifest) => workerRepository.reconcile(context, manifest.comparisons.jobId, manifest.id, []),
  }, "synthetic_demo");
  async function run(manifestId?: string) {
    const manifest = await workerRepository.begin(workerContext, a.jobId, "shadow-detection.v1", manifestId);
    await executeFinalCheckTask(workerContext, { version: "final-check-task.v1", tenantId: a.tenantId,
      jobId: a.jobId, manifestId: manifest.id, lockId: manifest.lockId, executionId: manifest.id }, {
      read: workerRepository.manifest.bind(workerRepository), execute: worker.execute.bind(worker),
      publish: completion.publish.bind(completion),
    }, "synthetic_demo");
    return workerRepository.manifest(workerContext, a.jobId, manifest.id);
  }
  const firstRequest = await repository.requestRun(a.context, job(a));
  expect(firstRequest).toMatchObject({ lockId: locked.id, attempt: 1, state: "requested" });
  expect(await repository.requestRun(a.context, job(a))).toEqual(firstRequest);
  const first = await run();
  const firstReveal = await repository.reveal(a.context, job(a));
  expect(firstReveal).toMatchObject({ state: "completed", runId: first.result!.runId });
  // A completed, still-valid attempt cannot be replaced, just as on main's request path.
  await expect(repository.requestRun(a.context, job(a))).rejects.toThrow("FINAL_CHECK_SOURCE_CHANGED");
  const source = first.sources.find(source => source.evidenceId !== null)!;
  expect(source).toBeDefined();
  await workTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.evidence_invalidation
    (id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')`,
    [randomUUID(), a.tenantId, source.evidenceId, a.actorId]));
  const secondRequest = await repository.requestRun(a.context, job(a));
  expect(secondRequest).toMatchObject({ lockId: locked.id, attempt: 2, state: "requested" });
  expect(await repository.requestRun(a.context, job(a))).toEqual(secondRequest);
  // Repeated requests retain (lock_id, attempt) identity rather than inserting another first attempt.
  expect((await f.admin.query(`SELECT attempt FROM infrastructure.final_check_request
    WHERE lock_id=$1 ORDER BY attempt`, [locked.id])).rows).toEqual([{ attempt: 1 }, { attempt: 2 }]);
  const secondPending = await workerRepository.begin(workerContext, a.jobId, "shadow-detection.v1", secondRequest.manifestId as string);
  await expect(repository.requestRun(a.context, job(a))).rejects.toThrow("FINAL_CHECK_PENDING");
  expect(await repository.reveal(a.context, job(a))).toMatchObject({ state: "failed", items: [] });
  const second = await run(secondPending.id);
  expect(second.id).not.toBe(first.id);
  expect(second.result!.runId).not.toBe(first.result!.runId);
  expect((await f.admin.query(`SELECT attempt FROM app.final_check_manifest
    WHERE tenant_id=$1 AND job_id=$2 AND lock_id=$3 ORDER BY attempt`, [a.tenantId, a.jobId, locked.id])).rows)
    .toEqual([{ attempt: 1 }, { attempt: 2 }]);
  expect(await repository.reveal(a.context, job(a))).toMatchObject({
    state: "completed", lockId: locked.id, runId: second.result!.runId,
  });
  // Replay cannot drift back to the first binding.
  expect(await repository.reveal(a.context, job(a))).toEqual(await repository.reveal(a.context, job(a)));
});
