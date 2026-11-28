import { readFile } from "node:fs/promises";
import { currentCommandRegistryRows } from "./lp5-command-catalog.js";
import { readFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { meterCompany, command, terms } from "./subscription-persistence-fixtures.js";
import { service, request, retainedExport } from "./plan-entitlement-lifecycle-fixtures.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { migrate } from "../src/index.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
// LP-6c replacements are restricted to these exact overloads.
// Retain the predecessor test's separate named dispatcher allowance below.
const lp6cSignatures = [
  "app.assert_financial_authorization(uuid,uuid,character varying,bigint,character,character)",
  "app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,character varying,character varying,character varying,character,uuid,uuid)",
  "app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,character varying,character varying,character,uuid,uuid)",
  "app.reverse_journal(uuid,uuid,uuid,character varying,character varying,character,uuid,uuid)",
  "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)",
  "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)",
  "app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone)",
  "app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone)",
  "app.reserve_customer_invoice_number(uuid)",
  "app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)",
  "app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid)",
  "app.final_lock_require_owner(uuid,uuid)",
  "app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)",
  "app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)",
  "app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)",
  "app.lock_recovery_payer_job(uuid,uuid,uuid)",
  "app.final_check_require_invoice_actor(uuid,uuid,uuid)",
  "app.assert_receipt_fact_scope(uuid,uuid,text)",
  "app.write_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb)",
  "app.lp3_authorize(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer)",
  "app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone,uuid,uuid)",
  "app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone,uuid,uuid,uuid)",
  "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid,uuid,uuid)",
  "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone,uuid,uuid)",
  "app.lp5_bind_effect(uuid,uuid,text,jsonb)",
  "app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)",
  "app.complete_command(uuid,jsonb)",
  "app.mon1_company_actor(uuid,text)",
] as const;
const lp6cBodies = [...readFileSync(new URL("../migrations/0723_lp6c_money_binding.sql", import.meta.url), "utf8")
  .matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)];
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration("0556_mon8_job_track_and_trial.sql");
  const f = c as unknown as WorkFixture, trial = await firstTrialFixture(f), paid = await meterCompany(f);
  await command(f, paid, terms(paid)); await retainedExport(f, trial);
  const before = await snapshot(c.admin);
  const catalogue = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) args,
    CASE WHEN p.oid<>'app.mon8_company_feature(text,text,uuid)'::regprocedure THEN p.prosrc END source,
    CASE WHEN p.oid<>'app.mon8_company_feature(text,text,uuid)'::regprocedure THEN pg_get_functiondef(p.oid) END definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control','worm_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
  const security = await catalogue();
  expect(await service(f, trial).check(request("final_check", trial.jobId))).toMatchObject({ executable: false });
  await applyMigration(c, "0556_mon8_job_track_and_trial.sql");
  expect(await snapshot(c.admin)).toEqual(before); expect(await catalogue()).toEqual(security);
  expect(await service(f, trial).require(request("final_check", trial.jobId))).toMatchObject({ executable: true });
  expect(await service(f, paid).require(request("invoices", paid.jobId))).toMatchObject({ executable: true });
  await migrate(c.admin); await migrate(c.admin);
  expect(await snapshot(c.admin)).toEqual({ ...before, ...laterEmptyTables, "app.command_type_registry": (await c.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify(currentCommandRegistryRows)])).rows[0].data });
  // Successor migrations have their own exact reviewed routine ACL additions.
  // Keep the 0556-only assertion above, and retain every predecessor definition.
  const live = await catalogue();
  expect(lp6cBodies).toHaveLength(lp6cSignatures.length);
  const lp6cReplacements = new Map<number, string>();
  for (const [index, signature] of lp6cSignatures.entries()) {
    // Resolve only this named signature, never a name-only/wildcard allowance.
    const oid = (await c.admin.query("SELECT $1::regprocedure::oid oid", [signature])).rows[0].oid;
    const body = lp6cBodies[index]!;
    expect(signature.split("(")[0]).toBe(`app.${body[1]}`);
    lp6cReplacements.set(oid, body[4]!);
  }
  // LATER-SAFETY-144 replaces only this exact writer body; retain its metadata checks.
  const signedInvoiceSql = await readFile(new URL("../migrations/0731_combined_invoice_signed_vat.sql", import.meta.url), "utf8");
  const signedInvoiceOid = (await c.admin.query("SELECT 'app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)'::regprocedure::oid oid")).rows[0].oid;
  lp6cReplacements.set(signedInvoiceOid, signedInvoiceSql.split("FUNCTION app.issue_lock_bound_customer_invoice(")[1]!.split("AS $$")[1]!.split(/\$\$\s*;/u)[0]!);
  // LATER-SAFETY-150 replaces only the internal 14-argument builder attestation body.
  const sentHeadSql = await readFile(new URL("../migrations/0743_builder_acceptance_sent_head.sql", import.meta.url), "utf8");
  const sentHeadOid = (await c.admin.query("SELECT 'app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)'::regprocedure::oid oid")).rows[0].oid;
  lp6cReplacements.set(sentHeadOid, [...sentHeadSql.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)][0]![4]!);
  // Only these six exact identities receive their latest 0724 bodies. Their
  // owners, ACLs and all other metadata remain checked by successor proofs.
  const delegationSql = await readFile(new URL("../migrations/0724_lp6c_customer_portal_delegation.sql", import.meta.url), "utf8");
  const delegationBodies = [...delegationSql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)];
  const delegationSignatures = ["app.current_actor()", "app.current_tenant()", "identity.customer_portal_message(uuid,uuid,uuid,text,jsonb)",
    "app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)", "app.lp5_bind_effect(uuid,uuid,text,jsonb)", "app.complete_command(uuid,jsonb)"];
  expect(delegationBodies).toHaveLength(delegationSignatures.length);
  for (const signature of delegationSignatures) {
    const body = delegationBodies.find(match => match[1] === signature.split("(")[0]);
    expect(body, signature).toBeDefined();
    const oid = (await c.admin.query("SELECT $1::regprocedure::oid oid", [signature])).rows[0].oid;
    lp6cReplacements.set(oid, body![4]!);
  }
  const clientDecisionSql = await readFile(new URL("../migrations/0725_lp6c_client_extra_decision.sql", import.meta.url), "utf8");
  const clientDecisionOid = (await c.admin.query("SELECT 'identity.extra_customer_approval(uuid,uuid,uuid,text,jsonb)'::regprocedure::oid oid")).rows[0].oid;
  lp6cReplacements.set(clientDecisionOid, clientDecisionSql.split("FUNCTION identity.extra_customer_approval(")[1]!.split("AS $$")[1]!.split("$$;")[0]!);
  // 0722 adds only this exact administrative close routine; successor proofs bind its ACLs.
  const abandonedVisit = await readFile(new URL("../migrations/0722_abandoned_visit_authority.sql", import.meta.url), "utf8");
  const abandonedVisitRoutines = live.filter(row => row.nspname === "app" && row.proname === "ent3b_close_abandoned_visit"
    && row.args === "p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_reason text");
  expect(abandonedVisitRoutines).toHaveLength(1);
  // LP-6d repair 12 (0740): the only change reads the visit operative's (third-party) authority through the private copy.
  expect(abandonedVisitRoutines[0]?.definition?.split("$function$")[1]).toEqual(
    abandonedVisit.split("FUNCTION app.ent3b_close_abandoned_visit(")[1]!.split("AS $$")[1]!.split("$$;")[0]!
      .replace(" IF EXISTS(SELECT 1 FROM app.ent3b_visit_authority(visit_row.membership_id,p_job)",
        " -- LP6D_THIRD_PARTY (repair 12): the visit's operative is a third party with no request of its own; its\n -- current visit authority is read through the private copy, never through the caller's binding.\n IF EXISTS(SELECT 1 FROM app.lp6d_visit_authority_of(visit_row.membership_id,p_job)"));
  const lp11Sql = await readFile(new URL("../migrations/0765_lp11_bound_tenant_rls.sql", import.meta.url), "utf8");
  for (const signature of [
    "infrastructure.discover_readiness_plans()", "app.serialize_final_check_evidence()",
    "app.guard_post_lock_upload_transition()", "app.lp6d_refused_contractor_principal(uuid)",
    "app.ch4_guard_new_site_work()", "app.mon2_consistency()", "app.claim_trial_identity_keys(uuid,uuid)", "app.contractor_session(uuid)", "app.lp6_bound_request()",
    "infrastructure.discover_retention_reviews()", "app.retention_timer_book(uuid,uuid)",
    "app.retention_timer(uuid,uuid,jsonb,text)",
    "app.prepare_evidence_pack_v3(uuid,uuid)", "app.complete_evidence_pack_v3_check(uuid,uuid,text)",
    "app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text)",
    "identity.customer_practice_pay_now(uuid,uuid,uuid,text)",
    "app.mon3_require_registered_admission()", "app.lp_job_permit_consumed()",
    "app.final_check_job_terms(uuid,uuid,text,timestamp with time zone)",
    "app.guard_job_proof_source()", "app.guard_final_lock_proof_statement()", "app.ch4_capture_site_source()",
    "app.worm_audit(app.worm_command,text,text)", "app.worm_claim(uuid)", "app.worm_finish(uuid,integer,text,jsonb)",
    "worm_control.worm_recovery_target(uuid)", "worm_control.worm_reconcile(uuid,integer,boolean)",
    "worm_control.worm_operator_alerts()",
  ]) {
    const source = lp11Sql.split(`CREATE OR REPLACE FUNCTION ${signature.split("(")[0]}(`)[1]!
      .split("AS $$")[1]!.split("$$;")[0];
    expect((await c.admin.query("SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows)
      .toEqual([{ prosrc: source }]);
  }
  for (const routine of ["intake", "machine_stage"]) {
    const source = lp11Sql.split(`CREATE OR REPLACE FUNCTION connector.${routine}(`)[1]!
      .split("AS $$")[1]!.split("$$;")[0];
    expect((await c!.admin.query(
      "SELECT p.prosrc FROM pg_proc p WHERE p.pronamespace='connector'::regnamespace AND p.proname=$1", [routine],
    )).rows).toEqual([{ prosrc: source }]);
  }
  const pilotFinalAccountSql = await readFile(new URL("../migrations/0776_pilot_final_account.sql", import.meta.url), "utf8");
  const pilotDisclosureBody = pilotFinalAccountSql.split("CREATE OR REPLACE FUNCTION app.guard_final_lock_disclosure_terms(")[1]!
    .split("AS $$")[1]!.split("$$;")[0]!;
  const recoverySql = await readFile(new URL("../migrations/0732_final_check_typed_recovery.sql", import.meta.url), "utf8");
  for (const [name,args] of [
    ["final_check_read_authority","t uuid, j uuid, d text, locking boolean"],
    ["admit_final_check_cycle","t uuid, j uuid"],
    ["final_check_cycle_claim","t uuid, j uuid, l uuid, m uuid, a integer, c uuid"],
    ["final_check_cycle_finish","t uuid, j uuid, l uuid, m uuid, a integer, c uuid, succeeded boolean"],
  ]) {
    const routines = live.filter(row => row.nspname === "app" && row.proname === name && row.args === args);
    expect(routines).toHaveLength(1);
    const source = name === "final_check_cycle_finish" ? lp11Sql : recoverySql;
    expect(routines[0]?.definition?.split("$function$")[1]).toBe(source.split(`FUNCTION app.${name}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]);
  }
  // 0692 adds one owner-only helper; pin its complete body as well as successor metadata.
  const receiptGate = await readFile(new URL("../migrations/0692_final_check_post_invoice_receipt_gate.sql", import.meta.url), "utf8");
  const receiptHelpers = live.filter(row => row.nspname === "app" && row.proname === "require_receipt_final_check"
    && row.args === "p_tenant uuid, p_job uuid");
  expect(receiptHelpers).toHaveLength(1);
  expect(receiptHelpers[0]?.definition?.split("$function$")[1]).toEqual(
    receiptGate.split("FUNCTION app.require_receipt_final_check(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
  const variationPhotoSql = await readFile(new URL("../migrations/0781_variation_revision_photo.sql", import.meta.url), "utf8");
  // 0765 preserves distinct customer, human emergency, mailbox and machine entry points.
  for (const [name, args] of [
    ["customer_stages", "t uuid, j uuid, c uuid, digest text, completion uuid, command uuid, expected_hash text"],
    ["customer_variation", "t uuid, j uuid, c uuid, digest text, command jsonb"],
    ["dark_emergency", "s text, csrf text, t uuid, p jsonb"],
    ["emergency_owner", "s text, csrf text, t uuid"],
    ["sso_emergency_use", "u uuid, p jsonb"],
    ["scim2_configure", "s text, csrf text, t uuid, b uuid, c uuid, is_enabled boolean, credential_hash text"],
    ["scim2_machine", "b uuid, token text, p jsonb"],
  ]) {
    // QW-1 (0781) replaces only the customer_variation body: photos in the view and an exact-photo approval check.
    const source = name === "customer_variation" ? variationPhotoSql : lp11Sql;
    const body = source.split(`FUNCTION identity.${name}(`)[1]!.split("AS $$")[1]!.split("$$;")[0];
    const routines = live.filter(row => row.nspname === "identity" && row.proname === name && row.args === args);
    expect(routines).toHaveLength(1);
    expect(routines[0]?.definition?.split("$function$")[1]).toEqual(body);
  }
  // 0709 replaces only this exact overload on 0656's body; pin its entire body, including all predecessor guards.
  const feeResult = await readFile(new URL("../migrations/0742_fee_webhook_receipt_binding.sql", import.meta.url), "utf8");
  const feeResultBody = feeResult.split("CREATE OR REPLACE FUNCTION app.replace_fee_reservation_book")[1]!.split("AS $$")[1]!.split("$$;")[0];
  expect(live.filter(row => row.nspname === "app" && row.proname === "replace_fee_reservation_book"
    && row.args === "p_tenant uuid, p_book jsonb, p_result jsonb")).toHaveLength(1);
  expect(live.find(row => row.nspname === "app" && row.proname === "replace_fee_reservation_book"
    && row.args === "p_tenant uuid, p_book jsonb, p_result jsonb")?.definition?.split("$function$")[1]).toEqual(feeResultBody);
  const billingSource = await readFile(new URL("../migrations/0727_billing_export_delivery_once.sql", import.meta.url), "utf8");
  const billingBodies = new Map([
    ["cb_delivery|p_session uuid, p_job uuid, p_command uuid, p_payload jsonb", billingSource.split("FUNCTION app.cb_delivery(")[1]!.split("AS $$")[1]!.split("$$;")[0]!],
    ["cb_csv_cell|v text", billingSource.split("FUNCTION app.cb_csv_cell(")[1]!.split("AS $$")[1]!.split("$$;")[0]!],
  ]);
  for (const key of billingBodies.keys()) {
    expect(live.filter(row => row.nspname === "app" && `${row.proname}|${row.args}` === key)).toHaveLength(1);
  }
  // 0697 adds only this owner-only trigger routine; pin its exact identity and complete body.
  const variationLock = await readFile(new URL("../migrations/0694_variation_post_lock_refusal.sql", import.meta.url), "utf8");
  const variationLockBody = variationLock.split("FUNCTION app.guard_variation_final_account_lock()")[1]!.split("AS $$")[1]!.split("$$;")[0];
  const variationLockRoutines = live.filter(row => row.nspname === "app" && row.proname === "guard_variation_final_account_lock" && row.args === "");
  expect(variationLockRoutines).toHaveLength(1);
  expect(variationLockRoutines[0]?.definition?.split("$function$")[1]).toEqual(variationLockBody);
  // 0587 replaces only the payment-fee writer body; keep every mainline exception below.
  const paymentFeeWriterOid = (await c.admin.query("SELECT 'app.write_payment_fee(uuid,text,jsonb)'::regprocedure::oid oid")).rows[0].oid;
  const collectRecheck = await readFile(new URL("../migrations/0587_payment_fee_collect_recheck.sql", import.meta.url), "utf8");
  const paymentFeeWriterBody = collectRecheck.split("CREATE OR REPLACE FUNCTION app.write_payment_fee")[1]!.split("AS $$")[1]!.split("$$;")[0];
  // 0567 changes only the checked settlement overload's expected approval hash.
  const settlementOid = (await c.admin.query("SELECT 'app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone,uuid,uuid,uuid)'::regprocedure::oid oid")).rows[0].oid;
  const selfComparison = "(SELECT content_hash FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization)";
  // This batch replaces only these exact routine identities; compare their complete bodies.
  const batchBodies = await Promise.all([
    ["ef_inputs", "t uuid, ag app.enterprise_agreement_version, p_period text", "0745_enterprise_fee_rejected_line.sql"],
    // 0756 retains LS-149 owner-before-replay and LS-162 pending-change refusal from 0755.
    ["mon2_command", "t uuid, digest text, command_id uuid, v jsonb", "0756_subscription_attempt_reconciliation.sql"],
    ["ef_prepare_statement", "p_session uuid, p_command uuid, p_period text", "0704_enterprise_fee_period_order.sql"],
    ["cb_derive", "p_session uuid, p_job uuid, p_command uuid, p_source text, p_invoice text, p_hash text, p_projection jsonb", "0748_billing_policy_hold_projection.sql"],
    ["ef_post_statement", "p_session uuid, p_command uuid, p_statement uuid, p_authorization uuid", "0704_enterprise_fee_period_order.sql"],
    ["receipt_fact_invoice_line", "t uuid, j uuid, i uuid, l uuid, r uuid, k uuid, ch uuid", "0713_supplementary_after_combined_receipt.sql"],
    ["issue_practice_customer_invoice", "p_tenant uuid, p_job uuid, p_final_revision uuid, p_actor uuid, p_command uuid, p_recipient text, p_issued_on date", "0723_lp6c_money_binding.sql"],
    ["issue_practice_customer_credit_note", "p_tenant uuid, p_job uuid, p_invoice uuid, p_actor uuid, p_command uuid, p_net_pence bigint, p_reason text, p_preview_hash text", "0717_credit_request_digest_fields.sql"],
    ["lp5b_contractor_permission", "p_type text, p_actor uuid, p_job uuid, p_input jsonb", "0722_abandoned_visit_authority.sql"],
    ["lp5_bind_effect", "p_command uuid, p_authorization uuid, p_adapter text, p_reference jsonb", "0724_lp6c_customer_portal_delegation.sql"],
    ["lp5b_contractor_result", "p_command uuid, p_outcome jsonb", "0722_abandoned_visit_authority.sql"],
    ["ent3b_closeout_guard", "", "0722_abandoned_visit_authority.sql"],
    ["receipt_fact_proposal", "t uuid, j uuid, p jsonb", "0747_receipt_proposal_historical_capacity.sql"],
    ["read_final_check_manifest", "t uuid, j uuid, m uuid", "0698_final_check_post_invoice_rerun.sql"],
    ["evidence_pack_v3_material", "t uuid, c uuid, ordinary_only boolean", "0698_final_check_post_invoice_rerun.sql"],
    ["begin_final_check", "t uuid, j uuid, detector text, policy text", "0698_final_check_post_invoice_rerun.sql"],
    ["complete_final_check", "t uuid, j uuid, m uuid, p jsonb", "0698_final_check_post_invoice_rerun.sql"],
    ["guard_final_check_manifest", "", "0698_final_check_post_invoice_rerun.sql"],
    ["read_final_check_reveal", "t uuid, j uuid, d text", "0732_final_check_typed_recovery.sql"],
    ["read_value_job", "j uuid, digest text", "0698_final_check_post_invoice_rerun.sql"],
    ["request_final_check_run", "t uuid, j uuid, d text", "0732_final_check_typed_recovery.sql"],
    ["request_practice_final_check_on_lock", "", "0698_final_check_post_invoice_rerun.sql"],
    ["verify_final_check_run", "p_tenant uuid, p_job uuid, p_run uuid, p_lock uuid, p_cutoff timestamp with time zone", "0698_final_check_post_invoice_rerun.sql"],
    ["retention_records", "t uuid, digest text, j uuid, cid uuid, v jsonb, expected text", "0646_retention_timer_runtime_rules.sql"],
    ["notice_fixture_records", "j uuid, n uuid, digest text, operation text, v jsonb", "0647_notice_live_job_check.sql"],
    ["pay_now_fake_attempt", "t uuid, digest text, j uuid, operation text, v jsonb", "0648_pay_now_catch_statement.sql"],
    ["ch6_integrity_authority", "t uuid, j uuid, digest text", "0660_baseline_ancestry_audit_trust.sql"],
    ["ch6_integrity_sources", "t uuid, j uuid, d text", "0660_baseline_ancestry_audit_trust.sql"],
    ["ch6_record_integrity_review", "t uuid, j uuid, digest text, review jsonb, source_snapshot jsonb", "0660_baseline_ancestry_audit_trust.sql"],
    ["decision_check_command", "p_digest text, p_command jsonb, p_phase text, p_data jsonb", "0660_baseline_ancestry_audit_trust.sql"],
    ["interim_draft_records", "t uuid, digest text, j uuid, operation text, v jsonb", "0721_interim_draft_rules.sql"],
    ["interim_draft_records", "t uuid, digest text, j uuid, operation text, v jsonb", "0665_interim_read_authority.sql"],
    ["ch5_history_actor", "t uuid, j uuid, d text", "0668_import_company_owner_history.sql"],
    ["guard_practice_material_requirement", "", "0690_import_ancestry_record_anchor.sql"],
    ["ch4_read_work_facts", "t uuid, j uuid, digest text", "0690_import_ancestry_record_anchor.sql"],
    ["read_job_sources", "t uuid, j uuid, digest text, source text", "0690_import_ancestry_record_anchor.sql"],
    ["ch4_require_command_owner", "t uuid, j uuid, digest text", "0690_import_ancestry_record_anchor.sql"],
    ["final_check_builder", "t uuid, j uuid, d text, locking boolean", "0735_per_firm_final_check_terms.sql"],
    ["evidence_pack_v3_owner", "t uuid, c uuid, d text", "0735_per_firm_final_check_terms.sql"],
    ["adopt_invoiced_job_v3", "t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text", "0690_import_ancestry_record_anchor.sql"],
    ["apply_recovery_timeline_signal", "p_tenant uuid, p_signal jsonb", "0690_import_ancestry_record_anchor.sql"],
    ["guard_watchdog_upload_update", "", "0720_verified_upload_immutable.sql"],
    // 0735 re-creates these with full latest bodies that check the job's own firm acceptance.
    ["final_check_require_worker", "p_tenant uuid, p_job uuid", "0735_per_firm_final_check_terms.sql"],
    ["final_check_worker", "t uuid, j uuid", "0735_per_firm_final_check_terms.sql"],
    ["accept_final_check_terms", "p_tenant uuid, p_actor uuid, p_command uuid, p_version text", "0735_per_firm_final_check_terms.sql"],
    ["guard_final_lock_disclosure_terms", "", "0735_per_firm_final_check_terms.sql"],
    ["surface_shadow_signal_early", "p_tenant uuid, p_job uuid, p_signal uuid, p_firing uuid, p_decision uuid, p_disclosure uuid, p_rule text, p_version text, p_source uuid, p_object_version text, p_facts jsonb", "0735_per_firm_final_check_terms.sql"],
    ["connector_promotion", "p_session uuid, p_namespace text, p_event text, p_command uuid, p_result jsonb", "0754_connector_promotion_list_closed_job.sql"],
    ["issue_practice_customer_invoice", "p_tenant uuid, p_job uuid, p_final_revision uuid, p_actor uuid, p_command uuid, p_recipient text, p_issued_on date", "0764_practice_firm_name_invoice.sql"],
    ["issue_lock_bound_customer_invoice", "p_tenant uuid, p_job uuid, p_revision uuid, p_actor uuid, p_command uuid, p_kind text, p_recipient text, p_issued_on date, p_source_hash text", "0764_practice_firm_name_invoice.sql"],
  ].map(async ([name, args, migration]) => {
    const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    if (name === "decision_check_command") expect(sql).toContain("rv.result->>'sourceJobId'=source.id::text");
    return { name, args, body: sql.split(`CREATE OR REPLACE FUNCTION app.${name}`)[1]!.split("AS $$")[1]!.split("$$;")[0] };
  }));
  // Saved-estimate successor: retain and verify the recovery predecessor above.
  const savedEstimatePredecessor = batchBodies.find(row => row.name === "read_final_check_reveal" && row.args === "t uuid, j uuid, d text")!;
  expect(savedEstimatePredecessor.body).toBe(recoverySql.split("CREATE OR REPLACE FUNCTION app.read_final_check_reveal")[1]!.split("AS $$")[1]!.split("$$;")[0]);
  const savedEstimateSql = await readFile(new URL("../migrations/0737_real_fc_revealed_estimate.sql", import.meta.url), "utf8");
  batchBodies.unshift({ name: "read_final_check_reveal", args: "t uuid, j uuid, d text", body: savedEstimateSql.split("AS $$")[1]!.split("$$;")[0]! });
  // ENT-5 changes only these exact routine bodies; preserve every predecessor check.
  const clientAuthority = await readFile(new URL("../migrations/0642_extra_client_send_authority.sql", import.meta.url), "utf8");
  const clientAttribution = await readFile(new URL("../migrations/0644_extra_customer_approval.sql", import.meta.url), "utf8");
  const practiceProof = await readFile(new URL("../migrations/0736_proof_keeps_finished.sql", import.meta.url), "utf8");
  const replacements = (source: string) => [...source.matchAll(/changed:=replace\((?:original|changed),'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/g)]
    .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")] as const);
  const authorityChanges = replacements(clientAuthority), attributionChanges = replacements(clientAttribution);
  expect(authorityChanges).toHaveLength(3); expect(attributionChanges).toHaveLength(1);
  const practiceProofChanges = replacements(practiceProof);
  expect(practiceProofChanges).toHaveLength(2);
  const clientBodyChanges = new Map([
    ["app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamp with time zone, p_authorization uuid, p_outbox uuid)", authorityChanges.slice(0, 2)],
    ["app.northside_capture_action()", attributionChanges],
    ["app.ch4_capture_site_source()", practiceProofChanges],
  ]);
  // ENT-5 changes only these exact predecessor routines; all other definitions stay pinned.
  const routineKey = (identity: string) => identity.replace(/,\s*/gu, ",");
  const ent5Bodies = new Map<string, string>();
  const ent5Replacements = [
    ["app.current_firm_profile_key()", "0757_practice_firm_name.sql"],
    ["app.job_saved_firm_name(j uuid)", "0757_practice_firm_name.sql"],
    ["app.lp4_seal_audit(p_events jsonb,p_trust text)", "0758_lp6e_audit_attribution.sql"],
    ["app.lp5_check_command_completion()", "0758_lp6e_audit_attribution.sql"],
    ["app.validate_job_proof_receipt(t uuid,cid uuid)", "0758_lp6e_audit_attribution.sql"],
    ["app.retire_replaced_job_proof_findings(j uuid,c uuid)", "0758_lp6e_audit_attribution.sql"],
    ["app.retired_job_proof_findings(j uuid)", "0758_lp6e_audit_attribution.sql"],
    // Linked-practice successors retain metadata and replace these seven bodies.
    ["app.issue_practice_session(digest text)", "0741_identity_linked_practice.sql"],
    ["app.start_blank_practice_company(digest text,previous_digest text)", "0741_identity_linked_practice.sql"],
    ["app.start_blank_practice_company_v2(new_token text,previous_token text)", "0741_identity_linked_practice.sql"],
    ["app.seed_saved_v1_sample()", "0741_identity_linked_practice.sql"],
    ["app.authenticate_practice_session(digest text,requested_tenant uuid)", "0741_identity_linked_practice.sql"],
    ["app.lp6_session_authority(p_kind text,p_credential text,p_tenant uuid)", "0749_lp6d_remaining_routines.sql"],
    ["app.is_blank_practice_company(digest text)", "0741_identity_linked_practice.sql"],
    ["identity.provision_verified_challenge(challenge_id uuid)", "0703_invitation_issuer_recheck.sql"],
    ["app.xa_approve(p_job uuid,p_request uuid,p_command uuid,p_actor uuid,p_step integer,p_hash text,p_net bigint,p_reject boolean,p_reason text)", "0635_extra_same_step.sql"],
    ["app.xa_approve(p_job uuid,p_request uuid,p_command uuid,p_actor uuid,p_step integer,p_hash text,p_net bigint,p_reject boolean,p_reason text)", "0728_extra_reject_null_step.sql"],
    ["app.xa_withdraw(p_job uuid,p_variation uuid,p_command uuid,p_actor uuid,p_reason text)", "0636_extra_withdraw_roles.sql"],
    ["app.xa_requirement(p_rules jsonb,p_net bigint)", "0637_extra_working_day_wait.sql"],
    ["app.xa_escalate()", "0637_extra_working_day_wait.sql"],
    ["app.xa_queue(p_member uuid)", "0759_extra_queue_approver_eligibility.sql"],
    ["app.valid_approval_rules(d jsonb)", "0638_extra_rule_wait_schema.sql"],
    ["app.xa_client_view_authority(p_job uuid,p_request uuid,p_actor uuid,p_email text)", "0686_extra_client_authority_loss.sql"],
    ["app.xa_client_decide(p_job uuid,p_request uuid,p_command uuid,p_actor uuid,p_token_hash text,p_email text,p_hash text,p_net bigint,p_reject boolean,p_reason text,p_role_name text,p_tester text)", "0686_extra_client_authority_loss.sql"],
    ["identity.extra_customer_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text)", "0686_extra_client_authority_loss.sql"],
    ["app.lp5b_contractor_permission(p_type text,p_actor uuid,p_job uuid,p_input jsonb)", "0636_extra_withdraw_roles.sql"],
  ] as const;
  for (const [identity, file] of ent5Replacements) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    const replacement = [...sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(([^)]*)\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/gu)]
      .find(match => routineKey(`${match[1]}(${match[2]!.replace(/ DEFAULT [^,]+/gu, "")})`) === identity);
    expect(replacement, identity).toBeDefined();
    ent5Bodies.set(identity, replacement![3]!);
  }
  // 0622 changes exactly the effective-state read and retains the latest mark writer.
  const relink = await readFile(new URL("../migrations/0622_extra_duplicate_relink.sql", import.meta.url), "utf8");
  const relinkBodies = Object.fromEntries(["xa_latest_kind", "xa_mark_duplicate"].map(name => [name,
    relink.split(`CREATE OR REPLACE FUNCTION app.${name}`)[1]!.split("AS $$")[1]!.split("$$;")[0]]));
  const finishSql = await readFile(new URL("../migrations/0620_contractor_job_finish.sql", import.meta.url), "utf8");
  const finishRoutineBodies = new Map([
    ["lp_command|p_session uuid, p_input jsonb, p_source_bytes bytea", "lp_command"],
    ["lp_read|p_session uuid, p_input jsonb", "lp_read"],
    ["lp_finish|p_session uuid, p_command uuid, p_result jsonb", "lp_finish"],
    ["lp_require_audit|", "lp_require_audit"],
    ["lp_receipt_immutable|", "lp_receipt_immutable"],
  ].map(([identity, name]) => [identity, finishSql.split(`CREATE OR REPLACE FUNCTION app.${name}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]]));
  // LP-6d (0740) re-creates only the routines it names; each body must be exactly a 0740 body for that name.
  // Owners, ACLs and other metadata stay checked by the 0740 migration proof.
  const lp6dBodies = new Map<string, string[]>();
  for (const m of (await readFile(new URL("../migrations/0749_lp6d_remaining_routines.sql", import.meta.url), "utf8"))
    .matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)) {
    lp6dBodies.set(m[1]!, [...(lp6dBodies.get(m[1]!) ?? []), m[4]!]);
  }
  // LATER-SAFETY-183 is xa_price's sole successor; retain the full LP-6d binding prefix.
  const pricePermissionSql = await readFile(new URL("../migrations/0752_extra_price_permission_order.sql", import.meta.url), "utf8");
  lp6dBodies.set("app.xa_price", [pricePermissionSql.split("AS $$")[1]!.split("$$;")[0]!]);
  // LATER-SAFETY-189: pin the complete own-extra writer without changing owner/ACL checks.
  const proceedRaiserSql = await readFile(new URL("../migrations/0760_extra_proceed_raiser_authority.sql", import.meta.url), "utf8");
  lp6dBodies.set("app.xa_proceed", [proceedRaiserSql.split("AS $$")[1]!.split("$$;")[0]!]);
  // 0762 is the complete Northside registration successor; retain every header and privilege comparison below.
  const northsideSql = await readFile(new URL("../migrations/0762_northside_hosted_agreement.sql", import.meta.url), "utf8");
  lp6dBodies.set("app.northside_register", [northsideSql.split("FUNCTION app.northside_register(")[1]!.split("AS $$")[1]!.split("$$;")[0]!]);
  // LP-6d LP-10 hold: only the final appended sink-trigger successor is live.
  lp6dBodies.set("app.guard_recovery_message_sink", [lp6dBodies.get("app.guard_recovery_message_sink")!.at(-1)!]);
  // LP6D-WORKER-PRESENCE: exact latest sources; historical 0749 assertions remain above.
  const presenceSql = await readFile(new URL("../migrations/0753_lp6d_worker_binding_presence.sql", import.meta.url), "utf8");
  for (const m of presenceSql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis))
    lp6dBodies.set(m[1]!, [m[4]!]);
  const billingProof = loadMigrationProofs().proofs.find(proof => proof.migration === "0766_lp8a_billing_revokes.sql")!;
  const advanceDelta = billingProof.upgrade.find(change => change.section === "routines" && change.before?.nspname === "app" && change.before.proname === "advance_final_account_draft");
  if (advanceDelta?.section !== "routines" || !advanceDelta.before || !advanceDelta.after) throw new Error("Missing LP-8a draft routine proof");
  const advanceSql = await readFile(new URL(`../migrations/${billingProof.migration}`, import.meta.url), "utf8");
  const advanceBody = advanceSql.split("CREATE OR REPLACE FUNCTION app.advance_final_account_draft(")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
  const outboxProof = loadMigrationProofs().proofs.find(proof => proof.migration === "0767_lp8b_outbox_evidence.sql")!;
  const residentDelta = outboxProof.upgrade.find(change => change.section === "routines" &&
    change.before?.nspname === "app" && change.before.proname === "ent3d_record_resident_confirmation");
  if (residentDelta?.section !== "routines" || !residentDelta.before || !residentDelta.after) throw new Error("Missing LP-8b resident confirmation proof");
  const residentSql = await readFile(new URL(`../migrations/${outboxProof.migration}`, import.meta.url), "utf8");
  const residentBody = residentSql.split("CREATE OR REPLACE FUNCTION app.ent3d_record_resident_confirmation(")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
  const searchPath = (config: string[] | null) => {
    const value = config?.find(setting => setting.startsWith("search_path="));
    if (!value) throw new Error("Missing LP-8a search path in proof");
    return "SET search_path TO " + value.slice("search_path=".length).split(", ").map(schema => `'${schema}'`).join(", ");
  };
  for (const match of lp11Sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+\$\$(.*?)\$\$;/gsu))
    lp6dBodies.set(match[1]!, [match[3]!]);
  const pilotInvitationsSql = await readFile(new URL("../migrations/0772_pilot_identity_invitations.sql", import.meta.url), "utf8");
  const pilotInviteBody = pilotInvitationsSql.split("CREATE OR REPLACE FUNCTION identity.invite_member(")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
  const pilotPortalSql = await readFile(new URL("../migrations/0775_pilot_customer_portal.sql", import.meta.url), "utf8");
  const pilotPortalRoutines = new Set([
    "app.customer_portal_current(g app.customer_portal_grant)",
    "app.customer_portal_issuer(t uuid, digest text)",
    "app.job_source_insert_guard()",
    "identity.customer_portal_issue(t uuid, builder_digest text, j uuid, c uuid, link_digest text, content text)",
    "identity.customer_portal_use(t uuid, j uuid, c uuid, digest text, session_digest text, operation text)",
    "identity.customer_portal_quote(t uuid, j uuid, c uuid, digest text, cmd jsonb)",
  ]);
  const pilotFinalCheckSql = await readFile(new URL("../migrations/0777_pilot_final_check.sql", import.meta.url), "utf8");
  const pilotRevealSql = await readFile(new URL("../migrations/0779_pilot_final_check_reveal.sql", import.meta.url), "utf8");
  const receiptDedupSql = await readFile(new URL("../migrations/0783_receipt_duplicate_command.sql", import.meta.url), "utf8");
  const priceRulesV2GuardBody = (await readFile(new URL("../migrations/0784_extra_price_rules_v2.sql", import.meta.url), "utf8"))
    .split("CREATE OR REPLACE FUNCTION app.ent3c_pricing_basis_guard(")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
  const receiptDedupBody = receiptDedupSql.split("CREATE OR REPLACE FUNCTION app.record_practice_customer_receipt(")[1]!
    .split("AS $$")[1]!.split("$$;")[0]!;
  const pilotRevealRoutines = new Set([
    "app.read_final_check_reveal(t uuid, j uuid, d text)",
    "app.read_final_check_disputes(t uuid, j uuid, d text)",
    "app.record_final_check_disposition(t uuid, j uuid, d text, p jsonb)",
    "app.confirm_final_check_catch(t uuid, j uuid, d text, p jsonb)",
  ]);
  const pilotFinalCheckRoutines = new Set([
    "app.lp11_bind_shadow_job(t uuid, j uuid)",
    "app.final_check_require_worker(p_tenant uuid, p_job uuid)",
    "app.final_check_worker(t uuid, j uuid)",
  ]);
  for (const prior of security) {
    const current = live.find(row => row.oid === prior.oid);
    if (prior.nspname === advanceDelta.before.nspname && prior.proname === advanceDelta.before.proname && prior.args === advanceDelta.before.args) {
      const before = searchPath(advanceDelta.before.proconfig);
      const after = searchPath(advanceDelta.after.proconfig);
      expect(prior.definition).toContain(before);
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => advanceBody).replace(before, after));
      expect(current?.source).toBe(advanceBody);
      continue;
    }
    if (prior.nspname === residentDelta.before.nspname && prior.proname === residentDelta.before.proname && prior.args === residentDelta.before.args) {
      expect(prior.prosecdef).toBe(residentDelta.before.prosecdef);
      expect(current?.prosecdef).toBe(residentDelta.after.prosecdef);
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => residentBody)
        .replace(" LANGUAGE plpgsql\n", " LANGUAGE plpgsql\n SECURITY DEFINER\n"));
      expect(current?.source).toBe(residentBody);
      continue;
    }
    if (prior.nspname === "app" && prior.proname === "guard_final_lock_disclosure_terms" && prior.args === "") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => pilotDisclosureBody));
      expect(current?.source).toBe(pilotDisclosureBody);
      continue;
    }
    // 0772 replaces this exact invitation body without changing its definition header or privileges.
    if (prior.nspname === "identity" && prior.proname === "invite_member" &&
      prior.args === "session_digest character, t uuid, recipient character varying, assigned_role character varying") {
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => pilotInviteBody));
      expect(current?.source).toBe(pilotInviteBody);
      continue;
    }
    // 0775 replaces these exact bodies; the catalogue proof below still checks all routine privileges.
    const identity = `${prior.nspname}.${prior.proname}(${prior.args})`;
    // EP-CC-S1 (0784) replaces only the ENT-3c pricing-basis guard body; the catalogue proof below still checks its privileges.
    if (identity === "app.ent3c_pricing_basis_guard()") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => priceRulesV2GuardBody));
      expect(current?.source).toBe(priceRulesV2GuardBody);
      continue;
    }
    if (identity === "app.record_practice_customer_receipt(p_tenant uuid, p_job uuid, p_invoice uuid, p_actor uuid, p_command uuid, p_paid_on date, p_amount bigint, p_method text, p_reference text)") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => receiptDedupBody));
      expect(current?.source).toBe(receiptDedupBody);
      continue;
    }
    if (pilotFinalCheckRoutines.has(identity) || pilotRevealRoutines.has(identity)) {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const source = pilotRevealRoutines.has(identity) ? pilotRevealSql : pilotFinalCheckSql;
      const body = source.split(`CREATE OR REPLACE FUNCTION ${prior.nspname}.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]!;
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => body));
      expect(current?.source).toBe(body);
      continue;
    }
    if (pilotPortalRoutines.has(identity)) {
      const expected = identity === "identity.customer_portal_use(t uuid, j uuid, c uuid, digest text, session_digest text, operation text)"
        ? { ...prior, proacl: "{jobguard_migration=X/jobguard_migration,jobguard_identity=X/jobguard_migration,jobguard_binding_owner=X/jobguard_migration}" }
        : prior;
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(expected);
      const body = pilotPortalSql.split(`CREATE OR REPLACE FUNCTION ${prior.nspname}.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]!;
      expect(current?.definition).toBe(prior.definition!.replace(prior.source, () => body));
      expect(current?.source).toBe(body);
      continue;
    }
    // QW-1 (0781) replaces only the customer_variation body; keep its metadata exact and pin the full 0781 body.
    if (prior.nspname === "identity" && prior.proname === "customer_variation" && prior.args === "t uuid, j uuid, c uuid, digest text, command jsonb") {
      const body = variationPhotoSql.split("FUNCTION identity.customer_variation(")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      expect(current?.definition?.split("$function$")[1]).toBe(body);
      expect(current?.source).toBe(body);
      continue;
    }
    // 0751 succeeds LP-6d for this exact dispatcher; pin it before generic LP-6d successor handling.
    if (prior.nspname === "app" && prior.proname === "accounting_export" &&
      prior.args === "t uuid, digest text, operation text, source text, v jsonb") {
      const sql = await readFile(new URL("../migrations/0751_accounting_export_attempt_reconciliation.sql", import.meta.url), "utf8");
      const body = sql.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toBe(body);
      expect(current?.source).toBe(body);
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      expect(current?.definition).not.toEqual(prior.definition);
      continue;
    }
    if (prior.definition !== null && current?.source !== prior.source && lp6dBodies.get(`${prior.nspname}.${prior.proname}`)?.includes(current?.source)) {
      const definition = prior.definition.replace(prior.source, () => current!.source);
      if (prior.nspname === "app" && prior.proname === "contractor_practice_session_require_audit" && prior.args === "") {
        // 0765 verifies the exact revocation witness through the protected
        // policy and clears the permit as the existing migration owner.
        expect(current!.definition).toBe(definition.replace(
          " LANGUAGE plpgsql\n SET search_path", " LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path",
        ));
      } else {
        // Contractor session's checked bridge may change LANGUAGE from SQL to PL/pgSQL.
        const header = (source: string) => source.replace(/^ LANGUAGE \w+$/mu, " LANGUAGE <checked>");
        expect(header(current!.definition)).toEqual(header(definition));
      }
      continue;
    }
    // 0733 remains the exact body for the practice-only link issuer.
    if (prior.nspname === "app" && prior.proname === "demo_issue_customer_link" &&
      prior.args === "t uuid, j uuid, c uuid, session_digest text, link_digest text, content text") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0733_real_customer_link_own_quote.sql", import.meta.url), "utf8");
      const body = sql.split(`FUNCTION ${prior.nspname}.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toBe(body);
      expect(current?.source).toBe(body);
      continue;
    }
    // 0667 inserts only the practice-owner guard into lock_final_account and replaces the invoice actor check's end.
    if (prior.nspname === "app" && prior.proname === "lock_final_account" && prior.args === "p_tenant uuid, p_job uuid, p_actor uuid, p_command uuid, p_revision uuid, p_expected integer, p_declaration text") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const owner = await readFile(new URL("../migrations/0667_final_check_practice_owner_check.sql", import.meta.url), "utf8");
      const anchor = "BEGIN\n PERFORM app.final_lock_require_owner(p_tenant,p_actor);";
      expect(prior.definition?.split(anchor)).toHaveLength(2);
      // 0735 then re-creates the full latest body. The INSTALLED definition must equal the
      // predecessor definition with exactly that body, and 0667's guard must stay verbatim in
      // the installed source, right after the first owner check and 0735's scope refusal.
      const perFirm = await readFile(new URL("../migrations/0735_per_firm_final_check_terms.sql", import.meta.url), "utf8");
      const body = perFirm.split("CREATE OR REPLACE FUNCTION app.lock_final_account(")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
      const parts = prior.definition!.split("$function$"); parts[1] = body;
      const expectedDefinition = parts.join("$function$");
      expect(current?.definition).toBe(expectedDefinition);
      expect(current?.source).toBe(expectedDefinition.split("$function$")[1]);
      const installed = current!.source!, guard = owner.split("$guard$")[1]!;
      expect(installed.split(anchor)).toHaveLength(2);
      const afterOwner = installed.split(anchor)[1]!, scopeEnd = afterOwner.indexOf("END IF;") + "END IF;".length;
      expect(afterOwner.slice(0, scopeEnd)).toContain("app.final_check_bound_practice(p_tenant,app.final_check_job_scope(p_tenant,p_job))");
      expect(afterOwner.slice(scopeEnd).startsWith("\n" + guard)).toBe(true);
      expect(installed.split(guard)).toHaveLength(2);
      continue;
    }
    if (prior.nspname === "app" && prior.proname === "final_check_require_invoice_actor" && prior.args === "p_tenant uuid, p_job uuid, p_actor uuid") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const owner = await readFile(new URL("../migrations/0723_lp6c_money_binding.sql", import.meta.url), "utf8");
      const body=owner.split("FUNCTION app.final_check_require_invoice_actor(")[1]!.split("AS $$")[1]!.split(/\$\$\s*;/u)[0];
      expect(current?.definition?.split("$function$")[1]).toBe(body);
      expect(current?.source).toBe(body);
      continue;
    }
    // 0699 adds the bound-request check to 0679's sync checkpoint writer; keep its metadata exact.
    if (prior.nspname === "app" && prior.proname === "sync_snapshot_generation" && prior.args === "u uuid, r bigint, s bigint, h text, e text") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0699_sync_checkpoint_bound_reader.sql", import.meta.url), "utf8");
      const body = sql.split("FUNCTION app.sync_snapshot_generation(")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toBe(body);
      expect(current?.source).toBe(body);
      continue;
    }
    // 0695 and 0696 change only the contractor admin body; keep its metadata exact and bind the final body to 0845.
    if (prior.nspname === "app" && prior.proname === "contractor_admin_command" && prior.args === "actor uuid, payload jsonb, request_hash text") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0696_contractor_admin_expected_revision.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toBe(sql.split("FUNCTION app.contractor_admin_command(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
      expect(current?.source).toBe(sql.split("FUNCTION app.contractor_admin_command(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
      continue;
    }
    const batchReplacement = batchBodies.findLast(row => prior.nspname === "app" && prior.proname === row.name && prior.args === row.args);
    if (batchReplacement) {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      expect(current?.definition?.split("$function$")[1]).toEqual(batchReplacement.body);
      expect(current?.source).toBe(batchReplacement.body);
      continue;
    }
    // 0632 changes only these exact shadow routines; MIGFIX-7's upgrade test binds their full bodies and unchanged ACLs.
    if (prior.nspname === "app" && (
      (prior.proname === "record_shadow_disclosure" && prior.args === "p_tenant uuid, p_job uuid, p_signal uuid, p_event uuid, p_route text")
    )) {
      const own = await readFile(new URL("../migrations/0632_shadow_group_disclosure.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toBe(own.split(`FUNCTION app.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]);
      continue;
    }
    // 0566, 0573 and 0606 extend exactly this dispatcher for managed recovery, supervisor queries and dark orders.
    if (prior.nspname === "app" && prior.proname === "lp5_command_result" && prior.args === "p_command_id uuid, p_outcome jsonb") continue;
    // 0631 replaces the legacy v1 landing bodies; 0654 extends only the reversal replay/policy checks; 0682 binds replays to the stored payload.
    if (prior.nspname === "app" && (
      (prior.proname === "approve_synthetic_landing" && prior.args === "p jsonb") ||
      (prior.proname === "reverse_synthetic_landing" && prior.args === "p_tenant uuid, p_reversal uuid, p_derivation uuid, p_journal uuid, p_allocation uuid, p_amount bigint, p_reason character varying"))) {
      const migration = prior.proname === "reverse_synthetic_landing" ? "0682_synthetic_reversal_replay_match.sql" : "0631_legacy_recovery_money_integrity.sql";
      const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
      const body = sql.split(`CREATE OR REPLACE FUNCTION app.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else
    // 0808 changes only this exact authority body, preserving all routine metadata and grants.
    if (prior.nspname === "app" && prior.proname === "lp_authority" && prior.args === "p_session uuid, p_job uuid, p_action text") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0712_end_check_rule_a_rerun.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toEqual(sql.split("AS $$")[1]!.split("$$;")[0]);
      expect(current?.source).toBe(sql.split("AS $$")[1]!.split("$$;")[0]);
    } else
    // 0620 extends only these exact live-prompt bodies; preserve their full replacements.
    if (prior.nspname === "app" && finishRoutineBodies.has(`${prior.proname}|${prior.args}`)) {
      expect(current?.definition?.split("$function$")[1]).toEqual(finishRoutineBodies.get(`${prior.proname}|${prior.args}`));
    } else
    // 0615 extends the exact success-fee writer from 0583; retain its full latest body.
    if (prior.nspname === "app" && prior.proname === "write_success_fee_v3" &&
      prior.args === "p_job uuid, p_session text, p_command jsonb, p_artifact jsonb") {
      const sql = await readFile(new URL("../migrations/0615_success_fee_changed_proof.sql", import.meta.url), "utf8");
      const body = sql.split("CREATE OR REPLACE FUNCTION app.write_success_fee_v3")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "payment_fee_current" &&
      prior.args === "t uuid, j uuid, s uuid, actor uuid") {
      const sql = await readFile(new URL("../migrations/0616_payment_fee_current_review.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toEqual(sql.split("AS $$")[1]!.split("$$;")[0]);
      expect(current?.source).toBe(sql.split("AS $$")[1]!.split("$$;")[0]);
    } else if (prior.nspname === "app" && prior.proname === "adopt_invoiced_job_v3" &&
      prior.args === "t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text") {
      const migration = await readFile(new URL("../migrations/0625_company_import_once.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.adopt_invoiced_job_v3")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "dunning_workbench" &&
      prior.args === "t uuid, digest text, j uuid, operation text, v jsonb") {
      const migration = await readFile(new URL("../migrations/0628_dunning_owner_approval.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.dunning_workbench")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && (
      prior.proname === "xa_latest_kind" && prior.args === "p_tenant uuid, p_job uuid, p_variation uuid" ||
      prior.proname === "xa_mark_duplicate" && prior.args === "p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid")) {
      expect(current?.definition?.split("$function$")[1]).toEqual(relinkBodies[prior.proname]);
    } else if (prior.nspname === "app" && prior.proname === "configure_recovery_demo" &&
      prior.args === "p_job uuid, p_command uuid, p_scenario character varying") {
      const source = await readFile(new URL("../migrations/0670_recovery_demo_replay_job.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.configure_recovery_demo")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "ent4b_fact_guard" && prior.args === "") {
      // 0673 adds only the unlink receipt binding; pin its complete reviewed body.
      const source = await readFile(new URL("../migrations/0673_duplicate_unlink_command_binding.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.ent4b_fact_guard()")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "work_order_commit" && prior.args === "actor uuid, payload jsonb") {
      // 0675 and 0676 change only the work-order commit body; bind the final body to 0676.
      const source = await readFile(new URL("../migrations/0676_work_order_expected_revision.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.work_order_commit(")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "cb_unresolved" && prior.args === "p_tenant uuid, p_job uuid") {
      const source = await readFile(new URL("../migrations/0623_extra_duplicate_disposition.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "mon2_issue" &&
      prior.args === "t uuid, digest text, start_day date, revision integer") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const migration = await readFile(new URL("../migrations/0714_subscription_period_open_refusal.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.mon2_issue")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.oid === paymentFeeWriterOid) {
      expect(current?.definition?.split("$function$")[1]).toEqual(paymentFeeWriterBody);
    } else if (prior.oid === settlementOid) {
      expect(prior.definition).toContain(selfComparison);
      const predecessor = prior.definition.replace(selfComparison, "payload");
      const replacement = lp6cReplacements.get(prior.oid);
      expect(replacement).toBeDefined();
      expect(current?.definition).toEqual(predecessor.replace(prior.source.replace(selfComparison, "payload"), () => replacement!));
      expect(current?.source).toBe(replacement);
    } else if (clientBodyChanges.has(`${prior.nspname}.${prior.proname}(${prior.args})`)) {
      let expected = prior.definition!;
      const body = ent5Bodies.get(routineKey(`${prior.nspname}.${prior.proname}(${prior.args})`));
      if (body !== undefined) {
        const parts = expected.split("$function$"); parts[1] = body; expected = parts.join("$function$");
      }
      for (const [before, after] of clientBodyChanges.get(`${prior.nspname}.${prior.proname}(${prior.args})`)!) {
        expect(expected).toContain(before);
        expected = expected.replaceAll(before, after);
      }
      expect(current?.definition).toEqual(expected);
    } else if (prior.nspname === "app" && prior.proname === "mon3_activate" && prior.args === "t uuid, digest text, command_id uuid, v jsonb") {
      expect({ ...current, definition: prior.definition, source: prior.source }).toEqual(prior);
      const migration = await readFile(new URL("../migrations/0715_second_job_card_gate_filters.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.mon3_activate")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
      expect(current?.source).toBe(body);
    } else if (prior.nspname === "app" && prior.proname === "guard_recovery_message_sink" && prior.args === "") {
      const migration = await readFile(new URL("../migrations/0749_lp6d_remaining_routines.sql", import.meta.url), "utf8");
      const lp6dBody = migration.split("CREATE OR REPLACE FUNCTION app.guard_recovery_message_sink()").at(-1)!.split("AS $$")[1]!.split("$$;")[0]!;
      expect(lp6dBody).toContain("FOR SHARE OF mem,o)");
      const body = lp6dBody.replace("FOR SHARE OF mem,o)", "FOR SHARE OF mem)");
      expect(current?.definition).toEqual(prior.definition?.replace(prior.source, () => body));
      expect(current?.source).toEqual(body);
    } else if (ent5Bodies.has(routineKey(`${prior.nspname}.${prior.proname}(${prior.args})`))) {
      expect(current?.definition?.split("$function$")[1]).toEqual(ent5Bodies.get(routineKey(`${prior.nspname}.${prior.proname}(${prior.args})`)));
    } else if (prior.nspname === "app" && billingBodies.has(`${prior.proname}|${prior.args}`)) {
      expect(current?.definition?.split("$function$")[1]).toEqual(billingBodies.get(`${prior.proname}|${prior.args}`));
    } else if (lp6cReplacements.has(prior.oid)) {
      const replacement = lp6cReplacements.get(prior.oid)!;
      expect(current?.definition).toEqual(prior.definition === null ? null : prior.definition.replace(prior.source, () => replacement));
      expect(current?.source).toBe(replacement);
    } else {
      expect(current?.definition).toEqual(prior.definition);
    }
  }
  const privileges = (rows: typeof security) => rows.map(({ oid: _oid, definition: _definition, source: _source, ...row }) => row)
    .sort((a,b) => a.nspname.localeCompare(b.nspname) || a.proname.localeCompare(b.proname) || a.args.localeCompare(b.args));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const successors = loadMigrationProofs().proofs.filter(proof => proof.migration > "0556_mon8_job_track_and_trial.sql")
    .map(proof => ({ ...proof, upgrade: proof.upgrade.filter(change => change.section === "routines") }));
  // The historical fixture staged 0562 early. Strictly undo only that reviewed
  // fixture metadata, then replay EVERY successor below; no proof is skipped.
  // The inverse checks exact reviewed after-values before restoring before-values.
  const foundation = successors.find(proof => proof.migration === "0562_lp6a_request_binding.sql");
  expect(foundation).toBeDefined();
  expect(foundation!.upgrade).toHaveLength(6);
  expect(foundation!.upgrade.map(change => {
    if (change.section !== "routines" || change.after === null) throw new Error("Unexpected 0562 routine normalization record");
    return change.after.nspname + "." + change.after.proname + "(" + change.after.args + ")";
  }).sort()).toEqual([
    "app.bind_request(p_kind text, p_credential text, p_tenant uuid)",
    "app.current_actor()",
    "app.current_tenant()",
    "app.lp6_bound_request()",
    "app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)",
    "identity.sso_session_memberships(u uuid, s uuid)",
  ].sort());
  const inverseFoundation = { ...foundation!, lp0: [], tenancy: [],
    upgrade: [...foundation!.upgrade].reverse().map(change => ({ ...change, before: change.after, after: change.before })) };
  const stagedBaseline = { rows: {}, routines: privileges(security), relations: [], policies: [] };
  // A changed security attribute in ANY staged routine must fail before normalization.
  for (const change of foundation!.upgrade) {
    if (change.section !== "routines" || change.after === null) throw new Error("Unexpected 0562 routine normalization record");
    const identity = change.after;
    const matches = (row: typeof stagedBaseline.routines[number]) => row.nspname === identity.nspname &&
      row.proname === identity.proname && row.args === identity.args;
    expect(stagedBaseline.routines.filter(matches)).toHaveLength(1);
    const tampered = { ...stagedBaseline, routines: stagedBaseline.routines.map(row =>
      matches(row) ? { ...row, prosecdef: !row.prosecdef } : row) };
    expect(() => applyUpgradeProofs(tampered, [inverseFoundation], ownerOids)).toThrow("before allowance mismatch");
  }
  const logicalPreFoundation = applyUpgradeProofs(stagedBaseline, [inverseFoundation], ownerOids);
  const expected = applyUpgradeProofs(logicalPreFoundation, successors, ownerOids);
  expect(privileges(live)).toEqual(privileges(expected.routines.filter(row => row.nspname !== "infrastructure") as typeof security));
}, 120000);
