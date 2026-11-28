// V2-E9 (migration 2065): firm A/B proof for the choice allowance tables.
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = { "v2 choice allowances": [["app.v2_choice_allowance", "job_id"], ["app.v2_choice_allowance_step", "job_id"]] };

export function register(helpers) {
  const { test, assert, admin, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-E9", families);
  // The E9 tests before this one leave choice allowance versions and steps on firm A's jobs.
  test("FL-E9 firm check: both choice allowance tables had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });

  test("FL-E9: the choice allowance firm lock migration is safe to run twice", async () => {
    const policies = async () => (await admin.query(
      "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
    const before = await policies();
    await admin.query(readFileSync(new URL("../migrations/2065_v2_choice_allowance_firm_lock.sql", import.meta.url), "utf8"));
    assert.deepEqual(await policies(), before);
  });
}
