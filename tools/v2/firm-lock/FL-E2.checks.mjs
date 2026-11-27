// V2-E2 (migration 2066): firm A/B proof for the fact reply tables.
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = { "v2 fact replies": [
  ["app.v2_reply_recipient", "job_id"], ["app.v2_fact_reply_request", "job_id"], ["app.v2_fact_reply", "job_id"],
  ["app.v2_fact_reply_cancel", "job_id"], ["app.v2_fact_reply_applied", "job_id"],
] };

export function register(helpers) {
  const { test, assert, admin, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-E2", families);
  // The E2 tests before this one leave requests, replies, cancels and applied rows on firm A's job.
  test("FL-E2 firm check: every fact reply table had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });

  test("FL-E2: the fact reply firm lock migration is safe to run twice", async () => {
    const policies = async () => (await admin.query(
      "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
    const before = await policies();
    await admin.query(readFileSync(new URL("../migrations/2066_v2_fact_reply_firm_lock.sql", import.meta.url), "utf8"));
    assert.deepEqual(await policies(), before);
  });
}
