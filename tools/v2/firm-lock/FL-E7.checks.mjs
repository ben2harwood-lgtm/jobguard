// V2-E7 (migration 2067): firm A/B proof for the reminder tables.
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = { "v2 fact reminders": [
  ["app.v2_fact_reminder", "job_id"], ["app.v2_fact_reminder_run", "job_id"],
] };

export function register(helpers) {
  const { test, assert, admin, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-E7", families);
  // The E7 tests before this one leave reminder and run rows on firm A's job.
  test("FL-E7 firm check: every reminder table had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });

  test("FL-E7: the reminder firm lock migration is safe to run twice", async () => {
    const policies = async () => (await admin.query(
      "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
    const before = await policies();
    await admin.query(readFileSync(new URL("../migrations/2067_v2_fact_reminder_firm_lock.sql", import.meta.url), "utf8"));
    assert.deepEqual(await policies(), before);
  });
}
