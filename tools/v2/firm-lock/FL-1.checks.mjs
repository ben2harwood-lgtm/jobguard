// FL-1 (Q35, migration 2047): firm A/B proof for the V2 core tables.
import { randomUUID } from "node:crypto";
import { registerFirmChecks } from "./checks-lib.mjs";

const job = table => [table, "job_id"];

export const families = {
  "customer money": ["app.customer_credit_note", "app.customer_invoice", "app.customer_message_source",
    "app.customer_payment", "app.customer_payment_reversal"].map(job),
  "job record": ["app.job_activation", "app.job_activation_terms", "app.job_assignment", "app.job_commercial_track",
    "app.job_diary_entry", "app.job_finding", "app.job_import_v3", "app.job_party_binding", "app.job_party_current",
    "app.job_site_source_receipt", "app.job_small_trip_event", "app.job_small_trip_observation",
    "app.job_source_original", "app.job_work_state_event"].map(job),
  "proposal review": ["app.proposal_review", "app.proposal_review_line", "app.proposal_review_line_parent",
    "app.proposal_review_question"].map(job),
  "quote": ["app.quote_acceptance_sequence", "app.quote_version"].map(job),
  "scope": ["app.scope_lineage", "app.scope_progress"].map(job),
  "v2 work plan": ["app.v2_work_plan", "app.v2_work_plan_edit", "app.v2_work_plan_task"].map(job),
  "variation": ["app.variation", "app.variation_approval", "app.variation_rate_observation", "app.variation_rejection",
    "app.variation_revision", "app.variation_withdrawal"].map(job),
  "linked by parent": [["app.finding_suppression", "finding_id"], ["app.quote_delivery_event", "quote_send_id"],
    ["app.job_link", "predecessor_job_id"]],
};

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  registerFirmChecks(helpers, "FL-1", families);

  // A restrictive FOR ALL policy with only USING also checks new rows: firm B can't write onto firm A's job.
  test("FL-1 firm check: firm B can't insert a quote version naming firm A's job (42501)", async () => {
    const { firmA, firmB } = await contexts();
    const own = (sql, params) => withTenant(runtime, firmA, db => db.$client.query(sql, params));
    const { rows: [visible] } = await own("SELECT id FROM app.quote_version ORDER BY id LIMIT 1");
    assert.ok(visible, "positive control: firm A reads its own quote version");
    const { rows: [row] } = await admin.query("SELECT to_jsonb(q) AS row FROM app.quote_version q WHERE id = $1", [visible.id]);
    const before = (await admin.query("SELECT count(*)::int AS n FROM app.quote_version")).rows[0].n;
    await assert.rejects(withTenant(runtime, firmB, db => db.$client.query(
      "INSERT INTO app.quote_version SELECT * FROM jsonb_populate_record(NULL::app.quote_version, $1)",
      [{ ...row.row, id: randomUUID() }])),
    error => error.code === "42501" && /row-level security/u.test(error.message));
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.quote_version")).rows[0].n, before);
  });
}
