import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
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

// Synthetic authenticated membership creates stamped contexts for the RLS tests.
const context = (tenantId: string): VerifiedTenantContext =>
  testTenantContext(tenantId);

let postgres: EmbeddedPostgres;
let admin: Pool;
let runtime: Pool;
let databaseDir: string;
let port: number;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jobguard-pg16-"));
  port = await freePort(55433, 499);
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
  // LP-1 Q1, Ben decision 40: TEST-ONLY writer for the original RLS backstops.
  // It is a non-owner without bypass rights; the application login never gets these grants.
  await admin.query(`
    CREATE ROLE lp1_tenancy_fixture NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT jobguard_runtime TO lp1_tenancy_fixture;
    GRANT INSERT, UPDATE, DELETE ON app.account, app.membership TO lp1_tenancy_fixture;
  `);
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

    await withTenant(admin, context(TENANT_A), async (database) => {
      await database.$client.query("SET LOCAL ROLE lp1_tenancy_fixture");
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
    await withTenant(admin, context(TENANT_A), async (database) => {
      await database.$client.query("SET LOCAL ROLE lp1_tenancy_fixture");
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
    await withTenant(admin, context(TENANT_A), async (database) => {
      await database.$client.query("SET LOCAL ROLE lp1_tenancy_fixture");
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
    // Deliberately unstamped so the malformed context reaches withTenant's INVALID_TENANT_CONTEXT refusal.
    await expect(withTenant(runtime, { tenantId: "not-a-uuid" } as VerifiedTenantContext, async () => undefined)).rejects.toMatchObject({
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
      withTenant(admin, context(TENANT_A), async (database) => {
        await database.$client.query("SET LOCAL ROLE lp1_tenancy_fixture");
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

  // 0244 adds no tables. Its sole routine stays private; schema/name/arguments order.
  it("retains the private place-admission routine catalogue addition", async () => {
    expect((await admin.query(`
      SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
             r.rolname AS owner, p.prosecdef, p.proconfig,
             has_function_privilege('jobguard_runtime', p.oid, 'EXECUTE') AS runtime,
             has_function_privilege('jobguard_meter', p.oid, 'EXECUTE') AS meter,
             EXISTS (SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='app' AND p.proname='mon1_admit_place' ORDER BY 1,2,3
    `)).rows).toEqual([
      { nspname: "app", proname: "mon1_admit_place", args: "t uuid, j uuid, source_kind text, source_id uuid", owner: "jobguard_migration", prosecdef: false, proconfig: ["search_path=pg_catalog"], runtime: false, meter: false, public: false },
    ]);
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
      { relname: "activation_acceptance_operation_use", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "approval_rule_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "audit_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "audit_export", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "audit_export_checkpoint", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_allocation_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_application_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_export_batch", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_export_delivery", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_export_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_line_match", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_quarantine", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_status_import", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "cap_snapshot", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "capture_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "client_contract", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "client_contract_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "client_organisation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "closeout_answer", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "command_lifecycle_claim", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "command_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      // Explicit private command-registry control-plane exception.
      { relname: "command_type_registry", relrowsecurity: false, relforcerowsecurity: false, guarded: false },
      { relname: "commercial_integrity_activity_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "commercial_integrity_value_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "commercial_track_assignment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_agreement_status_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_client_customer", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_member", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_membership_revocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_party_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_receipt_line_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_resident_contact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "counterparty_check", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_credit_note", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_credit_note_sequence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_invoice", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_invoice_evidence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_invoice_sequence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_message_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_payment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_payment_reversal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_portal_grant", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_portal_session", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "customer_variation_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "decision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "decision_resolution", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "discrepancy_finding_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "discrepancy_review_outcome", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_agreement_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_baseline_batch", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_baseline_team", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_duplicate_correction", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_fee_contribution", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_fee_derivation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_fee_statement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_fee_statement_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_fee_statement_dispute", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "enterprise_fee_statement_section", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_invalidation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_object", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack_attachment_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack_v3", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack_v3_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack_v3_check", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_pack_v3_request", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "evidence_upload", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_approval_outcome", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_approval_request", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_approval_revision_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_approval_step_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_client_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_client_link_closure", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_completion_observation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_duplicate_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_escalation_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_evidence_pack", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_office_prompt_signal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_order_line_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_origin", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_pricing_basis", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_prompt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_prompt_citation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_prompt_rule_settings", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_sor_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "fee_illustration_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_draft", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_invoice_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_invoiced_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_lock", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_lock_check", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_proof", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_account_scope_disposition", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_disposition_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_manifest", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_manifest_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_processing_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_reveal_proof", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_run_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_source_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_terms_acceptance", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "financial_authorization", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "finding_suppression", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "goods_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "import_batch", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "import_row_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "imported_job_baseline", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_decision_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_finding_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_outcome_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "inbox_preference_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_activation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_activation_terms", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_assignment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_commercial_track", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_diary_entry", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_finding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_import_v3", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_party_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_party_current", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_photo_purpose", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_record_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_site_source_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_small_trip_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_small_trip_observation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_source_original", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_work_state_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "journal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "journal_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "landing_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "landing_reversal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "ledger_account", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "ledger_book", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "lp_job_insert_permit", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "material_pack_conversion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "material_rate_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "material_requirement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "materials_issue_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "membership", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "merchant", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "merchant_sku", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "merchant_sku_alias", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_computation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_correction", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_day_ledger", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_input_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_alert", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_computation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_correction", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_day_ledger", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_place_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_scope", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_lifecycle_source_ref", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_projection_alert", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "meter_work_ledger", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "northside_action_attribution", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "northside_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "org_unit", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "payment_fee_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "payment_fee_statement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "planned_work_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "platform_enterprise_fee", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "platform_enterprise_fee_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "platform_fee_statement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "platform_fee_statement_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "platform_statement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "platform_statement_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_feed_account", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_feed_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_feed_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_feed_job_owner", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_feed_receipt_match", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_supplier_credit_case_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_supplier_credit_review_payment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "prompt_resolution", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "property_constraint_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
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
      { relname: "quote_acceptance_sequence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
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
      { relname: "receipt_allocation_fact_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "receipt_allocation_fact_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "receipt_allocation_fact_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "receipt_allocation_fact_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "receipt_allocation_fact_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "receipt_line_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_allocation_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_allocation_line_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_allocation_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_attribution_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_attribution_reassessment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_attribution_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case_allocation_reversal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_case_terms_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_claim_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_claim_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_demo_selection", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_eligibility_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_eligibility_v3_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_fee_derivation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_fee_journal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_follow_up", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_follow_up_advance", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_follow_up_due", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_follow_up_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_follow_up_owner", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_follow_up_reminder", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_message", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_message_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_message_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_message_sink", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_payment_payer_mark", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_timeline_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "recovery_timeline_signal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "repository_operational_record", relrowsecurity: true, relforcerowsecurity: true, guarded: true },

      { relname: "role_grant", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "role_grant_revocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_adapter_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_run_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sandbox_work", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "schedule_of_rates", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_identity", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_lineage", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_progress", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "scope_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_break_glass_access", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_commercial_signal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_disclosure_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_final_check_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_final_check_reveal_proof", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_final_check_run_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_final_check_source_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_must_surface_firing", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_reconciliation_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_signal_classification", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_signal_disposition", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_signal_evidence", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "shadow_signal_ineligibility", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "simulated_settlement_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "site", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "site_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "site_visit", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "small_builder_demo_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "small_builder_demo_report", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "small_builder_demo_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sor_item", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "sor_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stage_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stage_review_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stored_receipt_case_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stored_receipt_case_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stored_receipt_case_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_agreement_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_alert", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_change_outcome", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_correction_disposition", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_onboarding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_operations_card", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_period", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_period_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_place", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_place_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_plan_change", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_simulated_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_simulated_result", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "subscription_simulated_work", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "success_fee_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "success_fee_derivation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "success_fee_journal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "success_fee_journal_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "success_fee_review", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "success_fee_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_bill_supersession", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "supplier_credit_consumption", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
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
      { relname: "team", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "team_membership", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_admission", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_business_verification", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_card_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_card_result", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_end_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_identity_key_claim", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_identity_snapshot", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_start", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "trial_subscription_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_approval", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_rate_observation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_rejection", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "variation_withdrawal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "watchdog_command_identity", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "watchdog_command_result", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "work_order", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "work_order_current", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "work_order_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "work_order_revision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
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
      { relname: "activation_acceptance_operation_use", owner: "jobguard_migration" },
      { relname: "approval_rule_version", owner: "jobguard_migration" },
      { relname: "audit_event", owner: "jobguard_migration" },
      { relname: "audit_export", owner: "jobguard_migration" },
      { relname: "audit_export_checkpoint", owner: "jobguard_migration" },
      { relname: "billing_allocation_run", owner: "jobguard_migration" },
      { relname: "billing_application_event", owner: "jobguard_migration" },
      { relname: "billing_export_batch", owner: "jobguard_migration" },
      { relname: "billing_export_delivery", owner: "jobguard_migration" },
      { relname: "billing_export_line", owner: "jobguard_migration" },
      { relname: "billing_fact", owner: "jobguard_migration" },
      { relname: "billing_line_match", owner: "jobguard_migration" },
      { relname: "billing_quarantine", owner: "jobguard_migration" },
      { relname: "billing_status_import", owner: "jobguard_migration" },
      { relname: "cap_snapshot", owner: "jobguard_migration" },
      { relname: "capture_source", owner: "jobguard_migration" },
      { relname: "client_contract", owner: "jobguard_migration" },
      { relname: "client_contract_version", owner: "jobguard_migration" },
      { relname: "client_organisation", owner: "jobguard_migration" },
      { relname: "closeout_answer", owner: "jobguard_migration" },
      { relname: "command_lifecycle_claim", owner: "jobguard_command_writer" },
      { relname: "command_receipt", owner: "jobguard_migration" },
      { relname: "command_type_registry", owner: "jobguard_command_writer" },
      { relname: "commercial_integrity_activity_fact", owner: "jobguard_migration" },
      { relname: "commercial_integrity_value_fact", owner: "jobguard_migration" },
      { relname: "commercial_track_assignment", owner: "jobguard_migration" },
      { relname: "contractor_agreement_status_revision", owner: "jobguard_migration" },
      { relname: "contractor_client_customer", owner: "jobguard_migration" },
      { relname: "contractor_member", owner: "jobguard_migration" },
      { relname: "contractor_membership_revocation", owner: "jobguard_migration" },
      { relname: "contractor_party_binding", owner: "jobguard_migration" },
      { relname: "contractor_receipt_line_allocation", owner: "jobguard_migration" },
      { relname: "contractor_resident_contact", owner: "jobguard_migration" },
      { relname: "counterparty_check", owner: "jobguard_migration" },
      { relname: "customer", owner: "jobguard_migration" },
      { relname: "customer_credit_note", owner: "jobguard_migration" },
      { relname: "customer_credit_note_sequence", owner: "jobguard_migration" },
      { relname: "customer_invoice", owner: "jobguard_migration" },
      { relname: "customer_invoice_evidence", owner: "jobguard_migration" },
      { relname: "customer_invoice_sequence", owner: "jobguard_migration" },
      { relname: "customer_message_source", owner: "jobguard_migration" },
      { relname: "customer_payment", owner: "jobguard_migration" },
      { relname: "customer_payment_reversal", owner: "jobguard_migration" },
      { relname: "customer_portal_grant", owner: "jobguard_migration" },
      { relname: "customer_portal_session", owner: "jobguard_migration" },
      { relname: "customer_revision", owner: "jobguard_migration" },
      { relname: "customer_variation_approval", owner: "jobguard_migration" },
      { relname: "decision", owner: "jobguard_migration" },
      { relname: "decision_resolution", owner: "jobguard_migration" },
      { relname: "discrepancy_finding_revision", owner: "jobguard_migration" },
      { relname: "discrepancy_review_outcome", owner: "jobguard_migration" },
      { relname: "enterprise_agreement_version", owner: "jobguard_migration" },
      { relname: "enterprise_baseline_batch", owner: "jobguard_migration" },
      { relname: "enterprise_baseline_team", owner: "jobguard_migration" },
      { relname: "enterprise_duplicate_correction", owner: "jobguard_migration" },
      { relname: "enterprise_fee_contribution", owner: "jobguard_migration" },
      { relname: "enterprise_fee_derivation", owner: "jobguard_migration" },
      { relname: "enterprise_fee_statement", owner: "jobguard_migration" },
      { relname: "enterprise_fee_statement_approval", owner: "jobguard_migration" },
      { relname: "enterprise_fee_statement_dispute", owner: "jobguard_migration" },
      { relname: "enterprise_fee_statement_section", owner: "jobguard_migration" },
      { relname: "evidence_invalidation", owner: "jobguard_migration" },
      { relname: "evidence_link", owner: "jobguard_migration" },
      { relname: "evidence_object", owner: "jobguard_migration" },
      { relname: "evidence_pack", owner: "jobguard_migration" },
      { relname: "evidence_pack_attachment_approval", owner: "jobguard_migration" },
      { relname: "evidence_pack_revision", owner: "jobguard_migration" },
      { relname: "evidence_pack_v3", owner: "jobguard_migration" },
      { relname: "evidence_pack_v3_approval", owner: "jobguard_migration" },
      { relname: "evidence_pack_v3_check", owner: "jobguard_migration" },
      { relname: "evidence_pack_v3_request", owner: "jobguard_migration" },
      { relname: "evidence_upload", owner: "jobguard_migration" },
      { relname: "extra_approval_outcome", owner: "jobguard_migration" },
      { relname: "extra_approval_request", owner: "jobguard_migration" },
      { relname: "extra_approval_revision_binding", owner: "jobguard_migration" },
      { relname: "extra_approval_step_fact", owner: "jobguard_migration" },
      { relname: "extra_client_link", owner: "jobguard_migration" },
      { relname: "extra_client_link_closure", owner: "jobguard_migration" },
      { relname: "extra_completion_observation", owner: "jobguard_migration" },
      { relname: "extra_duplicate_link", owner: "jobguard_migration" },
      { relname: "extra_escalation_fact", owner: "jobguard_migration" },
      { relname: "extra_event", owner: "jobguard_migration" },
      { relname: "extra_evidence_pack", owner: "jobguard_migration" },
      { relname: "extra_office_prompt_signal", owner: "jobguard_migration" },
      { relname: "extra_order_line_link", owner: "jobguard_migration" },
      { relname: "extra_origin", owner: "jobguard_migration" },
      { relname: "extra_pricing_basis", owner: "jobguard_migration" },
      { relname: "extra_prompt", owner: "jobguard_migration" },
      { relname: "extra_prompt_citation", owner: "jobguard_migration" },
      { relname: "extra_prompt_rule_settings", owner: "jobguard_migration" },
      { relname: "extra_sor_revision", owner: "jobguard_migration" },
      { relname: "fee_illustration_source", owner: "jobguard_migration" },
      { relname: "final_account_draft", owner: "jobguard_migration" },
      { relname: "final_account_invoice_binding", owner: "jobguard_migration" },
      { relname: "final_account_invoiced_line", owner: "jobguard_migration" },
      { relname: "final_account_line", owner: "jobguard_migration" },
      { relname: "final_account_lock", owner: "jobguard_migration" },
      { relname: "final_account_lock_check", owner: "jobguard_migration" },
      { relname: "final_account_proof", owner: "jobguard_migration" },
      { relname: "final_account_revision", owner: "jobguard_migration" },
      { relname: "final_account_scope_disposition", owner: "jobguard_migration" },
      { relname: "final_check_disposition_binding", owner: "jobguard_migration" },
      { relname: "final_check_manifest", owner: "jobguard_migration" },
      { relname: "final_check_manifest_source", owner: "jobguard_migration" },
      { relname: "final_check_processing_source", owner: "jobguard_migration" },
      { relname: "final_check_reveal_proof", owner: "jobguard_migration" },
      { relname: "final_check_run_binding", owner: "jobguard_migration" },
      { relname: "final_check_source_attempt", owner: "jobguard_migration" },
      { relname: "final_check_terms_acceptance", owner: "jobguard_migration" },
      { relname: "financial_authorization", owner: "jobguard_migration" },
      { relname: "finding_suppression", owner: "jobguard_migration" },
      { relname: "goods_receipt", owner: "jobguard_migration" },
      { relname: "import_batch", owner: "jobguard_migration" },
      { relname: "import_row_receipt", owner: "jobguard_migration" },
      { relname: "imported_job_baseline", owner: "jobguard_migration" },
      { relname: "inbox_decision_revision", owner: "jobguard_migration" },
      { relname: "inbox_finding_revision", owner: "jobguard_migration" },
      { relname: "inbox_outcome_event", owner: "jobguard_migration" },
      { relname: "inbox_preference_revision", owner: "jobguard_migration" },
      { relname: "job", owner: "jobguard_migration" },
      { relname: "job_activation", owner: "jobguard_migration" },
      { relname: "job_activation_terms", owner: "jobguard_migration" },
      { relname: "job_assignment", owner: "jobguard_migration" },
      { relname: "job_commercial_track", owner: "jobguard_migration" },
      { relname: "job_diary_entry", owner: "jobguard_migration" },
      { relname: "job_finding", owner: "jobguard_migration" },
      { relname: "job_import_v3", owner: "jobguard_migration" },
      { relname: "job_link", owner: "jobguard_migration" },
      { relname: "job_party_binding", owner: "jobguard_migration" },
      { relname: "job_party_current", owner: "jobguard_migration" },
      { relname: "job_photo_purpose", owner: "jobguard_migration" },
      { relname: "job_record_proposal", owner: "jobguard_migration" },
      { relname: "job_site_source_receipt", owner: "jobguard_migration" },
      { relname: "job_small_trip_event", owner: "jobguard_migration" },
      { relname: "job_small_trip_observation", owner: "jobguard_migration" },
      { relname: "job_source_original", owner: "jobguard_migration" },
      { relname: "job_work_state_event", owner: "jobguard_migration" },
      { relname: "journal", owner: "jobguard_migration" },
      { relname: "journal_line", owner: "jobguard_migration" },
      { relname: "landing_allocation", owner: "jobguard_migration" },
      { relname: "landing_reversal", owner: "jobguard_migration" },
      { relname: "ledger_account", owner: "jobguard_migration" },
      { relname: "ledger_book", owner: "jobguard_migration" },
      { relname: "lp_job_insert_permit", owner: "jobguard_migration" },
      { relname: "material_pack_conversion", owner: "jobguard_migration" },
      { relname: "material_rate_revision", owner: "jobguard_migration" },
      { relname: "material_requirement", owner: "jobguard_migration" },
      { relname: "materials_issue_fact", owner: "jobguard_migration" },
      { relname: "membership", owner: "jobguard_migration" },
      { relname: "merchant", owner: "jobguard_migration" },
      { relname: "merchant_sku", owner: "jobguard_migration" },
      { relname: "merchant_sku_alias", owner: "jobguard_migration" },
      { relname: "meter_computation", owner: "jobguard_migration" },
      { relname: "meter_correction", owner: "jobguard_migration" },
      { relname: "meter_day_ledger", owner: "jobguard_migration" },
      { relname: "meter_input_event", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_alert", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_computation", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_correction", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_day_ledger", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_place_binding", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_scope", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_source", owner: "jobguard_migration" },
      { relname: "meter_lifecycle_source_ref", owner: "jobguard_migration" },
      { relname: "meter_projection_alert", owner: "jobguard_migration" },
      { relname: "meter_work_ledger", owner: "jobguard_migration" },
      { relname: "northside_action_attribution", owner: "jobguard_migration" },
      { relname: "northside_run", owner: "jobguard_migration" },
      { relname: "org_unit", owner: "jobguard_migration" },
      { relname: "payment_fee_command", owner: "jobguard_migration" },
      { relname: "payment_fee_statement", owner: "jobguard_migration" },
      { relname: "planned_work_revision", owner: "jobguard_migration" },
      { relname: "platform_enterprise_fee", owner: "jobguard_migration" },
      { relname: "platform_enterprise_fee_line", owner: "jobguard_migration" },
      { relname: "platform_fee_statement", owner: "jobguard_migration" },
      { relname: "platform_fee_statement_command", owner: "jobguard_migration" },
      { relname: "platform_statement", owner: "jobguard_migration" },
      { relname: "platform_statement_line", owner: "jobguard_migration" },
      { relname: "practice_feed_account", owner: "jobguard_migration" },
      { relname: "practice_feed_command", owner: "jobguard_migration" },
      { relname: "practice_feed_event", owner: "jobguard_migration" },
      { relname: "practice_feed_job_owner", owner: "jobguard_migration" },
      { relname: "practice_feed_receipt_match", owner: "jobguard_migration" },
      { relname: "practice_supplier_credit_case_binding", owner: "jobguard_migration" },
      { relname: "practice_supplier_credit_review_payment", owner: "jobguard_migration" },
      { relname: "prompt_resolution", owner: "jobguard_migration" },
      { relname: "proof_application_response", owner: "jobguard_migration" },
      { relname: "property_constraint_fact", owner: "jobguard_migration" },
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
      { relname: "quote_acceptance_sequence", owner: "jobguard_migration" },
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
      { relname: "receipt_allocation_fact_command", owner: "jobguard_migration" },
      { relname: "receipt_allocation_fact_line", owner: "jobguard_migration" },
      { relname: "receipt_allocation_fact_review", owner: "jobguard_migration" },
      { relname: "receipt_allocation_fact_revision", owner: "jobguard_migration" },
      { relname: "receipt_allocation_fact_source", owner: "jobguard_migration" },
      { relname: "receipt_line_allocation", owner: "jobguard_migration" },
      { relname: "recovery_allocation_command", owner: "jobguard_migration" },
      { relname: "recovery_allocation_line_source", owner: "jobguard_migration" },
      { relname: "recovery_allocation_review", owner: "jobguard_migration" },
      { relname: "recovery_approval", owner: "jobguard_migration" },
      { relname: "recovery_attribution_command", owner: "jobguard_migration" },
      { relname: "recovery_attribution_reassessment", owner: "jobguard_migration" },
      { relname: "recovery_attribution_revision", owner: "jobguard_migration" },
      { relname: "recovery_case", owner: "jobguard_migration" },
      { relname: "recovery_case_allocation", owner: "jobguard_migration" },
      { relname: "recovery_case_allocation_reversal", owner: "jobguard_migration" },
      { relname: "recovery_case_event", owner: "jobguard_migration" },
      { relname: "recovery_case_terms_approval", owner: "jobguard_migration" },
      { relname: "recovery_claim_line", owner: "jobguard_migration" },
      { relname: "recovery_claim_revision", owner: "jobguard_migration" },
      { relname: "recovery_demo_selection", owner: "jobguard_migration" },
      { relname: "recovery_eligibility_revision", owner: "jobguard_migration" },
      { relname: "recovery_eligibility_v3_review", owner: "jobguard_migration" },
      { relname: "recovery_fee_derivation", owner: "jobguard_migration" },
      { relname: "recovery_fee_journal", owner: "jobguard_migration" },
      { relname: "recovery_follow_up", owner: "jobguard_migration" },
      { relname: "recovery_follow_up_advance", owner: "jobguard_migration" },
      { relname: "recovery_follow_up_due", owner: "jobguard_migration" },
      { relname: "recovery_follow_up_event", owner: "jobguard_migration" },
      { relname: "recovery_follow_up_owner", owner: "jobguard_migration" },
      { relname: "recovery_follow_up_reminder", owner: "jobguard_migration" },
      { relname: "recovery_message", owner: "jobguard_migration" },
      { relname: "recovery_message_approval", owner: "jobguard_migration" },
      { relname: "recovery_message_event", owner: "jobguard_migration" },
      { relname: "recovery_message_sink", owner: "jobguard_migration" },
      { relname: "recovery_payment_payer_mark", owner: "jobguard_migration" },
      { relname: "recovery_review", owner: "jobguard_migration" },
      { relname: "recovery_timeline_run", owner: "jobguard_migration" },
      { relname: "recovery_timeline_signal", owner: "jobguard_migration" },
      { relname: "repository_operational_record", owner: "jobguard_command_writer" },

      { relname: "role_grant", owner: "jobguard_migration" },
      { relname: "role_grant_revocation", owner: "jobguard_migration" },
      { relname: "sandbox_adapter_receipt", owner: "jobguard_migration" },
      { relname: "sandbox_run", owner: "jobguard_migration" },
      { relname: "sandbox_run_event", owner: "jobguard_migration" },
      { relname: "sandbox_work", owner: "jobguard_migration" },
      { relname: "schedule_of_rates", owner: "jobguard_migration" },
      { relname: "scope_identity", owner: "jobguard_migration" },
      { relname: "scope_lineage", owner: "jobguard_migration" },
      { relname: "scope_progress", owner: "jobguard_migration" },
      { relname: "scope_revision", owner: "jobguard_migration" },
      { relname: "shadow_break_glass_access", owner: "jobguard_migration" },
      { relname: "shadow_commercial_signal", owner: "jobguard_migration" },
      { relname: "shadow_disclosure_event", owner: "jobguard_migration" },
      { relname: "shadow_final_check_completion", owner: "jobguard_migration" },
      { relname: "shadow_final_check_reveal_proof", owner: "jobguard_migration" },
      { relname: "shadow_final_check_run_binding", owner: "jobguard_migration" },
      { relname: "shadow_final_check_source_attempt", owner: "jobguard_migration" },
      { relname: "shadow_must_surface_firing", owner: "jobguard_migration" },
      { relname: "shadow_reconciliation_run", owner: "jobguard_migration" },
      { relname: "shadow_signal_classification", owner: "jobguard_migration" },
      { relname: "shadow_signal_disposition", owner: "jobguard_migration" },
      { relname: "shadow_signal_evidence", owner: "jobguard_migration" },
      { relname: "shadow_signal_ineligibility", owner: "jobguard_migration" },
      { relname: "simulated_settlement_event", owner: "jobguard_migration" },
      { relname: "site", owner: "jobguard_migration" },
      { relname: "site_revision", owner: "jobguard_migration" },
      { relname: "site_visit", owner: "jobguard_migration" },
      { relname: "small_builder_demo_receipt", owner: "jobguard_migration" },
      { relname: "small_builder_demo_report", owner: "jobguard_migration" },
      { relname: "small_builder_demo_run", owner: "jobguard_migration" },
      { relname: "sor_item", owner: "jobguard_migration" },
      { relname: "sor_version", owner: "jobguard_migration" },
      { relname: "stage_completion", owner: "jobguard_migration" },
      { relname: "stage_review_event", owner: "jobguard_migration" },
      { relname: "stored_receipt_case_allocation", owner: "jobguard_migration" },
      { relname: "stored_receipt_case_binding", owner: "jobguard_migration" },
      { relname: "stored_receipt_case_command", owner: "jobguard_migration" },
      { relname: "subscription_agreement_revision", owner: "jobguard_migration" },
      { relname: "subscription_alert", owner: "jobguard_migration" },
      { relname: "subscription_change_outcome", owner: "jobguard_migration" },
      { relname: "subscription_correction_disposition", owner: "jobguard_migration" },
      { relname: "subscription_onboarding", owner: "jobguard_migration" },
      { relname: "subscription_operations_card", owner: "jobguard_migration" },
      { relname: "subscription_period", owner: "jobguard_migration" },
      { relname: "subscription_period_line", owner: "jobguard_migration" },
      { relname: "subscription_place", owner: "jobguard_migration" },
      { relname: "subscription_place_binding", owner: "jobguard_migration" },
      { relname: "subscription_plan_change", owner: "jobguard_migration" },
      { relname: "subscription_review", owner: "jobguard_migration" },
      { relname: "subscription_simulated_attempt", owner: "jobguard_migration" },
      { relname: "subscription_simulated_result", owner: "jobguard_migration" },
      { relname: "subscription_simulated_work", owner: "jobguard_migration" },
      { relname: "success_fee_command", owner: "jobguard_migration" },
      { relname: "success_fee_derivation", owner: "jobguard_migration" },
      { relname: "success_fee_journal", owner: "jobguard_migration" },
      { relname: "success_fee_journal_line", owner: "jobguard_migration" },
      { relname: "success_fee_review", owner: "jobguard_migration" },
      { relname: "success_fee_source", owner: "jobguard_migration" },
      { relname: "supplier_bill_supersession", owner: "jobguard_migration" },
      { relname: "supplier_credit_consumption", owner: "jobguard_migration" },
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
      { relname: "team", owner: "jobguard_migration" },
      { relname: "team_membership", owner: "jobguard_migration" },
      { relname: "trial_admission", owner: "jobguard_migration" },
      { relname: "trial_business_verification", owner: "jobguard_migration" },
      { relname: "trial_card_attempt", owner: "jobguard_migration" },
      { relname: "trial_card_result", owner: "jobguard_migration" },
      { relname: "trial_end_source", owner: "jobguard_migration" },
      { relname: "trial_identity_key_claim", owner: "jobguard_migration" },
      { relname: "trial_identity_snapshot", owner: "jobguard_migration" },
      { relname: "trial_start", owner: "jobguard_migration" },
      { relname: "trial_subscription_source", owner: "jobguard_migration" },
      { relname: "variation", owner: "jobguard_migration" },
      { relname: "variation_approval", owner: "jobguard_migration" },
      { relname: "variation_rate_observation", owner: "jobguard_migration" },
      { relname: "variation_rejection", owner: "jobguard_migration" },
      { relname: "variation_revision", owner: "jobguard_migration" },
      { relname: "variation_withdrawal", owner: "jobguard_migration" },
      { relname: "watchdog_command_identity", owner: "jobguard_migration" },
      { relname: "watchdog_command_result", owner: "jobguard_migration" },
      { relname: "work_order", owner: "jobguard_migration" },
      { relname: "work_order_current", owner: "jobguard_migration" },
      { relname: "work_order_line", owner: "jobguard_migration" },
      { relname: "work_order_revision", owner: "jobguard_migration" },
    ]);
  });
});

// MON-3C-ELIG adds no relation/policy. Only this exact checked routine is new.
it("MON-3C-ELIG exact routine owner and execution grants", async () => {
 const rows = (await admin.query(`SELECT p.proname,r.rolname owner,p.prosecdef,p.proconfig,
 has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
 has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
 EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0) public
 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.mon3_read_eligibility(uuid,text,uuid)'::regprocedure`)).rows;
 expect(rows).toEqual([{proname:"mon3_read_eligibility",owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:true,infrastructure:false,public:false}]);
});

// C248: exact additive guard identity, private execution and fixed lookup context.
it("SV5-GUARD catalogue retains a private migration-owned tenant-safe upload guard", async () => {
 const routines=(await admin.query(`SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
  has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_execute,
  has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') shadow_execute
  FROM pg_proc p WHERE p.oid IN ('app.guard_post_lock_upload_transition()'::regprocedure,'app.serialize_final_check_evidence()'::regprocedure)`)).rows;
 expect(routines).toEqual(Array.from({length:2},()=>({owner:'jobguard_migration',prosecdef:true,proconfig:['search_path=pg_catalog, app'],runtime_execute:false,shadow_execute:false})));
 const triggers=(await admin.query(`SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger
  WHERE tgrelid='app.evidence_upload'::regclass AND tgname='b_final_check_upload_transition'`)).rows;
 expect(triggers).toEqual([{tgname:'b_final_check_upload_transition',tgenabled:'O',definition:'CREATE TRIGGER b_final_check_upload_transition BEFORE UPDATE ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.guard_post_lock_upload_transition()'}]);
});
