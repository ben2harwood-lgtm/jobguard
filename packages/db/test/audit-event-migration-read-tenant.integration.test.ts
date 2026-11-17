import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { closeTestPools, freePort, syntheticOwnerPool } from "./pool-test-utils.js";

const tenantA = randomUUID(), tenantB = randomUUID();
const columns = "tenant_id, sequence, event_hash";
const newest = [tenantA, tenantB].sort().map(tenant_id => ({ tenant_id, sequence: "2", event_hash: "b".repeat(64) }));
let postgres: EmbeddedPostgres, directory: string, admin: Pool;

// Superuser fixture setup is separate from each restricted-role read below.
// The unchanged handoff suite additionally proves the real non-superuser bootstrap.
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-audit-migration-read-"));
  const port = await freePort(58600, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres",
    password: "synthetic-test-only", persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = await syntheticOwnerPool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic-test-only" });
  await migrate(admin);
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role=replica");
    for (const tenant of [tenantA, tenantB]) {
      await client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
      for (const sequence of [1, 2]) {
        await client.query(`INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,
          subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
          VALUES($1,$2,$3,'audit.v1','test:synthetic','test.recorded','test','fictional',clock_timestamp(),
          '{}'::jsonb,$4,$5,$6)`, [randomUUID(), tenant, sequence, "a".repeat(64),
          sequence === 1 ? null : "a".repeat(64), (sequence === 1 ? "a" : "b").repeat(64)]);
      }
    }
    await client.query(`CREATE FUNCTION app.test_unfiltered_migration_audit()
      RETURNS TABLE(tenant_id uuid, sequence bigint, event_hash char(64))
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS
      $$ SELECT tenant_id, sequence, event_hash FROM app.audit_event ORDER BY tenant_id, sequence $$`);
    await client.query("ALTER FUNCTION app.test_unfiltered_migration_audit() OWNER TO jobguard_migration");
    await client.query("REVOKE ALL ON FUNCTION app.test_unfiltered_migration_audit() FROM PUBLIC");
    await client.query("GRANT EXECUTE ON FUNCTION app.test_unfiltered_migration_audit() TO jobguard_runtime");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}, 120_000);

afterAll(async () => {
  await closeTestPools(admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function readAs(role: "jobguard_migration" | "jobguard_runtime" | "jobguard_infrastructure" | "jobguard_audit_verifier", sql: string, tenant?: string) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    if (tenant !== undefined) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    else await client.query("RESET app.tenant_id");
    expect((await client.query("SELECT current_user")).rows[0].current_user).toBe(role);
    return (await client.query(sql)).rows;
  } finally { await client.query("ROLLBACK"); client.release(); }
}

describe("migration-role audit reads (LATER-SAFETY-129)", () => {
  it("with two tenants' audit rows present, jobguard_migration under tenant A sees only A's rows", async () => {
    expect(await readAs("jobguard_migration", `SELECT ${columns} FROM app.audit_event ORDER BY sequence`, tenantA))
      .toEqual([1, 2].map(sequence => ({ tenant_id: tenantA, sequence: String(sequence), event_hash: (sequence === 1 ? "a" : "b").repeat(64) })));
    expect((await readAs("jobguard_migration", "SELECT DISTINCT tenant_id FROM app.audit_event", tenantB)))
      .toEqual([{ tenant_id: tenantB }]);
  });

  it("with two tenants' audit rows present, jobguard_migration with app.tenant_id unset sees no rows", async () => {
    expect(await readAs("jobguard_migration", `SELECT ${columns} FROM app.audit_event`)).toEqual([]);
    expect(await readAs("jobguard_migration", `SELECT ${columns} FROM app.audit_event`, "")).toEqual([]);
  });

  it("a test-only SECURITY DEFINER owned by jobguard_migration without a tenant filter, called by jobguard_runtime under tenant A, returns only A's rows", async () => {
    const rows = await readAs("jobguard_runtime", "SELECT * FROM app.test_unfiltered_migration_audit()", tenantA);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.tenant_id)).toEqual([tenantA, tenantA]);
    expect(await readAs("jobguard_runtime", "SELECT * FROM app.test_unfiltered_migration_audit()")).toEqual([]);
  });

  it.each(["jobguard_runtime", "jobguard_infrastructure"] as const)("%s cannot execute checkpoint_candidates", async role => {
    expect((await admin.query("SELECT has_function_privilege($1,'audit_control.checkpoint_candidates()','EXECUTE') allowed", [role])).rows)
      .toEqual([{ allowed: false }]);
    await expect(readAs(role, "SELECT * FROM audit_control.checkpoint_candidates()", tenantA)).rejects.toMatchObject({ code: "42501" });
  });

  it("the verifier is a non-owner NOLOGIN NOBYPASSRLS role with no memberships and only three readable audit columns", async () => {
    expect((await admin.query(`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls
      FROM pg_roles WHERE rolname='jobguard_audit_verifier'`)).rows).toEqual([{
      rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolbypassrls: false,
    }]);
    expect((await admin.query(`SELECT 1 FROM pg_auth_members WHERE roleid='jobguard_audit_verifier'::regrole
      OR member='jobguard_audit_verifier'::regrole`)).rows).toEqual([]);
    expect((await admin.query(`SELECT attname FROM pg_attribute WHERE attrelid='app.audit_event'::regclass
      AND attnum>0 AND NOT attisdropped AND has_column_privilege('jobguard_audit_verifier',attrelid,attnum,'SELECT')
      ORDER BY attname`)).rows.map(row => row.attname)).toEqual(["event_hash", "sequence", "tenant_id"]);
    expect((await admin.query(`SELECT pg_get_userbyid(relowner) owner,relforcerowsecurity FROM pg_class
      WHERE oid='app.audit_event'::regclass`)).rows).toEqual([{ owner: "jobguard_migration", relforcerowsecurity: true }]);
    await expect(readAs("jobguard_audit_verifier", "SELECT payload FROM app.audit_event")).rejects.toMatchObject({ code: "42501" });
    expect(await readAs("jobguard_audit_verifier", `SELECT ${columns} FROM app.audit_event`)).toHaveLength(4);
  });

  it("jobguard_migration gets both tenants' newest checkpoint candidates without tenant context or under a different tenant", async () => {
    const sql = "SELECT * FROM audit_control.checkpoint_candidates() ORDER BY tenant_id";
    expect(await readAs("jobguard_migration", sql)).toEqual(newest);
    expect(await readAs("jobguard_migration", sql, tenantA)).toEqual(newest);
    expect((await admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig
      FROM pg_proc WHERE oid='audit_control.checkpoint_candidates()'::regprocedure`)).rows).toEqual([{
      owner: "jobguard_audit_verifier", prosecdef: true, provolatile: "s", proconfig: ["search_path=pg_catalog, pg_temp"],
    }]);
  });
});
