import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { vi } from "vitest";
import { closeWorkerFixtureCluster, registerWorkerFixtureCluster, workerFixturePool } from "../../../packages/db/test/worker-login-fixture.js";

vi.mock("../../../packages/db/src/worker-pool.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../../packages/db/src/worker-pool.js")>(),
  outboundWorkerPool: workerFixturePool,
}));

function clusterOptions(postgres: EmbeddedPostgres) {
  return (postgres as unknown as { options: { port: number; user: string; password: string } }).options;
}

const start = EmbeddedPostgres.prototype.start;
const stop = EmbeddedPostgres.prototype.stop;
EmbeddedPostgres.prototype.start = async function () {
  await start.call(this);
  const { port, user, password } = clusterOptions(this);
  const admin = new Pool({ host: "127.0.0.1", port, user, password, database: "postgres", max: 1 });
  try {
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_worker') THEN
        CREATE ROLE jobguard_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_session_lookup') THEN
        CREATE ROLE jobguard_session_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_money_owner') THEN
        CREATE ROLE jobguard_money_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      END IF;
    END $$`);
  } finally {
    await admin.end();
  }
  registerWorkerFixtureCluster(port, { user, password });
};

EmbeddedPostgres.prototype.stop = async function () {
  try {
    await closeWorkerFixtureCluster(clusterOptions(this).port);
  } finally {
    await stop.call(this);
  }
};
