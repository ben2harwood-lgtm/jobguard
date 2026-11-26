// Test-only rows for main commands with no V2 route or a synthetic-demo fence.
// Never used by bootstrap or a product command. Keep all constraints and triggers on.
import { randomUUID } from "node:crypto";
import { referenceApprovalRulesV1 } from "../../../packages/core/dist/index.js";

const hash = "a".repeat(64);
const at = "2026-11-25T12:00:00.000Z";
// Only static table/column names from this file reach this helper.
async function insert(client, table, fields) {
  const keys = Object.keys(fields);
  await client.query(`INSERT INTO app.${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(fields));
}

export async function orderFixtures(client, tenant, jobId, auditId) {
  const { rows: [binding] } = await client.query(`SELECT b.*, r.command_id AS receipt_id FROM app.job_party_binding b
    JOIN app.command_receipt r ON (r.tenant_id,r.command_id)=(b.tenant_id,b.command_id)
    WHERE b.tenant_id=$1 AND b.job_id=$2 ORDER BY b.revision DESC LIMIT 1`, [tenant, jobId]);
  if (!binding) throw new Error("FL-3 fixture requires the real job party binding and a persisted command receipt");
  const common = { tenant_id: tenant, job_id: jobId };
  const { rows: [job] } = await client.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [tenant, jobId]);
  await client.query("SELECT set_config('app.practice_material_digest',$1,true)", [job.practice_session_digest]);

  // fixture: property checks have no V2 route. References come from the saved party binding.
  const source = { id: "synthetic-flood.v1", name: "Generated flood register (synthetic)" };
  await client.query("SAVEPOINT fl3_prevention_fixture");
  try {
    await insert(client, "property_constraint_fact", { id: randomUUID(), ...common, binding_id: binding.id, site_revision_id: binding.site_revision_id,
      actor_membership_id: (await client.query("SELECT actor_membership_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenant, binding.receipt_id])).rows[0].actor_membership_id,
      command_id: binding.receipt_id, kind: "flood", source_id: source.id, source_name: source.name, retrieved_at: at, audit_event_id: auditId,
      result: { version: "prevention-result.v1", environment: "synthetic_demo", kind: "flood", source, retrievedAt: at, observedAt: at,
        fact: "no_record", evaluatedAt: at, policyVersion: "prevention-staleness-reference.v1", referenceOnly: true,
        maximumAgeMinutes: 180, status: "clear", reason: "current" } });

    throw new Error("Expected prevention's checked actor gate to refuse an owner fixture");
  } catch (error) {
    if (error.code !== "42501" || !/FORBIDDEN|REQUEST_BINDING_REFUSED/u.test(error.message)) throw error;
    await client.query("ROLLBACK TO SAVEPOINT fl3_prevention_fixture");
  }
  await client.query("RELEASE SAVEPOINT fl3_prevention_fixture");

  // fixture: app.approve_synthetic_landing / app.reverse_synthetic_landing are fenced on V2.
  // Real photo evidence was finalized by the suite's EvidenceService path.
  const { rows: [evidence] } = await client.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND kind='original' ORDER BY id LIMIT 1", [tenant, jobId]);
  if (!evidence) throw new Error("FL-3 landing fixture requires the suite's real finalized upload");
  const recoveryCase = randomUUID(), receipt = randomUUID(), eligible = randomUUID(), landing = randomUUID(), allocation = randomUUID();
  await insert(client, "recovery_case", { id: recoveryCase, ...common, claim_pence: "100", currency: "GBP", state: "active", revision: 0, synthetic: true });
  await insert(client, "synthetic_recovery_receipt", { id: receipt, ...common, source_identity: `FL-3:${receipt}`, reconciliation_identity: `FL-3:${receipt}`,
    status: "settled", gross_pence: "120", currency: "GBP", synthetic: true, settled_at: at });
  for (const [id, kind] of [[eligible, "eligibility"], [landing, "landing"]]) {
    await insert(client, "recovery_approval", { id, ...common, case_id: recoveryCase, kind, expected_case_revision: 0,
      status: "approved", policy_version: "reference_fee_policy_v1", expires_at: "2099-01-01T00:00:00Z", command_id: randomUUID() });
  }
  await insert(client, "landing_allocation", { id: allocation, ...common, case_id: recoveryCase, receipt_id: receipt, evidence_id: evidence.id,
    eligibility_approval_id: eligible, landing_approval_id: landing, gross_pence: "120", eligible_net_pence: "100", currency: "GBP", policy_version: "reference_fee_policy_v1" });
  await insert(client, "landing_reversal", { id: randomUUID(), ...common, allocation_id: allocation, eligible_net_pence: "100", reason: "FL-3 synthetic reversal fixture" });

  // fixture: app.work_order_commit is fenced on V2. Build the real FK parents
  // for the family proof. A sibling receipt allocation below proves the family
  // when the checked party-record trigger refuses this owner fixture.
  const region = randomUUID(), branch = randomUUID(), clientId = randomUUID(), contract = randomUUID(), rule = randomUUID(), contractVersion = randomUUID();
  await client.query("INSERT INTO app.org_unit(tenant_id,id,kind,name) VALUES($1,$1,'tenant','FL-3 fictional root') ON CONFLICT DO NOTHING", [tenant]);
  await insert(client, "org_unit", { tenant_id: tenant, id: region, kind: "region", parent_id: tenant, parent_kind: "tenant", name: "FL-3 fictional region" });
  await insert(client, "org_unit", { tenant_id: tenant, id: branch, kind: "branch", parent_id: region, parent_kind: "region", name: "FL-3 fictional branch" });
  await insert(client, "client_organisation", { tenant_id: tenant, id: clientId, branch_id: branch, name: "FL-3 fictional client", client_type: "person" });
  await insert(client, "client_contract", { tenant_id: tenant, id: contract, client_id: clientId });
  await insert(client, "approval_rule_version", { tenant_id: tenant, id: rule, client_id: clientId, contract_id: contract, revision: 1, document: referenceApprovalRulesV1 });
  await insert(client, "client_contract_version", { tenant_id: tenant, id: contractVersion, client_id: clientId, contract_id: contract, revision: 1, rule_version_id: rule,
    document: { version: "client-contract.v1", reference: "FL-3", startsOn: "2026-01-01", endsOn: null, sorVersionIds: [],
      tenderedAdjustment: { numerator: "0", denominator: "1" }, photoRule: "optional", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 } });
  const { rows: [member] } = await client.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND role='owner' ORDER BY id LIMIT 1", [tenant]);
  // The owner insert is deliberately refused by the deferred checked-record gate.
  // Report this to FL-F; do not forge a contractor receipt or disable the trigger.
  await client.query("SAVEPOINT fl3_party_fixture");
  try {
    await insert(client, "contractor_client_customer", { tenant_id: tenant, id: randomUUID(), client_id: clientId, customer_id: binding.customer_id,
      customer_revision_id: binding.customer_revision_id, command_id: binding.receipt_id, actor_membership_id: member.id });
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    throw new Error("Expected the checked contractor party record gate to refuse a fixture");
  } catch (error) {
    if (error.code !== "23514" || !/CONTRACTOR_PARTY_RECORD_REQUIRED/u.test(error.message)) throw error;
    await client.query("ROLLBACK TO SAVEPOINT fl3_party_fixture");
  }
  await client.query("RELEASE SAVEPOINT fl3_party_fixture");

  // fixture: contractor billing application is fenced on V2; an original-order
  // receipt has no extra export identity and contributes no matched-extra value.
  const run = randomUUID();
  await insert(client, "billing_allocation_run", { id: run, ...common, client_contract_id: contract, source: "FL-3", invoice_number: "FL-3",
    input_hash: hash, projection: {}, command_id: binding.receipt_id });
  await insert(client, "contractor_receipt_line_allocation", { id: randomUUID(), ...common, run_id: run, source_ref: "FL-3", external_invoice_line_id: "order",
    line_job_id: jobId, rule: "separate_invoice", gross_numerator: "120", gross_denominator: "1", net_numerator: "100", net_denominator: "1",
    matched_extra_numerator: "0", matched_extra_denominator: "1" });
}
