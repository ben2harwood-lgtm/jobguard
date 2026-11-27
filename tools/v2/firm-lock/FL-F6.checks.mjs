// V2-F6 (migration 2048): firm A/B proof for the customer extra-link table.
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = {
  "customer extra links": [["app.v2_customer_extra_link", "job_id"]],
};

export function register(helpers) {
  registerFirmChecks(helpers, "FL-F6", families);
}
