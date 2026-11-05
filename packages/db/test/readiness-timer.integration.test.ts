import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
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
 admin = new Pool(connection); await migrate(admin);
 runtime = new Pool({ ...connection, options: "-c role=jobguard_runtime" });
 infrastructure = new Pool({ ...connection, options: "-c role=jobguard_infrastructure" });
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenantId, other]);
 await importWatchdogFixtureJob(admin, tenantId, scope.jobId);
}, 120_000);
afterAll(async () => { await closeTestPools(infrastructure, runtime, admin); await pg?.stop(); });

it("discovers latest identifiers through FORCE RLS, restores caller context and grants only EXECUTE", async () => {
 await store().confirm(context, "member:synthetic-builder", plan);
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
 await store().confirm(testTenantContext(other), "member:synthetic-builder", { ...plan, scope: foreignScope });
 const beforeJob = (await admin.query("SELECT to_jsonb(j) payload FROM app.job j WHERE tenant_id=$1 AND id=$2", [tenantId, scope.jobId])).rows;
 await tasks().discover_readiness_plans!(null, helpers);
 const scheduled = queue.find(q => q.name === "readiness_schedule" && (q.payload as {scope: typeof scope}).scope.tenantId === tenantId)!;
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
 await store().confirm(context, "member:synthetic-builder", { ...plan, factRevision: 2, status: "cancelled" });
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
  const current = { ...plan, ...entry.patch, factRevision: i + 3, plannedDate: "2026-01-05" };
  at = "2026-01-01T08:00:00.000Z"; queue.length = 0;
  await store().confirm(context, "member:synthetic-builder", current);
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
 at = "2027-01-04T08:00:00.000Z"; queue.length = 0;
 await store().confirm(context, "member:synthetic-builder", { ...plan, factRevision: 9, plannedDate: "2027-01-05" });
 await tasks().readiness_schedule!({ version: "readiness-schedule-task.v1", scope }, helpers);
 expect(queue).toEqual([]);
 at = "2026-10-23T08:00:00.000Z";
 await store().confirm(context, "member:synthetic-builder", { ...plan, factRevision: 10, plannedDate: "2026-10-26" });
 await tasks().readiness_schedule!({ version: "readiness-schedule-task.v1", scope }, helpers);
 const evaluation = queue.find(q => q.name === "readiness_evaluate")!;
 await store().confirm(context, "member:synthetic-builder", { ...plan, factRevision: 11, plannedDate: "2026-10-27" });
 const before = await store().proposals(context, scope);
 at = "2026-10-26T10:00:00.000Z";
 await tasks().readiness_evaluate!(evaluation.payload, helpers);
 expect(await store().proposals(context, scope)).toEqual(before);
});
