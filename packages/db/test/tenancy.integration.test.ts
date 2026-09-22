import { closeTestPools } from "./pool-test-utils.js";
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
  await closeTestPools(runtime, admin);
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
      { relname: "acceptance_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "account", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "action_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "action_authorization", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "action_outbox", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "audit_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "cap_snapshot", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "capture_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "command_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "commercial_integrity_activity_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "commercial_integrity_value_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_credit_note", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_credit_note_sequence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_invoice", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_invoice_evidence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_invoice_sequence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_payment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_payment_reversal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "decision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "decision_resolution", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "discrepancy_finding_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "discrepancy_review_outcome", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_invalidation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_object", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_upload", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "fee_illustration_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_draft", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_proof", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "financial_authorization", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "finding_suppression", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "goods_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "imported_job_baseline", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_decision_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_finding_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_outcome_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_preference_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_activation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_finding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_record_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "journal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "journal_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "landing_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "landing_reversal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "ledger_account", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "ledger_book", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "material_pack_conversion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "material_rate_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "material_requirement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "membership", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "merchant", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "merchant_sku", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "merchant_sku_alias", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "planned_work_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proposal_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proposal_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proposal_review_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proposal_review_line_parent", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proposal_review_question", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "provider_event_inbox", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "purchase_order_draft", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "purchase_order_placement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "purchase_order_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_acceptance", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_delivery_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_document_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_draft", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_send", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "quote_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "rate_book_observation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "readiness_decision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "readiness_snapshot", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_claim_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_demo_selection", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_eligibility_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_fee_derivation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_fee_journal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_adapter_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_run_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_work", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_identity", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_lineage", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_progress", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "simulated_settlement_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stage_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stage_review_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_bill_supersession", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_document", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_document_intake", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_document_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_fact_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_fact_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_match_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_match_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_match_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "synthetic_evidence_original", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "synthetic_obligation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "synthetic_recovery_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_rate_observation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_rejection", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
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
      { relname: "acceptance_event", owner: "jobguard_migration" },
      { relname: "account", owner: "jobguard_migration" },
      { relname: "action_attempt", owner: "jobguard_migration" },
      { relname: "action_authorization", owner: "jobguard_migration" },
      { relname: "action_outbox", owner: "jobguard_migration" },
      { relname: "audit_event", owner: "jobguard_migration" },
      { relname: "cap_snapshot", owner: "jobguard_migration" },
      { relname: "capture_source", owner: "jobguard_migration" },
      { relname: "command_receipt", owner: "jobguard_migration" },
      { relname: "commercial_integrity_activity_fact", owner: "jobguard_migration" },
      { relname: "commercial_integrity_value_fact", owner: "jobguard_migration" },
      { relname: "customer_credit_note", owner: "jobguard_migration" },
      { relname: "customer_credit_note_sequence", owner: "jobguard_migration" },
      { relname: "customer_invoice", owner: "jobguard_migration" },
      { relname: "customer_invoice_evidence", owner: "jobguard_migration" },
      { relname: "customer_invoice_sequence", owner: "jobguard_migration" },
      { relname: "customer_payment", owner: "jobguard_migration" },
      { relname: "customer_payment_reversal", owner: "jobguard_migration" },
      { relname: "decision", owner: "jobguard_migration" },
      { relname: "decision_resolution", owner: "jobguard_migration" },
      { relname: "discrepancy_finding_revision", owner: "jobguard_migration" },
      { relname: "discrepancy_review_outcome", owner: "jobguard_migration" },
      { relname: "evidence_invalidation", owner: "jobguard_migration" },
      { relname: "evidence_link", owner: "jobguard_migration" },
      { relname: "evidence_object", owner: "jobguard_migration" },
      { relname: "evidence_upload", owner: "jobguard_migration" },
      { relname: "fee_illustration_source", owner: "jobguard_migration" },
      { relname: "final_account_draft", owner: "jobguard_migration" },
      { relname: "final_account_line", owner: "jobguard_migration" },
      { relname: "final_account_proof", owner: "jobguard_migration" },
      { relname: "final_account_revision", owner: "jobguard_migration" },
      { relname: "financial_authorization", owner: "jobguard_migration" },
      { relname: "finding_suppression", owner: "jobguard_migration" },
      { relname: "goods_receipt", owner: "jobguard_migration" },
      { relname: "imported_job_baseline", owner: "jobguard_migration" },
      { relname: "inbox_decision_revision", owner: "jobguard_migration" },
      { relname: "inbox_finding_revision", owner: "jobguard_migration" },
      { relname: "inbox_outcome_event", owner: "jobguard_migration" },
      { relname: "inbox_preference_revision", owner: "jobguard_migration" },
      { relname: "job", owner: "jobguard_migration" },
      { relname: "job_activation", owner: "jobguard_migration" },
      { relname: "job_finding", owner: "jobguard_migration" },
      { relname: "job_record_proposal", owner: "jobguard_migration" },
      { relname: "journal", owner: "jobguard_migration" },
      { relname: "journal_line", owner: "jobguard_migration" },
      { relname: "landing_allocation", owner: "jobguard_migration" },
      { relname: "landing_reversal", owner: "jobguard_migration" },
      { relname: "ledger_account", owner: "jobguard_migration" },
      { relname: "ledger_book", owner: "jobguard_migration" },
      { relname: "material_pack_conversion", owner: "jobguard_migration" },
      { relname: "material_rate_revision", owner: "jobguard_migration" },
      { relname: "material_requirement", owner: "jobguard_migration" },
      { relname: "membership", owner: "jobguard_migration" },
      { relname: "merchant", owner: "jobguard_migration" },
      { relname: "merchant_sku", owner: "jobguard_migration" },
      { relname: "merchant_sku_alias", owner: "jobguard_migration" },
      { relname: "planned_work_revision", owner: "jobguard_migration" },
      { relname: "proposal_line", owner: "jobguard_migration" },
      { relname: "proposal_review", owner: "jobguard_migration" },
      { relname: "proposal_review_line", owner: "jobguard_migration" },
      { relname: "proposal_review_line_parent", owner: "jobguard_migration" },
      { relname: "proposal_review_question", owner: "jobguard_migration" },
      { relname: "provider_event_inbox", owner: "jobguard_migration" },
      { relname: "purchase_order_draft", owner: "jobguard_migration" },
      { relname: "purchase_order_placement", owner: "jobguard_migration" },
      { relname: "purchase_order_revision", owner: "jobguard_migration" },
      { relname: "quote_acceptance", owner: "jobguard_migration" },
      { relname: "quote_delivery_event", owner: "jobguard_migration" },
      { relname: "quote_document_version", owner: "jobguard_migration" },
      { relname: "quote_draft", owner: "jobguard_migration" },
      { relname: "quote_line", owner: "jobguard_migration" },
      { relname: "quote_revision", owner: "jobguard_migration" },
      { relname: "quote_send", owner: "jobguard_migration" },
      { relname: "quote_version", owner: "jobguard_migration" },
      { relname: "rate_book_observation", owner: "jobguard_migration" },
      { relname: "readiness_decision", owner: "jobguard_migration" },
      { relname: "readiness_snapshot", owner: "jobguard_migration" },
      { relname: "recovery_approval", owner: "jobguard_migration" },
      { relname: "recovery_case", owner: "jobguard_migration" },
      { relname: "recovery_case_event", owner: "jobguard_migration" },
      { relname: "recovery_claim_revision", owner: "jobguard_migration" },
      { relname: "recovery_demo_selection", owner: "jobguard_migration" },
      { relname: "recovery_eligibility_revision", owner: "jobguard_migration" },
      { relname: "recovery_fee_derivation", owner: "jobguard_migration" },
      { relname: "recovery_fee_journal", owner: "jobguard_migration" },
      { relname: "recovery_review", owner: "jobguard_migration" },
      { relname: "sandbox_adapter_receipt", owner: "jobguard_migration" },
      { relname: "sandbox_run", owner: "jobguard_migration" },
      { relname: "sandbox_run_event", owner: "jobguard_migration" },
      { relname: "sandbox_work", owner: "jobguard_migration" },
      { relname: "scope_identity", owner: "jobguard_migration" },
      { relname: "scope_lineage", owner: "jobguard_migration" },
      { relname: "scope_progress", owner: "jobguard_migration" },
      { relname: "scope_revision", owner: "jobguard_migration" },
      { relname: "simulated_settlement_event", owner: "jobguard_migration" },
      { relname: "stage_completion", owner: "jobguard_migration" },
      { relname: "stage_review_event", owner: "jobguard_migration" },
      { relname: "supplier_bill_supersession", owner: "jobguard_migration" },
      { relname: "supplier_document", owner: "jobguard_migration" },
      { relname: "supplier_document_intake", owner: "jobguard_migration" },
      { relname: "supplier_document_version", owner: "jobguard_migration" },
      { relname: "supplier_fact_proposal", owner: "jobguard_migration" },
      { relname: "supplier_fact_revision", owner: "jobguard_migration" },
      { relname: "supplier_match_allocation", owner: "jobguard_migration" },
      { relname: "supplier_match_proposal", owner: "jobguard_migration" },
      { relname: "supplier_match_revision", owner: "jobguard_migration" },
      { relname: "synthetic_evidence_original", owner: "jobguard_migration" },
      { relname: "synthetic_obligation", owner: "jobguard_migration" },
      { relname: "synthetic_recovery_receipt", owner: "jobguard_migration" },
      { relname: "variation", owner: "jobguard_migration" },
      { relname: "variation_approval", owner: "jobguard_migration" },
      { relname: "variation_rate_observation", owner: "jobguard_migration" },
      { relname: "variation_rejection", owner: "jobguard_migration" },
      { relname: "variation_revision", owner: "jobguard_migration" },
    ]);
  });
});
