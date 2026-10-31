import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bootstrapSyntheticDemo, finalizeMeterLifecycleOwnership, SYNTHETIC_DATABASE_NAME } from "../src/demo-bootstrap.js";
import { DEMO_TENANT_ID, demoCheckpoints } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { MIGRATION_URLS } from "../src/migrate.js";

describe("bootstrap SQL trace (no PostgreSQL proof)", () => {
  it.each(["jobguard_migration", "jobguard_meter_owner"])("finalizes %s routines and restores temporary permissions", async (routineOwner) => {
    const sql: string[] = [];
    const admin = { async query(query: string) {
      sql.push(query);
      if (query === "SELECT current_user") return { rows: [{ current_user: "synthetic_owner" }] };
      if (query.startsWith("SELECT inherit_option")) return { rows: [{ inherit_option: false, set_option: true }] };
      if (query.startsWith("SELECT pg_get_userbyid")) return { rows: [{ owner: routineOwner }] };
      return { rows: [] };
    } } as unknown as PoolClient;
    await finalizeMeterLifecycleOwnership(admin);
    expect(sql.filter(q=>q.startsWith('ALTER FUNCTION') && q.endsWith('OWNER TO jobguard_meter_owner'))).toEqual([
      'ALTER FUNCTION app.mon1_lifecycle_actor(uuid,text,boolean) OWNER TO jobguard_meter_owner',
      'ALTER FUNCTION app.mon1_lifecycle_capture(uuid,text,uuid,date,integer) OWNER TO jobguard_meter_owner',
      'ALTER FUNCTION app.mon1_lifecycle_rebuild(uuid,text,uuid) OWNER TO jobguard_meter_owner',
      'ALTER FUNCTION app.mon1_lifecycle_read(uuid,text,uuid) OWNER TO jobguard_meter_owner',
      'ALTER FUNCTION app.mon1_counted_meter_today(uuid,text) OWNER TO jobguard_meter_owner',
      'ALTER FUNCTION app.mon1_fresh_counted_meter_today(uuid,text) OWNER TO jobguard_meter_owner',
      'ALTER FUNCTION app.mon1_today_source(uuid,text) OWNER TO jobguard_meter_owner',
    ]);
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION app.mon1_counted_meter_today(uuid,text) FROM jobguard_runtime');
    expect(sql).toContain('GRANT jobguard_migration TO "synthetic_owner" WITH INHERIT FALSE, SET TRUE');
    expect(sql.indexOf('REVOKE CREATE ON SCHEMA app FROM jobguard_meter_owner')).toBeLessThan(sql.indexOf('COMMIT'));
    expect(sql.at(-2)).toBe('REVOKE jobguard_meter_owner FROM "synthetic_owner"');
    expect(sql.at(-1)).toBe('COMMIT');
  });
  it("rolls back ownership and temporary grants if any routine has an unexpected owner", async () => {
    const sql: string[] = [];
    const admin = { async query(query: string) {
      sql.push(query);
      if (query === "SELECT current_user") return { rows: [{ current_user: "synthetic_owner" }] };
      if (query.startsWith("SELECT pg_get_userbyid")) return { rows: [{ owner: "unexpected_owner" }] };
      return { rows: [] };
    } } as unknown as PoolClient;
    await expect(finalizeMeterLifecycleOwnership(admin)).rejects.toThrow('Unexpected meter routine owner');
    expect(sql.at(-1)).toBe('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
  });

  it("revokes temporary audit ownership membership when migration setup fails", async () => {
    const queries: string[] = [];
    const client = {release() {}, async query(sql: string) {
      queries.push(sql);
      if (sql.includes("WHERE rolname='jobguard_runtime'")) return {rowCount:1,rows:[{rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolcanlogin:true}]};
      if (sql.includes("SELECT rolsuper,rolbypassrls") && sql.includes("FROM pg_roles WHERE rolname=$1")) return {rows:[{rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolcanlogin:false,rolreplication:false,member:false}]};
      if (sql === "SELECT current_user") return {rows:[{current_user:"synthetic_owner"}]};
      if (sql === "SET ROLE jobguard_migration") throw new Error("fixture migration setup failure");
      return {rowCount:0,rows:[]};
    }} as unknown as PoolClient;
    const connect=vi.spyOn(Pool.prototype,"connect").mockImplementation(async()=>client);
    const end=vi.spyOn(Pool.prototype,"end").mockResolvedValue(undefined);
    const previousMode=process.env.JOBGUARD_ENV;
    process.env.JOBGUARD_ENV="synthetic_demo";
    try {
      await expect(bootstrapSyntheticDemo({ownerUrl:"postgresql://owner:synthetic@localhost/jobguard_synthetic_demo",
        runtimeUrl:"postgresql://jobguard_runtime:synthetic@localhost/jobguard_synthetic_demo"})).rejects.toThrow("fixture migration setup failure");
      const failed=queries.indexOf("SET ROLE jobguard_migration");
      expect(queries.indexOf("GRANT jobguard_binding_owner TO jobguard_migration WITH INHERIT TRUE, SET TRUE")).toBeLessThan(failed);
      const revokedBinding=queries.indexOf("REVOKE jobguard_binding_owner FROM jobguard_migration");
      expect(revokedBinding).toBeGreaterThan(failed);
      expect(queries.findLastIndex(q=>q.includes("g.rolsuper AS super_grantor"))).toBeGreaterThan(revokedBinding);
      expect(queries.indexOf("GRANT jobguard_audit_writer TO jobguard_migration WITH INHERIT TRUE, SET TRUE")).toBeLessThan(failed);
      expect(queries.indexOf("RESET ROLE")).toBeGreaterThan(failed);
      expect(queries.indexOf("REVOKE jobguard_audit_writer FROM jobguard_migration")).toBeGreaterThan(queries.indexOf("RESET ROLE"));
    } finally {
      connect.mockRestore();end.mockRestore();
      if(previousMode===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousMode;
    }
  });

  it.each([[false, false], [false, true], [true, false]])("binds the synthetic small-builder track and cleans migration grants (failure=%s, seedReplay=%s)", async (migrationFailure, seedReplay) => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = { release() {}, async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (migrationFailure && sql.startsWith("CREATE TABLE IF NOT EXISTS public.jobguard_schema_migration")) throw new Error("synthetic migration failure");
      if (sql.startsWith("SELECT app.begin_command(")) return { rowCount: 1, rows: [{ result: seedReplay ? { kind: "replay", result: {} } : { kind: "claim" } }] };
      if (sql.startsWith("SELECT app.complete_command(")) return { rowCount: 1, rows: [{ result: {} }] };
      if (sql.includes("FROM pg_roles WHERE rolname='jobguard_runtime'")) return { rowCount: 1, rows: [{ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolcanlogin: true }] };
      // Restricted shadow/meter roles: one posture row each; no holders in this trace.
      if (sql.includes("SELECT rolsuper,rolbypassrls") && sql.includes("FROM pg_roles WHERE rolname=$1") && ["jobguard_shadow", "jobguard_shadow_emergency_access", "jobguard_meter", "jobguard_meter_owner", "jobguard_audit_writer", "jobguard_command_writer", "jobguard_binding_owner"].includes(values[0] as string)) return { rowCount: 1, rows: [{ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolcanlogin: false, rolreplication: false, member: false }] };
      if (sql.includes("SELECT pg_get_userbyid(proowner) AS owner")) return { rowCount: 1, rows: [{ owner: "jobguard_migration" }] };
      if (sql === "SELECT current_user") return { rowCount: 1, rows: [{ current_user: "synthetic_owner" }] };
      if (sql.includes("SELECT 1 FROM public.jobguard_schema_migration")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("count(*)::int count")) return { rowCount: 1, rows: [{ count: 45 }] };
      return { rowCount: sql.startsWith("SELECT") ? 0 : 1, rows: [] };
    } } as unknown as PoolClient;
    const connect = vi.spyOn(Pool.prototype, "connect").mockImplementation(async () => client);
    const end = vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
    const previousMode = process.env.JOBGUARD_ENV;
    process.env.JOBGUARD_ENV = "synthetic_demo";
    try {
      const bootstrap = bootstrapSyntheticDemo({ ownerUrl: `postgresql://synthetic_owner:fixture@localhost/${SYNTHETIC_DATABASE_NAME}`, runtimeUrl: `postgresql://jobguard_runtime:fixture@localhost/${SYNTHETIC_DATABASE_NAME}` });
      if (migrationFailure) await expect(bootstrap).rejects.toThrow("synthetic migration failure");
      else await bootstrap;
      for (const role of ["jobguard_audit_writer", "jobguard_command_writer", "jobguard_binding_owner"]) {
        const create = queries.findIndex(({sql}) => sql.includes(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`));
        const migrate = queries.findIndex(({sql}) => sql === 'SET ROLE jobguard_migration');
        expect(create).toBeGreaterThan(-1);
        expect(create).toBeLessThan(migrate);
        expect(queries.findIndex(({sql}) => sql === `GRANT ${role} TO jobguard_migration WITH INHERIT TRUE, SET TRUE`)).toBeLessThan(migrate);
        expect(queries.findIndex(({sql}) => sql === `REVOKE ${role} FROM jobguard_migration`)).toBeGreaterThan(migrate);
      }
      if (migrationFailure) {
        const rollback = queries.findIndex(({sql}) => sql === 'ROLLBACK');
        expect(rollback).toBeGreaterThan(queries.findIndex(({sql}) => sql === 'SET ROLE jobguard_migration'));
        expect(queries.findIndex(({sql}) => sql === 'RESET ROLE')).toBeGreaterThan(rollback);
        expect(queries.some(({sql}) => sql.includes('INSERT INTO app.job_commercial_track'))).toBe(false);
        return;
      }
      const begins = queries.filter(({sql}) => sql.startsWith("SELECT app.begin_command("));
      const records = queries.filter(({sql}) => sql.startsWith("SELECT app.record_repository_command("));
      const completes = queries.filter(({sql}) => sql.startsWith("SELECT app.complete_command("));
      expect(begins).toHaveLength(demoCheckpoints.length);
      expect(records).toHaveLength(seedReplay ? 0 : demoCheckpoints.length);
      expect(completes).toHaveLength(seedReplay ? 0 : demoCheckpoints.length);
      for (const begin of begins) {
        expect(begin.values[0]).toBe("repository-command.v1");
        expect(begin.values[2]).toBe("synthetic_demo.seed");
        if (!seedReplay) {
          const record = records.find(q => q.values[0] === begin.values[1])!;
          const complete = completes.find(q => q.values[0] === begin.values[1])!;
          expect(queries.indexOf(record)).toBeGreaterThan(queries.indexOf(begin));
          expect(queries.indexOf(complete)).toBeGreaterThan(queries.indexOf(record));
          expect(queries.indexOf(complete)).toBeLessThan(queries.findIndex(q => q.sql === "COMMIT" && queries.indexOf(q) > queries.indexOf(begin)));
        }
      }
      if (!seedReplay) expect(queries.indexOf(completes[0]!)).toBeGreaterThan(queries.indexOf(records.at(-1)!));
      expect(queries.some(({sql}) => sql.includes('CREATE ROLE jobguard_meter'))).toBe(true);
      expect(queries.some(({sql,values}) => sql.includes('SELECT rolsuper,rolbypassrls') && values[0] === 'jobguard_meter')).toBe(true);
      expect(queries.findIndex(({sql,values}) => sql.includes('SELECT rolsuper,rolbypassrls') && values[0] === 'jobguard_meter'))
        .toBeLessThan(queries.findIndex(({sql}) => sql === 'SET ROLE jobguard_migration'));
      expect(queries.some(({sql}) => sql.includes('CREATE ROLE jobguard_meter_owner'))).toBe(true);
      const reset = queries.findIndex(({sql}) => sql === 'RESET ROLE');
      const transfer = queries.findIndex(({sql}) => sql.includes('ALTER FUNCTION app.mon1_lifecycle_actor') && sql.includes('OWNER TO jobguard_meter_owner'));
      expect(transfer).toBeGreaterThan(reset);
      expect(queries.filter(({sql}) => sql.startsWith('ALTER FUNCTION app.mon1_lifecycle_') && sql.endsWith('OWNER TO jobguard_meter_owner'))).toHaveLength(4);
      expect(queries.filter(({sql}) => sql.startsWith('ALTER FUNCTION app.mon1_lifecycle_') && sql.endsWith('SECURITY DEFINER'))).toHaveLength(4);
      expect(queries.some(({sql}) => sql === 'REVOKE CREATE ON SCHEMA app FROM jobguard_meter_owner')).toBe(true);
      const binding = queries.findIndex(({ sql }) => sql.includes("INSERT INTO app.job_commercial_track"));
      const live = queries.findIndex(({ sql }) => sql.includes("UPDATE app.job SET status='live'"));
      expect(binding, "missing SH-1 binding before UPDATE-to-live").toBeGreaterThan(queries.findIndex(({ sql }) => sql === "BEGIN"));
      expect(binding).toBeLessThan(live);
      expect(queries[binding]?.sql).toContain("'small_builder'");
      expect(queries[binding]?.sql).toContain("'synthetic_demo'");
      expect(queries.slice(0, binding).filter(({ sql }) => sql.startsWith("SET LOCAL ROLE")).at(-1)?.sql).toBe("SET LOCAL ROLE jobguard_migration");
      expect(queries.slice(binding, live).some(({ sql }) => ["COMMIT", "ROLLBACK"].includes(sql))).toBe(false);
    } finally {
      connect.mockRestore(); end.mockRestore();
      if (previousMode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousMode;
    }
  });
});

describe("synthetic Vercel/Neon bootstrap", () => {
  let postgres: EmbeddedPostgres; let directory: string; let admin: Pool; let runtime: Pool;
  let port: number; let ownerUrl: string; let runtimeUrl: string;
  const password = "synthetic-bootstrap-only";
  // Build both addresses from parts in set-up, once the port is known.
  const address = (user: string, phrase: string) => {
    const url = new URL(`postgresql://127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`);
    url.username = user; url.password = phrase; return url.href;
  };
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jobguard-bootstrap-"));
    port = await freePort(60200, 100);
    ownerUrl = address("neondb_owner", password);
    runtimeUrl = address("jobguard_runtime", ["runtime", "synthetic", "only"].join("-"));
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
    await control.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
    await control.query(`CREATE DATABASE ${SYNTHETIC_DATABASE_NAME} OWNER neondb_owner`); await control.end();
    admin = new Pool({ connectionString: ownerUrl });
  }, 60_000);
  afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); await rm(directory, { recursive: true, force: true }); });
  it("creates roles, applies every registered migration, reports the actual total, seeds once, and keeps pooled RLS local", async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    const prerequisite = await admin.connect();
    try {
      expect((await prerequisite.query("SELECT rolname FROM pg_roles WHERE rolname IN ('jobguard_audit_writer','jobguard_command_writer','jobguard_binding_owner')")).rows).toEqual([]);
      for (const [file, role] of [["0456_lp4_database_audit.sql", "jobguard_audit_writer"], ["0475_lp5a_commands.sql", "jobguard_command_writer"], ["0520_lp6a_request_binding.sql", "jobguard_binding_owner"]]) {
        const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
        await expect(prerequisite.query(sql)).rejects.toMatchObject({ code: "42704", message: `${role} is missing; run administrative ensureRoles before migrations` });
        await prerequisite.query("ROLLBACK");
      }
    } finally { prerequisite.release(); }
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: MIGRATION_URLS.length, tenantId: DEMO_TENANT_ID });
    const firstSeedClient = await admin.connect();
    let firstSeed: unknown[];
    try {
      await firstSeedClient.query("BEGIN");
      await firstSeedClient.query("SET LOCAL ROLE jobguard_migration");
      await firstSeedClient.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
      firstSeed = (await firstSeedClient.query("SELECT command_id,semantic_key,status,result,completed_at FROM app.command_receipt WHERE tenant_id=$1 ORDER BY semantic_key", [DEMO_TENANT_ID])).rows;
    } finally { await firstSeedClient.query("ROLLBACK"); firstSeedClient.release(); }
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: MIGRATION_URLS.length });
    const verifier = await admin.connect();

    await verifier.query("SET ROLE jobguard_migration");
    await verifier.query("SELECT set_config('app.tenant_id',$1,false)", [DEMO_TENANT_ID]);
    const applied = (await verifier.query("SELECT migration_name FROM jobguard_schema_migration ORDER BY migration_name")).rows.map(({ migration_name }) => migration_name);
    expect(applied).toHaveLength(MIGRATION_URLS.length);
    expect(applied).toEqual(MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!));
    const seeded = (await verifier.query("SELECT semantic_key,status,result FROM app.command_receipt WHERE tenant_id=$1 ORDER BY semantic_key", [DEMO_TENANT_ID])).rows;
    expect((await verifier.query("SELECT command_id,semantic_key,status,result,completed_at FROM app.command_receipt WHERE tenant_id=$1 ORDER BY semantic_key", [DEMO_TENANT_ID])).rows).toEqual(firstSeed);
    expect(seeded).toHaveLength(demoCheckpoints.length);
    expect(seeded.map(row => row.status)).toEqual(demoCheckpoints.map(() => "succeeded"));
    expect(seeded.map(row => row.result)).toEqual([...demoCheckpoints].sort().map(checkpoint => ({ checkpoint })));

    await verifier.query("RESET ROLE"); verifier.release();
    expect((await admin.query("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname IN ('jobguard_shadow','jobguard_shadow_emergency_access') ORDER BY rolname")).rows).toEqual([
      { rolname: "jobguard_shadow", rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false },
      { rolname: "jobguard_shadow_emergency_access", rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false },
    ]);
    expect((await admin.query("SELECT pg_get_userbyid(proowner) AS owner,prosecdef FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname LIKE 'mon1_lifecycle_%' ORDER BY proname")).rows).toEqual(Array.from({length:4},()=>({owner:'jobguard_meter_owner',prosecdef:true})));
    expect((await admin.query("SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication FROM pg_roles WHERE rolname='jobguard_meter_owner'")).rows).toEqual([{rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false,rolreplication:false}]);
    expect((await admin.query("SELECT has_schema_privilege('jobguard_meter_owner','app','CREATE') AS create,pg_has_role('neondb_owner','jobguard_meter_owner','SET') AS set,pg_has_role('neondb_owner','jobguard_meter_owner','USAGE') AS usage")).rows).toEqual([{create:false,set:false,usage:false}]);
    // PostgreSQL 16 gives the CREATEROLE bootstrap owner an automatic ADMIN-only membership (no INHERIT, no SET)
    // granted by the bootstrap superuser. The owner cannot revoke it, so the exact shape is asserted: that one
    // holder per role and no other, with no privilege of either role, as the support route's USAGE check relies on.
    const holderShape = async () => (await admin.query(`SELECT r.rolname AS role,pg_get_userbyid(m.member) AS member,pg_get_userbyid(m.grantor) AS grantor,m.admin_option,m.inherit_option,m.set_option
      FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname IN ('jobguard_binding_owner','jobguard_meter_owner','jobguard_shadow','jobguard_shadow_emergency_access') ORDER BY r.rolname`)).rows;
    const adminOnly = { member: "neondb_owner", grantor: "postgres", admin_option: true, inherit_option: false, set_option: false };
    expect((await admin.query("SELECT count(*)::int n FROM pg_auth_members WHERE member='jobguard_binding_owner'::regrole")).rows[0].n).toBe(0);
    expect((await admin.query(`SELECT rolname FROM pg_roles WHERE rolname IN ('jobguard_runtime','jobguard_identity','jobguard_infrastructure','jobguard_migration')
      AND (pg_has_role(oid,'jobguard_binding_owner','USAGE') OR pg_has_role(oid,'jobguard_binding_owner','SET'))`)).rows).toEqual([]);
    expect((await admin.query("SELECT has_schema_privilege('jobguard_binding_owner','app','CREATE') app,has_schema_privilege('jobguard_binding_owner','control_plane','CREATE') control_plane")).rows[0]).toEqual({app:false,control_plane:false});
    expect(await holderShape()).toEqual([{ role: "jobguard_binding_owner", ...adminOnly }, { role: "jobguard_meter_owner", ...adminOnly }, { role: "jobguard_shadow", ...adminOnly }, { role: "jobguard_shadow_emergency_access", ...adminOnly }]);
    expect((await admin.query(`SELECT pg_has_role('neondb_owner','jobguard_shadow','USAGE') AS shadow_usage,pg_has_role('neondb_owner','jobguard_shadow','SET') AS shadow_set,
      pg_has_role('neondb_owner','jobguard_shadow_emergency_access','USAGE') AS emergency_usage,pg_has_role('neondb_owner','jobguard_shadow_emergency_access','SET') AS emergency_set`)).rows)
      .toEqual([{ shadow_usage: false, shadow_set: false, emergency_usage: false, emergency_set: false }]);
    expect((await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_runtime'")).rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    // Exact LP-5a ownership exceptions; every other business/control table remains migration-owned.
    expect((await admin.query(`SELECT schemaname,tablename,tableowner FROM pg_tables
      WHERE schemaname IN ('app','identity','control_plane','audit_control','infrastructure')
        AND tableowner <> 'jobguard_migration' ORDER BY schemaname,tablename`)).rows).toEqual([
      { schemaname: "app", tablename: "command_lifecycle_claim", tableowner: "jobguard_command_writer" },
      { schemaname: "app", tablename: "command_type_registry", tableowner: "jobguard_command_writer" },
      { schemaname: "app", tablename: "repository_operational_record", tableowner: "jobguard_command_writer" },
    ]);
    expect((await admin.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind IN ('r','p') AND c.relname <> 'command_type_registry' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`)).rows).toEqual([{ count: 0 }]);
    const catalogue = await admin.connect();
    try {
      await catalogue.query("SET ROLE jobguard_migration");
      expect((await catalogue.query(`SELECT relrowsecurity,relforcerowsecurity,
        has_table_privilege('jobguard_runtime',oid,'SELECT') AS runtime_read,
        has_table_privilege('jobguard_runtime',oid,'INSERT') AS runtime_insert
        FROM pg_class WHERE oid='app.command_type_registry'::regclass`)).rows)
        .toEqual([{ relrowsecurity: false, relforcerowsecurity: false, runtime_read: false, runtime_insert: false }]);
    } finally { await catalogue.query("RESET ROLE"); catalogue.release(); }
    // M4-8-S adds six read-only runtime catalog rows; bootstrap must preserve the no-direct-write standard.
    for (const table of ["recovery_allocation_command", "recovery_allocation_review", "recovery_allocation_line_source", "recovery_case_allocation", "recovery_case_allocation_reversal", "receipt_line_allocation"]) {
      expect((await admin.query(`SELECT pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,
        has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_select,
        has_table_privilege('jobguard_runtime',c.oid,'INSERT') can_insert,
        has_table_privilege('jobguard_runtime',c.oid,'UPDATE') can_update,
        has_table_privilege('jobguard_runtime',c.oid,'DELETE') can_delete
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=$1`, [table])).rows).toEqual([{
        owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true, can_select: true, can_insert: false, can_update: false, can_delete: false,
      }]);
    }
    expect((await admin.query("SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication FROM pg_roles WHERE rolname='jobguard_audit_writer'")).rows).toEqual([
      {rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false,rolreplication:false},
    ]);
    expect((await admin.query(`SELECT has_schema_privilege('jobguard_audit_writer','app','CREATE') can_create,
      pg_has_role('jobguard_migration','jobguard_audit_writer','MEMBER') migration_member,
      pg_has_role('jobguard_runtime','jobguard_audit_writer','MEMBER') runtime_member`)).rows).toEqual([
      {can_create:false,migration_member:false,runtime_member:false},
    ]);
    expect((await admin.query("SELECT rolcreaterole FROM pg_roles WHERE rolname='jobguard_migration'")).rows).toEqual([{ rolcreaterole: false }]);
    for (const role of ["jobguard_command_writer"]) {
      expect((await admin.query(`SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication
        FROM pg_roles WHERE rolname=$1`, [role])).rows).toEqual([{
        rolcanlogin: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false, rolreplication: false,
      }]);
      expect((await admin.query(`SELECT has_schema_privilege($1,'app','CREATE') AS create,
        pg_has_role('jobguard_migration',$1,'MEMBER') AS migration_member,
        pg_has_role('jobguard_runtime',$1,'MEMBER') AS runtime_member`, [role])).rows)
        .toEqual([{ create: false, migration_member: false, runtime_member: false }]);
      expect((await admin.query(`SELECT pg_get_userbyid(member) AS member,admin_option,inherit_option,set_option
        FROM pg_auth_members WHERE roleid=$1::regrole`, [role])).rows)
        .toEqual([{ member: "neondb_owner", admin_option: true, inherit_option: false, set_option: false }]);
    }
    runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
    const client = await runtime.connect();
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    expect((await client.query("SELECT title,status,revision FROM app.job ORDER BY title")).rows).toEqual([
      { title: "Kitchen extension", status: "live", revision: 0 },
      { title: "Loft conversion", status: "quoting", revision: 0 },
      { title: "Practice kitchen", status: "quoting", revision: 0 },
    ]);
    expect((await client.query("SELECT job_id,job_track,environment,provenance,source_id FROM app.job_commercial_track ORDER BY job_id")).rows).toEqual([
      { job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", job_track: "small_builder", environment: "synthetic_demo", provenance: "legacy_synthetic_live_fixture", source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    ]);
    await expect(client.query("UPDATE app.job SET title='forbidden'")).rejects.toMatchObject({ code: "42501" }); await client.query("ROLLBACK");
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await expect(client.query("INSERT INTO app.job(id,tenant_id,title) VALUES(gen_random_uuid(),'22222222-2222-4222-8222-222222222222','foreign')")).rejects.toMatchObject({ code: "42501" });
    await client.query("ROLLBACK"); client.release();
    expect((await runtime.query("SELECT current_setting('app.tenant_id',true) tenant,count(*)::int count FROM app.job GROUP BY 1")).rows).toEqual([]);
    // Fail closed: a second holder of the support role makes bootstrap refuse; revoking it restores the exact shape.
    await admin.query("CREATE ROLE sv2_probe_holder NOLOGIN");
    await admin.query("GRANT jobguard_shadow_emergency_access TO sv2_probe_holder");
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow("holder other than the PostgreSQL 16 ADMIN-only creator membership");
    await admin.query("REVOKE jobguard_shadow_emergency_access FROM sv2_probe_holder");
    await admin.query("GRANT jobguard_meter_owner TO sv2_probe_holder");
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow("holder other than the PostgreSQL 16 ADMIN-only creator membership");
    await admin.query("REVOKE jobguard_meter_owner FROM sv2_probe_holder");
    await admin.query("GRANT jobguard_audit_writer TO sv2_probe_holder");
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow("jobguard_audit_writer has a holder other than the PostgreSQL 16 ADMIN-only creator membership");
    await admin.query("REVOKE jobguard_audit_writer FROM sv2_probe_holder");
    await admin.query("ALTER ROLE jobguard_audit_writer LOGIN");
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow("jobguard_audit_writer does not have the required least-privilege posture");
    await admin.query("ALTER ROLE jobguard_audit_writer NOLOGIN");
    await admin.query("GRANT jobguard_runtime TO jobguard_audit_writer");
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow("jobguard_audit_writer does not have the required least-privilege posture");
    await admin.query("REVOKE jobguard_runtime FROM jobguard_audit_writer");
    for (const role of ["jobguard_command_writer"]) {
      await admin.query(`GRANT ${role} TO sv2_probe_holder`);
      await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow(`${role} has a holder other than the PostgreSQL 16 ADMIN-only creator membership`);
      await admin.query(`REVOKE ${role} FROM sv2_probe_holder`);
      await admin.query(`ALTER ROLE ${role} LOGIN`);
      await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow(`${role} does not have the required least-privilege posture`);
      await admin.query(`ALTER ROLE ${role} NOLOGIN`);
      await admin.query(`GRANT jobguard_runtime TO ${role}`);
      await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toThrow(`${role} does not have the required least-privilege posture`);
      await admin.query(`REVOKE jobguard_runtime FROM ${role}`);
    }
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: MIGRATION_URLS.length });
    expect(await holderShape()).toEqual([{ role: "jobguard_binding_owner", ...adminOnly }, { role: "jobguard_meter_owner", ...adminOnly }, { role: "jobguard_shadow", ...adminOnly }, { role: "jobguard_shadow_emergency_access", ...adminOnly }]);
  }, 60_000);
  it("creates and commits the subsequent builder origin using the actual runtime role", async () => {
    const client = await runtime.connect(), scope = randomUUID(), variation = randomUUID();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
      expect((await client.query("SELECT current_user")).rows).toEqual([{ current_user: "jobguard_runtime" }]);
      await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reserved')", [scope, DEMO_TENANT_ID]);
      await client.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description) VALUES($1,$2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$3,'text','Fictional extra','Fictional extra')", [variation, DEMO_TENANT_ID, scope]);
      await client.query("COMMIT");
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
      expect((await client.query("SELECT job_track,kind,provenance,raising_role FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [DEMO_TENANT_ID, variation])).rows).toEqual([{ job_track: "small_builder", kind: "builder_logged", provenance: "legacy_synthetic_capture", raising_role: "legacy_unrecorded" }]);
      await expect(client.query("UPDATE app.job_commercial_track SET job_track='contractor' WHERE tenant_id=$1", [DEMO_TENANT_ID])).rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("refuses an environment or database not explicitly synthetic", async () => {
    process.env.JOBGUARD_ENV = "production";
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
    process.env.JOBGUARD_ENV = "synthetic_demo";
    await expect(bootstrapSyntheticDemo({ ownerUrl: ownerUrl.replace(SYNTHETIC_DATABASE_NAME, "postgres"), runtimeUrl })).rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
  });
});
