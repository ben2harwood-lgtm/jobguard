// V2-D3 (migration 2063): firm A/B proof for the materials tables.
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = { "v2 materials": [
  ["app.v2_material_line", "job_id"], ["app.v2_material_enquiry", "job_id"], ["app.v2_material_enquiry_command", "job_id"],
] };

export function register(helpers) {
  const { test, assert, contexts } = helpers;
  const unproven = registerFirmChecks(helpers, "FL-D3", families);
  // The D3 tests before this one leave lines, enquiries and generate receipts on firm A's job.
  test("FL-D3 firm check: every materials table had a firm A row to prove", async () => {
    await contexts();
    assert.deepEqual(unproven, []);
  });
}
