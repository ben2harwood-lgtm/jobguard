// V2-F3 (change drafts): firm A/B proof for the change-draft tables.
import { registerFirmChecks } from "./checks-lib.mjs";

export const families = {
  "change drafts": [["app.v2_change_draft", "job_id"], ["app.v2_change_draft_task", "job_id"]],
};

export function register(helpers) {
  registerFirmChecks(helpers, "FL-F3", families);
}
