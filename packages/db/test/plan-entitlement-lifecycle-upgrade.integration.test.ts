import { readFile } from "node:fs/promises";
import { currentCommandRegistryRows } from "./lp5-command-catalog.js";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { meterCompany, command, terms } from "./subscription-persistence-fixtures.js";
import { service, request, retainedExport } from "./plan-entitlement-lifecycle-fixtures.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { migrate } from "../src/index.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration("0556_mon8_job_track_and_trial.sql");
  const f = c as unknown as WorkFixture, trial = await firstTrialFixture(f), paid = await meterCompany(f);
  await command(f, paid, terms(paid)); await retainedExport(f, trial);
  const before = await snapshot(c.admin);
  const catalogue = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) args,
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
  // 0692 adds one owner-only helper; pin its complete body as well as successor metadata.
  const receiptGate = await readFile(new URL("../migrations/0692_final_check_post_invoice_receipt_gate.sql", import.meta.url), "utf8");
  const receiptHelpers = live.filter(row => row.nspname === "app" && row.proname === "require_receipt_final_check"
    && row.args === "p_tenant uuid, p_job uuid");
  expect(receiptHelpers).toHaveLength(1);
  expect(receiptHelpers[0]?.definition?.split("$function$")[1]).toEqual(
    receiptGate.split("FUNCTION app.require_receipt_final_check(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
  // 0655 replaces only the emergency capability body; pin the complete reviewed replacement.
  const emergency = await readFile(new URL("../migrations/0655_emergency_token_minted.sql", import.meta.url), "utf8");
  const emergencyBody = emergency.split("FUNCTION identity.dark_emergency(")[1]!.split("AS $$")[1]!.split("$$;")[0];
  const emergencyRoutines = live.filter(row => row.nspname === "identity" && row.proname === "dark_emergency"
    && row.args === "s text, csrf text, t uuid, p jsonb");
  expect(emergencyRoutines).toHaveLength(1);
  expect(emergencyRoutines[0]?.definition?.split("$function$")[1]).toEqual(emergencyBody);
  // 0709 replaces only this exact overload on 0656's body; pin its entire body, including all predecessor guards.
  const feeResult = await readFile(new URL("../migrations/0708_fee_result_json_errors.sql", import.meta.url), "utf8");
  const feeResultBody = feeResult.split("CREATE OR REPLACE FUNCTION app.replace_fee_reservation_book")[1]!.split("AS $$")[1]!.split("$$;")[0];
  expect(live.filter(row => row.nspname === "app" && row.proname === "replace_fee_reservation_book"
    && row.args === "p_tenant uuid, p_book jsonb, p_result jsonb")).toHaveLength(1);
  expect(live.find(row => row.nspname === "app" && row.proname === "replace_fee_reservation_book"
    && row.args === "p_tenant uuid, p_book jsonb, p_result jsonb")?.definition?.split("$function$")[1]).toEqual(feeResultBody);
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
  // Ben's router ruling: the 0584 effective-session successor was renumbered to 0658 by stem only.
  // Only this exact routine may take its reviewed successor body; its complete definition header stays exact.
  const effectiveSessionOid = (await c.admin.query("SELECT 'app.lp6_session_authority(text,text,uuid)'::regprocedure::oid oid")).rows[0].oid;
  const effectiveSessionMigration = await readFile(new URL("../migrations/0658_lp6b_effective_session_actor.sql", import.meta.url), "utf8");
  const effectiveSessionBody = effectiveSessionMigration.split("AS $$")[1]!.split("$$;")[0];
  // 0567 changes only the checked settlement overload's expected approval hash.
  const settlementOid = (await c.admin.query("SELECT 'app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone,uuid,uuid,uuid)'::regprocedure::oid oid")).rows[0].oid;
  const selfComparison = "(SELECT content_hash FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization)";
  // This batch replaces only these exact routine identities; compare their complete bodies.
  const batchBodies = await Promise.all([
    ["ef_prepare_statement", "p_session uuid, p_command uuid, p_period text", "0704_enterprise_fee_period_order.sql"],
    ["ef_post_statement", "p_session uuid, p_command uuid, p_statement uuid, p_authorization uuid", "0704_enterprise_fee_period_order.sql"],
    ["receipt_fact_invoice_line", "t uuid, j uuid, i uuid, l uuid, r uuid, k uuid, ch uuid", "0713_supplementary_after_combined_receipt.sql"],
    ["issue_practice_customer_invoice", "p_tenant uuid, p_job uuid, p_final_revision uuid, p_actor uuid, p_command uuid, p_recipient text, p_issued_on date", "0716_invoice_line_vat_signed_split.sql"],
    ["issue_practice_customer_credit_note", "p_tenant uuid, p_job uuid, p_invoice uuid, p_actor uuid, p_command uuid, p_net_pence bigint, p_reason text, p_preview_hash text", "0717_credit_request_digest_fields.sql"],
    ["receipt_fact_proposal", "t uuid, j uuid, p jsonb", "0692_final_check_post_invoice_receipt_gate.sql"],
    ["read_final_check_manifest", "t uuid, j uuid, m uuid", "0698_final_check_post_invoice_rerun.sql"],
    ["evidence_pack_v3_material", "t uuid, c uuid, ordinary_only boolean", "0698_final_check_post_invoice_rerun.sql"],
    ["begin_final_check", "t uuid, j uuid, detector text, policy text", "0698_final_check_post_invoice_rerun.sql"],
    ["complete_final_check", "t uuid, j uuid, m uuid, p jsonb", "0698_final_check_post_invoice_rerun.sql"],
    ["guard_final_check_manifest", "", "0698_final_check_post_invoice_rerun.sql"],
    ["read_final_check_reveal", "t uuid, j uuid, d text", "0698_final_check_post_invoice_rerun.sql"],
    ["read_value_job", "j uuid, digest text", "0698_final_check_post_invoice_rerun.sql"],
    ["request_final_check_run", "t uuid, j uuid, d text", "0698_final_check_post_invoice_rerun.sql"],
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
    ["final_check_builder", "t uuid, j uuid, d text, locking boolean", "0690_import_ancestry_record_anchor.sql"],
    ["evidence_pack_v3_owner", "t uuid, c uuid, d text", "0690_import_ancestry_record_anchor.sql"],
    ["adopt_invoiced_job_v3", "t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text", "0690_import_ancestry_record_anchor.sql"],
    ["apply_recovery_timeline_signal", "p_tenant uuid, p_signal jsonb", "0690_import_ancestry_record_anchor.sql"],
    ["guard_watchdog_upload_update", "", "0720_verified_upload_immutable.sql"],
  ].map(async ([name, args, migration]) => {
    const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    if (name === "decision_check_command") expect(sql).toContain("rv.result->>'sourceJobId'=source.id::text");
    return { name, args, body: sql.split(`CREATE OR REPLACE FUNCTION app.${name}`)[1]!.split("AS $$")[1]!.split("$$;")[0] };
  }));
  // ENT-5 changes only these exact routine bodies; preserve every predecessor check.
  const clientAuthority = await readFile(new URL("../migrations/0642_extra_client_send_authority.sql", import.meta.url), "utf8");
  const clientAttribution = await readFile(new URL("../migrations/0644_extra_customer_approval.sql", import.meta.url), "utf8");
  const replacements = (source: string) => [...source.matchAll(/changed:=replace\((?:original|changed),'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/g)]
    .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")] as const);
  const authorityChanges = replacements(clientAuthority), attributionChanges = replacements(clientAttribution);
  expect(authorityChanges).toHaveLength(3); expect(attributionChanges).toHaveLength(1);
  const clientBodyChanges = new Map([
    ["app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamp with time zone, p_authorization uuid, p_outbox uuid)", authorityChanges.slice(0, 2)],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", authorityChanges.slice(2)],
    ["app.northside_capture_action()", attributionChanges],
  ]);
  // ENT-5 changes only these exact predecessor routines; all other definitions stay pinned.
  const routineKey = (identity: string) => identity.replace(/,\s*/gu, ",");
  const ent5Bodies = new Map<string, string>();
  const ent5Replacements = [
    ["identity.provision_verified_challenge(challenge_id uuid)", "0703_invitation_issuer_recheck.sql"],
    ["app.xa_approve(p_job uuid,p_request uuid,p_command uuid,p_actor uuid,p_step integer,p_hash text,p_net bigint,p_reject boolean,p_reason text)", "0635_extra_same_step.sql"],
    ["app.xa_withdraw(p_job uuid,p_variation uuid,p_command uuid,p_actor uuid,p_reason text)", "0636_extra_withdraw_roles.sql"],
    ["app.lp5b_contractor_permission(p_type text,p_actor uuid,p_job uuid,p_input jsonb)", "0636_extra_withdraw_roles.sql"],
    ["app.xa_requirement(p_rules jsonb,p_net bigint)", "0637_extra_working_day_wait.sql"],
    ["app.xa_escalate()", "0637_extra_working_day_wait.sql"],
    ["app.xa_queue(p_member uuid)", "0637_extra_working_day_wait.sql"],
    ["app.valid_approval_rules(d jsonb)", "0638_extra_rule_wait_schema.sql"],
    ["app.xa_client_view_authority(p_job uuid,p_request uuid,p_actor uuid,p_email text)", "0686_extra_client_authority_loss.sql"],
    ["app.xa_client_decide(p_job uuid,p_request uuid,p_command uuid,p_actor uuid,p_token_hash text,p_email text,p_hash text,p_net bigint,p_reject boolean,p_reason text,p_role_name text,p_tester text)", "0686_extra_client_authority_loss.sql"],
    ["identity.extra_customer_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text)", "0686_extra_client_authority_loss.sql"],
  ] as const;
  for (const [identity, file] of ent5Replacements) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    const replacement = [...sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(([^)]*)\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/gu)]
      .find(match => routineKey(`${match[1]}(${match[2]})`) === identity);
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
  for (const prior of security) {
    const current = live.find(row => row.oid === prior.oid);
    // 0650 changes only the demo issuer body; keep its metadata and every other definition pinned.
    if (prior.nspname === "app" && prior.proname === "demo_issue_customer_link" &&
      prior.args === "t uuid, j uuid, c uuid, session_digest text, link_digest text, content text") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0650_demo_customer_link_reference.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toBe(sql.split("FUNCTION app.demo_issue_customer_link(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
      continue;
    }
    // 0667 inserts only the practice-owner guard into lock_final_account and replaces the invoice actor check's end.
    if (prior.nspname === "app" && prior.proname === "lock_final_account" && prior.args === "p_tenant uuid, p_job uuid, p_actor uuid, p_command uuid, p_revision uuid, p_expected integer, p_declaration text") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const owner = await readFile(new URL("../migrations/0667_final_check_practice_owner_check.sql", import.meta.url), "utf8");
      const anchor = "BEGIN\n PERFORM app.final_lock_require_owner(p_tenant,p_actor);";
      expect(prior.definition?.split(anchor)).toHaveLength(2);
      expect(current?.definition).toBe(prior.definition?.replace(anchor, anchor + "\n" + owner.split("$guard$")[1]!));
      continue;
    }
    if (prior.nspname === "app" && prior.proname === "final_check_require_invoice_actor" && prior.args === "p_tenant uuid, p_job uuid, p_actor uuid") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const owner = await readFile(new URL("../migrations/0667_final_check_practice_owner_check.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toBe(owner.split("FUNCTION app.final_check_require_invoice_actor(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
      continue;
    }
    // 0699 adds the bound-request check to 0679's sync checkpoint writer; keep its metadata exact.
    if (prior.nspname === "app" && prior.proname === "sync_snapshot_generation" && prior.args === "u uuid, r bigint, s bigint, h text, e text") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0699_sync_checkpoint_bound_reader.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toBe(sql.split("FUNCTION app.sync_snapshot_generation(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
      continue;
    }
    // 0695 and 0696 change only the contractor admin body; keep its metadata exact and bind the final body to 0845.
    if (prior.nspname === "app" && prior.proname === "contractor_admin_command" && prior.args === "actor uuid, payload jsonb, request_hash text") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0696_contractor_admin_expected_revision.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toBe(sql.split("FUNCTION app.contractor_admin_command(")[1]!.split("AS $$")[1]!.split("$$;")[0]);
      continue;
    }
    const batchReplacement = batchBodies.find(row => prior.nspname === "app" && prior.proname === row.name && prior.args === row.args);
    if (batchReplacement) {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      expect(current?.definition?.split("$function$")[1]).toEqual(batchReplacement.body);
      continue;
    }
    // 0632 changes only these exact shadow routines; MIGFIX-7's upgrade test binds their full bodies and unchanged ACLs.
    if (prior.nspname === "app" && (
      (prior.proname === "record_shadow_disclosure" && prior.args === "p_tenant uuid, p_job uuid, p_signal uuid, p_event uuid, p_route text") ||
      (prior.proname === "surface_shadow_signal_early" && prior.args === "p_tenant uuid, p_job uuid, p_signal uuid, p_firing uuid, p_decision uuid, p_disclosure uuid, p_rule text, p_version text, p_source uuid, p_object_version text, p_facts jsonb")
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
    } else
    // 0599_accounting_export_route_change changes only this checked synthetic dispatcher; dedicated route upgrade tests bind the body.
    if (prior.nspname === "app" && prior.proname === "accounting_export" &&
      prior.args === "t uuid, digest text, operation text, source text, v jsonb") {
      expect(current?.definition).not.toEqual(prior.definition);
    } else
    // 0808 changes only this exact authority body, preserving all routine metadata and grants.
    if (prior.nspname === "app" && prior.proname === "lp_authority" && prior.args === "p_session uuid, p_job uuid, p_action text") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const sql = await readFile(new URL("../migrations/0712_end_check_rule_a_rerun.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toEqual(sql.split("AS $$")[1]!.split("$$;")[0]);
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
    } else if (prior.nspname === "app" && prior.proname === "payment_fee_current" &&
      prior.args === "t uuid, j uuid, s uuid, actor uuid") {
      const sql = await readFile(new URL("../migrations/0616_payment_fee_current_review.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toEqual(sql.split("AS $$")[1]!.split("$$;")[0]);
    } else if (prior.oid === effectiveSessionOid) {
      const predecessorParts = prior.definition.split("$function$");
      expect(predecessorParts).toHaveLength(3);
      expect(current?.definition).toEqual(`${predecessorParts[0]}$function$${effectiveSessionBody}$function$${predecessorParts[2]}`);
    } else if (prior.nspname === "app" && prior.proname === "adopt_invoiced_job_v3" &&
      prior.args === "t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text") {
      const migration = await readFile(new URL("../migrations/0625_company_import_once.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.adopt_invoiced_job_v3")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "dunning_workbench" &&
      prior.args === "t uuid, digest text, j uuid, operation text, v jsonb") {
      const migration = await readFile(new URL("../migrations/0628_dunning_owner_approval.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.dunning_workbench")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && (
      prior.proname === "xa_latest_kind" && prior.args === "p_tenant uuid, p_job uuid, p_variation uuid" ||
      prior.proname === "xa_mark_duplicate" && prior.args === "p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid")) {
      expect(current?.definition?.split("$function$")[1]).toEqual(relinkBodies[prior.proname]);
    } else if (prior.nspname === "app" && prior.proname === "configure_recovery_demo" &&
      prior.args === "p_job uuid, p_command uuid, p_scenario character varying") {
      const source = await readFile(new URL("../migrations/0670_recovery_demo_replay_job.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.configure_recovery_demo")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "ent4b_fact_guard" && prior.args === "") {
      // 0673 adds only the unlink receipt binding; pin its complete reviewed body.
      const source = await readFile(new URL("../migrations/0673_duplicate_unlink_command_binding.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.ent4b_fact_guard()")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "work_order_commit" && prior.args === "actor uuid, payload jsonb") {
      // 0675 and 0676 change only the work-order commit body; bind the final body to 0676.
      const source = await readFile(new URL("../migrations/0676_work_order_expected_revision.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.work_order_commit(")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "cb_unresolved" && prior.args === "p_tenant uuid, p_job uuid") {
      const source = await readFile(new URL("../migrations/0623_extra_duplicate_disposition.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "mon2_issue" &&
      prior.args === "t uuid, digest text, start_day date, revision integer") {
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const migration = await readFile(new URL("../migrations/0714_subscription_period_open_refusal.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.mon2_issue")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.oid === paymentFeeWriterOid) {
      expect(current?.definition?.split("$function$")[1]).toEqual(paymentFeeWriterBody);
    } else if (prior.oid === settlementOid) {
      expect(prior.definition).toContain(selfComparison);
      expect(current?.definition).toEqual(prior.definition.replace(selfComparison, "payload"));
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
      expect({ ...current, definition: prior.definition }).toEqual(prior);
      const migration = await readFile(new URL("../migrations/0715_second_job_card_gate_filters.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.mon3_activate")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (ent5Bodies.has(routineKey(`${prior.nspname}.${prior.proname}(${prior.args})`))) {
      expect(current?.definition?.split("$function$")[1]).toEqual(ent5Bodies.get(routineKey(`${prior.nspname}.${prior.proname}(${prior.args})`)));
    } else {
      expect(current?.definition).toEqual(prior.definition);
    }
  }
  const privileges = (rows: typeof security) => rows.map(({ oid: _oid, definition: _definition, ...row }) => row)
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
  expect(privileges(live)).toEqual(privileges(expected.routines as typeof security));
}, 120000);
