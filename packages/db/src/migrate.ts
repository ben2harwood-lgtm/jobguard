import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const INITIAL_MIGRATION_URL = new URL("../migrations/0000_tenancy.sql", import.meta.url);

export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(fileURLToPath(INITIAL_MIGRATION_URL), "utf8");
  await pool.query(sql);
}
