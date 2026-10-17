// Synthetic PostgreSQL fixtures. Never call extra-fixtures.cluster/close: those delete their directory.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { ContractorRepository, ExtraRepository, contractorSessionContext, migrate } from "../src/index.js";
import { enterpriseDashboardScopeLockSql } from "../src/enterprise-dashboard-queries.js";
import { fixture } from "./extra-fixtures.js";
import { actor, direct, invite } from "./site-extra-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

export const deadlineMs = 8000;
export const exclusiveGateSql = "SELECT pg_advisory_xact_lock(hashtextextended($1,54))";
export const dashboardQuery = { version: "enterprise-dashboard-query.v1", from: "2000-01-01T00:00:00Z", until: "2099-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
export type Revocation = "grant.revoke" | "membership.revoke";
export function barrier() {
  let release!: () => void;
  const reached = new Promise<void>(resolve => { release = resolve; });
  return { reached, release };
}
export async function bounded<T>(work: Promise<T>, label: string, ms = deadlineMs): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
// Attach rejection handling immediately, before observing the other connection's locks.
export const outcome = <T>(work: Promise<T>) => work.then(
  value => ({ ok: true as const, value }), error => ({ ok: false as const, error: error as unknown }),
);

export async function authorityCluster() {
  if (process.env.CI === undefined) {
    const space = await statfs(tmpdir());
    if (space.bavail * space.bsize < 33 * 1024 ** 3) throw new Error("Retained database requires at least 33 GiB free");
  }
  const directory = await mkdtemp(join(tmpdir(), "jg-dashboard-authority-"));
  const port = await freePort(58800, 400);
  // persistent:true is essential: embedded-postgres.stop() deletes a non-persistent directory.
  const postgres = new EmbeddedPostgres({ databaseDir: join(directory, "postgres"), port, user: "postgres", password: "synthetic", persistent: true,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  const config = { host: "127.0.0.1", port, user: "postgres", password: "synthetic" };
  const pools: Pool[] = [];
  const retainedPool = (settings: ConstructorParameters<typeof Pool>[0]) => {
    const pool = new Pool(settings); pools.push(pool); return pool;
  };
  const control = retainedPool(config);
  const admin = retainedPool({ ...config, database: "jobguard_synthetic_demo", statement_timeout: 15000 });
  const runtimePool = (name: string, max = 4) => retainedPool({ ...config, database: "jobguard_synthetic_demo", user: "dashboard_authority_login",
    application_name: name, max, connectionTimeoutMillis: 8000, lock_timeout: 12000, statement_timeout: 15000 });
  const close = async () => { try { await closeTestPools(...pools); } finally { await postgres.stop(); } };
  // Preserve the location even if startup/migration fails. No teardown path removes it.
  await writeFile(join(directory, "TEST-RETENTION.txt"), "TESTS-DASHBOARD-AUTHORITY-1 synthetic database; stop and retain.\n");
  console.info(`TESTS-DASHBOARD-AUTHORITY-1 retained database: ${directory}`);
  try {
    await postgres.initialise(); await postgres.start();
    await control.query("CREATE DATABASE jobguard_synthetic_demo");
    await migrate(admin);
    await installLegacySyntheticPartyFixtures(admin);
    await admin.query("CREATE ROLE dashboard_authority_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS; GRANT jobguard_runtime TO dashboard_authority_login");
    const runtime = runtimePool("dashboard_authority_reused");
    return { admin, runtime, config, directory, runtimePool, close };
  } catch (error) { await close(); throw error; }
}
export type AuthorityCluster = Awaited<ReturnType<typeof authorityCluster>>;

export async function authorityWorld(c: AuthorityCluster) {
  const f = await fixture(c), viewer = await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId });
  const operative = await actor(c, f, f.demo.operativeMembershipId);
  const extra = await new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, operative));
  const session = randomUUID(), sessionRef = randomUUID();
  // Invited members have genuine persisted, digest-bound practice sessions, resolved by the real bridge.
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
  [sessionRef, f.p.tenantId, viewer.member.membershipId, viewer.member.identityUserId, createHash("sha256").update(session).digest("hex")]);
  const context = await contractorSessionContext(c.runtime, session);
  return { ...f, viewer, extraId: extra.variationId, session, sessionRef, context };
}
export type AuthorityWorld = Awaited<ReturnType<typeof authorityWorld>>;

export async function expireSession(c: AuthorityCluster, w: AuthorityWorld) {
  // Expiry is immutable in production. Only this owner fixture moves both timestamps into the past.
  const client = await c.admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE control_plane.contractor_practice_session DISABLE TRIGGER USER");
    await client.query(`WITH t AS MATERIALIZED (SELECT clock_timestamp()-interval '8 days' at)
      UPDATE control_plane.contractor_practice_session SET created_at=t.at,expires_at=t.at+interval '7 days'
      FROM t WHERE session_id=$1`, [w.sessionRef]);
    await client.query("ALTER TABLE control_plane.contractor_practice_session ENABLE TRIGGER USER");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function revocationInput(c: AuthorityCluster, w: AuthorityWorld, kind: Revocation) {
  const view = await new ContractorRepository(c.runtime).query(w.p, { version: "contractor-query.v1", tenantId: w.p.tenantId, resource: "organisation" });
  return { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision,
    ...kind === "grant.revoke" ? { kind, grantId: w.viewer.grant } : { kind, membershipId: w.viewer.member.membershipId } };
}

/** Only delays delivery of a real gate result. All authority, facts, commands, audit and commits run unchanged.
 * The explicit negative-control switch omits only the dashboard gate, delegating a harmless SELECT instead.
 */
export function scheduledPool(base: Pool, options: { hold?: "shared" | "exclusive"; omitDashboardGate?: boolean } = {}) {
  const attempted = barrier(), acquired = barrier(), resume = barrier();
  let pid: number | undefined, sourceQueries = 0, commits = 0;
  const pool = new Proxy(base, { get(target, key) {
    if (key === "connect") return async () => {
      const client = await target.connect();
      pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      return new Proxy(client, { get(connection, property) {
        if (property === "query") return async (sql: string, values?: unknown[]) => {
          const shared = sql === enterpriseDashboardScopeLockSql, exclusive = sql === exclusiveGateSql;
          if (shared || exclusive) attempted.release();
          const result = options.omitDashboardGate && shared
            ? await connection.query("SELECT 1 /* TEST ONLY: dashboard gate omitted */") : await connection.query(sql, values);
          if (shared || exclusive) {
            acquired.release();
            if ((shared && options.hold === "shared") || (exclusive && options.hold === "exclusive")) await bounded(resume.reached, "release acquired gate");
          }
          if (sql.includes("WITH actor AS MATERIALIZED")) sourceQueries++;
          if (sql === "COMMIT") commits++;
          return result;
        };
        const value = Reflect.get(connection, property);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { pool, attempted: attempted.reached, acquired: acquired.reached, resume: resume.release,
    get pid() { if (pid === undefined) throw new Error("Backend not connected"); return pid; },
    get sourceQueries() { return sourceQueries; }, get commits() { return commits; } };
}

export class GateNotObserved extends Error {}
/** Match the exact two-int representation of hashtextextended(tenant,54), mode, grant state and blocker.
 * Polling yields to PostgreSQL, never establishes ordering by elapsed sleep.
 */
export async function observeGate(c: AuthorityCluster, tenant: string, pid: number, mode: "ShareLock" | "ExclusiveLock", granted: boolean, blocker?: number, ms = deadlineMs) {
  const until = Date.now() + ms;
  do {
    const row = (await c.admin.query<{ seen: boolean }>(`WITH key AS (SELECT hashtextextended($1::uuid::text,54) value)
      SELECT EXISTS(SELECT 1 FROM pg_locks l CROSS JOIN key k
       WHERE l.pid=$2 AND l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND l.classid=((k.value >> 32) & 4294967295)::oid AND l.objid=(k.value & 4294967295)::oid AND l.objsubid=1
        AND l.mode=$3 AND l.granted=$4 AND ($5::int IS NULL OR $5=ANY(pg_blocking_pids(l.pid)))) seen`,
    [tenant, pid, mode, granted, blocker ?? null])).rows[0]!;
    if (row.seen) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  } while (Date.now() < until);
  throw new GateNotObserved(`No ${granted ? "held" : "waiting"} ${mode} tenant gate for backend ${pid}`);
}

export async function storedRows(c: AuthorityCluster, tenant: string) {
  const names = (await c.admin.query<{ schemaname: string; tablename: string }>(`SELECT p.schemaname,p.tablename FROM pg_tables p
    JOIN information_schema.columns c ON(c.table_schema,c.table_name,c.column_name)=(p.schemaname,p.tablename,'tenant_id')
    WHERE p.schemaname IN ('app','audit_control','control_plane') ORDER BY p.schemaname,p.tablename`)).rows;
  const result: Record<string, string[]> = {};
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  for (const n of names) result[`${n.schemaname}.${n.tablename}`] = (await c.admin.query<{ bytes: string }>(
    `SELECT row_to_json(t)::text bytes FROM ${quote(n.schemaname)}.${quote(n.tablename)} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text COLLATE "C"`, [tenant])).rows.map(r => r.bytes);
  return result;
}
