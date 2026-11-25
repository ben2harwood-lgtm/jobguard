// Q36 / V2-FL-2. Registered by the full V2 seed suite, sharing its two sign-ins.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { FinalAccountCommandService, FeeIllustrationRepository } from "../../../packages/db/dist/index.js";
import { registerFirmChecks } from "./checks-lib.mjs";

const job = table => [`app.${table}`, "job_id"];
export const families = {
  billing: ["billing_allocation_run", "billing_application_event", "billing_export_batch", "billing_export_delivery",
    "billing_export_line", "billing_fact", "billing_line_match", "billing_quarantine", "billing_status_import"].map(job),
  extras: ["closeout_answer", "extra_approval_outcome", "extra_approval_request", "extra_approval_revision_binding",
    "extra_approval_step_fact", "extra_client_link", "extra_duplicate_link", "extra_escalation_fact", "extra_event",
    "extra_order_line_link", "extra_origin", "extra_pack_artifact", "extra_pricing_basis", "extra_sor_revision"].map(job),
  "final account": ["final_account_draft", "final_account_invoice_binding", "final_account_invoiced_line",
    "final_account_line", "final_account_lock", "final_account_lock_check", "final_account_revision",
    "final_account_scope_disposition"].map(job),
  "fee and cap": ["cap_snapshot", "fee_illustration_source"].map(job),
  "client link closure": [["app.extra_client_link_closure", "link_id"]],
};
const hash = text => createHash("sha256").update(text).digest("hex");

// fixture: work_order_commit and the contractor billing/approval commands are fenced on V2.
// Only the seed admin connection inserts these synthetic rows; every read proof uses runtime.
// A normal draft job is bound to the contractor track in this fixture before entering live.
async function contractorFixture({ admin, withTenant }, context, digest) {
  return withTenant(admin, context, async db => {
    const sql = (text, values) => db.$client.query(text, values);
    const { rows: [bound] } = await sql("SELECT app.current_actor() AS actor");
    const tenant = context.tenantId, actor = bound.actor, jobId = randomUUID();
    const put = async (table, values) => {
      const entries = Object.entries({ tenant_id: tenant, ...values });
      await sql(`INSERT INTO app.${table} (${entries.map(([key]) => key).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")})`,
        entries.map(([, value]) => value));
    };
    const now = new Date().toISOString(), h = hash(jobId);
    await put("job", { id: jobId, title: "FL-2 fictional contractor fixture", status: "draft", provenance: "system_generated_quote",
      practice_session_digest: digest, practice_scenario: "capture" });
    const party = randomUUID();
    const { rows: [sourceParty] } = await sql("SELECT to_jsonb(b) AS row FROM app.job_party_binding b WHERE tenant_id=$1 LIMIT 1", [tenant]);
    if (!sourceParty) throw new Error("FL-2 requires the seeded fictional parties");
    await sql("INSERT INTO app.job_party_binding SELECT * FROM jsonb_populate_record(NULL::app.job_party_binding,$1)",
      [{ ...sourceParty.row, id: party, job_id: jobId, revision: 0, command_id: null, provenance: "backfilled_synthetic_fixture" }]);
    await put("job_party_current", { job_id: jobId, binding_id: party });
    await sql("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenant, jobId]);
    await put("job_commercial_track", { job_id: jobId, job_track: "contractor", environment: "synthetic_demo", provenance: "work_order_import" });
    const command = async (type, semantic = randomUUID()) => {
      const id = randomUUID();
      await put("command_receipt", { command_id: id, command_type: type, semantic_key: semantic,
        request_hash: h, status: "processing", actor_membership_id: actor });
      return id;
    };
    const region = randomUUID(), branch = randomUUID(), client = randomUUID(), contract = randomUUID(), rule = randomUUID(), contractVersion = randomUUID();
    await sql("INSERT INTO app.org_unit(tenant_id,id,kind,name) VALUES($1,$1,'tenant','FL-2 fictional root') ON CONFLICT DO NOTHING", [tenant]);
    await put("org_unit", { id: region, kind: "region", parent_id: tenant, parent_kind: "tenant", name: "FL-2 fictional region" });
    await put("org_unit", { id: branch, kind: "branch", parent_id: region, parent_kind: "region", name: "FL-2 fictional branch" });
    await put("client_organisation", { id: client, branch_id: branch, name: "FL-2 fictional client", client_type: "housing_association" });
    await put("client_contract", { id: contract, client_id: client });
    await put("approval_rule_version", { id: rule, client_id: client, contract_id: contract, revision: 1, document: { version: "approval-rules.v1" } });
    await put("client_contract_version", { id: contractVersion, client_id: client, contract_id: contract, revision: 1,
      rule_version_id: rule, document: { version: "client-contract.v1" } });
    const scope = randomUUID(), extra = randomUUID(), revision = randomUUID(), binding = randomUUID(), request = randomUUID();
    const raise = await command("RecordOfficeExtra", `extra-origin:${jobId}:${extra}`);
    await put("scope_identity", { id: scope, job_id: jobId });
    await put("variation", { id: extra, job_id: jobId, scope_item_id: scope, capture_kind: "text", capture_text: "Fictional FL-2 extra",
      description: "Fictional FL-2 extra", job_track: "contractor", origin: "office_entry" });
    await put("extra_origin", { job_id: jobId, variation_id: extra, job_track: "contractor", kind: "office_entry", command_id: raise,
      raising_membership_id: actor, raising_role: "owner", provenance: "command", source_capture_kind: "text", source_capture_hash: h });
    await put("extra_event", { id: randomUUID(), job_id: jobId, variation_id: extra, sequence: 1, kind: "logged",
      command_id: raise, actor_membership_id: actor, server_recorded_at: now });
    await put("variation_revision", { id: revision, job_id: jobId, variation_id: extra, scope_item_id: scope, revision: 1,
      description: "Fictional FL-2 extra", quantity_decimal: "1", unit: "item", unit_rate_pence: "100", signed_delta_pence: "100",
      content_hash: h, confirmed_by_membership_id: actor, rate_provenance_kind: "human_entered", rate_source_ref: "FL-2 fixture",
      rate_source_hash: h, rate_version: "fixture.v1" });
    await put("extra_approval_revision_binding", { id: binding, job_id: jobId, variation_id: extra, logical_revision: 1,
      source_kind: "ordinary", source_revision_id: revision, variation_revision_id: revision, source_hash: h,
      command_id: raise, actor_membership_id: actor, binding_hash: h });
    const submit = await command("SubmitExtra");
    await put("extra_approval_request", { id: request, job_id: jobId, variation_id: extra, request_revision: 1, binding_id: binding,
      rule_version_id: rule, contract_version_id: contractVersion, client_id: client, rule_document_hash: h, requirement: {}, comparisons: {},
      net_pence: "100", revision_hash: h, command_id: submit, submitter_membership_id: actor, request_hash: h });
    await put("extra_approval_step_fact", { id: randomUUID(), job_id: jobId, variation_id: extra, request_id: request, step_index: 0,
      step_role: "supervisor", actor_kind: "contract_rule", approved_hash: h, approved_net_pence: "100", command_id: submit });
    await put("extra_approval_outcome", { id: randomUUID(), job_id: jobId, variation_id: extra, request_id: request, kind: "approved",
      actor_kind: "member", actor_membership_id: actor, command_id: submit });
    await put("extra_escalation_fact", { id: randomUUID(), job_id: jobId, variation_id: extra, request_id: request,
      step_index: 0, eligible_roles: ["supervisor"] });

    // Inert approved artifact fixture: no executor is called, and the outbox is cancelled at insertion.
    const decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID(), outbox = randomUUID();
    const expires = new Date(Date.now() + 3600000).toISOString(), content = "FL-2 fictional artifact", contentHash = hash(content);
    await put("decision", { id: decision, subject_type: "job", subject_ref: jobId, action_type: "extra.client_invite" });
    await put("decision_resolution", { id: resolution, decision_id: decision, resolution: "approved", actor_membership_id: actor });
    await put("action_authorization", { id: authorization, decision_id: decision, resolution_id: resolution,
      actor_membership_id: actor, action_type: "extra.client_invite", recipient: "fixture@jobguard-v2.invalid", content_hash: contentHash,
      aggregate_revision: 0, policy_version: "fixture.v1", expires_at: expires });
    await put("action_outbox", { id: outbox, authorization_id: authorization, adapter: "fake_email", provider_effect_key: outbox,
      action_type: "extra.client_invite", recipient: "fixture@jobguard-v2.invalid", content_hash: contentHash, immutable_content: content,
      aggregate_revision: 0, policy_version: "fixture.v1", authorization_expires_at: expires, status: "cancelled" });
    const link = randomUUID();
    await put("extra_client_link", { id: link, job_id: jobId, variation_id: extra, request_id: request, client_id: client,
      approver_membership_id: actor, recipient: "fixture@jobguard-v2.invalid", token_hash: hash(link), expires_at: expires,
      issued_by_membership_id: actor, authorization_id: authorization, outbox_action_id: outbox, command_id: submit });
    await put("extra_client_link_closure", { id: randomUUID(), link_id: link, kind: "revoked", actor_membership_id: actor, command_id: submit });

    const batch = randomUUID(), line = randomUUID(), imported = randomUUID(), fact = randomUUID(), run = randomUUID();
    const cmd = await command("FL2BillingFixture");
    await put("billing_export_batch", { id: batch, job_id: jobId, client_contract_id: contract, command_id: cmd,
      artifact: {}, json_content: "{}", csv_content: "FL-2 fictional CSV", json_hash: hash("{}"), csv_hash: hash("FL-2 fictional CSV"), total_net_pence: "100" });
    await put("billing_export_line", { id: line, job_id: jobId, client_contract_id: contract, batch_id: batch,
      extra_id: extra, scope_item_id: scope, revision_id: revision, revision_hash: h, approval_request_id: request,
      approval_binding_id: binding, approved_net_pence: "100", line: {} });
    await put("billing_export_delivery", { id: randomUUID(), job_id: jobId, client_contract_id: contract, batch_id: batch,
      outbox_action_id: outbox, command_id: cmd });
    await put("billing_status_import", { id: imported, job_id: jobId, command_id: cmd, transport: "csv", source_hash: h, actor_membership_id: actor });
    await put("billing_fact", { id: fact, job_id: jobId, client_contract_id: contract, import_id: imported, source: "FL-2 fixture",
      source_event_id: fact, invoice_number: "FL-2", payload: {}, payload_hash: h, match_valid: true });
    await put("billing_line_match", { id: randomUUID(), job_id: jobId, client_contract_id: contract, fact_id: fact,
      external_invoice_line_id: "FL-2", export_line_id: line, line_job_id: jobId });
    await put("billing_quarantine", { id: randomUUID(), job_id: jobId, client_contract_id: contract, fact_id: fact, reason: "fixture" });
    await put("billing_allocation_run", { id: run, job_id: jobId, client_contract_id: contract, source: "FL-2 fixture", invoice_number: "FL-2",
      input_hash: h, projection: {}, command_id: cmd });
    await put("billing_application_event", { id: randomUUID(), job_id: jobId, run_id: run, command_id: cmd });
    // Fixture receipts are terminal before commit; none can be mistaken for pending product work.
    await sql("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=ANY($2::uuid[])",
      [tenant, [raise, submit, cmd]]);
    return { jobId, link };
  });
}

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  let prepared;
  const prepare = () => prepared ??= (async () => {
    const context = await contexts();
    const fixtures = [];
    for (const firm of [context.firmA, context.firmB]) {
      const { rows: [row] } = await withTenant(runtime, firm, db => db.$client.query("SELECT app.current_firm_profile_key() AS key"));
      assert.match(row.key, /^practice:[a-f0-9]{64}$/u);
      fixtures.push(await contractorFixture(helpers, firm, row.key.slice("practice:".length)));
    }
    const { rows: [own] } = await withTenant(runtime, context.firmA, db => db.$client.query(
      "SELECT j.id, app.current_actor() AS actor FROM app.job j JOIN app.cap_snapshot c ON (c.tenant_id,c.job_id)=(j.tenant_id,j.id) WHERE j.status='live' AND NOT EXISTS (SELECT FROM app.final_account_draft d WHERE (d.tenant_id,d.job_id)=(j.tenant_id,j.id)) AND NOT EXISTS (SELECT FROM app.fee_illustration_source f WHERE (f.tenant_id,f.job_id)=(j.tenant_id,j.id)) ORDER BY j.id LIMIT 1"));
    assert.ok(own, "positive control: seeded firm A has a live job and cap");
    // Exercise the existing V2 application commands where they work; no fixture writer replaces them.
    await new FinalAccountCommandService(runtime).assemble(context.firmA, { version: "final-account.assemble.v1",
      commandId: randomUUID(), actorMembershipId: own.actor, jobId: own.id, expectedRevision: 0 });
    await new FeeIllustrationRepository(runtime).create(context.firmA, own.id, randomUUID());
    return { context, fixtures, liveJob: own.id };
  })();

  test("FL-2: populated positive controls for every family, both practice firms use runtime", async () => {
    const { context, fixtures, liveJob } = await prepare();
    assert.equal(context.firmA.tenantId, context.firmB.tenantId);
    for (const [index, firm] of [context.firmA, context.firmB].entries()) {
      for (const table of [
        ...families.billing.map(([table]) => table.slice("app.".length)),
        "extra_origin", "extra_event", "extra_approval_revision_binding", "extra_approval_request",
        "extra_approval_step_fact", "extra_approval_outcome", "extra_escalation_fact", "extra_client_link",
      ]) {
        const { rows } = await withTenant(runtime, firm, db => db.$client.query(`SELECT job_id FROM app.${table} WHERE job_id=ANY($1::uuid[])`,
          [fixtures.map(f => f.jobId)]));
        assert.deepEqual(rows, [{ job_id: fixtures[index].jobId }], `${table}: own row visible and other firm's row absent`);
      }
      const { rows } = await withTenant(runtime, firm, db => db.$client.query(
        "SELECT link_id FROM app.extra_client_link_closure WHERE link_id=ANY($1::uuid[])", [fixtures.map(f => f.link)]));
      assert.deepEqual(rows, [{ link_id: fixtures[index].link }], "indirect lock follows the visible parent");
    }
    for (const table of ["final_account_draft", "final_account_revision", "final_account_line", "cap_snapshot", "fee_illustration_source"]) {
      const { rowCount } = await withTenant(runtime, context.firmA, db => db.$client.query(`SELECT job_id FROM app.${table} WHERE job_id=$1`, [liveJob]));
      assert.ok(rowCount > 0, `${table}: a real positive control, never an empty-table pass`);
    }
  });
  registerFirmChecks({ ...helpers, contexts: async () => (await prepare()).context }, "FL-2", families);

  test("FL-2: firm B cannot insert, update or delete firm A's final-account draft", async () => {
    const { context, liveJob } = await prepare();
    const read = () => admin.query("SELECT to_jsonb(d) AS row FROM app.final_account_draft d WHERE tenant_id=$1 AND job_id=$2",
      [context.firmA.tenantId, liveJob]);
    const before = (await read()).rows;
    assert.equal(before.length, 1, "positive control: firm A's populated draft");
    await assert.rejects(withTenant(runtime, context.firmB, db => db.$client.query(
      "INSERT INTO app.final_account_draft(tenant_id,job_id,id) VALUES($1,$2,$3)",
      [context.firmA.tenantId, liveJob, randomUUID()])),
    error => error.code === "42501" && /row-level security/u.test(error.message));
    for (const statement of [
      "UPDATE app.final_account_draft SET revision=revision+1 WHERE tenant_id=$1 AND job_id=$2",
      "DELETE FROM app.final_account_draft WHERE tenant_id=$1 AND job_id=$2",
    ]) {
      await assert.rejects(withTenant(runtime, context.firmB, db => db.$client.query(statement,
        [context.firmA.tenantId, liveJob])), error => error.code === "42501");
    }
    assert.deepEqual((await read()).rows, before, "all refused writes leave the draft unchanged");
  });

  test("FL-2: migration 2048 reapplies twice over populated rows without policy or grant changes", async () => {
    await prepare();
    const catalog = async () => (await admin.query(`SELECT c.oid::regclass::text AS table_name,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
      p.polname,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid) AS expression,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid
      WHERE c.oid=ANY($1::regclass[]) ORDER BY 1,p.polname`, [Object.values(families).flat().map(([table]) => table)])).rows;
    const before = await catalog(), migration = readFileSync(new URL("../migrations/2048_v2_firm_lock_money.sql", import.meta.url), "utf8");
    for (let i = 0; i < 2; i++) {
      await admin.query(migration);
      assert.deepEqual(await catalog(), before);
    }
  });
}
