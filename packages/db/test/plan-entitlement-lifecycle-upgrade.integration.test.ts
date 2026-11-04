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
// LP-6c and LP-6d body-changing successor exceptions use only these exact overloads.
// All other predecessor bodies remain byte-for-byte protected below.
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
const lp6cBodies = [...readFileSync(new URL("../migrations/0570_lp6c_money_binding.sql", import.meta.url), "utf8")
  .matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)];
const lp6dSignatures = [
  "app.transition_scope_progress(uuid,uuid,uuid,integer,character varying,character varying)",
  "app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid)",
  "app.require_current_job_parties(uuid,uuid)",
  "app.require_watchdog_live(uuid)",
  "app.link_contractor_customer(uuid,uuid,jsonb)",
  "app.bind_contractor_parties(uuid,jsonb)",
  "app.read_contractor_resident(uuid,uuid)",
  "app.work_order_begin(uuid,uuid,text)",
  "app.work_order_commit(uuid,jsonb)",
  "app.import_batch_record(uuid,jsonb)",
  "app.import_sor_version(uuid,jsonb)",
  "app.work_order_parties_unchanged(uuid,uuid,uuid,uuid,uuid,jsonb)",
  "app.reveal_shadow_signals(uuid,uuid)",
  "app.read_final_account_lock_verification(uuid,uuid)",
  "app.prepare_final_review_extra(uuid,uuid,uuid)",
  "app.accept_final_check_terms(uuid,uuid,uuid,text)",
  "app.record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text)",
  "app.ent3b_start_visit(uuid,uuid,uuid)",
  "app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text)",
  "app.ent3c_record_sor_revision(uuid,uuid,text,text)",
  "app.xa_submit(uuid,uuid,uuid,uuid)",
  "app.xa_price(uuid,uuid,uuid,uuid,bigint,boolean)",
  "app.xa_approve(uuid,uuid,uuid,uuid,integer,text,bigint,boolean,text)",
  "app.xa_withdraw(uuid,uuid,uuid,uuid,text)",
  "app.xa_mark_duplicate(uuid,uuid,uuid,uuid,uuid,uuid)",
  "app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,uuid)",
  "app.xa_revoke_link(uuid,uuid,uuid,uuid)",
  "app.xa_client_decide(uuid,uuid,uuid,uuid,text,text,text,bigint,boolean,text,text,text)",
  "app.xa_client_view_authority(uuid,uuid,uuid,text)",
  "app.read_job_sources(uuid,uuid,text,text)",
  "app.lp_authority(uuid,uuid,text)",
  "app.lp_read(uuid,jsonb)",
  "app.lp_command(uuid,jsonb,bytea)",
  "app.lp_finish(uuid,uuid,jsonb)",
  "app.lp_visit_evaluate(uuid,uuid,uuid)",
  "app.lp_sources(uuid,uuid)",
  "app.lp_observation_prompt(uuid,uuid,uuid)",
  "app.ch4_read_work_facts(uuid,uuid,text)",
  "app.ch4_command_work_facts(uuid,uuid,text)",
  "app.ch4_work_state_command(uuid,uuid,text,jsonb)",
  "app.ch4_record_work_state(uuid,uuid,text,jsonb)",
  "app.ch4_link_post_lock_job(uuid,uuid,text,jsonb)",
  "app.read_final_check_reveal(uuid,uuid,text)",
  "app.record_final_check_disposition(uuid,uuid,text,jsonb)",
  "app.read_final_check_disputes(uuid,uuid,text)",
  "app.confirm_final_check_catch(uuid,uuid,text,jsonb)",
  "app.request_final_check_run(uuid,uuid,text)",
  "app.sv7a_require_watchdog_live_lock(uuid,uuid,text)",
  "app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb)",
  "app.read_evidence_pack_v3(uuid,uuid,text)",
  "app.request_evidence_pack_v3(uuid,uuid,text,jsonb)",
  "app.create_practice_sandbox_job(uuid,uuid,uuid,text)",
  "app.decision_check_command(text,jsonb,text,jsonb)",
  "app.contractor_admin_command(uuid,jsonb,text)",
  "app.enterprise_baseline_actor(uuid)",
  "app.enterprise_baseline_import(uuid,text,text,jsonb)",
  "app.enterprise_baseline_read(uuid,uuid)",
  "app.record_repository_command(uuid)",
  "app.lp5b_prepare_projection(uuid)",
  "app.lp5b_contractor_permission(text,uuid,uuid,jsonb)",
  "app.practice_worker_switch_on(uuid,uuid,uuid)",
  "app.practice_worker_switch_off(uuid,uuid)",
  "app.practice_worker_switch_state(uuid)",
  "app.revoke_contractor_practice_session(uuid)",
  "app.northside_register(uuid,jsonb)",
  "app.xa_escalate()",
  "app.ent3b_visit_authority(uuid,uuid)",
  "app.ent3a_extra_authority(uuid,text,uuid)",
  "app.ent3a_require_extra_authority(uuid,uuid)",
  "app.xa_begin(uuid,uuid,text[],uuid)",
  "app.xa_covers(uuid,text[],uuid,text)",
  "app.evidence_pack_v3_owner(uuid,uuid,text)",
  "app.ch4_require_command_owner(uuid,uuid,text)",
  "app.demo_request_source_hold(uuid,uuid,text)",
  "app.demo_source_hold_state(uuid,uuid,text)",
  "app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text)",
  "app.demo_shadow_review_inputs(uuid,uuid,text)",
  "app.ch6_integrity_sources(uuid,uuid,text)",
  "app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)",
  "app.ch6_integrity_authority(uuid,uuid,text)",
  "app.ch6_integrity_published(uuid,uuid,text)",
  "app.ch6_integrity_source_fingerprint(uuid,uuid,text,jsonb)",
  "app.ch5_import_actor(uuid,text)",
  "app.ch5_history_actor(uuid,uuid,text)",
  "app.ch5_write_history(uuid,uuid,text,uuid,uuid,uuid)",
  "app.ch5_imported_catch(uuid,uuid,text,uuid,uuid,uuid)",
  "app.import_late_source(uuid,uuid,text,jsonb)",
  "app.accounting_export(uuid,text,text,text,jsonb)",
  "app.mon8_retained_baseline_actor(uuid)",
  "app.sync_snapshot_generation(uuid,bigint,bigint,text,text)",
  "app.lp6d_contractor_session_identity(uuid)",
  "app.lp6_session_authority(text,text,uuid)",
  "app.contractor_session(uuid)",
  "identity.invite_member(character,uuid,character varying,character varying)",
  "app.revoke_recovery_message_authorization(uuid,uuid,uuid,uuid)"
] as const;
const lp6dBodies = [...readFileSync(new URL("../migrations/0780_lp6d_remaining_routines.sql", import.meta.url), "utf8")
  .matchAll(/CREATE (?:OR REPLACE )?FUNCTION ((?:app|identity)\.\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)];
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration("0556_mon8_job_track_and_trial.sql");
  const f = c as unknown as WorkFixture, trial = await firstTrialFixture(f), paid = await meterCompany(f);
  await command(f, paid, terms(paid)); await retainedExport(f, trial);
  const before = await snapshot(c.admin);
  const catalogue = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_function_arguments(p.oid) args,p.prosrc source,
    CASE WHEN p.oid<>'app.mon8_company_feature(text,text,uuid)'::regprocedure THEN pg_get_functiondef(p.oid) END definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
  const security = await catalogue();
  expect(await service(f, trial).check(request("final_check", trial.jobId))).toMatchObject({ executable: false });
  await applyMigration(c, "0556_mon8_job_track_and_trial.sql");
  expect(await snapshot(c.admin)).toEqual(before); expect(await catalogue()).toEqual(security);
  expect(await service(f, trial).require(request("final_check", trial.jobId))).toMatchObject({ executable: true });
  expect(await service(f, paid).require(request("invoices", paid.jobId))).toMatchObject({ executable: true });
  await migrate(c.admin); await migrate(c.admin);
  expect(await snapshot(c.admin)).toEqual({ ...before, ...laterEmptyTables });
  // Successor migrations have their own exact reviewed routine ACL additions.
  // Keep the 0556-only assertion above, and retain every predecessor definition.
  const live = await catalogue();
  expect(lp6cBodies).toHaveLength(lp6cSignatures.length);
  const replacements = new Map<number, string>();
  for (const [index, signature] of lp6cSignatures.entries()) {
    // Resolve only this named signature, never a name-only/wildcard allowance.
    const oid = (await c.admin.query("SELECT $1::regprocedure::oid oid", [signature])).rows[0].oid;
    const body = lp6cBodies[index]!;
    expect(signature.split("(")[0]).toBe(`app.${body[1]}`);
    replacements.set(oid, body[4]!);
  }
  expect(lp6dBodies).toHaveLength(lp6dSignatures.length);
  for (const [index, signature] of lp6dSignatures.entries()) {
    const oid = (await c.admin.query("SELECT $1::regprocedure::oid oid", [signature])).rows[0].oid;
    const body = lp6dBodies[index]!;
    expect(signature.split("(")[0]).toBe(body[1]);
    replacements.set(oid, body[4]!);
  }
  for (const prior of security) {
    const current = live.find(row => row.oid === prior.oid);
    const replacement = replacements.get(prior.oid);
    const expected = replacement === undefined || prior.definition === null
      ? prior.definition : prior.definition.replace(prior.source, replacement);
    expect(current?.definition, `${prior.nspname}.${prior.proname}(${prior.args})`).toEqual(expected);
    if (replacement !== undefined) expect(current?.source).toBe(replacement);
  }
  const privileges = (rows: typeof security) => rows.map(({ oid: _oid, definition: _definition, source: _source, ...row }) => row)
    .sort((a,b) => a.nspname.localeCompare(b.nspname) || a.proname.localeCompare(b.proname) || a.args.localeCompare(b.args));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const successors = loadMigrationProofs().proofs.filter(proof => proof.migration > "0556_mon8_job_track_and_trial.sql")
    .map(proof => ({ ...proof, upgrade: proof.upgrade.filter(change => change.section === "routines") }));
  const expected = applyUpgradeProofs({ rows: {}, routines: privileges(security), relations: [], policies: [] }, successors, ownerOids);
  expect(privileges(live)).toEqual(privileges(expected.routines as typeof security));
}, 120000);
