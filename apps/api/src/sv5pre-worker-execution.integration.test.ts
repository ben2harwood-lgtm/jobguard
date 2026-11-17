import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { makeWorkerUtils, run, type Runner, type TaskList, type WorkerUtils } from "graphile-worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@jobguard/db";
import { registerFinalCheckTask } from "./worker-task-extensions.js";

const requireDb = createRequire(new URL("../../../packages/db/package.json", import.meta.url));
const EmbeddedPostgres = requireDb("embedded-postgres").default;
const { freePort, closeTestPools } = await import(new URL("../../../packages/db/test/pool-test-utils.ts", import.meta.url).href);
const credential = randomUUID();
const task = { version: "final-check-task.v1", tenantId: randomUUID(), jobId: randomUUID(), lockId: randomUUID(), manifestId: randomUUID(), executionId: randomUUID() };
let postgres: InstanceType<typeof EmbeddedPostgres>, admin: Pool, utilities: WorkerUtils, port: number;
let runner: Runner | undefined, entrypoint: ChildProcess | undefined;
const root = fileURLToPath(new URL("../../../", import.meta.url));
function connection(user: string) {
  const address = new URL("postgresql://127.0.0.1"); address.username = user; address.port = String(port); address.pathname = "postgres";
  address.password = credential;
  return address.href;
}
async function until(predicate: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function stopEntrypoint() {
  const child = entrypoint; entrypoint = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  if (child.pid) process.kill(-child.pid, "SIGTERM");
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    process.kill(-child.pid, "SIGKILL"); await exited;
  }
}
async function domainCounts() {
  const names = await admin.query<{ schema: string; name: string }>(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','audit') AND c.relkind='r' ORDER BY 1,2`);
  const counts: Record<string, string> = {};
  for (const { schema, name } of names.rows) counts[`${schema}.${name}`] = (await admin.query<{ count: string }>(`SELECT count(*)::text AS count FROM "${schema}"."${name}"`)).rows[0]!.count;
  return counts;
}

beforeAll(async () => {
  const databaseDir = await mkdtemp(join(tmpdir(), "jobguard-sv5pre-worker-")); port = await freePort(57300, 300);
  // Keep the disposable data directory for inspection; this order does not delete files.
  postgres = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: credential, persistent: true,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential, database: "postgres", max: 2 });
  await migrate(admin);
  for (const [login, group] of [["sv5pre_worker_runtime", "jobguard_runtime"], ["sv5pre_worker_shadow", "jobguard_shadow"], ["sv5pre_worker_graphile", "jobguard_infrastructure"]]) {
    await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`);
    await admin.query(`ALTER ROLE ${login} PASSWORD '${credential}'`); await admin.query(`GRANT ${group} TO ${login}`);
  }
  // Graphile enables RLS without caller policies on its private queue tables.
  // Install as the queue login so it owns those tables; table grants alone cannot satisfy RLS.
  // CREATE is temporary and confined to this disposable test database.
  await admin.query("GRANT CREATE ON DATABASE postgres TO sv5pre_worker_graphile");
  try {
    utilities = await makeWorkerUtils({ connectionString: connection("sv5pre_worker_graphile"), maxPoolSize: 2 });
    await utilities.migrate();
  } finally {
    await admin.query("REVOKE CREATE ON DATABASE postgres FROM sv5pre_worker_graphile");
  }
}, 90_000);
afterAll(async () => { await stopEntrypoint(); await runner?.stop(); await utilities?.release(); await closeTestPools(admin); await postgres?.stop(); });

describe("SV5PRE actual Graphile execution", () => {
  it("PRE-Q6 r10 the queue login owns Graphile tables without business privileges or RLS bypass", async () => {
    const tables = await admin.query<{ owner: string; relforcerowsecurity: boolean }>(`SELECT pg_get_userbyid(c.relowner) AS owner,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='graphile_worker' AND c.relkind='r'`);
    expect(tables.rows.length).toBeGreaterThan(0);
    for (const table of tables.rows) expect(table).toEqual({ owner: "sv5pre_worker_graphile", relforcerowsecurity: false });
    expect((await admin.query(`SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,
      has_database_privilege(rolname,'postgres','CREATE') AS database_create,
      has_table_privilege(rolname,'app.job','INSERT') AS business_insert,
      pg_has_role(rolname,'jobguard_runtime','MEMBER') AS business_role
      FROM pg_roles WHERE rolname='sv5pre_worker_graphile'`)).rows).toEqual([{
      rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false,
      database_create: false, business_insert: false, business_role: false,
    }]);
  });

  it("PRE-Q6-03 PRE-Q6-06 a durable registered task reaches its handler after worker restart", async () => {
    runner = await run({ connectionString: connection("sv5pre_worker_graphile"), taskList: { unused_fixture_task: async () => undefined }, concurrency: 1, pollInterval: 100 });
    await runner.stop(); runner = undefined;
    const queued = await utilities.addJob("final_check", task, { maxAttempts: 1, jobKey: `sv5pre-restart:${task.executionId}` });
    expect((await admin.query("SELECT payload FROM graphile_worker._private_jobs WHERE id=$1", [queued.id])).rows[0]!.payload).toEqual(task);
    let received: unknown;
    const tasks: TaskList = {};
    // This is an injected domain port, not the installed SV-5 handler.
    registerFinalCheckTask(tasks, async payload => { received = payload; });
    runner = await run({ connectionString: connection("sv5pre_worker_graphile"), taskList: tasks, concurrency: 1, pollInterval: 100 });
    await until(async () => received !== undefined, "injected final-check domain port");
    expect(received).toEqual(task);
    await until(async () => (await admin.query("SELECT 1 FROM graphile_worker._private_jobs WHERE id=$1", [queued.id])).rowCount === 0, "Graphile acknowledgment of the injected port only");
    await runner.stop(); runner = undefined;
    expect((await admin.query("SELECT count(*)::int AS count FROM app.final_account_lock_check")).rows[0]!.count).toBe(0);
  }, 45_000);

  it("PRE-Q6-04 the installed executable entrypoint refuses a forged tenant/job/manifest", async () => {
    const before = await domainCounts(), payload = { ...task, executionId: randomUUID() };
    const queued = await utilities.addJob("final_check", payload, { maxAttempts: 1, jobKey: `sv5pre-entrypoint:${payload.executionId}` });
    let output = "";
    entrypoint = spawn("pnpm", ["--filter", "@jobguard/api", "start:worker"], { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, JOBGUARD_ENV: "synthetic_demo", GRAPHILE_DATABASE_URL: connection("sv5pre_worker_graphile"),
        RUNTIME_DATABASE_URL: connection("sv5pre_worker_runtime"), SHADOW_DATABASE_URL: connection("sv5pre_worker_shadow") } });
    entrypoint.stdout?.on("data", chunk => { output += String(chunk); }); entrypoint.stderr?.on("data", chunk => { output += String(chunk); });
    try {
      await until(async () => {
        if (entrypoint?.exitCode !== null) throw new Error(`Worker entrypoint exited before dispatch: ${output.slice(-1500)}`);
        const row = (await admin.query<{ attempts: number; last_error: string | null }>("SELECT attempts,last_error FROM graphile_worker._private_jobs WHERE id=$1", [queued.id])).rows[0];
        return row?.attempts === 1 && row.last_error?.includes("FINAL_CHECK_FORBIDDEN") === true;
      }, "persisted forged-manifest failure");
      const persisted = (await admin.query("SELECT payload,attempts,last_error FROM graphile_worker._private_jobs WHERE id=$1", [queued.id])).rows[0]!;
      expect(persisted.payload).toEqual(payload); expect(persisted.attempts).toBe(1); expect(persisted.last_error).toContain("FINAL_CHECK_FORBIDDEN");
      expect(await domainCounts()).toEqual(before);
    } finally { await stopEntrypoint(); }
  }, 45_000);
});
