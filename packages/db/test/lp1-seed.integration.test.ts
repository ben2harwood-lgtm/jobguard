// Real bootstrap instrumentation observes the real connection; no SQL result is substituted.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client, Pool, type QueryResult } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bootstrapSyntheticDemo, SYNTHETIC_DATABASE_NAME } from "../src/demo-bootstrap.js";
import { DEMO_ACCOUNT_ID, DEMO_EMPTY_ACCOUNT_ID, DEMO_MEMBERSHIP_ID, DEMO_EMPTY_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_EMPTY_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

type Trace = { table: string; role: string; login: string };
const address = (port: number, user: string, phrase: string, database = SYNTHETIC_DATABASE_NAME) => {
  const url = new URL(`postgresql://127.0.0.1:${port}/${database}`);
  url.username = user;
  url.password = phrase;
  return url.href;
};

describe("LP-1 explicit owner bootstrap", () => {
  const phrase = randomUUID(), runtimePhrase = randomUUID();
  let postgres: EmbeddedPostgres, control: Pool, owner: Pool, runtime: Pool, port: number;
  let ownerUrl: string, runtimeUrl: string;
  const previous = process.env.JOBGUARD_ENV;
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), "jg-lp1-seed-")); port = await freePort(62900, 100);
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: phrase, persistent: false,
      createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    control = new Pool({ connectionString: address(port, "postgres", phrase, "postgres") });
    await control.query(`CREATE ROLE lp1_bootstrap_owner LOGIN PASSWORD '${phrase}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
    await control.query(`CREATE DATABASE ${SYNTHETIC_DATABASE_NAME} OWNER lp1_bootstrap_owner`);
    ownerUrl = address(port, "lp1_bootstrap_owner", phrase); runtimeUrl = address(port, "jobguard_runtime", runtimePhrase);
    owner = new Pool({ connectionString: ownerUrl });
    process.env.JOBGUARD_ENV = "synthetic_demo";
  }, 60_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous;
    await closeTestPools(runtime, owner, control); await postgres?.stop();
  });
  async function observedBootstrap() {
    const trace: Trace[] = [];
    const original = Client.prototype.query;
    const query = original as unknown as (this: Client, sql: string, values?: unknown[]) => Promise<QueryResult>;
    // The bootstrap uses promise-style textual queries. Other calls retain pg's original overloads.
    const observer = vi.spyOn(Client.prototype, "query").mockImplementation(function (this: Client, ...args: unknown[]) {
      const sql = args[0];
      const table = typeof sql === "string" ? /^INSERT INTO app\.(account|membership|job)\(/u.exec(sql)?.[1] : undefined;
      if (!table) return Reflect.apply(original, this, args);
      return (async () => {
        const observed = (await query.call(this, "SELECT current_user AS role,session_user AS login")).rows[0]!;
        trace.push({ table, role: observed.role as string, login: observed.login as string });
        return Reflect.apply(original, this, args);
      })();
    } as typeof Client.prototype.query);
    try { await bootstrapSyntheticDemo({ ownerUrl, runtimeUrl }); return trace; }
    finally { observer.mockRestore(); }
  }
  async function rows() {
    // Separately authenticated verifier can assume migration because bootstrap explicitly granted it.
    const db = await owner.connect();
    try {
      await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_migration");
      const result: { accounts: unknown[]; memberships: unknown[] } = { accounts: [], memberships: [] };
      for (const [tenant, account, member] of [[DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID], [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_ACCOUNT_ID, DEMO_EMPTY_MEMBERSHIP_ID]]) {
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
        result.accounts.push(...(await db.query(`SELECT row_to_json(t)::text AS bytes FROM
          (SELECT id,tenant_id,name,created_at,updated_at FROM app.account WHERE id=$1) t`, [account])).rows);
        result.memberships.push(...(await db.query(`SELECT row_to_json(t)::text AS bytes FROM
          (SELECT id,tenant_id,account_id,identity_user_id,role,created_at,revoked_at,expires_at FROM app.membership WHERE id=$1) t`, [member])).rows);
      }
      return result;
    } finally { await db.query("ROLLBACK"); db.release(); }
  }

  it("[LP1-09] the four demo rows use the owner connection and bootstrap remains repeatable", async () => {
    const first = await observedBootstrap(), before = await rows(), second = await observedBootstrap();
    expect(before.accounts).toHaveLength(2); expect(before.memberships).toHaveLength(2);
    expect(await rows()).toEqual(before);
    for (const trace of [first, second]) {
      expect(trace.filter(row => row.table === "account" || row.table === "membership")).toEqual([
        { table: "account", role: "jobguard_migration", login: "lp1_bootstrap_owner" },
        { table: "membership", role: "jobguard_migration", login: "lp1_bootstrap_owner" },
        { table: "account", role: "jobguard_migration", login: "lp1_bootstrap_owner" },
        { table: "membership", role: "jobguard_migration", login: "lp1_bootstrap_owner" },
      ]);
      const jobs = trace.filter(row => row.table === "job"); expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every(row => row.role === "jobguard_runtime" && row.login === "lp1_bootstrap_owner")).toBe(true);
    }
    runtime = new Pool({ connectionString: runtimeUrl });
    await expect(runtime.query("SET ROLE jobguard_migration")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("INSERT INTO app.account(id,tenant_id,name) SELECT id,tenant_id,name FROM app.account"))
      .rejects.toMatchObject({ code: "42501" });
    expect((await owner.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='lp1_bootstrap_owner'")).rows)
      .toEqual([{ rolsuper: false, rolbypassrls: false }]);
    expect((await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN('app.account'::regclass,'app.membership'::regclass) ORDER BY relname")).rows)
      .toEqual([{ relname: "account", relrowsecurity: true, relforcerowsecurity: true }, { relname: "membership", relrowsecurity: true, relforcerowsecurity: true }]);
  }, 120_000);
});

describe("LP-1 bootstrap boundary checks without PostgreSQL", () => {
  it("[LP1-10] owner seed preparation is explicit, isolated and unavailable to services", async () => {
    const previous = process.env.JOBGUARD_ENV, unreachablePort = 1;
    const ownerUrl = address(unreachablePort, "lp1_unreachable_owner", randomUUID());
    const runtimeUrl = address(unreachablePort, "jobguard_runtime", randomUUID());
    try {
      for (const mode of ["pilot_no_charge", "production_billing", "production", undefined]) {
        if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
        await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
      }
      process.env.JOBGUARD_ENV = "synthetic_demo";
      for (const pair of [
        { ownerUrl: ownerUrl.replace(SYNTHETIC_DATABASE_NAME, "postgres"), runtimeUrl },
        { ownerUrl, runtimeUrl: runtimeUrl.replace(SYNTHETIC_DATABASE_NAME, "postgres") },
        { ownerUrl, runtimeUrl: runtimeUrl.replace("jobguard_runtime", "lp1_unreachable_owner") },
      ]) await expect(bootstrapSyntheticDemo(pair)).rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
      // Fresh import must not connect. No mocked provider is used as database evidence.
      vi.resetModules();
      const connect = vi.spyOn(Pool.prototype, "connect");
      try { await import("../src/demo-bootstrap.js"); expect(connect).not.toHaveBeenCalled(); }
      finally { connect.mockRestore(); }
      // These are focused source assertions, not whole-file pins. They do not replace a deployment proof.
      for (const path of ["../../../apps/api/src/main.ts", "../../../apps/api/src/worker.ts", "../src/demo-runtime.ts"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        expect(source).not.toMatch(/bootstrapSyntheticDemo|MIGRATION_DATABASE_URL|from\s+["'][^"']*demo-bootstrap/u);
      }
    } finally {
      if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous;
    }
  });
});
