import { Pool } from "pg";
import { closeTestPools } from "./pool-test-utils.js";

type Credentials = { user: string; password: string };
type WorkerCluster = { credentials: Credentials; login: Promise<void> | undefined; pools: Map<string, Promise<Pool>> };
const clusters = new Map<number, WorkerCluster>();

export function registerWorkerFixtureCluster(port: number, credentials: Credentials) {
  clusters.set(port, { credentials, login: undefined, pools: new Map() });
}

async function databaseOf(source: Pool) {
  return (await source.query<{ database: string; port: number }>(
    "SELECT current_database() AS database,inet_server_port() AS port",
  )).rows[0]!;
}

export async function workerFixturePool(source: Pool): Promise<Pool> {
  const { database, port } = await databaseOf(source);
  const cluster = clusters.get(Number(port));
  if (!cluster) throw new Error("Missing PostgreSQL cluster for worker fixture");
  const address = { host: "127.0.0.1", port: Number(port) };
  let pool = cluster.pools.get(database);
  if (!pool) {
    pool = (async () => {
      cluster.login ??= (async () => {
        const admin = new Pool({ ...address, ...cluster.credentials, database: "postgres", max: 1 });
        try {
          // A physical restore already contains the fixture's cluster login.
          await admin.query(`DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='lp10_fixture_worker') THEN
              CREATE ROLE lp10_fixture_worker LOGIN PASSWORD 'synthetic-worker-only'
                NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
              GRANT jobguard_worker TO lp10_fixture_worker;
            END IF;
          END $$`);
        } finally { await admin.end(); }
      })();
      await cluster.login;
      return new Pool({ ...address, database, user: "lp10_fixture_worker", password: "synthetic-worker-only", max: 2 });
    })();
    cluster.pools.set(database, pool);
  }
  return pool;
}

export async function closeWorkerFixtureDatabase(source: Pool) {
  const { port, database } = await databaseOf(source);
  const pools = clusters.get(Number(port))?.pools;
  const pool = pools?.get(database);
  if (!pool) return;
  pools!.delete(database);
  await closeTestPools(await pool);
}

export async function closeWorkerFixtureCluster(port: number) {
  const cluster = clusters.get(port);
  clusters.delete(port);
  if (!cluster?.pools.size) return;
  const pools = await Promise.allSettled(cluster.pools.values());
  await closeTestPools(...pools.flatMap(pool => pool.status === "fulfilled" ? [pool.value] : []));
}
