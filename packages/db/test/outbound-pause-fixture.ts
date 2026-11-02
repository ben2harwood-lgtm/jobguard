import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { MIGRATION_URLS } from "../src/migrate.js";

export const OUTBOUND_PAUSE_MIGRATION = "0528_commercial_outbound_pause.sql";
/** Today's ActionExecutor reads the outbound pause, so a fixture stopped at an older schema seeds through
 * today's code only with this one migration applied early. It is self-contained and needs only the base roles. */
export async function applyOutboundPause(admin: Pick<Pool, "query">) {
  const url = MIGRATION_URLS.find(item => item.pathname.endsWith(`/${OUTBOUND_PAUSE_MIGRATION}`))!;
  await admin.query(await readFile(url, "utf8"));
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [OUTBOUND_PAUSE_MIGRATION]);
}
