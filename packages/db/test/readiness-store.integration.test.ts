import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrate, MIGRATION_URLS, withTenant } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { DurableReadinessStore } from "../../../apps/api/src/readiness-store.js";
import { DarkReadinessScheduler, type ReadinessSchedulePorts, type ScheduledPlan } from "../../../apps/api/src/readiness-scheduler.js";
import { refusedLiveReadinessAdapters } from "../../../apps/api/src/readiness-adapters.js";

let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool;
const tenantId = randomUUID(), other = randomUUID(), context = testTenantContext(tenantId);
const scope = { tenantId, jobId: randomUUID(), taskId: randomUUID() };
const now = "2026-10-30T12:00:00.000Z", due = "2026-11-02T09:00:00.000Z";
const plan: ScheduledPlan = { version: "readiness-scheduled-plan.v1", synthetic: true, scope, factRevision: 1,
  ruleRevision: "readiness-scheduled.v1", status: "confirmed", plannedDate: "2026-11-02", jurisdiction: "england-and-wales",
  localTime: "09:00", timeZone: "Europe/London", predecessors: [], edges: [], material: { requiredUnits: 1, landedUnits: 1 }, access: "unknown", crew: true };
const store = () => new DurableReadinessStore(runtime, "synthetic_demo");
const ports = (): ReadinessSchedulePorts => ({
  load: raw => store().load(context, raw),
  loadJobPlans: raw => store().loadJobPlans(context, raw),
  recordProposal: raw => store().recordProposal(context, raw),
});
const tableNames = ["scheduled_readiness_plan", "scheduled_readiness_proposal"];
beforeAll(async () => {
  const databaseDir = await mkdtemp(join(tmpdir(), "jg-readiness-store-")), port = await freePort(59600, 100);
  pg = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" });
  // Upgrade from the exact predecessor set, then apply the new migration through the real registry.
  for (const url of MIGRATION_URLS) {
    if (url.pathname.endsWith("/0588_scheduled_readiness_store.sql")) break;
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(url, "utf8");
    await admin.query(url.pathname.endsWith("/0095_job_parties.sql") ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : sql);
  }
  // Predecessors are tracked here so migrate proves the additive upgrade rather than recreating tables.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS) {
    if (url.pathname.endsWith("/0588_scheduled_readiness_store.sql")) break;
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenantId, other]);
  await importWatchdogFixtureJob(admin, tenantId, scope.jobId);
  const previousJob = (await admin.query("SELECT to_jsonb(j) payload FROM app.job j WHERE tenant_id=$1 AND id=$2", [tenantId, scope.jobId])).rows;
  await migrate(admin); await migrate(admin);
  expect((await admin.query("SELECT to_jsonb(j) payload FROM app.job j WHERE tenant_id=$1 AND id=$2", [tenantId, scope.jobId])).rows).toEqual(previousJob);
  runtime = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres", max: 2, options: "-c role=jobguard_runtime" });
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); });

it("persists confirmed facts and unknown adapter outcomes across store/scheduler reconstruction; concurrent replay makes one row and audit", async () => {
  await store().confirm(context, "member:synthetic-builder", plan);
  await store().confirm(context, "member:synthetic-builder", plan);
  expect(await store().load(context, scope)).toEqual(plan);
  const adapters = { weather: async () => ({ suitable: true }), holidays: async () => ({ version: "readiness-holidays.v1", synthetic: true, revision: "fixture.v1", observedAt: now,
    expiresAt: "2026-12-01T00:00:00.000Z", jurisdiction: "england-and-wales", from: "2026-01-01", through: "2026-12-31", holidays: [] }) };
  const addJob = vi.fn(async (..._args: unknown[]) => ({}));
  await new DarkReadinessScheduler(adapters, ports(), "synthetic_demo").schedule(scope, now, { addJob } as unknown as Parameters<DarkReadinessScheduler["schedule"]>[2]);
  const task = addJob.mock.calls[0]![1];
  await Promise.all([due, "2026-11-02T09:01:00.000Z"].map(at => new DarkReadinessScheduler(adapters, ports(), "synthetic_demo").execute(task, at)));
  const rows = await store().proposals(context, scope);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ weather: "unknown", ready: false, reasons: ["Access availability unknown", "Weather availability unknown"], feeEligible: false, recoveryFeePence: 0, programmeChanged: false });
  const counts = await admin.query("SELECT event_type,count(*)::int n FROM app.audit_event WHERE tenant_id=$1 GROUP BY event_type", [tenantId]);
  expect(counts.rows).toEqual(expect.arrayContaining([{ event_type: "readiness.scheduled_plan_confirmed", n: 1 }, { event_type: "readiness.scheduled_proposal_recorded", n: 1 }]));
  await expect(store().recordProposal(context, { ...rows[0]!, reasons: ["forged"] })).rejects.toThrow("READINESS_STORE_CONFLICT");
  await expect(store().confirm(context, "member:synthetic-builder", { ...plan, access: false })).rejects.toThrow("READINESS_STORE_CONFLICT");
  // A second version changes readiness without mutating history; an old evaluation cannot write against it.
  await store().confirm(context, "member:synthetic-builder", { ...plan, factRevision: 2, status: "cancelled" });
  await expect(store().recordProposal(context, rows[0]!)).rejects.toThrow("READINESS_STORE_CONFLICT");
  expect(await store().proposals(context, scope)).toEqual(rows);
  await expect(new DarkReadinessScheduler(refusedLiveReadinessAdapters, ports()).execute(task, due)).rejects.toThrow("READINESS_LIVE_DISABLED");
  await expect(refusedLiveReadinessAdapters.weather({ scope, date: plan.plannedDate })).rejects.toThrow("READINESS_LIVE_DISABLED");
});
it("isolates tenant/job/task reads, denies cross-tenant writes and prevents runtime mutations", async () => {
  const foreign = new DurableReadinessStore(runtime, "synthetic_demo");
  expect(await foreign.load(testTenantContext(other), scope)).toBeNull(); expect(await foreign.proposals(testTenantContext(other), scope)).toEqual([]);
  for (const changed of [{ ...scope, jobId: randomUUID() }, { ...scope, taskId: randomUUID() }]) {
    expect(await store().load(context, changed)).toBeNull(); expect(await store().proposals(context, changed)).toEqual([]);
  }
  expect((await runtime.query("SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows).toEqual([{ role: "jobguard_runtime", rolsuper: false, rolbypassrls: false }]);
  for (const table of tableNames) {
    expect((await admin.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,
      has_table_privilege('jobguard_infrastructure',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') infrastructure
      FROM pg_class c WHERE c.oid=$1::regclass`, [`app.${table}`])).rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", infrastructure: false }]);
    expect((await withTenant(runtime, testTenantContext(other), db => db.$client.query(`SELECT * FROM app.${table}`))).rows).toEqual([]);
    for (const sql of [`UPDATE app.${table} SET payload='{}'`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) {
      await expect(withTenant(runtime, context, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
  }
  const stored = (await admin.query("SELECT * FROM app.scheduled_readiness_plan WHERE tenant_id=$1 LIMIT 1", [tenantId])).rows[0];
  await expect(withTenant(runtime, testTenantContext(other), db => db.$client.query(`INSERT INTO app.scheduled_readiness_plan(tenant_id,job_id,task_id,fact_revision,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, scope.jobId, scope.taskId, 3, stored.plan_hash, stored.payload, stored.audit_event_id]))).rejects.toMatchObject({ code: "42501" });
});
it("rolls plan writes back when audit fails and binds all plan/proposal identities", async () => {
  const before = (await admin.query("SELECT count(*)::int n FROM app.scheduled_readiness_plan")).rows;
  await expect(store().confirm(context, "invalid actor secret text", { ...plan, factRevision: 3 })).rejects.toThrow();
  expect((await admin.query("SELECT count(*)::int n FROM app.scheduled_readiness_plan")).rows).toEqual(before);
  const p = (await admin.query("SELECT payload,audit_event_id FROM app.scheduled_readiness_proposal LIMIT 1")).rows[0];
  await expect(withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.scheduled_readiness_proposal(tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, randomUUID(), scope.taskId, "c".repeat(64), p.payload.planHash, { ...p.payload, key: "c".repeat(64) }, p.audit_event_id]))).rejects.toMatchObject({ code: "23514" });
  const wrongJob = randomUUID(); await importWatchdogFixtureJob(admin, tenantId, wrongJob);
  await expect(withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.scheduled_readiness_proposal(tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, wrongJob, scope.taskId, "e".repeat(64), p.payload.planHash, { ...p.payload, key: "e".repeat(64), scope: { ...scope, jobId: wrongJob } }, p.audit_event_id]))).rejects.toMatchObject({ code: "23503" });
  await expect(withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.scheduled_readiness_proposal(tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, scope.jobId, scope.taskId, "f".repeat(64), p.payload.planHash, { ...p.payload, key: "f".repeat(64) }, randomUUID()]))).rejects.toMatchObject({ code: "23503" });
  expect((await admin.query("SELECT count(*)::int n FROM app.scheduled_readiness_proposal")).rows).toEqual([{ n: 1 }]);
  await expect(withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.scheduled_readiness_proposal(tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, scope.jobId, scope.taskId, "d".repeat(64), p.payload.planHash, { ...p.payload, key: "d".repeat(64), recoveryFeePence: 1 }, p.audit_event_id]))).rejects.toMatchObject({ code: "23514" });
});


it("reads latest confirmed plans in one tenant/job and proposes without writing programme facts", async () => {
  const jobId = randomUUID(), otherJob = randomUUID(), foreignJob = randomUUID();
  await importWatchdogFixtureJob(admin, tenantId, jobId);
  await importWatchdogFixtureJob(admin, tenantId, otherJob);
  await importWatchdogFixtureJob(admin, other, foreignJob);
  const blocked = { ...plan, scope: { tenantId, jobId, taskId: randomUUID() },
    labourRatePence: 999_999_999_999, uncertainDurationHours: 1 };
  const next = { ...blocked, scope: { tenantId, jobId, taskId: randomUUID() }, access: true as const, plannedDate: "2026-11-03" };
  const cancelled = { ...next, scope: { ...next.scope, taskId: randomUUID() } };
  for (const p of [blocked, next, cancelled, { ...next, scope: { ...next.scope, jobId: otherJob } }])
    await store().confirm(context, "member:synthetic-builder", p);
  await store().confirm(context, "member:synthetic-builder", { ...cancelled, factRevision: 2, status: "cancelled" });
  await store().confirm(testTenantContext(other), "member:synthetic-builder", { ...next, scope: { ...next.scope, tenantId: other, jobId: foreignJob } });
  expect(await store().loadJobPlans(context, blocked.scope)).toEqual(expect.arrayContaining([blocked, next]));
  expect(await store().loadJobPlans(context, blocked.scope)).toHaveLength(2);
  expect(await store().loadJobPlans(testTenantContext(other), blocked.scope)).toEqual([]);
  const snapshot = async () => (await admin.query("SELECT to_jsonb(p) AS row FROM app.scheduled_readiness_plan p ORDER BY tenant_id,job_id,task_id,fact_revision")).rows;
  const before = await snapshot();
  const adapters = { weather: async () => null, holidays: async () => ({ version: "readiness-holidays.v1", synthetic: true,
    revision: "fixture.v1", observedAt: now, expiresAt: "2026-12-01T00:00:00.000Z", jurisdiction: "england-and-wales",
    from: "2026-01-01", through: "2026-12-31", holidays: [] }) };
  const addJob = vi.fn(async (..._args: unknown[]) => ({}));
  const scheduler = new DarkReadinessScheduler(adapters, ports(), "synthetic_demo");
  await scheduler.schedule(blocked.scope, now, { addJob } as unknown as Parameters<DarkReadinessScheduler["schedule"]>[2]);
  const task = addJob.mock.calls[0]![1];
  await scheduler.execute(task, due); await scheduler.execute(task, due);
  expect(await snapshot()).toEqual(before);
  const proposals = await store().proposals(context, blocked.scope);
  expect(proposals).toHaveLength(1);
  expect(proposals[0]).toMatchObject({ labourExposurePence: 999_999_999_999,
    resequence: [{ taskId: next.scope.taskId, fromDate: next.plannedDate, toDate: blocked.plannedDate }],
    programmeChanged: false, classification: "prevention", feeEligible: false, recoveryFeePence: 0 });
  // Only a human confirmation creates the new fact revision and supersedes the queued evaluation.
  await store().confirm(context, "member:synthetic-builder", { ...blocked, factRevision: 2, plannedDate: "2026-11-04" });
  expect(await scheduler.execute(task, due)).toBe("superseded");
  expect(await store().load(context, blocked.scope)).toMatchObject({ factRevision: 2, plannedDate: "2026-11-04" });
});
