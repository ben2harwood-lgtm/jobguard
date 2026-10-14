import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

// The explicit list as merged before MERGE-CHURN-1 (founder decision 35). It is closed: never edit, reorder or append.
// Later migrations are discovered from the directory below, so two pieces adding migrations never edit one shared list.
const LISTED_MIGRATION_URLS = [
  new URL("../migrations/0000_tenancy.sql", import.meta.url),
  new URL("../migrations/0001_audit.sql", import.meta.url),
  new URL("../migrations/0002_evidence.sql", import.meta.url),
  new URL("../migrations/0003_job_spine.sql", import.meta.url),
  new URL("../migrations/0004_ledger.sql", import.meta.url),
  new URL("../migrations/0005_commands.sql", import.meta.url),
  new URL("../migrations/0006_outbox.sql", import.meta.url),
  new URL("../migrations/0007_capture.sql", import.meta.url),
  new URL("../migrations/0008_review.sql", import.meta.url),
  new URL("../migrations/0009_quote_pricing.sql", import.meta.url),
  new URL("../migrations/0010_quote_documents.sql", import.meta.url),
  new URL("../migrations/0011_quote_acceptance.sql", import.meta.url),
  new URL("../migrations/0012_job_activation.sql", import.meta.url),
  new URL("../migrations/0013_decision_inbox.sql", import.meta.url),
  new URL("../migrations/0014_variations.sql", import.meta.url),
  new URL("../migrations/0015_proof_stage_gates.sql", import.meta.url),
  new URL("../migrations/0016_final_accounts.sql", import.meta.url),
  new URL("../migrations/0017_customer_billing.sql", import.meta.url),
  new URL("../migrations/0018_recovery_outcomes.sql", import.meta.url),
  new URL("../migrations/0019_commercial_integrity.sql", import.meta.url),
  new URL("../migrations/0020_job_import.sql", import.meta.url),
  new URL("../migrations/0021_sandbox_runs.sql", import.meta.url),
  new URL("../migrations/0022_browser_local_dictation.sql", import.meta.url),
  new URL("../migrations/0023_recovery_demo_ui.sql", import.meta.url),
  new URL("../migrations/0024_fee_illustration.sql", import.meta.url),
  new URL("../migrations/0025_uiwire7_synthetic_evidence_bytes.sql", import.meta.url),
  new URL("../migrations/0026_final_account_migration_policy.sql", import.meta.url),
  new URL("../migrations/0027_uiwire10_customer_invoice.sql", import.meta.url),
  new URL("../migrations/0028_uiwire11_credit_notes.sql", import.meta.url),
  new URL("../migrations/0029_uiwire12_customer_receipts.sql", import.meta.url),
  new URL("../migrations/0030_receipt_replay_and_invoice_binding.sql", import.meta.url),
  new URL("../migrations/0031_material_rates.sql", import.meta.url),
  new URL("../migrations/0032_purchase_order_precommit.sql", import.meta.url),
  new URL("../migrations/0033_supplier_document_intake.sql", import.meta.url),
  new URL("../migrations/0034_recovery_cases.sql", import.meta.url),
  new URL("../migrations/0035_recovery_eligibility.sql", import.meta.url),
  new URL("../migrations/0036_supplier_fact_confirmation.sql", import.meta.url),
  new URL("../migrations/0037_supplier_matching.sql", import.meta.url),
  new URL("../migrations/0038_things_to_check.sql", import.meta.url),
  new URL("../migrations/0039_readiness.sql", import.meta.url),
  new URL("../migrations/0040_inbox_relevance.sql", import.meta.url),
  new URL("../migrations/0041_evidence_packs.sql", import.meta.url),
  new URL("../migrations/0042_evidence_pack_repair.sql", import.meta.url),
  new URL("../migrations/0053_shared_money_origin.sql", import.meta.url),
  new URL("../migrations/0054_contractor_organisation.sql", import.meta.url),
  new URL("../migrations/0094_practice_session_ownership.sql", import.meta.url),
  new URL("../migrations/0095_job_parties.sql", import.meta.url),
  new URL("../migrations/0096_watchdog_live.sql", import.meta.url),
  new URL("../migrations/0097_recovery_case_current.sql", import.meta.url),
  new URL("../migrations/0102_contractor_parties.sql", import.meta.url),
  new URL("../migrations/0103_prevention_checks.sql", import.meta.url),
  new URL("../migrations/0106_practice_feed.sql", import.meta.url),
  new URL("../migrations/0107_recovery_messages.sql", import.meta.url),
  new URL("../migrations/0109_job_activation_terms.sql", import.meta.url),
  new URL("../migrations/0110_work_orders.sql", import.meta.url),
  new URL("../migrations/0111_persisted_identity.sql", import.meta.url),
  new URL("../migrations/0112_recovery_follow_up.sql", import.meta.url),
  new URL("../migrations/0115_recovery_follow_up_repair.sql", import.meta.url),
  new URL("../migrations/0119_recovery_eligibility_v3.sql", import.meta.url),
  new URL("../migrations/0120_enterprise_identity.sql", import.meta.url),
  new URL("../migrations/0121_audit_export.sql", import.meta.url),
  new URL("../migrations/0122_extra_origin_persistence.sql", import.meta.url),
  new URL("../migrations/0127_recovery_timing_pin.sql", import.meta.url),
  new URL("../migrations/0128_shadow_persistence.sql", import.meta.url),
  new URL("../migrations/0129_sso_required.sql", import.meta.url),
  new URL("../migrations/0130_recovery_eligibility_v3_f17_timing.sql", import.meta.url),
  new URL("../migrations/0131_practice_feed_facts.sql", import.meta.url),
  new URL("../migrations/0132_final_account_lock.sql", import.meta.url),
  new URL("../migrations/0133_shadow_detection.sql", import.meta.url),
  new URL("../migrations/0134_recovery_case_terms.sql", import.meta.url),
  new URL("../migrations/0135_site_extra_authority.sql", import.meta.url),
  new URL("../migrations/0136_recovery_allocation.sql", import.meta.url),
  new URL("../migrations/0137_scim_deactivation.sql", import.meta.url),
  new URL("../migrations/0138_practice_session_hardening.sql", import.meta.url),
  new URL("../migrations/0139_site_visit_closeout.sql", import.meta.url),
  new URL("../migrations/0140_site_extra_pricing.sql", import.meta.url),
  new URL("../migrations/0141_site_extra_evidence.sql", import.meta.url),
  new URL("../migrations/0142_recovery_insurer_money.sql", import.meta.url),
  new URL("../migrations/0143_sso_emergency_owner_window.sql", import.meta.url),
  new URL("../migrations/0144_job_work_state.sql", import.meta.url),
  new URL("../migrations/0150_membership_authority_fix.sql", import.meta.url),
  new URL("../migrations/0151_ledger_corrections_fix.sql", import.meta.url),
  new URL("../migrations/0153_quote_supersession_guard.sql", import.meta.url),
  new URL("../migrations/0154_follow_up_clock_fence.sql", import.meta.url),
  new URL("../migrations/0155_quote_reacceptance.sql", import.meta.url),
] as const;

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/u;
// Not a string literal inside new URL(), so bundlers do not try to resolve a directory as an asset.
const MIGRATION_DIRECTORY = "../migrations/";
const nameOf = (url: URL) => url.pathname.split("/").at(-1)!;

/**
 * Every listed migration, then each newer `NNNN_name.sql` in the directory in name order. Fails closed: an unexpected
 * entry, a missing listed file, a new file not numbered above the last listed one, or a repeated number throws.
 * loadMigrationUrls keeps any such failure, and migrate() refuses to run with it, because a bundled web runtime
 * (which never migrates) imports this module where the directory cannot be read.
 */
export function discoverMigrationUrls(directory: URL, listed: readonly URL[]): URL[] {
  const listedNames = listed.map(nameOf);
  const last = listedNames.at(-1)!;
  const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => !entry.name.startsWith("."));
  const unexpected = entries.filter((entry) => !entry.isFile() || !MIGRATION_FILE.test(entry.name)).map((entry) => entry.name);
  if (unexpected.length) throw new Error(`Migration directory holds unexpected entries: ${JSON.stringify(unexpected)}; only NNNN_lowercase_name.sql files belong there.`);
  const present = new Set(entries.map((entry) => entry.name));
  const missing = listedNames.filter((name) => !present.has(name));
  if (missing.length) throw new Error(`Merged migrations are missing from the directory: ${JSON.stringify(missing)}.`);
  const listedSet = new Set(listedNames);
  const newer = [...present].filter((name) => !listedSet.has(name)).sort();
  const early = newer.filter((name) => name <= last);
  if (early.length) throw new Error(`New migrations must be numbered above ${last}: ${JSON.stringify(early)}.`);
  const numbers = new Map<string, string>();
  for (const name of [...listedNames, ...newer]) {
    const number = MIGRATION_FILE.exec(name)![1]!;
    if (numbers.has(number)) throw new Error(`Migrations ${numbers.get(number)} and ${name} share number ${number}.`);
    numbers.set(number, name);
  }
  return [...listed, ...newer.map((name) => new URL(name, directory))];
}

function loadMigrationUrls(): { urls: readonly URL[]; unavailable?: Error } {
  try { return { urls: discoverMigrationUrls(new URL(MIGRATION_DIRECTORY, import.meta.url), LISTED_MIGRATION_URLS) }; }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { urls: LISTED_MIGRATION_URLS, unavailable: new Error(`The migration list could not be built from the migrations directory; refusing to migrate from a partial list. ${reason}`, { cause: error }) };
  }
}

const loaded = loadMigrationUrls();
export const MIGRATION_URLS: readonly URL[] = Object.freeze([...loaded.urls]);
/** Why the directory-built list is unavailable here, if it is; migrate() refuses to run while this is set. */
export const migrationListProblem = (): Error | undefined => loaded.unavailable;
export const INITIAL_MIGRATION_URL = LISTED_MIGRATION_URLS[0];

export async function migrate(pool: Pick<Pool | PoolClient, "query">): Promise<void> {
  const problem = migrationListProblem();
  if (problem) throw problem;
  await pool.query(`CREATE TABLE IF NOT EXISTS public.jobguard_schema_migration (
    migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`);
  for (const migrationUrl of MIGRATION_URLS) {
    const migrationName = fileURLToPath(migrationUrl).split("/").at(-1)!;
    const applied = await pool.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [migrationName]);
    if (applied.rowCount) continue;
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    // Select backfill mode within this migration's transaction, even with a pooled connection.
    const mode = process.env.JOBGUARD_ENV === "synthetic_demo" ? "synthetic_demo" : "details_needed";
    await pool.query(migrationName === "0095_job_parties.sql" ? sql.replace("BEGIN;", `BEGIN; SELECT set_config('app.deployment_mode','${mode}',true);`) : sql);
    await pool.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1) ON CONFLICT DO NOTHING", [migrationName]);
  }
}
