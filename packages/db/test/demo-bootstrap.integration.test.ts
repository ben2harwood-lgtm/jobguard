import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSyntheticDemo, SYNTHETIC_DATABASE_NAME } from "../src/demo-bootstrap.js";
import { DEMO_TENANT_ID, demoCheckpoints } from "../src/demo-seed.js";
import { closeTestPools } from "./pool-test-utils.js";

describe("synthetic Vercel/Neon bootstrap", () => {
  let postgres: EmbeddedPostgres; let directory: string; let admin: Pool; let runtime: Pool;
  const port = 57800 + Math.floor(Math.random() * 100);
  const password = "synthetic-bootstrap-only";
  const ownerUrl = `postgresql://neondb_owner:${password}@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`;
  const runtimeUrl = `postgresql://jobguard_runtime:runtime-synthetic-only@127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jobguard-bootstrap-"));
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
    await control.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
    await control.query(`CREATE DATABASE ${SYNTHETIC_DATABASE_NAME} OWNER neondb_owner`); await control.end();
    admin = new Pool({ connectionString: ownerUrl });
  }, 60_000);
  afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); await rm(directory, { recursive: true, force: true }); });

  it("creates roles, applies 0000..0024, seeds once, replays safely, and keeps pooled RLS local", async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: 22, tenantId: DEMO_TENANT_ID });
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).resolves.toMatchObject({ migrations: 22 });
    const verifier = await admin.connect();
    await verifier.query("SET ROLE jobguard_migration");
    await verifier.query("SELECT set_config('app.tenant_id',$1,false)", [DEMO_TENANT_ID]);
    expect((await verifier.query("SELECT migration_name FROM jobguard_schema_migration ORDER BY migration_name")).rows.map(({ migration_name }) => migration_name)).toHaveLength(27);
    expect((await verifier.query("SELECT semantic_key FROM app.command_receipt WHERE tenant_id=$1", [DEMO_TENANT_ID])).rowCount).toBe(demoCheckpoints.length);
    await verifier.query("RESET ROLE"); verifier.release();
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
    await expect(client.query("UPDATE app.job SET title='forbidden'")).rejects.toMatchObject({ code: "42501" }); await client.query("ROLLBACK");
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await expect(client.query("INSERT INTO app.job(id,tenant_id,title) VALUES(gen_random_uuid(),'22222222-2222-4222-8222-222222222222','foreign')")).rejects.toMatchObject({ code: "42501" });
    await client.query("ROLLBACK"); client.release();
    expect((await runtime.query("SELECT current_setting('app.tenant_id',true) tenant,count(*)::int count FROM app.job GROUP BY 1")).rows).toEqual([]);
  }, 60_000);

  it("refuses an environment or database not explicitly synthetic", async () => {
    process.env.JOBGUARD_ENV = "production";
    await expect(bootstrapSyntheticDemo({ ownerUrl, runtimeUrl })).rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
    process.env.JOBGUARD_ENV = "synthetic_demo";
    await expect(bootstrapSyntheticDemo({ ownerUrl: ownerUrl.replace(SYNTHETIC_DATABASE_NAME, "postgres"), runtimeUrl })).rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
  });
});
