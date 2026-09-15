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
  const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: (message) => { if (process.env.DEBUG?.includes("jobguard:e2e-db")) console.error(message); } });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
  await control.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await control.query(`CREATE DATABASE ${SYNTHETIC_DATABASE_NAME} OWNER neondb_owner`); await control.end();
  process.env.JOBGUARD_ENV = "synthetic_demo";
  await bootstrapSyntheticDemo({ ownerUrl: `postgresql://neondb_owner:${password}@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`, runtimeUrl: E2E_RUNTIME_URL });
  return async () => {
    await fetch("http://127.0.0.1:3000/api/test-support/drain", { method: "POST", headers: { authorization: `Bearer ${shutdownToken}` } });
    await postgres.stop();
    await rm(directory, { recursive: true, force: true });
  };
}
