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
  const token = await startBlankPracticeCompany(c.runtime, start);
  const outcomes = await Promise.allSettled([startBlankPracticeCompany(c.runtime, reset, token), startBlankPracticeCompany(c.runtime, reset, token)]);
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
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
  await expect(c.runtime.query("SELECT app.start_blank_practice_company(NULL,NULL)")).rejects.toThrow("UNAUTHENTICATED");
});

it("upgrades legacy sessions without changing their jobs or credentials and refuses a non-demo database", async () => {
  const { startBeforeMigration, applyMigration } = await import("./contractor-practice-session-fixtures.js");
  const prior = await startBeforeMigration("0901_blank_practice_company.sql");
  try {
    const token = await issuePracticeSession(prior.runtime);
    const before = await prior.admin.query("SELECT row_to_json(j) value FROM app.job j WHERE practice_session_digest=$1 ORDER BY id", [digestOf(token)]);
    await applyMigration(prior, "0901_blank_practice_company.sql");
    expect(await authenticatePracticeSession(prior.runtime, token)).toBeDefined();
    expect(await isBlankPracticeCompany(prior.runtime, digestOf(token))).toBe(false);
    expect((await prior.admin.query("SELECT row_to_json(j) value FROM app.job j WHERE practice_session_digest=$1 ORDER BY id", [digestOf(token)])).rows).toEqual(before.rows);
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
