// B1A (migration 2073): firm A/B proof for the walk session record.
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = {
  "walk record": [["app.v2_walk_session", "job_id"], ["app.v2_walk_entry", "job_id"]],
};

export function register(helpers) {
  registerFirmChecks(helpers, "FL-B1A", families);
}
