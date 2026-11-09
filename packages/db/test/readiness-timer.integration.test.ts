import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { DurableReadinessStore } from "../../../apps/api/src/readiness-store.js";
import { type ScheduledPlan } from "../../../apps/api/src/readiness-scheduler.js";

let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, infrastructure: Pool;
const tenantId = randomUUID(), other = randomUUID(), context = testTenantContext(tenantId);
const scope = { tenantId, jobId: randomUUID(), taskId: randomUUID() };
import { readinessTasks } from "../../../apps/api/src/readiness-task.js";
import { verifiedTenantContextForQueuedJob } from "../src/index.js";
type TaskList = ReturnType<typeof readinessTasks>["tasks"];
type JobHelpers = Parameters<NonNullable<TaskList[string]>>[1];
let at = "2026-03-27T08:00:00.000Z";
const plan: ScheduledPlan = { version: "readiness-scheduled-plan.v1", synthetic: true, scope, factRevision: 1,
  ruleRevision: "readiness-scheduled.v1", status: "confirmed", plannedDate: "2026-03-30", jurisdiction: "scotland",
  localTime: "09:00", timeZone: "Europe/London", predecessors: [], edges: [], material: { requiredUnits: 1, landedUnits: 1 }, access: "unknown", crew: true };
const store = () => new DurableReadinessStore(runtime, "synthetic_demo");
async function actorFor(tenant: string) {
 const member = (await admin.query("SELECT id,identity_user_id FROM app.membership WHERE tenant_id=$1 AND role='owner' LIMIT 1", [tenant])).rows[0]!;
 return { membershipId: member.id, identityUserId: member.identity_user_id };
}
const queue: { name: string; payload: unknown; options: { runAt?: Date; jobKey: string } }[] = [];
const helpers = {
 async addJob(name: string, payload: unknown, options: { runAt?: Date; jobKey: string }) { queue.push({ name, payload, options }); return {}; },
 async withPgClient(fn: (client: import("pg").PoolClient) => Promise<unknown>) { const c = await infrastructure.connect(); try { return await fn(c); } finally { c.release(); } },
} as unknown as JobHelpers;
function tasks(): TaskList {
 return readinessTasks(runtime, "synthetic_demo", (store, scope) => {
 const context = verifiedTenantContextForQueuedJob(scope.tenantId);
 return {load: raw => store.load(context, raw), recordProposal: raw => store.recordProposal(context, raw)};
 }, () => at).tasks;
}
beforeAll(async () => {
 const databaseDir = await mkdtemp(join(tmpdir(), "jg-readiness-timer-")), port = await freePort(59700, 100);
 pg = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "synthetic", persistent: false,
  createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await pg.initialise(); await pg.start();
 const connection = { host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres", max: 2 };
 const bootstrap = new Pool(connection);
 await bootstrap.query("CREATE DATABASE jobguard_synthetic_demo");
 await bootstrap.end();
 connection.database = "jobguard_synthetic_demo";
 admin = new Pool(connection); await migrate(admin);
 runtime = new Pool({ ...connection, options: "-c role=jobguard_runtime" });
 infrastructure = new Pool({ ...connection, options: "-c role=jobguard_infrastructure" });
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenantId, other]);
 await importWatchdogFixtureJob(admin, tenantId, scope.jobId);
}, 120_000);
afterAll(async () => { await closeTestPools(infrastructure, runtime, admin); await pg?.stop(); });

it("discovers latest identifiers through FORCE RLS, restores caller context and grants only EXECUTE", async () => {
 // Discovery uses the database clock; scheduling below retains fixed DST dates.
 const today = (await admin.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London','YYYY-MM-DD') today")).rows[0].today as string;
 await store().confirm(context, await actorFor(tenantId), { ...plan, plannedDate: today });
 const client = await infrastructure.connect();
 try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)", [other]);
  expect((await client.query("SELECT * FROM infrastructure.discover_readiness_plans()")).rows).toEqual([
   { tenant_id: tenantId, job_id: scope.jobId, task_id: scope.taskId },
  ]);
  expect((await client.query("SELECT current_setting('app.tenant_id') tenant")).rows[0].tenant).toBe(other);
  await client.query("ROLLBACK");
 } finally { client.release(); }
 await expect(infrastructure.query("SELECT * FROM app.scheduled_readiness_plan")).rejects.toMatchObject({ code: "42501" });
 await expect(runtime.query("SELECT * FROM infrastructure.discover_readiness_plans()")).rejects.toMatchObject({ code: "42501" });
});
it("the real task schedules the previous workday across DST; concurrent executions and crash replay persist one prevention proposal", async () => {
 const foreignScope = { tenantId: other, jobId: randomUUID(), taskId: randomUUID() };
 await importWatchdogFixtureJob(admin, other, foreignScope.jobId);
 await store().confirm(testTenantContext(other), await actorFor(other), { ...plan, scope: foreignScope });
 const today = (await admin.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London','YYYY-MM-DD') today")).rows[0].today as string;
 await store().confirm(context, await actorFor(tenantId), { ...plan, factRevision: 2, plannedDate: today });
 const beforeJob = (await admin.query("SELECT to_jsonb(j) payload FROM app.job j WHERE tenant_id=$1 AND id=$2", [tenantId, scope.jobId])).rows;
 await tasks().discover_readiness_plans!(null, helpers);
 const scheduled = queue.find(q => q.name === "readiness_schedule" && (q.payload as {scope: typeof scope}).scope.tenantId === tenantId)!;
 await store().confirm(context, await actorFor(tenantId), { ...plan, factRevision: 3 });
 await Promise.all([tasks().readiness_schedule!(scheduled.payload, helpers), tasks().readiness_schedule!(scheduled.payload, helpers)]);
 const evaluation = queue.find(q => q.name === "readiness_evaluate")!;
 expect(evaluation.options.runAt).toEqual(new Date("2026-03-27T09:00:00.000Z"));
 at = "2026-03-27T08:59:00.000Z";
 await expect(tasks().readiness_evaluate!(evaluation.payload, helpers)).rejects.toThrow("READINESS_NOT_DUE");
 expect(await store().proposals(context, scope)).toEqual([]);
 at = "2026-03-27T09:00:00.000Z";
 await Promise.all([tasks().readiness_evaluate!(evaluation.payload, helpers), tasks().readiness_evaluate!(evaluation.payload, helpers)]);
 // Reconstruct after persistence, as when a worker dies before acknowledging the job.
 at = "2026-03-27T09:01:00.000Z";
 await tasks().readiness_evaluate!(evaluation.payload, helpers);
 const proposals = await store().proposals(context, scope);
 expect(proposals).toHaveLength(1);
 expect(proposals[0]).toMatchObject({ reasons: ["Access availability unknown"], classification: "prevention", recoveryFeePence: 0,
  feeEligible: false, programmeChanged: false, status: "proposal" });
 expect(await store().proposals(testTenantContext(other), scope)).toEqual([]);
 expect(await store().proposals(testTenantContext(other), foreignScope)).toEqual([]);
 expect((await admin.query("SELECT to_jsonb(j) payload FROM app.job j WHERE tenant_id=$1 AND id=$2", [tenantId, scope.jobId])).rows).toEqual(beforeJob);
 await store().confirm(context, await actorFor(tenantId), { ...plan, factRevision: 4, status: "cancelled", plannedDate: today });
 await tasks().readiness_evaluate!(evaluation.payload, helpers);
 expect(await store().proposals(context, scope)).toEqual(proposals);
 expect((await infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans() WHERE tenant_id=$1", [tenantId])).rows).toEqual([]);
});

it("through the real task preserves each missing-fact reason and Scottish holiday timing; ready work has no risk", async () => {
 const cases: { patch: Partial<ScheduledPlan>; reasons: string[] }[] = [
  { patch: { access: true }, reasons: [] },
  { patch: { access: false }, reasons: ["Access is not available"] },
  { patch: { access: "unknown" }, reasons: ["Access availability unknown"] },
  { patch: { access: true, crew: "unknown" }, reasons: ["Crew availability unknown"] },
  { patch: { access: true, material: { requiredUnits: 1, landedUnits: 0 } }, reasons: ["1 units still needed"] },
  { patch: { access: true, edges: [{ taskId: scope.taskId, dependsOnTaskId: randomUUID() }] }, reasons: ["Predecessor completion unknown"] },
 ];
 for (const [i, entry] of cases.entries()) {
  const current = { ...plan, ...entry.patch, factRevision: i + 5, plannedDate: "2026-01-05" };
  at = "2026-01-01T08:00:00.000Z"; queue.length = 0;
  await store().confirm(context, await actorFor(tenantId), current);
  await tasks().readiness_schedule!({ version: "readiness-schedule-task.v1", scope }, helpers);
  const evaluation = queue.find(q => q.name === "readiness_evaluate")!;
  // Fictional Scottish fixture closes Friday 2 January: Thursday is the preceding workday.
  expect(evaluation.options.runAt).toEqual(new Date("2026-01-01T09:00:00.000Z"));
  at = "2026-01-01T09:00:00.000Z";
  await tasks().readiness_evaluate!(evaluation.payload, helpers);
  const proposals = await store().proposals(context, scope);
  expect(proposals.at(-1)).toMatchObject({ ready: entry.reasons.length === 0, reasons: entry.reasons,
   status: "proposal", programmeChanged: false, classification: "prevention", feeEligible: false, recoveryFeePence: 0 });
 }
});
it("leaves uncovered calendar years unqueued and supersedes a changed revision", async () => {
 at = "2028-01-04T08:00:00.000Z"; queue.length = 0;
 await store().confirm(context, await actorFor(tenantId), { ...plan, factRevision: 11, plannedDate: "2028-01-05" });
 await tasks().readiness_schedule!({ version: "readiness-schedule-task.v1", scope }, helpers);
 expect(queue).toEqual([]);
 at = "2026-10-23T08:00:00.000Z";
 await store().confirm(context, await actorFor(tenantId), { ...plan, factRevision: 12, plannedDate: "2026-10-26" });
 await tasks().readiness_schedule!({ version: "readiness-schedule-task.v1", scope }, helpers);
 const evaluation = queue.find(q => q.name === "readiness_evaluate")!;
 await store().confirm(context, await actorFor(tenantId), { ...plan, factRevision: 13, plannedDate: "2026-10-27" });
 const before = await store().proposals(context, scope);
 at = "2026-10-26T10:00:00.000Z";
 await tasks().readiness_evaluate!(evaluation.payload, helpers);
 expect(await store().proposals(context, scope)).toEqual(before);
});

it("rejects infrastructure discovery in a non-synthetic database", async () => {
 const connection = { ...admin.options, password: "synthetic", database: "postgres", max: 2 };
 const nonSynthetic = new Pool(connection);
 const worker = new Pool({ ...connection, options: "-c role=jobguard_infrastructure" });
 try {
  await nonSynthetic.query("CREATE SCHEMA infrastructure");
  await nonSynthetic.query("GRANT USAGE ON SCHEMA infrastructure TO jobguard_infrastructure");
  // The guard runs before table access in this second database.
  await nonSynthetic.query(await readFile(new URL("../migrations/0684_readiness_discovery_guard.sql", import.meta.url), "utf8"));
  await expect(worker.query("SELECT * FROM infrastructure.discover_readiness_plans()"))
   .rejects.toMatchObject({ code: "42501", message: "MODE_FORBIDDEN" });
 } finally { await closeTestPools(worker, nonSynthetic); }
});

it("past confirmed plans cannot consume the cap ahead of another tenant's due plan", async () => {
 const early = "00000000-0000-4000-8000-000000000001", late = "ffffffff-ffff-4fff-bfff-ffffffffffff";
 const earlyJob = randomUUID(), lateJob = randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [early, late]);
 await importWatchdogFixtureJob(admin, early, earlyJob);
 await importWatchdogFixtureJob(admin, late, lateJob);
 const dates = (await admin.query(`SELECT
  to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Pacific/Kiritimati')::date - 1,'YYYY-MM-DD') past,
  to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Pacific/Kiritimati','YYYY-MM-DD') today`)).rows[0];
 for (let i = 0; i < 101; i++) {
  const pastScope = { tenantId: early, jobId: earlyJob, taskId: randomUUID() };
  if (i === 0) await store().confirm(testTenantContext(early), await actorFor(early), { ...plan,
   scope: pastScope, plannedDate: dates.today, timeZone: "Pacific/Kiritimati" });
  await store().confirm(testTenantContext(early), await actorFor(early), { ...plan,
   scope: pastScope, factRevision: i === 0 ? 2 : 1,
   plannedDate: dates.past, timeZone: "Pacific/Kiritimati" });
 }
 const dueScope = { tenantId: late, jobId: lateJob, taskId: randomUUID() };
 await store().confirm(testTenantContext(late), await actorFor(late), { ...plan,
  scope: dueScope, plannedDate: dates.today, timeZone: "Pacific/Kiritimati" });
 const rows = (await infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans()")).rows;
 expect(rows).toContainEqual({ tenant_id: late, job_id: lateJob, task_id: dueScope.taskId });
 expect(rows.some(row => row.tenant_id === early)).toBe(false);
 expect(rows.length).toBeLessThanOrEqual(100);
 expect(rows.every(row => Object.keys(row).sort().join() === "job_id,task_id,tenant_id")).toBe(true);
}, 120_000);

it("skips unknown PostgreSQL time zones without blocking another tenant's due plan", async () => {
 const badTenant = "00000000-0000-4000-8000-000000000002";
 const goodTenant = "00000000-0000-4000-8000-000000000003";
 const badJob = randomUUID(), goodJob = randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [badTenant, goodTenant]);
 await importWatchdogFixtureJob(admin, badTenant, badJob);
 await importWatchdogFixtureJob(admin, goodTenant, goodJob);
 const today = (await admin.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD') today")).rows[0].today as string;
 const badScopes = [];
 for (const timeZone of ["JobGuard/Unknown", "Synthetic/Nowhere"]) {
  expect((await admin.query("SELECT name FROM pg_catalog.pg_timezone_names WHERE name=$1", [timeZone])).rows).toEqual([]);
  const badScope = { tenantId: badTenant, jobId: badJob, taskId: randomUUID() };
  badScopes.push(badScope);
  await store().confirm(testTenantContext(badTenant), await actorFor(badTenant), { ...plan,
   scope: badScope, plannedDate: today, timeZone: "UTC" });
  // Seed a stored revision directly, as in the store tests: discovery must tolerate
  // zones PostgreSQL does not know without changing the TypeScript validator.
  const payload = { ...plan, scope: badScope, factRevision: 2, plannedDate: today, timeZone };
  const { createHash } = await import("node:crypto");
  await admin.query(`INSERT INTO app.scheduled_readiness_plan(tenant_id,job_id,task_id,fact_revision,plan_hash,payload,audit_event_id)
   SELECT tenant_id,job_id,task_id,2,$4,$5,audit_event_id FROM app.scheduled_readiness_plan
   WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 AND fact_revision=1`,
   [badTenant, badJob, badScope.taskId, createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload]);
 }
 const goodScope = { tenantId: goodTenant, jobId: goodJob, taskId: randomUUID() };
 await store().confirm(testTenantContext(goodTenant), await actorFor(goodTenant), { ...plan,
  scope: goodScope, plannedDate: today, timeZone: "UTC" });
 // Failing-first proof on real PostgreSQL, then restore the new routine even if
 // the assertion fails. The six existing timer tests keep their assertions.
 try {
  await admin.query(await readFile(new URL("../migrations/0684_readiness_discovery_guard.sql", import.meta.url), "utf8"));
  await expect(infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans()"))
   .rejects.toMatchObject({ code: "22023" });
 } finally {
  await admin.query(await readFile(new URL("../migrations/0685_readiness_bad_timezone.sql", import.meta.url), "utf8"));
 }
 const rows = (await infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans()")).rows;
 expect(rows).toContainEqual({ tenant_id: goodTenant, job_id: goodJob, task_id: goodScope.taskId });
 for (const badScope of badScopes) expect(rows).not.toContainEqual({
  tenant_id: badTenant, job_id: badJob, task_id: badScope.taskId,
 });
 expect(rows.some(row => row.tenant_id === badTenant)).toBe(false);
});

it.each(["europe/london", "EUROPE/LONDON", "utc"])("discovers a confirmed due plan with case-variant time zone %s", async timeZone => {
 const caseTenant = randomUUID(), caseJob = randomUUID();
 const caseScope = { tenantId: caseTenant, jobId: caseJob, taskId: randomUUID() };
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [caseTenant]);
 await importWatchdogFixtureJob(admin, caseTenant, caseJob);
 const today = (await admin.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE $1,'YYYY-MM-DD') today", [timeZone])).rows[0].today as string;
 // Use the real confirmation boundary: these names pass its time-zone validator.
 await store().confirm(testTenantContext(caseTenant), "member:synthetic-builder", { ...plan,
  scope: caseScope, plannedDate: today, timeZone });
 const expected = { tenant_id: caseTenant, job_id: caseJob, task_id: caseScope.taskId };
 // Prove the old routine silently excludes the confirmed plan, then restore
 // 1053 even if the failing-first assertion fails.
 try {
  await admin.query(await readFile(new URL("../migrations/0685_readiness_bad_timezone.sql", import.meta.url), "utf8"));
  const before = (await infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans()")).rows;
  expect(before).not.toContainEqual(expected);
 } finally {
  await admin.query(await readFile(new URL("../migrations/0720_readiness_timezone_case.sql", import.meta.url), "utf8"));
 }
 const after = (await infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans()")).rows;
 expect(after).toContainEqual(expected);
});

it("skips an unknown zone while discovering a valid due plan in the same tenant", async () => {
 await admin.query(await readFile(new URL("../migrations/0720_readiness_timezone_case.sql", import.meta.url), "utf8"));
 const mixedTenant = randomUUID(), mixedJob = randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [mixedTenant]);
 await importWatchdogFixtureJob(admin, mixedTenant, mixedJob);
 const mixedContext = testTenantContext(mixedTenant);
 const badScope = { tenantId: mixedTenant, jobId: mixedJob, taskId: randomUUID() };
 const goodScope = { tenantId: mixedTenant, jobId: mixedJob, taskId: randomUUID() };
 const today = (await admin.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD') today")).rows[0].today as string;
 await store().confirm(mixedContext, "member:synthetic-builder", { ...plan,
  scope: badScope, plannedDate: today, timeZone: "UTC" });
 const timeZone = "JobGuard/Unknown";
 expect((await admin.query("SELECT name FROM pg_catalog.pg_timezone_names WHERE lower(name)=lower($1)", [timeZone])).rows).toEqual([]);
 const payload = { ...plan, scope: badScope, factRevision: 2, plannedDate: today, timeZone };
 const { createHash } = await import("node:crypto");
 await admin.query(`INSERT INTO app.scheduled_readiness_plan(tenant_id,job_id,task_id,fact_revision,plan_hash,payload,audit_event_id)
  SELECT tenant_id,job_id,task_id,2,$4,$5,audit_event_id FROM app.scheduled_readiness_plan
  WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 AND fact_revision=1`,
  [mixedTenant, mixedJob, badScope.taskId, createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload]);
 await store().confirm(mixedContext, "member:synthetic-builder", { ...plan,
  scope: goodScope, plannedDate: today, timeZone: "utc" });
 const rows = (await infrastructure.query("SELECT * FROM infrastructure.discover_readiness_plans() WHERE tenant_id=$1", [mixedTenant])).rows;
 expect(rows).toEqual([{ tenant_id: mixedTenant, job_id: mixedJob, task_id: goodScope.taskId }]);
});
