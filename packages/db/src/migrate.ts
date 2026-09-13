import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const INITIAL_MIGRATION_URL = new URL("../migrations/0000_tenancy.sql", import.meta.url);
export const EVIDENCE_MIGRATION_URL = new URL("../migrations/0001_evidence.sql", import.meta.url);

export async function migrate(pool: Pool): Promise<void> {
  for (const migration of [INITIAL_MIGRATION_URL, EVIDENCE_MIGRATION_URL]) {
    await pool.query(await readFile(fileURLToPath(migration), "utf8"));
  }
}
