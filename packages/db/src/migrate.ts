import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

export const MIGRATION_URLS = [
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
] as const;
export const INITIAL_MIGRATION_URL = MIGRATION_URLS[0];

export async function migrate(pool: Pick<Pool | PoolClient, "query">): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.jobguard_schema_migration (
    migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`);
  for (const migrationUrl of MIGRATION_URLS) {
    const migrationName = fileURLToPath(migrationUrl).split("/").at(-1)!;
    const applied = await pool.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [migrationName]);
    if (applied.rowCount) continue;
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1) ON CONFLICT DO NOTHING", [migrationName]);
  }
}
