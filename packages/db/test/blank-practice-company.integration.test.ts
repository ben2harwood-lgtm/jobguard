import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { cluster, seedHomeOwner, digestOf, type Cluster } from "./contractor-practice-session-fixtures.js";
import { startBlankPracticeCompany, isBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession, authorizePracticeJob, issuePracticeSession } from "../src/practice-session.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
let c: Cluster;
const start = { version: "blank-practice-company.v1", action: "start" };
const reset = { ...start, action: "reset" };
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); await seedHomeOwner(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("pins the named sample trigger and keeps its existing routine", async () => {
  const trigger = await c.admin.query(`SELECT tgname, tgtype, tgenabled,
    tgfoid::regprocedure::text routine, pg_get_triggerdef(oid) definition
    FROM pg_trigger WHERE tgrelid='control_plane.practice_session'::regclass
      AND tgname='saved_v1_sample_on_session' AND NOT tgisinternal`);
  expect(trigger.rows).toEqual([{
    tgname: "saved_v1_sample_on_session", tgtype: 5, tgenabled: "O",
    routine: "app.seed_saved_v1_sample()",
    definition: "CREATE TRIGGER saved_v1_sample_on_session AFTER INSERT ON control_plane.practice_session FOR EACH ROW WHEN ((NOT app.is_blank_practice_company((new.token_digest)::text))) EXECUTE FUNCTION app.seed_saved_v1_sample()",
  }]);
});

it("starts empty, isolates testers, retains history and rejects old credentials after reset", async () => {
  const first = await startBlankPracticeCompany(c.runtime, start);
  const second = await startBlankPracticeCompany(c.runtime, start);
  const a = await authenticatePracticeSession(c.runtime, first), b = await authenticatePracticeSession(c.runtime, second);
  const jobs = new JobPartiesRepository(c.runtime);
  expect(await isBlankPracticeCompany(c.runtime, a.digest)).toBe(true);
  expect((await jobs.list(a.context, a.membershipId, a.digest)).jobs).toEqual([]);
  expect((await jobs.list(b.context, b.membershipId, b.digest)).jobs).toEqual([]);
  expect(await startBlankPracticeCompany(c.runtime, start, first)).toBe(first);
  // Exercise the existing controlled job creator in this otherwise empty namespace.
  const job = randomUUID();
  const client = await c.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.context.tenantId]);
    await client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [a.context.tenantId, job, a.membershipId, a.digest]);
    await client.query("COMMIT");
  } finally { client.release(); }
  await expect(authorizePracticeJob(c.runtime, first, job)).resolves.toBeDefined();
  await expect(authorizePracticeJob(c.runtime, second, job)).rejects.toThrow("NOT_FOUND");
  expect((await jobs.list(b.context, b.membershipId, b.digest)).jobs).toEqual([]);
  const next = await startBlankPracticeCompany(c.runtime, reset, first);
  const current = await authenticatePracticeSession(c.runtime, next);
  expect((await jobs.list(current.context, current.membershipId, current.digest)).jobs).toEqual([]);
  await expect(authorizePracticeJob(c.runtime, next, job)).rejects.toThrow("NOT_FOUND");
  await expect(authenticatePracticeSession(c.runtime, first)).rejects.toThrow("UNAUTHENTICATED");
  await expect(startBlankPracticeCompany(c.runtime, reset, first)).rejects.toThrow("UNAUTHENTICATED");
  expect(await authenticatePracticeSession(c.runtime, second)).toBeDefined();
  expect((await c.admin.query("SELECT practice_session_digest FROM app.job WHERE id=$1", [job])).rows[0].practice_session_digest).toBe(a.digest);
  expect((await c.admin.query("SELECT s.revoked_at,b.replaced_by FROM control_plane.practice_session s JOIN control_plane.blank_practice_session b USING(token_digest) WHERE s.token_digest=$1", [a.digest])).rows[0]).toEqual({ revoked_at: expect.any(Date), replaced_by: current.digest });
});
it("serializes competing resets, rejects nonblank/expired sessions and grants no table access", async () => {
  const outcome = await competingResets();
  expect(outcome).toMatchObject({ status: "rejected", reason: { message: "UNAUTHENTICATED" } });
  const legacy = await issuePracticeSession(c.runtime);
  await expect(startBlankPracticeCompany(c.runtime, reset, legacy)).rejects.toThrow("UNAUTHENTICATED");
  expect(await authenticatePracticeSession(c.runtime, legacy)).toBeDefined();
  const legacyJobs = await c.admin.query("SELECT title FROM app.job WHERE practice_session_digest=$1 AND saved_v1_sample", [digestOf(legacy)]);
  expect(legacyJobs.rows).toEqual([{ title: "Earlier proposed pricing (v1)" }]);
  await expect(c.runtime.query("SELECT * FROM control_plane.blank_practice_session")).rejects.toThrow(/permission denied/u);
  expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='control_plane.blank_practice_session'::regclass")).rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: false, owner: "jobguard_migration" });
  const expired = await startBlankPracticeCompany(c.runtime, start);
  await c.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [digestOf(expired)]);
  await expect(startBlankPracticeCompany(c.runtime, reset, expired)).rejects.toThrow("UNAUTHENTICATED");
  await expect(c.runtime.query("SELECT * FROM control_plane.practice_session")).rejects.toThrow(/permission denied/u);
  await expect(c.runtime.query("SELECT app.start_blank_practice_company_v2(NULL,NULL)")).rejects.toThrow("UNAUTHENTICATED");
});

it("upgrades legacy sessions without changing their jobs or credentials and refuses a non-demo database", async () => {
  const { startBeforeMigration, applyMigration } = await import("./contractor-practice-session-fixtures.js");
  const prior = await startBeforeMigration("0657_blank_practice_company.sql");
  try {
    const token = await issuePracticeSession(prior.runtime);
    const before = await prior.admin.query("SELECT row_to_json(j) value FROM app.job j WHERE practice_session_digest=$1 ORDER BY id", [digestOf(token)]);
    await applyMigration(prior, "0657_blank_practice_company.sql");
    expect(await authenticatePracticeSession(prior.runtime, token)).toBeDefined();
    expect(await isBlankPracticeCompany(prior.runtime, digestOf(token))).toBe(false);
    expect((await prior.admin.query("SELECT row_to_json(j) value FROM app.job j WHERE practice_session_digest=$1 ORDER BY id", [digestOf(token)])).rows).toEqual(before.rows);
    const oldBlank = randomUUID();
    await prior.runtime.query("SELECT app.start_blank_practice_company($1,NULL)", [digestOf(oldBlank)]);
    await applyMigration(prior, "0687_blank_practice_reset_token.sql");
    expect(await authenticatePracticeSession(prior.runtime, oldBlank)).toBeDefined();
    const replacement = await startBlankPracticeCompany(prior.runtime, reset, oldBlank);
    expect(await authenticatePracticeSession(prior.runtime, replacement)).toBeDefined();
    await expect(authenticatePracticeSession(prior.runtime, oldBlank)).rejects.toThrow("UNAUTHENTICATED");
    const fresh = await startBlankPracticeCompany(prior.runtime, start);
    expect((await prior.admin.query("SELECT count(*)::int n FROM app.job WHERE practice_session_digest=$1", [digestOf(fresh)])).rows[0].n).toBe(0);
  } finally { await prior.close(); }
  // Exercise the SQL database fence independently of the application's env guard.
  const foreign = await cluster(false, `fictional_${randomUUID().replaceAll("-", "")}`);
  try {
    await seedHomeOwner(foreign);
    await expect(startBlankPracticeCompany(foreign.runtime, start)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
  } finally { await foreign.close(); }
}, 240_000);

// Hold a completed reset uncommitted. The competing statement must actually
// wait for that transaction, then recheck authentication after it commits.
async function competingResets() {
  const token = await startBlankPracticeCompany(c.runtime, start);
  const first = await c.runtime.connect(), second = await c.runtime.connect();
  let pending: Promise<PromiseSettledResult<unknown>> | undefined;
  try {
    await first.query("BEGIN");
    await first.query("SELECT app.start_blank_practice_company_v2($1,$2)", [randomUUID(), token]);
    await second.query("SET statement_timeout='10s'");
    const pid = (await second.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    pending = second.query("SELECT app.start_blank_practice_company_v2($1,$2)", [randomUUID(), token])
      .then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }));
    const deadline = Date.now() + 5_000;
    let blocked = false;
    while (Date.now() < deadline) {
      const row = (await c.admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0];
      if (row?.wait_event_type === "Lock") { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(blocked, "second reset must overlap the uncommitted first reset").toBe(true);
    await first.query("COMMIT");
    const outcome = await pending;
    await expect(authenticatePracticeSession(c.runtime, token)).rejects.toThrow("UNAUTHENTICATED");
    return outcome;
  } finally {
    await first.query("ROLLBACK");
    await pending;
    await second.query("RESET statement_timeout");
    first.release(); second.release();
  }
}

it("detects removal of the reset lock in a scratch routine definition and restores it", async () => {
  const original = (await c.admin.query("SELECT pg_get_functiondef('app.start_blank_practice_company_v2(text,text)'::regprocedure) definition")).rows[0].definition as string;
  const lock = "PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=previous_digest FOR UPDATE;";
  expect(original).toContain(lock);
  try {
    await c.admin.query(original.replace(lock, "NULL; -- scratch mutation: omit serialization"));
    // Without the lock both checks see the old committed session as live. The
    // UPDATE waits, but it is too late: both replacements are then accepted.
    expect(await competingResets()).toMatchObject({ status: "fulfilled" });
  } finally {
    await c.admin.query(original);
  }
  expect((await c.admin.query("SELECT pg_get_functiondef('app.start_blank_practice_company_v2(text,text)'::regprocedure) definition")).rows[0].definition).toBe(original);
});

it("refuses digest-only reset authority and the legacy entry point without changing sessions", async () => {
  const token = await startBlankPracticeCompany(c.runtime, start);
  const job = randomUUID();
  const auth = await authenticatePracticeSession(c.runtime, token);
  const client = await c.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [auth.context.tenantId]);
    await client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [auth.context.tenantId, job, auth.membershipId, auth.digest]);
    await client.query("COMMIT");
    // The attacker can read this digest through the shared synthetic tenant.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [auth.context.tenantId]);
    const digest = (await client.query("SELECT practice_session_digest FROM app.job WHERE id=$1", [job])).rows[0].practice_session_digest;
    await client.query("COMMIT");
    const before = (await c.admin.query("SELECT row_to_json(s) value FROM control_plane.practice_session s ORDER BY token_digest")).rows;
    await expect(c.runtime.query("SELECT app.start_blank_practice_company_v2($1,$2)", [randomUUID(), digest])).rejects.toThrow("UNAUTHENTICATED");
    await expect(c.runtime.query("SELECT app.start_blank_practice_company($1,$2)", [digestOf(randomUUID()), digest])).rejects.toThrow(/permission denied/u);
    for (const [next, previous] of [[null, null], ["bad", null], [digest, null], [randomUUID(), ""], [randomUUID(), randomUUID()], [token, token]]) {
      await expect(c.runtime.query("SELECT app.start_blank_practice_company_v2($1,$2)", [next, previous])).rejects.toThrow("UNAUTHENTICATED");
    }
    expect((await c.admin.query("SELECT row_to_json(s) value FROM control_plane.practice_session s ORDER BY token_digest")).rows).toEqual(before);
    expect(await authenticatePracticeSession(c.runtime, token)).toBeDefined();
    expect(await authorizePracticeJob(c.runtime, token, job)).toBeDefined();
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("pins the new routine owner, security and ACL and withdraws the old runtime grant", async () => {
  const rows = (await c.admin.query(`SELECT proname, pg_get_userbyid(proowner) owner, prosecdef, proconfig,
    proacl::text acl, has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime_execute
    FROM pg_proc WHERE oid IN ('app.start_blank_practice_company(text,text)'::regprocedure,
      'app.start_blank_practice_company_v2(text,text)'::regprocedure) ORDER BY proname`)).rows;
  expect(rows).toEqual([
    { proname: "start_blank_practice_company", owner: "jobguard_migration", prosecdef: true,
      proconfig: ["search_path=pg_catalog"], acl: "{jobguard_migration=X/jobguard_migration}", runtime_execute: false },
    { proname: "start_blank_practice_company_v2", owner: "jobguard_migration", prosecdef: true,
      proconfig: ["search_path=pg_catalog"], acl: "{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}", runtime_execute: true },
  ]);
});
