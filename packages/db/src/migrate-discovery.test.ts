// MERGE-CHURN-1 (founder decision 35): new migrations are discovered from the directory; merged ones stay listed.
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { discoverMigrationUrls, INITIAL_MIGRATION_URL, MIGRATION_URLS, migrationListProblem } from "./migrate.js";

const nameOf = (url: URL) => url.pathname.split("/").at(-1)!;
// The 85 migrations merged before MERGE-CHURN-1, in their applied order. New migrations only ever follow these.
const MERGED_BEFORE = ["0000_tenancy", "0001_audit", "0002_evidence", "0003_job_spine", "0004_ledger", "0005_commands", "0006_outbox", "0007_capture", "0008_review", "0009_quote_pricing", "0010_quote_documents", "0011_quote_acceptance", "0012_job_activation", "0013_decision_inbox", "0014_variations", "0015_proof_stage_gates", "0016_final_accounts", "0017_customer_billing", "0018_recovery_outcomes", "0019_commercial_integrity", "0020_job_import", "0021_sandbox_runs", "0022_browser_local_dictation", "0023_recovery_demo_ui", "0024_fee_illustration", "0025_uiwire7_synthetic_evidence_bytes", "0026_final_account_migration_policy", "0027_uiwire10_customer_invoice", "0028_uiwire11_credit_notes", "0029_uiwire12_customer_receipts", "0030_receipt_replay_and_invoice_binding", "0031_material_rates", "0032_purchase_order_precommit", "0033_supplier_document_intake", "0034_recovery_cases", "0035_recovery_eligibility", "0036_supplier_fact_confirmation", "0037_supplier_matching", "0038_things_to_check", "0039_readiness", "0040_inbox_relevance", "0041_evidence_packs", "0042_evidence_pack_repair", "0053_shared_money_origin", "0054_contractor_organisation", "0094_practice_session_ownership", "0095_job_parties", "0096_watchdog_live", "0097_recovery_case_current", "0102_contractor_parties", "0103_prevention_checks", "0106_practice_feed", "0107_recovery_messages", "0109_job_activation_terms", "0110_work_orders", "0111_persisted_identity", "0112_recovery_follow_up", "0115_recovery_follow_up_repair", "0119_recovery_eligibility_v3", "0120_enterprise_identity", "0121_audit_export", "0122_extra_origin_persistence", "0127_recovery_timing_pin", "0128_shadow_persistence", "0129_sso_required", "0130_recovery_eligibility_v3_f17_timing", "0131_practice_feed_facts", "0132_final_account_lock", "0133_shadow_detection", "0134_recovery_case_terms", "0135_site_extra_authority", "0136_recovery_allocation", "0137_scim_deactivation", "0138_practice_session_hardening", "0139_site_visit_closeout", "0140_site_extra_pricing", "0141_site_extra_evidence", "0142_recovery_insurer_money", "0143_sso_emergency_owner_window", "0144_job_work_state", "0150_membership_authority_fix", "0151_ledger_corrections_fix", "0153_quote_supersession_guard", "0154_follow_up_clock_fence", "0155_quote_reacceptance"].map((stem) => `${stem}.sql`);

describe("MERGE-CHURN-1 migration discovery", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  const dir = (names: string[]) => {
    const root = mkdtempSync(join(tmpdir(), "jobguard-migrations-")); roots.push(root);
    for (const name of names) if (name.endsWith("/")) mkdirSync(join(root, name)); else writeFileSync(join(root, name), "SELECT 1;\n");
    return pathToFileURL(`${root}/`);
  };
  const listed = (directory: URL, names: string[]) => names.map((name) => new URL(name, directory));

  it("keeps every merged migration first, in its original order, and adds the directory's newer files after", () => {
    expect(migrationListProblem()).toBeUndefined();
    const names = MIGRATION_URLS.map(nameOf);
    expect(names.slice(0, MERGED_BEFORE.length)).toEqual(MERGED_BEFORE);
    expect(names).toEqual([...names].sort());
    const onDisk = readdirSync(new URL("../migrations/", import.meta.url)).filter((name) => !name.startsWith(".")).sort();
    expect(names).toEqual(onDisk);
    expect(nameOf(INITIAL_MIGRATION_URL)).toBe("0000_tenancy.sql");
  });

  it("discovers a new migration from the directory with no list edit", () => {
    const directory = dir(["0001_a.sql", "0002_b.sql", "0003_new.sql", ".DS_Store"]);
    expect(discoverMigrationUrls(directory, listed(directory, ["0001_a.sql", "0002_b.sql"])).map(nameOf)).toEqual(["0001_a.sql", "0002_b.sql", "0003_new.sql"]);
  });

  it("fails closed on a low number, a shared number, a missing merged file or a stray entry", () => {
    const check = (names: string[]) => { const directory = dir(names); return () => discoverMigrationUrls(directory, listed(directory, ["0001_a.sql", "0005_b.sql"])); };
    expect(check(["0001_a.sql", "0005_b.sql", "0003_late.sql"])).toThrow(/numbered above 0005_b.sql/u);
    expect(check(["0001_a.sql", "0005_b.sql", "0006_c.sql", "0006_d.sql"])).toThrow(/share number 0006/u);
    expect(check(["0001_a.sql", "0006_c.sql"])).toThrow(/missing from the directory: \["0005_b.sql"\]/u);
    expect(check(["0001_a.sql", "0005_b.sql", "notes.md"])).toThrow(/unexpected entries/u);
    expect(check(["0001_a.sql", "0005_b.sql", "0006_Upper.sql"])).toThrow(/unexpected entries/u);
    expect(check(["0001_a.sql", "0005_b.sql", "0006_dir.sql/"])).toThrow(/unexpected entries/u);
  });
});
