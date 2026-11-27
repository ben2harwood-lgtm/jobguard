// K8 (migration 2064): firm A/B proof for the hire records.
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = {
  "hire records": [["app.v2_hire_revision", "job_id"]],
};

export function register(helpers) {
  registerFirmChecks(helpers, "FL-K8", families);
}
