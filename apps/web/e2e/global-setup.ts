import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
const SYNTHETIC_DATABASE_NAME = "jobguard_synthetic_demo";
const port = 55432, password = "sbox-e2e-owner";
const shutdownToken = "sbox-e2e-local-pool-drain";
export const E2E_RUNTIME_URL = `postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`;
export default async function setup() {
  const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
  const { bootstrapSyntheticDemo } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  const directory = await mkdtemp(join(tmpdir(), "jobguard-sbox-e2e-"));
  const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: (message) => { if (process.env.DEBUG?.includes("jobguard:e2e-db")) console.error(message); } });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
  await control.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await control.query(`CREATE DATABASE ${SYNTHETIC_DATABASE_NAME} OWNER neondb_owner`); await control.end();
  process.env.JOBGUARD_ENV = "synthetic_demo";
  await bootstrapSyntheticDemo({ ownerUrl: `postgresql://neondb_owner:${password}@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`, runtimeUrl: E2E_RUNTIME_URL });
  const identityAdmin = new Pool({ host:"127.0.0.1", port, user:"postgres", password, database:SYNTHETIC_DATABASE_NAME });
  await identityAdmin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'sbox-e2e-identity'");
  // SV-5 Q6 practice run: the real worker process with its own queue and shadow logins, synthetic only.
  // Graphile installs its private tables as the queue login; CREATE is granted only until they exist.
  const login = (user: string) => `postgresql://${user}:sbox-e2e-worker@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`;
  for (const [user, group] of [["e2e_worker_queue", "jobguard_infrastructure"], ["e2e_worker_shadow", "jobguard_shadow"]]) {
    await identityAdmin.query(`CREATE ROLE ${user} LOGIN PASSWORD 'sbox-e2e-worker' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`);
    await identityAdmin.query(`GRANT ${group} TO ${user}`);
  }
  await identityAdmin.query(`GRANT CREATE ON DATABASE ${SYNTHETIC_DATABASE_NAME} TO e2e_worker_queue`);
  const worker: ChildProcess = spawn("pnpm", ["--filter", "@jobguard/api", "start:worker"], { cwd: join(process.cwd(), "../.."), detached: true, stdio: "inherit",
    env: { ...process.env, JOBGUARD_ENV: "synthetic_demo", JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY: "1", GRAPHILE_DATABASE_URL: login("e2e_worker_queue"), RUNTIME_DATABASE_URL: E2E_RUNTIME_URL, SHADOW_DATABASE_URL: login("e2e_worker_shadow") } });
  for (let i = 0; i < 240 && !(await identityAdmin.query("SELECT to_regclass('graphile_worker._private_jobs') IS NOT NULL ready")).rows[0].ready; i++) await new Promise(resolve => setTimeout(resolve, 500));
  await identityAdmin.query(`REVOKE CREATE ON DATABASE ${SYNTHETIC_DATABASE_NAME} FROM e2e_worker_queue`);
  await identityAdmin.end();
  return async () => {
    if (worker.pid) { try { process.kill(-worker.pid, "SIGTERM"); } catch { /* already stopped */ } }
    await fetch("http://127.0.0.1:3000/api/test-support/drain", { method: "POST", headers: { authorization: `Bearer ${shutdownToken}` } });
    await postgres.stop();
    await rm(directory, { recursive: true, force: true });
  };
}
