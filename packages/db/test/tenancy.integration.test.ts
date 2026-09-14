import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAccounts, migrate, type VerifiedTenantContext, withTenant } from "../src/index.js";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_A = "a0000000-0000-4000-8000-000000000001";
const ACCOUNT_B = "b0000000-0000-4000-8000-000000000002";
const USER_A = "c0000000-0000-4000-8000-000000000001";
const USER_B = "d0000000-0000-4000-8000-000000000002";

// Authentication creates these in M0-6. This test-only cast exercises M0-4 given trusted context.
const context = (tenantId: string): VerifiedTenantContext =>
  ({ tenantId }) as VerifiedTenantContext;

let postgres: EmbeddedPostgres;
let admin: Pool;
let runtime: Pool;
let databaseDir: string;
let port: number;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jobguard-pg16-"));
  port = 55432 + Math.floor(Math.random() * 500);
  postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "synthetic-test-only",
    persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    // Minimal build images may not install the library's en_US locale.
    initdbFlags: ["--lc-messages=C"],
    onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic-test-only" });
  await migrate(admin);
  await admin.query(`
    INSERT INTO control_plane.tenant (id) VALUES ('${TENANT_A}'), ('${TENANT_B}');
    INSERT INTO identity.identity_user (id) VALUES ('${USER_A}'), ('${USER_B}');
    INSERT INTO app.account (id, tenant_id, name) VALUES
      ('${ACCOUNT_A}', '${TENANT_A}', 'Tenant A'),
      ('${ACCOUNT_B}', '${TENANT_B}', 'Tenant B');
    INSERT INTO app.membership (id, tenant_id, account_id, identity_user_id, role) VALUES
      ('11000000-0000-4000-8000-000000000001', '${TENANT_A}', '${ACCOUNT_A}', '${USER_A}', 'owner'),
      ('22000000-0000-4000-8000-000000000002', '${TENANT_B}', '${ACCOUNT_B}', '${USER_B}', 'owner');
    CREATE ROLE jobguard_test_login LOGIN PASSWORD 'synthetic-runtime-only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
    GRANT jobguard_runtime TO jobguard_test_login;
  `);
  runtime = new Pool({
    host: "127.0.0.1",
    port,
    database: "postgres",
    user: "jobguard_test_login",
    password: "synthetic-runtime-only",
    max: 1,
  });
}, 60_000);

afterAll(async () => {
  await runtime?.end();
  await admin?.end();
  await postgres?.stop();
  await rm(databaseDir, { recursive: true, force: true });
});

describe("tenant context and PostgreSQL RLS", () => {
  it("allows a same-tenant read and denies a cross-tenant read even with a wrong filter", async () => {
    await withTenant(runtime, context(TENANT_A), async (database) => {
      expect((await listAccounts(database)).map(({ name }) => name)).toEqual(["Tenant A"]);
      const crossTenant = await database.$client.query(
        "SELECT name FROM app.account WHERE id = $1 OR tenant_id = $2",
        [ACCOUNT_B, TENANT_B],
      );
      expect(crossTenant.rows).toEqual([]);
    });
  });

  it("applies WITH CHECK to inserts, updates, and changed tenant_id", async () => {
    await expect(
      withTenant(runtime, context(TENANT_A), (database) =>
        database.$client.query(
          "INSERT INTO app.account (id, tenant_id, name) VALUES ($1, $2, 'forbidden')",
          ["a1000000-0000-4000-8000-000000000001", TENANT_B],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await withTenant(runtime, context(TENANT_A), async (database) => {
      const hiddenUpdate = await database.$client.query(
        "UPDATE app.account SET name = 'changed' WHERE id = $1",
        [ACCOUNT_B],
      );
      expect(hiddenUpdate.rowCount).toBe(0);
      await expect(
        database.$client.query("UPDATE app.account SET tenant_id = $1 WHERE id = $2", [
          TENANT_B,
          ACCOUNT_A,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("allows same-tenant insert, update, and delete operations", async () => {
    const id = "a3000000-0000-4000-8000-000000000003";
    await withTenant(runtime, context(TENANT_A), async (database) => {
      await database.$client.query(
        "INSERT INTO app.account (id, tenant_id, name) VALUES ($1, $2, 'temporary')",
        [id, TENANT_A],
      );
      const update = await database.$client.query("UPDATE app.account SET name = 'updated' WHERE id = $1", [id]);
      expect(update.rowCount).toBe(1);
      const deletion = await database.$client.query("DELETE FROM app.account WHERE id = $1", [id]);
      expect(deletion.rowCount).toBe(1);
    });
  });

  it("limits deletes and rejects cross-tenant composite references without disclosure", async () => {
    await withTenant(runtime, context(TENANT_A), async (database) => {
      const deletion = await database.$client.query("DELETE FROM app.account WHERE id = $1", [ACCOUNT_B]);
      expect(deletion.rowCount).toBe(0);
      await expect(
        database.$client.query(
          `INSERT INTO app.membership
             (id, tenant_id, account_id, identity_user_id, role)
           VALUES ($1, $2, $3, $4, 'member')`,
          ["33000000-0000-4000-8000-000000000003", TENANT_A, ACCOUNT_B, USER_A],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("fails closed for missing/malformed context and does not retain pooled tenant state", async () => {
    await expect(withTenant(runtime, context("not-a-uuid"), async () => undefined)).rejects.toMatchObject({
      code: "INVALID_TENANT_CONTEXT",
    });
    const missing = await runtime.query("SELECT * FROM app.account");
    expect(missing.rows).toEqual([]);

    await withTenant(runtime, context(TENANT_A), async (database) => {
      expect((await database.$client.query("SELECT name FROM app.account")).rows).toHaveLength(1);
    });
    const reused = await runtime.query("SELECT current_setting('app.tenant_id', true) AS tenant, * FROM app.account");
    expect(reused.rows).toEqual([]);
  });

  it("rolls back domain writes when work fails", async () => {
    const id = "a2000000-0000-4000-8000-000000000002";
    await expect(
      withTenant(runtime, context(TENANT_A), async (database) => {
        await database.$client.query(
          "INSERT INTO app.account (id, tenant_id, name) VALUES ($1, $2, 'rollback')",
          [id, TENANT_A],
        );
        throw new Error("synthetic failure");
      }),
    ).rejects.toThrow("synthetic failure");
    await withTenant(runtime, context(TENANT_A), async (database) => {
      expect((await database.$client.query("SELECT id FROM app.account WHERE id = $1", [id])).rows).toEqual([]);
    });
  });
});

describe("migration and privilege catalog", () => {
  it("supports a fresh migration and idempotent upgrade", async () => {
    await expect(migrate(admin)).resolves.toBeUndefined();
    expect((await admin.query("SELECT count(*)::int AS count FROM app.account")).rows[0]?.count).toBe(2);
  });

  it("automatically finds every business table protected by enabled and forced RLS plus a check policy", async () => {
    const result = await admin.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
             bool_or(p.polcmd = '*' AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) AS guarded
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'app' AND c.relkind = 'r'
      GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
      ORDER BY c.relname
    `);
    expect(result.rows).toEqual([
      { relname: "account", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "action_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "action_authorization", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "action_outbox", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "audit_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "capture_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "command_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "decision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "decision_resolution", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_object", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_upload", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "financial_authorization", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_record_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "journal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "journal_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "ledger_account", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "ledger_book", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "membership", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proposal_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "provider_event_inbox", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_identity", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_lineage", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_progress", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
    ]);
  });

  it("keeps runtime and infrastructure roles unprivileged", async () => {
    const roles = await admin.query(`
      SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolbypassrls
      FROM pg_roles WHERE rolname IN ('jobguard_runtime', 'jobguard_infrastructure') ORDER BY rolname
    `);
    for (const role of roles.rows) {
      expect(role).toMatchObject({
        rolsuper: false,
        rolinherit: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolbypassrls: false,
      });
    }
    expect(await runtime.query("SELECT has_schema_privilege('identity', 'USAGE') AS allowed"))
      .toMatchObject({ rows: [{ allowed: false }] });
    await expect(runtime.query("TRUNCATE app.account")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("ALTER TABLE app.account DISABLE ROW LEVEL SECURITY")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(runtime.query("SET ROLE postgres")).rejects.toMatchObject({ code: "42501" });
    const infra = await admin.query(
      "SELECT has_schema_privilege('jobguard_infrastructure', 'app', 'USAGE') AS app_access",
    );
    expect(infra.rows).toEqual([{ app_access: false }]);
    const ownership = await admin.query(`
      SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r' ORDER BY c.relname
    `);
    expect(ownership.rows).toEqual([
      { relname: "account", owner: "jobguard_migration" },
      { relname: "action_attempt", owner: "jobguard_migration" },
      { relname: "action_authorization", owner: "jobguard_migration" },
      { relname: "action_outbox", owner: "jobguard_migration" },
      { relname: "audit_event", owner: "jobguard_migration" },
      { relname: "capture_source", owner: "jobguard_migration" },
      { relname: "command_receipt", owner: "jobguard_migration" },
      { relname: "decision", owner: "jobguard_migration" },
      { relname: "decision_resolution", owner: "jobguard_migration" },
      { relname: "evidence_link", owner: "jobguard_migration" },
      { relname: "evidence_object", owner: "jobguard_migration" },
      { relname: "evidence_upload", owner: "jobguard_migration" },
      { relname: "financial_authorization", owner: "jobguard_migration" },
      { relname: "job", owner: "jobguard_migration" },
      { relname: "job_record_proposal", owner: "jobguard_migration" },
      { relname: "journal", owner: "jobguard_migration" },
      { relname: "journal_line", owner: "jobguard_migration" },
      { relname: "ledger_account", owner: "jobguard_migration" },
      { relname: "ledger_book", owner: "jobguard_migration" },
      { relname: "membership", owner: "jobguard_migration" },
      { relname: "proposal_line", owner: "jobguard_migration" },
      { relname: "provider_event_inbox", owner: "jobguard_migration" },
      { relname: "quote_version", owner: "jobguard_migration" },
      { relname: "scope_identity", owner: "jobguard_migration" },
      { relname: "scope_lineage", owner: "jobguard_migration" },
      { relname: "scope_progress", owner: "jobguard_migration" },
      { relname: "scope_revision", owner: "jobguard_migration" },
    ]);
  });
});
