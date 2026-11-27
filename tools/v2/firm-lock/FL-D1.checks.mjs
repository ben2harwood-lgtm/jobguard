// V2-D1 (migration 2059): firm A/B proof for the measurement table.
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = { "v2 measurement": [["app.v2_measurement", "job_id"]] };

export function register(helpers) {
  const { test, assert, admin, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-D1", families);
  // The D1 tests before this one leave measurements on firm A's job.
  test("FL-D1 firm check: the measurement table had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });

  test("FL-D1: the measurement firm lock migration is safe to run twice", async () => {
    const policies = async () => (await admin.query(
      "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
    const before = await policies();
    await admin.query(readFileSync(new URL("../migrations/2059_v2_measurement_firm_lock.sql", import.meta.url), "utf8"));
    assert.deepEqual(await policies(), before);
  });
}
