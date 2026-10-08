import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bootstrapSyntheticDemo, SYNTHETIC_DATABASE_NAME } from "../src/demo-bootstrap.js";
import { DEMO_TENANT_ID, demoCheckpoints } from "../src/demo-seed.js";
import { closeTestPools } from "./pool-test-utils.js";
import { MIGRATION_URLS } from "../src/migrate.js";

describe("bootstrap SQL trace (no PostgreSQL proof)", () => {
  it("binds the synthetic small-builder track in the fixture transaction before going live", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = { release() {}, async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (sql.includes("FROM pg_roles WHERE rolname='jobguard_runtime'")) return { rowCount: 1, rows: [{ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolcanlogin: true }] };
      // SV-2's two shadow roles: a least-privilege posture row each, and no holder other than the creator's (none in this trace).
      if (sql.includes("SELECT rolsuper,rolbypassrls") && sql.includes("FROM pg_roles WHERE rolname=$1") && ["jobguard_shadow", "jobguard_shadow_emergency_access"].includes(values[0] as string)) return { rowCount: 1, rows: [{ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolcanlogin: false, member: false }] };
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
      await bootstrapSyntheticDemo({ ownerUrl: `postgresql://synthetic_owner:fixture@localhost/${SYNTHETIC_DATABASE_NAME}`, runtimeUrl: `postgresql://jobguard_runtime:fixture@localhost/${SYNTHETIC_DATABASE_NAME}` });
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
  const port = 57800 + Math.floor(Math.random() * 100);
  const password = "synthetic-bootstrap-only";
  const ownerUrl = `postgresql://neondb_owner:${password}@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`;
  const runtimeUrl = `postgresql://jobguard_runtime:runtime-synthetic-only@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jobguard-bootstrap-"));
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
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: MIGRATION_URLS.length, tenantId: DEMO_TENANT_ID });
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: MIGRATION_URLS.length });
    const verifier = await admin.connect();
    await verifier.query("SET ROLE jobguard_migration");
    await verifier.query("SELECT set_config('app.tenant_id',$1,false)", [DEMO_TENANT_ID]);
    const applied = (await verifier.query("SELECT migration_name FROM jobguard_schema_migration ORDER BY migration_name")).rows.map(({ migration_name }) => migration_name);
    expect(applied).toHaveLength(MIGRATION_URLS.length);
    expect(applied).toEqual(MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!));
    expect((await verifier.query("SELECT semantic_key FROM app.command_receipt WHERE tenant_id=$1", [DEMO_TENANT_ID])).rowCount).toBe(demoCheckpoints.length);
    await verifier.query("RESET ROLE"); verifier.release();
    expect((await admin.query("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname IN ('jobguard_shadow','jobguard_shadow_emergency_access') ORDER BY rolname")).rows).toEqual([
      { rolname: "jobguard_shadow", rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false },
      { rolname: "jobguard_shadow_emergency_access", rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false },
    ]);
    // PostgreSQL 16 gives the CREATEROLE bootstrap owner an automatic ADMIN-only membership (no INHERIT, no SET)
    // granted by the bootstrap superuser. The owner cannot revoke it, so the exact shape is asserted: that one
    // holder per role and no other, with no privilege of either role, as the support route's USAGE check relies on.
    const holderShape = async () => (await admin.query(`SELECT r.rolname AS role,pg_get_userbyid(m.member) AS member,pg_get_userbyid(m.grantor) AS grantor,m.admin_option,m.inherit_option,m.set_option
      FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname IN ('jobguard_shadow','jobguard_shadow_emergency_access') ORDER BY r.rolname`)).rows;
    const adminOnly = { member: "neondb_owner", grantor: "postgres", admin_option: true, inherit_option: false, set_option: false };
    expect(await holderShape()).toEqual([{ role: "jobguard_shadow", ...adminOnly }, { role: "jobguard_shadow_emergency_access", ...adminOnly }]);
    expect((await admin.query(`SELECT pg_has_role('neondb_owner','jobguard_shadow','USAGE') AS shadow_usage,pg_has_role('neondb_owner','jobguard_shadow','SET') AS shadow_set,
      pg_has_role('neondb_owner','jobguard_shadow_emergency_access','USAGE') AS emergency_usage,pg_has_role('neondb_owner','jobguard_shadow_emergency_access','SET') AS emergency_set`)).rows)
      .toEqual([{ shadow_usage: false, shadow_set: false, emergency_usage: false, emergency_set: false }]);
    expect((await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_runtime'")).rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    expect((await admin.query(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname IN ('app','identity','control_plane','audit_control','infrastructure') AND tableowner <> 'jobguard_migration'`)).rows).toEqual([{ count: 0 }]);
    expect((await admin.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`)).rows).toEqual([{ count: 0 }]);
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
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: MIGRATION_URLS.length });
    expect(await holderShape()).toEqual([{ role: "jobguard_shadow", ...adminOnly }, { role: "jobguard_shadow_emergency_access", ...adminOnly }]);
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
