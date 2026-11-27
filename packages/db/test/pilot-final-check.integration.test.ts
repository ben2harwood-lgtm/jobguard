import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { pilotApprovalFixture } from "../../config/src/policy-gates.pilot-test-fixture.js";
import { requirePilotG1 } from "../../config/src/policy-gates.js";
import { pilotFinalCheckDiscovery, pilotFinalCheckExecutor, pilotWorkerTasks } from "../../../apps/api/src/pilot-worker.js";
import { generatePracticePng } from "../src/practice-proof-image.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { migrate } from "../src/migrate.js";
import { FinalCheckCompletionRepository, pilotFixtureFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { verifiedTenantContextForQueuedJob, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { finalCheckTenant } from "./final-check-fixture.js";

const { makeWorkerUtils, runOnce } = createRequire(new URL("../../../apps/api/package.json", import.meta.url))("graphile-worker");
const queueSchema = "jobguard_pilot_queue";
const database = "jobguard_pilot_final_check";
const migration = "0777_pilot_final_check.sql";
const digest = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
const terms = "pilot_final_check_terms.v1";
function executor(gate: () => void) {
  const execute = pilotFinalCheckExecutor(shadow, gate, pool => {
    const completion = new FinalCheckCompletionRepository(pool);
    return { worker: pilotFixtureFinalCheckPorts(pool, digest(generatePracticePng())), publish: completion.publish.bind(completion) };
  });
  return (task: Parameters<typeof execute>[1]) => execute(verifiedTenantContextForQueuedJob(task.tenantId), task);
}
let c: Cluster;
let shadow: Pool;
let otherShadow: Pool;
let queue: Pool;

beforeAll(async () => {
  c = await startBeforeMigration(migration, database);
  const predecessor = await c.admin.query("SELECT max(migration_name) AS migration FROM public.jobguard_schema_migration");
  expect(predecessor.rows[0]?.migration).toBe("0776_pilot_final_account.sql");
  expect((await c.admin.query("SELECT to_regclass('control_plane.pilot_final_check_binding') binding")).rows[0]?.binding).toBeNull();
  const legacyLock = randomUUID();
  const legacy = await c.admin.query(
    "INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id) VALUES($1,$2,$3) RETURNING row_to_json(final_check_request) snapshot",
    [legacyLock, randomUUID(), randomUUID()]);
  await c.admin.query(`CREATE ROLE jobguard_pilot_shadow_login LOGIN PASSWORD 'fictional-shadow';
    CREATE ROLE other_shadow LOGIN PASSWORD 'fictional-other-shadow';
    CREATE ROLE jobguard_pilot_queue_login LOGIN PASSWORD 'fictional-queue';
    GRANT jobguard_shadow TO jobguard_pilot_shadow_login,other_shadow`);
  await c.admin.query("CREATE DATABASE jobguard_pilot_queue");
  await c.admin.query("GRANT CREATE ON DATABASE jobguard_pilot_queue TO jobguard_pilot_queue_login");
  await c.admin.query("REVOKE CONNECT ON DATABASE jobguard_pilot_final_check FROM PUBLIC");
  await c.admin.query("GRANT CONNECT ON DATABASE jobguard_pilot_final_check TO ent4b_login,jobguard_pilot_shadow_login,other_shadow");
  shadow = new Pool({ ...c.config, database, user: "jobguard_pilot_shadow_login", password: "fictional-shadow" });
  otherShadow = new Pool({ ...c.config, database, user: "other_shadow", password: "fictional-other-shadow" });
  queue = new Pool({ ...c.config, database: "jobguard_pilot_queue", user: "jobguard_pilot_queue_login", password: "fictional-queue" });
  await migrate(c.admin);
  await migrate(c.admin);
  await c.admin.query("GRANT jobguard_pilot_final_check TO jobguard_pilot_shadow_login");
  expect((await c.admin.query("SELECT row_to_json(q) snapshot FROM infrastructure.final_check_request q WHERE lock_id=$1", [legacyLock])).rows)
    .toEqual(legacy.rows);
  expect((await shadow.query("SELECT * FROM app.pilot_final_check_requests()")).rows).toEqual([]);
  await c.admin.query(`
    CREATE FUNCTION app.expire_test_pilot_scope() RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
      UPDATE control_plane.lp11_shadow_scope SET expires_at=clock_timestamp()-interval '1 second'
      WHERE transaction_id=pg_current_xact_id_if_assigned() AND login=session_user
    $$;
    ALTER FUNCTION app.expire_test_pilot_scope() OWNER TO jobguard_session_lookup;
    REVOKE ALL ON FUNCTION app.expire_test_pilot_scope() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.expire_test_pilot_scope() TO jobguard_shadow;
  `);
}, 180_000);
afterAll(async () => {
  await Promise.all([shadow?.end(), otherShadow?.end(), queue?.end()]);
  await c?.close();
});
afterEach(() => vi.unstubAllEnvs());

async function fixture({ approved = true, photo }: { approved?: boolean; photo?: string } = {}) {
  const [tenantId, account, member, user, jobId, scope, baseline, draft, revision, upload, evidence] = Array.from({ length: 11 }, () => randomUUID()) as [string, string, string, string, string, string, string, string, string, string, string];
  const credential = digest(randomUUID());
  const env = pilotApprovalFixture().env;
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const gate = () => requirePilotG1(process.env);
  const admin = c.admin;
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fixture.invalid`, user]);
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional builder')", [tenantId, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenantId, member, account, user]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenantId, member]);
  await admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fixture',clock_timestamp()+interval '1 hour','pilot_no_charge')",
    [randomUUID(), user, credential]);
  await admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional extension','draft')", [tenantId, jobId]);
  await finalCheckTenant(admin, tenantId, db => seedSyntheticPartyFixture(db, tenantId, jobId));
  await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','pilot_no_charge','pilot_capture')", [tenantId, jobId]);
  await admin.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenantId, jobId]);
  await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenantId, scope, jobId]);
  await admin.query("INSERT INTO app.quote_version(tenant_id,id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [tenantId, baseline, jobId, digest("baseline")]);
  await admin.query("INSERT INTO app.final_account_draft(tenant_id,id,job_id) VALUES($1,$2,$3)", [tenantId, draft, jobId]);
  await admin.query(`INSERT INTO app.final_account_revision(tenant_id,id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',100000,20000,120000,false,'[]')`, [tenantId, revision, jobId, draft, digest("account"), baseline]);
  await admin.query(`INSERT INTO app.final_account_line(tenant_id,id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
    VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional extension',100000,1)`, [tenantId, randomUUID(), jobId, revision, baseline, scope]);
  await admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, draft, revision]);
  if (approved) await approve(tenantId, terms);
  if (photo) {
    const key = `tenants/${tenantId}/uploads/${upload}`;
    await finalCheckTenant(admin, tenantId, async db => {
      await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'image/png',1000000,'standard_evidence',clock_timestamp()+interval '1 hour')`, [tenantId, upload, jobId, scope, key, photo]);
      await db.query(`UPDATE app.evidence_upload SET state='verified',object_version_id='fictional-v1',server_verified_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2`, [tenantId, upload]);
      await db.query(`INSERT INTO app.evidence_object(tenant_id,id,job_id,scope_item_id,upload_id,object_key,object_version_id,sha256,content_type,byte_length,evidence_type,kind,retention_class,server_received_at,server_verified_at)
        VALUES($1,$2,$3,$4,$5,$6,'fictional-v1',$7,'image/png',100,'completion_photo','original','standard_evidence',clock_timestamp(),clock_timestamp())`, [tenantId, evidence, jobId, scope, upload, key, photo]);
    });
  }
  const context = verifiedTenantContextFromMembership({ tenantId, membershipId: member, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential });
  const locks = new FinalAccountLockRepository(c.runtime);
  await locks.disposition(context, { jobId, actorMembershipId: member, commandId: randomUUID(), scopeItemId: scope, disposition: "done" }, gate);
  return { tenantId, jobId, context, credential, member, evidence, gate, lock: () => locks.lock(context, { jobId, actorMembershipId: member,
    commandId: randomUUID(), finalAccountRevisionId: revision, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" }, gate) };
}

async function approve(tenantId: string, version: string) {
  await c.admin.query("INSERT INTO app.pilot_final_check_terms_approval(tenant_id,version,approval_sha256) VALUES($1,$2,$3)", [tenantId, version, digest(version)]);
}

async function lockTask(f: Awaited<ReturnType<typeof fixture>>, ack = true) {
  const lock = await f.lock();
  const { rows } = await shadow.query("SELECT * FROM app.pilot_final_check_requests()");
  const request = rows.find(row => row.lock_id === lock.id);
  expect(request).toMatchObject({ tenant_id: f.tenantId, job_id: f.jobId });
  if (ack) await shadow.query("SELECT app.pilot_final_check_ack($1,$2,$3,$4)", [f.tenantId, f.jobId, lock.id, request.manifest_id]);
  return { version: "final-check-task.v1" as const, tenantId: f.tenantId, jobId: f.jobId, lockId: lock.id,
    manifestId: request.manifest_id as string, executionId: randomUUID() };
}

async function counts(jobId: string) {
  return (await c.admin.query(`SELECT
    (SELECT count(*)::int FROM app.final_check_manifest WHERE job_id=$1) manifests,
    (SELECT count(*)::int FROM app.shadow_final_check_completion WHERE job_id=$1) certificates`, [jobId])).rows[0];
}

it("requires an exact pilot lock and publishes one certificate under concurrent delivery with fictional evidence", async () => {
  const f = await fixture({ photo: digest(generatePracticePng()) });
  expect((await shadow.query("SELECT * FROM app.pilot_final_check_requests()")).rows.some(r => r.job_id === f.jobId)).toBe(false);
  const task = await lockTask(f);
  const execute = executor(f.gate);
  const tasks = pilotWorkerTasks(execute);
  const deliver = (value: unknown) => tasks.final_check!(value, {} as never);
  for (const key of ["tenantId", "jobId", "lockId", "manifestId"] as const) {
    await expect(deliver({ ...task, [key]: randomUUID() })).rejects.toThrow();
  }
  await expect(deliver({ ...task, termsApproved: true })).rejects.toThrow("INVALID_FINAL_CHECK_TASK");
  expect(await counts(f.jobId)).toEqual({ manifests: 0, certificates: 0 });
  await Promise.all([deliver(task), deliver(task), deliver({ ...task, executionId: randomUUID() })]);
  await deliver(task);
  expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 1 });
  const cert = await c.admin.query("SELECT check_id,lock_id,manifest_id,run_id FROM app.shadow_final_check_completion WHERE job_id=$1", [f.jobId]);
  expect(cert.rows).toEqual([{ check_id: task.manifestId, lock_id: task.lockId, manifest_id: task.manifestId, run_id: expect.any(String) }]);
  await expect(finalCheckTenant(shadow, f.tenantId, db => db.query(
    "INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,run_id,status) VALUES($1,$2,$3,$4,'completed')",
    [f.tenantId, f.jobId, randomUUID(), cert.rows[0].run_id],
  ))).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
  expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 1 });
});

it("refuses wrong role, wrong job, pooled scope reuse and revoked or superseded approval", async () => {
  const f = await fixture();
  const task = await lockTask(f);
  const bind = "SELECT app.lp11_bind_shadow_job($1,$2)";
  const args = [task.tenantId, task.jobId];
  for (const db of [c.runtime, otherShadow, queue]) await expect(db.query(bind, args)).rejects.toThrow();
  await expect(c.runtime.query("SELECT * FROM app.shadow_final_check_completion")).rejects.toMatchObject({ code: "42501" });
  await expect(shadow.query("SELECT * FROM control_plane.pilot_final_check_binding")).rejects.toMatchObject({ code: "42501" });
  await c.admin.query("GRANT jobguard_runtime TO jobguard_pilot_shadow_login");
  try { await expect(shadow.query(bind, args)).rejects.toThrow("FINAL_CHECK_FORBIDDEN"); }
  finally { await c.admin.query("REVOKE jobguard_runtime FROM jobguard_pilot_shadow_login"); }
  const conn = await shadow.connect();
  try {
    await conn.query("BEGIN");
    await conn.query(bind, args);
    await conn.query("SAVEPOINT before_rebind");
    await expect(conn.query(bind, [task.tenantId, randomUUID()])).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
    await conn.query("ROLLBACK TO before_rebind");
    await conn.query("SELECT app.expire_test_pilot_scope()");
    expect((await conn.query("SELECT app.lp11_shadow_job_tenant($1,NULL,'job') tenant", [task.jobId])).rows).toEqual([{ tenant: null }]);
    await conn.query("SAVEPOINT after_expiry");
    await expect(conn.query(bind, args)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
    await conn.query("ROLLBACK TO after_expiry");
    await conn.query("COMMIT");
    expect((await conn.query("SELECT app.lp11_shadow_job_tenant($1,NULL,'job') tenant", [task.jobId])).rows).toEqual([{ tenant: null }]);
  } finally { conn.release(); }

  vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", undefined);
  await expect(executor(f.gate)(task)).rejects.toThrow("PILOT_G1_CLOSED");
  vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", pilotApprovalFixture().env.JOBGUARD_PILOT_21_APPROVAL);
  await approve(f.tenantId, "pilot_final_check_terms.v2");
  await expect(executor(f.gate)(task)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
  expect(await counts(f.jobId)).toEqual({ manifests: 0, certificates: 0 });
});

it("does not enqueue without approved terms or publish for an unsupported source", async () => {
  const missing = await fixture({ approved: false });
  await expect(missing.lock()).rejects.toThrow("DISCLOSURE_TERMS_NOT_ACCEPTED");
  expect((await shadow.query("SELECT * FROM app.pilot_final_check_requests()")).rows.some(r => r.job_id === missing.jobId)).toBe(false);

  const f = await fixture({ photo: digest("unrecognized fictional bytes") });
  const task = await lockTask(f);
  await expect(executor(f.gate)(task)).rejects.toThrow("FINAL_CHECK_PENDING");
  expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 0 });
  const attempts = await c.admin.query("SELECT status,failure_code FROM app.final_check_source_attempt WHERE job_id=$1", [f.jobId]);
  expect(attempts.rows).toEqual([{ status: "unsupported", failure_code: "UNSUPPORTED_SOURCE" }]);
  await expect(new FinalCheckRepository(c.runtime).read(f.context, f.jobId, null))
    .resolves.toEqual({ state: "failed", lockId: task.lockId, items: [] });
});


it("rechecks G1 after reconciliation and before publishing", async () => {
  const f = await fixture();
  const task = await lockTask(f);
  const approved = process.env.JOBGUARD_PILOT_21_APPROVAL;
  let checks = 0;
  const execute = executor(() => {
    if (++checks === 6) vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", undefined);
    f.gate();
  });
  await expect(execute(task)).rejects.toThrow("PILOT_G1_CLOSED");
  expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 0 });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.final_check_run_binding WHERE job_id=$1", [f.jobId])).rows[0]?.n).toBe(1);
  vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", approved);
  await executor(f.gate)(task);
  expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 1 });
});


it("discovers and executes a persisted reservation through the separate Graphile database", async () => {
  const f = await fixture();
  const task = await lockTask(f, false);
  const utils = await makeWorkerUtils({ pgPool: queue, schema: queueSchema });
  try {
    await utils.migrate();
    // Enqueue discovery twice to exercise the acknowledgement and delivery key.
    const discover = { discover_pilot_final_checks: pilotFinalCheckDiscovery(shadow, f.gate) };
    const options = { pgPool: queue, schema: queueSchema };
    await utils.addJob("discover_pilot_final_checks", {});
    await utils.addJob("discover_pilot_final_checks", {});
    await runOnce(options, discover);
    const deliveries = (await queue.query(
      `SELECT key FROM jobguard_pilot_queue.jobs WHERE task_identifier='final_check' AND key=$1`,
      [`pilot-final-check:${task.manifestId}`])).rows;
    expect(deliveries).toHaveLength(1);
    const execute = executor(f.gate);
    await runOnce(options, pilotWorkerTasks(execute));
    expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 1 });
    await expect(queue.query("SELECT * FROM control_plane.pilot_final_check_binding")).rejects.toThrow();
    expect((await c.admin.query("SELECT has_database_privilege('jobguard_pilot_queue_login', current_database(), 'CONNECT') allowed")).rows[0]?.allowed).toBe(false);
  } finally { await utils.release(); }
});

it("keeps pilot facts private until the matching certificate, then permits a dispute and an idempotent draft catch", async () => {
  const f = await fixture({ photo: digest(generatePracticePng()) });
  const repository = new FinalCheckRepository(c.runtime);
  const read = () => repository.read(f.context, f.jobId, null);
  const disputes = () => repository.disputes(f.context, f.jobId, null);
  const privateRead = await read();
  expect(privateRead).toEqual({ state: "unlocked", items: [] });
  expect(await disputes()).toEqual([]);
  const evidence = (await c.admin.query(
    "SELECT object_version_id,sha256,server_received_at::text received FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",
    [f.tenantId, f.evidence],
  )).rows[0];
  for (const description of ["Fitted shelving units", "Installed kitchen tiles"]) {
    const signalId = randomUUID();
    await c.admin.query(`INSERT INTO app.shadow_commercial_signal(
      tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
      VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),$5,'low','held_for_final_check')`,
    [f.tenantId, f.jobId, signalId, randomUUID(), description]);
    await c.admin.query(`INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [f.tenantId, f.jobId, signalId, f.evidence, evidence.object_version_id, evidence.sha256, evidence.received]);
  }
  expect(await read()).toEqual(privateRead);
  expect(await disputes()).toEqual([]);
  await expect(c.runtime.query("SELECT app.read_final_check_reveal($1,$2,NULL)", [f.tenantId, f.jobId]))
    .rejects.toMatchObject({ code: "42501" });
  await expect(repository.read(f.context, f.jobId, "a".repeat(64))).rejects.toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });

  const task = await lockTask(f);
  expect(await read()).toEqual({ state: "pending", lockId: task.lockId, items: [] });
  expect(await disputes()).toEqual([]);
  const approval = process.env.JOBGUARD_PILOT_21_APPROVAL;
  let checks = 0;
  await expect(executor(() => {
    if (++checks === 6) vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", undefined);
    f.gate();
  })(task)).rejects.toThrow("PILOT_G1_CLOSED");
  vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", approval);
  expect(await counts(f.jobId)).toEqual({ manifests: 1, certificates: 0 });
  expect(await read()).toEqual({ state: "pending", lockId: task.lockId, items: [] });
  expect(await disputes()).toEqual([]);

  await executor(f.gate)(task);
  const view = await read();
  expect(view).toMatchObject({ state: "completed", lockId: task.lockId });
  function subject(description: string) {
    const item = view.items.find(item => item.description === description);
    expect(item, JSON.stringify(view.items)).toBeDefined();
    return { commandId: randomUUID(), lockId: view.lockId!, runId: view.runId!,
      signalId: item!.signalId as string, expectedSignalRevision: item!.signalRevision as number };
  }
  const disposition = { version: "final-check.disposition.v1" as const, ...subject("Fitted shelving units"),
    answer: "already_included" as const, referenceId: null };
  await expect(repository.disposition(f.context, f.jobId, null, disposition))
    .resolves.toMatchObject({ disposition: "attribution_disputed" });
  expect(await disputes()).toEqual([expect.objectContaining({ signalId: disposition.signalId, answer: "already_included" })]);
  expect((await c.admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE job_id=$1 AND signal_id=$2",
    [f.jobId, disposition.signalId])).rows).toEqual([{ reason: "attribution_disputed" }]);
  const confirmation = { version: "final-check.catch.v1", ...subject("Installed kitchen tiles") };
  await expect(repository.confirmCatch(f.context, f.jobId, null, { ...confirmation, runId: randomUUID() }))
    .rejects.toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });
  await expect(repository.confirmCatch(f.context, f.jobId, null, {
    ...confirmation, expectedSignalRevision: confirmation.expectedSignalRevision + 1,
  })).rejects.toMatchObject({ code: "STALE_REVISION" });
  const result = await repository.confirmCatch(f.context, f.jobId, null, confirmation);
  expect(result).toMatchObject({ variationId: confirmation.commandId, disposition: "confirmed_extra" });
  expect(await repository.confirmCatch(f.context, f.jobId, null, confirmation)).toEqual(result);
  expect((await c.admin.query("SELECT id,origin FROM app.variation WHERE job_id=$1", [f.jobId])).rows)
    .toEqual([{ id: confirmation.commandId, origin: "jobguard_catch" }]);
  for (const table of ["variation_revision", "variation_approval", "customer_invoice"]) {
    expect((await c.admin.query(`SELECT 1 FROM app.${table} WHERE job_id=$1`, [f.jobId])).rowCount).toBe(0);
  }

  await approve(f.tenantId, "pilot_final_check_terms.v2");
  await expect(read()).rejects.toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });
  await expect(repository.confirmCatch(f.context, f.jobId, null, confirmation)).rejects.toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [f.credential]);
  await expect(read()).rejects.toThrow();
});
