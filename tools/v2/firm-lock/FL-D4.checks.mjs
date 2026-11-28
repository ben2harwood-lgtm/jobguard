// V2-D4 (migration 2060): firm A/B proof for the crew brief tables.
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = {
  "v2 crew brief": ["app.v2_crew_brief", "app.v2_crew_brief_command", "app.v2_crew_brief_photo"]
    .map(table => [table, "job_id"]),
};

export function register(helpers) {
  const { test, assert, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-D4", families);
  // The D4 tests before this one leave a brief, its receipt and a photo on firm A's job.
  test("FL-D4 firm check: every crew brief table had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });

  test("FL-D4: the crew brief firm lock migration is safe to run twice", async () => {
    const { admin } = helpers;
    const { readFileSync } = await import("node:fs");
    const policies = async () => (await admin.query(
      "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
    const before = await policies();
    await admin.query(readFileSync(new URL("../migrations/2060_v2_crew_brief_firm_lock.sql", import.meta.url), "utf8"));
    assert.deepEqual(await policies(), before);
  });
}
