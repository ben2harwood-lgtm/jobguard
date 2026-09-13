import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const MIGRATION_URLS = [
  new URL("../migrations/0000_tenancy.sql", import.meta.url),
  new URL("../migrations/0001_audit.sql", import.meta.url),
] as const;
export const INITIAL_MIGRATION_URL = MIGRATION_URLS[0];

export async function migrate(pool: Pool): Promise<void> {
  for (const migrationUrl of MIGRATION_URLS) {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    await pool.query(sql);
  }
}
