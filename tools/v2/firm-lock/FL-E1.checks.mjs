// V2-E1 (migration 2064): firm A/B proof for the open fact tables.
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = { "v2 open facts": [["app.v2_open_fact", "job_id"], ["app.v2_open_fact_change", "job_id"]] };

export function register(helpers) {
  const { test, assert, admin, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-E1", families);
  // The E1 tests before this one leave open facts on firm A's job.
  test("FL-E1 firm check: both open fact tables had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });

  test("FL-E1: the open fact firm lock migration is safe to run twice", async () => {
    const policies = async () => (await admin.query(
      "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
    const before = await policies();
    await admin.query(readFileSync(new URL("../migrations/2064_v2_open_fact_firm_lock.sql", import.meta.url), "utf8"));
    assert.deepEqual(await policies(), before);
  });
}
