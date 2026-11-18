import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-entitlement-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";
import { snapshot } from "./contractor-entitlement-fixtures.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { currentCommandRegistryRows } from "./lp5-command-catalog.js";
import { migrate } from "../src/migrate.js";

const own = "0632_shadow_group_disclosure.sql";
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("MIGFIX-7 preserves populated rows, types and privileges; changes only the two named routines and adds an ungranted trigger", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration(own);
  const tenant = randomUUID(), job = randomUUID(), survivor = randomUUID(), duplicate = randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional MIGFIX-7 upgrade','live')", [job, tenant]);
  for (const id of [survivor, duplicate]) await c.admin.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band)
    VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:m7',clock_timestamp(),'Fictional upgrade signal','low')`, [tenant, job, id]);
  await c.admin.query("UPDATE app.shadow_commercial_signal SET coalesced_into_signal_id=$2 WHERE id=$1", [duplicate, survivor]);
  const tables = ["app.job", "app.shadow_commercial_signal", "app.shadow_disclosure_event", "app.shadow_signal_ineligibility", "app.audit_event"];
  const rows = await proofBefore(c.admin, tables);
  expect(Object.keys(rows["app.shadow_commercial_signal"]!.rows)).toHaveLength(2);
  const catalog = async () => (await c!.admin.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
  const routines = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control','worm_control') AND p.prokind='f' ORDER BY 1,2,3`)).rows;
  const policies = async () => (await c!.admin.query("SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows;
  const beforeCatalog = await catalog(), beforeRoutines = await routines(), beforePolicies = await policies();
  await applyMigration(c, own);
  expect(await proofDifferences(c.admin, rows)).toEqual({ rows: [], types: [] });
  expect(await catalog()).toEqual(beforeCatalog);
  const afterRoutines = await routines();
  const sql = await readFile(new URL(`../migrations/${own}`, import.meta.url), "utf8");
  for (const prior of beforeRoutines) {
    const now = afterRoutines.find(r => r.nspname === prior.nspname && r.proname === prior.proname && r.args === prior.args);
    if (prior.nspname === "app" && ["record_shadow_disclosure", "surface_shadow_signal_early"].includes(prior.proname)) {
      expect({ ...now, definition: prior.definition }).toEqual(prior);
      expect(now.definition.split("$function$")[1]).toBe(sql.split(`FUNCTION app.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]);
      expect(now.definition).not.toBe(prior.definition);
    } else expect(now).toEqual(prior);
  }
  expect(afterRoutines.length - beforeRoutines.length).toBe(1);
  const added = afterRoutines.find(r => r.proname === "propagate_shadow_group_disclosure");
  expect(added).toMatchObject({ proacl: "{jobguard_migration=X/jobguard_migration}", prosecdef: true, proconfig: ["search_path=pg_catalog, app"] });
  expect((await c.admin.query("SELECT to_regprocedure('app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)') routine")).rows[0].routine).toBeNull();
  const beforeReplay = await snapshot(c.admin);
  await migrate(c.admin); await migrate(c.admin);
  const registry = (await c.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify(currentCommandRegistryRows)])).rows[0].data;
  expect(await snapshot(c.admin)).toEqual({ ...laterEmptyTables, ...beforeReplay, "app.command_type_registry": registry });
  expect(await proofDifferences(c.admin, rows)).toEqual({ rows: [], types: [] });
  // Successors add only their reviewed metadata; every replaced and added body is pinned below.
  const successors = loadMigrationProofs().proofs.filter(p => p.migration > own)
    .map(p => ({ ...p, upgrade: p.upgrade.filter(change => change.section !== "rows") }));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const metadata = (entries: typeof afterRoutines) => entries.map(({ definition: _definition, ...row }) => row);
  const relationMetadata = (entries: typeof beforeCatalog) => entries.map(({ policies: _policies, ...row }) => row);
  const expected = applyUpgradeProofs({ rows: {}, routines: metadata(afterRoutines), relations: relationMetadata(beforeCatalog), policies: beforePolicies }, successors, ownerOids);
  const replayRoutines = await routines(), installedCatalog = await catalog();
  expect(metadata(replayRoutines)).toEqual(expected.routines.filter(row => row.nspname !== "infrastructure"));
  expect(relationMetadata(installedCatalog)).toEqual(expected.relations);
  expect(await policies()).toEqual(expected.policies);
  // Exact predicates and ACLs are checked above. In the raw OID comparison,
  // reverse only the 0762 changes and retain every other predecessor field.
  const lp11 = successors.find(proof => proof.migration === "0762_lp11_bound_tenant_rls.sql")!;
  const lp11Policies = lp11.upgrade.filter(change => change.section === "policies");
  const lp11Relations = lp11.upgrade.filter(change => change.section === "relations");
  const replayCatalog = installedCatalog.map(relation => {
    const predecessor = beforeCatalog.find(row => row.nspname === relation.nspname && row.relname === relation.relname);
    if (!predecessor) return relation;
    const policyChanges = lp11Policies.filter(change => change.after?.schemaname === relation.nspname && change.after.tablename === relation.relname);
    const policies = relation.policies?.flatMap((policy: { polname: string; polqual: string | null; polwithcheck: string | null }) => {
      const change = policyChanges.find(entry => entry.after?.policyname === policy.polname);
      if (!change) return [policy];
      if (!change.before) return [];
      const rawPrior = predecessor.policies?.find((entry: { polname: string }) => entry.polname === policy.polname);
      if (!rawPrior) return [policy];
      return [{ ...policy, polqual: rawPrior.polqual, polwithcheck: rawPrior.polwithcheck }];
    }) ?? null;
    const aclChange = lp11Relations.find(change => change.before?.nspname === relation.nspname && change.before.relname === relation.relname);
    return {
      ...relation,
      relacl: aclChange?.before?.relacl ?? relation.relacl,
      policies: policies?.length ? policies : null,
    };
  });
  // Preserve all raw predecessor catalogue fields, including policy identities.
  for (const row of beforeCatalog) {
    if (row.nspname === "app" && ["customer_portal_session", "customer_portal_grant", "extra_client_session", "extra_client_link"].includes(row.relname)) {
      // 0724 adds exactly the private owner's SELECT and one tenant-scoped read policy.
      // Complete ACL/policy metadata is checked against its exact proof above;
      // retain every raw predecessor policy object, owner and RLS flag here.
      const current = replayCatalog.find(r => r.nspname === row.nspname && r.relname === row.relname)!;
      expect({ ...current, relacl: row.relacl, policies: row.policies }).toEqual(row);
      expect(current.policies).toHaveLength((row.policies?.length ?? 0) + 1);
      for (const policy of row.policies ?? []) expect(current.policies).toContainEqual(policy);
      expect(current.policies.some((policy: { polname: string }) => policy.polname === (row.relname.startsWith("extra_") ? "lp6_client_binding_read" : "lp6_customer_binding_read"))).toBe(true);
    } else if (row.nspname === 'app' && row.relname === 'action_attempt') {
      expect(replayCatalog).toContainEqual({...row,relacl:row.relacl.replace('jobguard_runtime=ar/','jobguard_runtime=r/')});
    } else if (row.nspname === "app" && row.relname === "sandbox_run_event") {
      const current = replayCatalog.find(r => r.nspname === row.nspname && r.relname === row.relname)!;
      expect({ ...current, policies: row.policies }).toEqual(row);
      expect(current.policies).toHaveLength((row.policies?.length ?? 0) + 1);
      for (const policy of row.policies ?? []) expect(current.policies).toContainEqual(policy);
      expect(current.policies.filter((policy: { polname: string; polcmd: string }) =>
        policy.polname === "worker_recovery_archived_run" && policy.polcmd === "r")).toHaveLength(1);
    } else if (row.nspname === "app" && row.relname === "final_check_terms_acceptance") {
      // 0735 adds exactly one restrictive per-firm read policy; its metadata is in the 0735 proof above.
      const current = replayCatalog.find(r => r.nspname === row.nspname && r.relname === row.relname)!;
      expect({ ...current, policies: row.policies }).toEqual(row);
      expect(current.policies).toHaveLength((row.policies?.length ?? 0) + 1);
      for (const policy of row.policies ?? []) expect(current.policies).toContainEqual(policy);
      expect(current.policies.filter((policy: { polname: string; polpermissive: boolean }) => policy.polname === "firm_read" && !policy.polpermissive)).toHaveLength(1);
    } else if(row.nspname==='app' && row.relname==='final_check_manifest_tenant_id_job_id_lock_id_key') {
      // 0698 replaces only this index's lock identity with lock+attempt; its relation metadata is in the proof.
      expect(replayCatalog.some(r=>r.nspname===row.nspname && r.relname===row.relname)).toBe(false);
    } else if (row.nspname==='app' && row.relname==='extra_duplicate_disposition') {
      // 0729 adds only command_writer SELECT and lp5b_command_read; both are pinned by its proof via expected.relations/policies above.
      const now = replayCatalog.find(r => r.nspname===row.nspname && r.relname===row.relname)!;
      expect({ ...now, relacl: row.relacl, policies: row.policies }).toEqual(row);
    } else if (row.nspname==='app' && row.relname==='synthetic_evidence_original') {
      // 0734 adds only its flag-gated, tenant-scoped job_proof_source_read owner policy,
      // pinned by its proof via expected.policies above; every predecessor policy remains.
      const now = replayCatalog.find(r => r.nspname===row.nspname && r.relname===row.relname)!;
      expect({ ...now, policies: row.policies }).toEqual(row);
      expect(now.policies).toHaveLength((row.policies?.length ?? 0) + 1);
      for (const policy of row.policies ?? []) expect(now.policies).toContainEqual(policy);
      expect(now.policies.some((policy: { polname: string }) => policy.polname === "job_proof_source_read")).toBe(true);
    } else expect(replayCatalog).toContainEqual(row);
  }
  const authority = await readFile(new URL("../migrations/0642_extra_client_send_authority.sql", import.meta.url), "utf8");
  const attribution = await readFile(new URL("../migrations/0644_extra_customer_approval.sql", import.meta.url), "utf8");
  const practiceProof = await readFile(new URL("../migrations/0736_proof_keeps_finished.sql", import.meta.url), "utf8");
  const replacements = (source: string) => [...source.matchAll(/changed:=replace\((?:original|changed),'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/g)]
    .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")] as const);
  const authorityChanges = replacements(authority), attributionChanges = replacements(attribution);
  expect(authorityChanges).toHaveLength(3); expect(attributionChanges).toHaveLength(1);
  const practiceProofChanges = replacements(practiceProof);
  expect(practiceProofChanges).toHaveLength(2);
  const practiceOwner = await readFile(new URL("../migrations/0667_final_check_practice_owner_check.sql", import.meta.url), "utf8");
  const lockAnchor = "BEGIN\n PERFORM app.final_lock_require_owner(p_tenant,p_actor);", lockGuard = "\n" + practiceOwner.split("$guard$")[1]!;
  // 0735's full lock_final_account body (pinned exactly below) keeps 0667's guard verbatim in the
  // INSTALLED source, right after the first owner check and 0735's own scope refusal.
  const installedLock = replayRoutines.filter(r => r.nspname === "app" && r.proname === "lock_final_account");
  expect(installedLock).toHaveLength(1);
  const lockSource = installedLock[0]!.definition.split("$function$")[1] as string;
  expect(lockSource.split(lockAnchor)).toHaveLength(2);
  const afterOwner = lockSource.split(lockAnchor)[1]!, scopeEnd = afterOwner.indexOf("END IF;") + "END IF;".length;
  expect(afterOwner.slice(0, scopeEnd)).toContain("app.final_check_bound_practice(p_tenant,app.final_check_job_scope(p_tenant,p_job))");
  expect(afterOwner.slice(scopeEnd).startsWith(lockGuard)).toBe(true);
  const patches = new Map([
    ["app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamp with time zone, p_authorization uuid, p_outbox uuid)", authorityChanges.slice(0, 2)],
    ["app.northside_capture_action()", attributionChanges],
    // 0667's practice-owner guard is retained inside 0735's full latest lock_final_account body (pinned below).
    ["app.ch4_capture_site_source()", practiceProofChanges],
  ]);
  // Exact existing replacements only; all their privileges and unrelated definitions remain frozen.
  const fullBodies = new Map<string, string>();
  for (const [identity, migration, overload = 0] of [
    ["app.lp4_seal_audit(p_events jsonb, p_trust text)", "0758_lp6e_audit_attribution.sql"],
    ["app.lp5_check_command_completion()", "0758_lp6e_audit_attribution.sql"],
    ["app.validate_job_proof_receipt(t uuid, cid uuid)", "0758_lp6e_audit_attribution.sql"],
    ["app.retire_replaced_job_proof_findings(j uuid, c uuid)", "0758_lp6e_audit_attribution.sql"],
    ["app.retired_job_proof_findings(j uuid)", "0758_lp6e_audit_attribution.sql"],
    // LP-6d LP-10 sink hold: the latest body is the 4th "FUNCTION app.guard_recovery_message_sink(" in 0749 (after the earlier CREATE, ALTER and REVOKE).
    ["app.guard_recovery_message_sink()", "0749_lp6d_remaining_routines.sql", 3],
    // 0741 recreates these exact bodies; never pin their pre-linked predecessors.
    ["app.issue_practice_session(digest text)", "0741_identity_linked_practice.sql"],
    ["app.start_blank_practice_company(digest text, previous_digest text)", "0741_identity_linked_practice.sql"],
    ["app.start_blank_practice_company_v2(new_token text, previous_token text)", "0741_identity_linked_practice.sql"],
    ["app.seed_saved_v1_sample()", "0741_identity_linked_practice.sql"],
    ["app.authenticate_practice_session(digest text, requested_tenant uuid)", "0741_identity_linked_practice.sql"],
    ["app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)", "0749_lp6d_remaining_routines.sql"],
    ["app.is_blank_practice_company(digest text)", "0741_identity_linked_practice.sql"],
    ["app.company_final_check_request_run(j uuid)", "0732_final_check_typed_recovery.sql"],
    ["app.company_final_check_reveal(j uuid)", "0732_final_check_typed_recovery.sql"],
    ["app.cb_derive(p_session uuid, p_job uuid, p_command uuid, p_source text, p_invoice text, p_hash text, p_projection jsonb)", "0748_billing_policy_hold_projection.sql"],
    ["app.cb_delivery(p_session uuid, p_job uuid, p_command uuid, p_payload jsonb)", "0727_billing_export_delivery_once.sql"],
    ["app.cb_csv_cell(v text)", "0727_billing_export_delivery_once.sql"],
    ["identity.extra_customer_approval(t uuid, j uuid, c uuid, digest text, input jsonb)", "0725_lp6c_client_extra_decision.sql"],
    ["app.current_actor()", "0724_lp6c_customer_portal_delegation.sql"],
    ["app.current_tenant()", "0724_lp6c_customer_portal_delegation.sql"],
    ["identity.customer_portal_message(t uuid, j uuid, c uuid, digest text, input jsonb)", "0724_lp6c_customer_portal_delegation.sql"],
    ["app.lp5b_contractor_result(p_command uuid, p_outcome jsonb)", "0722_abandoned_visit_authority.sql"],
    ["app.ent3b_closeout_guard()", "0722_abandoned_visit_authority.sql"],
    ["app.ent3b_close_abandoned_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_reason text)", "0722_abandoned_visit_authority.sql"],
    ["app.receipt_fact_proposal(t uuid, j uuid, p jsonb)", "0747_receipt_proposal_historical_capacity.sql"],
    ["app.contractor_admin_command(actor uuid, payload jsonb, request_hash text)", "0696_contractor_admin_expected_revision.sql"],
    ["app.read_final_check_manifest(t uuid, j uuid, m uuid)", "0698_final_check_post_invoice_rerun.sql"],
    ["app.evidence_pack_v3_material(t uuid, c uuid, ordinary_only boolean)", "0698_final_check_post_invoice_rerun.sql"],
    ["app.begin_final_check(t uuid, j uuid, detector text, policy text)", "0698_final_check_post_invoice_rerun.sql"],
    ["app.complete_final_check(t uuid, j uuid, m uuid, p jsonb)", "0698_final_check_post_invoice_rerun.sql"],
    ["app.guard_final_check_manifest()", "0698_final_check_post_invoice_rerun.sql"],
    ["app.read_final_check_reveal(t uuid, j uuid, d text)", "0732_final_check_typed_recovery.sql"],
    ["app.read_value_job(j uuid, digest text)", "0698_final_check_post_invoice_rerun.sql"],
    ["app.request_final_check_run(t uuid, j uuid, d text)", "0732_final_check_typed_recovery.sql"],
    ["app.request_practice_final_check_on_lock()", "0698_final_check_post_invoice_rerun.sql"],
    ["app.verify_final_check_run(p_tenant uuid, p_job uuid, p_run uuid, p_lock uuid, p_cutoff timestamp with time zone)", "0698_final_check_post_invoice_rerun.sql"],
    ["app.lp5_command_result(p_command_id uuid, p_outcome jsonb)", "0729_duplicate_disposition_command_lifecycle.sql"],
    ["app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text)", "0728_extra_reject_null_step.sql"],
    ["app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text)", "0636_extra_withdraw_roles.sql"],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", "0722_abandoned_visit_authority.sql"],
    ["app.xa_requirement(p_rules jsonb, p_net bigint)", "0637_extra_working_day_wait.sql"],
    ["app.xa_escalate()", "0637_extra_working_day_wait.sql"],
    ["app.xa_queue(p_member uuid)", "0759_extra_queue_approver_eligibility.sql"],
    ["app.valid_approval_rules(d jsonb)", "0638_extra_rule_wait_schema.sql"],
    ["app.retention_records(t uuid, digest text, j uuid, cid uuid, v jsonb, expected text)", "0646_retention_timer_runtime_rules.sql"],
    ["app.notice_fixture_records(j uuid, n uuid, digest text, operation text, v jsonb)", "0647_notice_live_job_check.sql"],
    ["app.pay_now_fake_attempt(t uuid, digest text, j uuid, operation text, v jsonb)", "0648_pay_now_catch_statement.sql"],
    ["app.customer_portal_current(g app.customer_portal_grant)", "0733_real_customer_link_own_quote.sql"],
    ["app.demo_issue_customer_link(t uuid, j uuid, c uuid, session_digest text, link_digest text, content text)", "0733_real_customer_link_own_quote.sql"],
    ["identity.customer_portal_use(t uuid, j uuid, c uuid, digest text, session_digest text, operation text)", "0733_real_customer_link_own_quote.sql"],
    ["identity.customer_portal_quote(t uuid, j uuid, c uuid, digest text, cmd jsonb)", "0733_real_customer_link_own_quote.sql"],
    ["identity.customer_stages(t uuid, j uuid, c uuid, digest text, completion uuid, command uuid, expected_hash text)", "0762_lp11_bound_tenant_rls.sql"],
    ["identity.customer_variation(t uuid, j uuid, c uuid, digest text, command jsonb)", "0762_lp11_bound_tenant_rls.sql"],
    ["identity.dark_emergency(s text, csrf text, t uuid, p jsonb)", "0762_lp11_bound_tenant_rls.sql"],
    ["app.replace_fee_reservation_book(p_tenant uuid, p_book jsonb, p_result jsonb)", "0742_fee_webhook_receipt_binding.sql"],
    ["app.ch6_integrity_authority(t uuid, j uuid, digest text)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.ch6_integrity_sources(t uuid, j uuid, d text)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.ch6_record_integrity_review(t uuid, j uuid, digest text, review jsonb, source_snapshot jsonb)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.decision_check_command(p_digest text, p_command jsonb, p_phase text, p_data jsonb)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.interim_draft_records(t uuid, digest text, j uuid, operation text, v jsonb)", "0665_interim_read_authority.sql"],
    ["app.interim_draft_records(t uuid, digest text, j uuid, operation text, v jsonb)", "0721_interim_draft_rules.sql"],
    ["app.ch5_history_actor(t uuid, j uuid, d text)", "0668_import_company_owner_history.sql"],
    ["app.accounting_export(t uuid, digest text, operation text, source text, v jsonb)", "0751_accounting_export_attempt_reconciliation.sql"],
    ["app.configure_recovery_demo(p_job uuid, p_command uuid, p_scenario character varying)", "0670_recovery_demo_replay_job.sql"],
    ["app.ent4b_fact_guard()", "0673_duplicate_unlink_command_binding.sql"],
    ["app.work_order_commit(actor uuid, payload jsonb)", "0676_work_order_expected_revision.sql"],
    ["app.sync_snapshot_generation(u uuid, r bigint, s bigint, h text, e text)", "0699_sync_checkpoint_bound_reader.sql"],
    ["identity.provision_verified_challenge(challenge_id uuid)", "0703_invitation_issuer_recheck.sql"],
    ["app.ef_inputs(t uuid, ag app.enterprise_agreement_version, p_period text)", "0745_enterprise_fee_rejected_line.sql"],
    // 0756 retains LS-149 owner-before-replay and LS-162 pending-change refusal from 0755.
    ["app.mon2_command(t uuid, digest text, command_id uuid, v jsonb)", "0756_subscription_attempt_reconciliation.sql"],
    ["app.ef_prepare_statement(p_session uuid, p_command uuid, p_period text)", "0704_enterprise_fee_period_order.sql"],
    ["app.ef_post_statement(p_session uuid, p_command uuid, p_statement uuid, p_authorization uuid)", "0704_enterprise_fee_period_order.sql"],
    ["app.accounting_export_route_read(t uuid, digest text, source text)", "0709_accounting_export_route_read_exported.sql"],
    ["app.extra_duplicate_resolve(p_session uuid, p_job uuid, p_body jsonb)", "0729_duplicate_disposition_command_lifecycle.sql"],
    ["app.lp_authority(p_session uuid, p_job uuid, p_action text)", "0712_end_check_rule_a_rerun.sql"],
    ["app.receipt_fact_invoice_line(t uuid, j uuid, i uuid, l uuid, r uuid, k uuid, ch uuid)", "0713_supplementary_after_combined_receipt.sql"],
    ["app.mon2_issue(t uuid, digest text, start_day date, revision integer)", "0714_subscription_period_open_refusal.sql"],
    ["app.mon3_activate(t uuid, digest text, command_id uuid, v jsonb)", "0715_second_job_card_gate_filters.sql"],
    ["app.issue_practice_customer_credit_note(p_tenant uuid, p_job uuid, p_invoice uuid, p_actor uuid, p_command uuid, p_net_pence bigint, p_reason text, p_preview_hash text)", "0717_credit_request_digest_fields.sql"],
    ["infrastructure.discover_readiness_plans()", "0718_readiness_timezone_case.sql"],
    ["app.guard_watchdog_upload_update()", "0720_verified_upload_immutable.sql"],
    ["app.reverse_synthetic_landing(p_tenant uuid, p_reversal uuid, p_derivation uuid, p_journal uuid, p_allocation uuid, p_amount bigint, p_reason character varying)", "0682_synthetic_reversal_replay_match.sql"],
    ["app.final_check_require_invoice_actor(p_tenant uuid, p_job uuid, p_actor uuid)", "0723_lp6c_money_binding.sql"],
    ["app.assert_financial_authorization(t uuid, a uuid, p character varying, n bigint, c character, h character)", "0723_lp6c_money_binding.sql"],
    ["app.post_plan_obligation(j uuid, b uuid, r uuid, i uuid, n bigint, c character, s character varying, pk character varying, pr character varying, h character, a uuid, au uuid)", "0723_lp6c_money_binding.sql"],
    ["app.post_plan_settlement(j uuid, b uuid, o uuid, cl uuid, r uuid, n bigint, c character, s character varying, pr character varying, h character, a uuid, au uuid)", "0723_lp6c_money_binding.sql"],
    ["app.reverse_journal(j uuid, b uuid, o uuid, s character varying, pr character varying, h character, a uuid, au uuid)", "0723_lp6c_money_binding.sql"],
    ["app.record_builder_attested_acceptance(p_tenant uuid, p_acceptance uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_total bigint, p_expected integer, p_actor uuid, p_customer character varying, p_method character varying, p_accepted_at timestamp with time zone, p_evidence uuid)", "0743_builder_acceptance_sent_head.sql"],
    ["app.record_quote_disposition(p_tenant uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_actor uuid, p_kind character varying, p_occurred timestamp with time zone)", "0723_lp6c_money_binding.sql"],
    ["app.switch_job_live(p_tenant uuid, p_activation uuid, p_cap_snapshot uuid, p_obligation uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_net bigint, p_cap bigint, p_mode character varying, p_terms character varying, p_policy character varying, p_actor uuid, p_activated timestamp with time zone)", "0723_lp6c_money_binding.sql"],
    ["app.record_simulated_settlement(p_tenant uuid, p_id uuid, p_obligation uuid, p_provider_event character varying, p_amount bigint, p_simulated_at timestamp with time zone)", "0723_lp6c_money_binding.sql"],
    ["app.reserve_customer_invoice_number(p_tenant uuid)", "0723_lp6c_money_binding.sql"],
    ["app.issue_practice_customer_invoice(p_tenant uuid, p_job uuid, p_final_revision uuid, p_actor uuid, p_command uuid, p_recipient text, p_issued_on date)", "0723_lp6c_money_binding.sql"],
    ["app.switch_job_live_v3(p_tenant uuid, p_activation uuid, p_terms uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_actor uuid, p_command uuid, p_authorization uuid)", "0723_lp6c_money_binding.sql"],
    ["app.final_lock_require_owner(p_tenant uuid, p_actor uuid)", "0723_lp6c_money_binding.sql"],
    ["app.issue_lock_bound_customer_invoice(p_tenant uuid, p_job uuid, p_revision uuid, p_actor uuid, p_command uuid, p_kind text, p_recipient text, p_issued_on date, p_source_hash text)", "0731_combined_invoice_signed_vat.sql"],
    ["app.approve_recovery_case_terms(p_tenant uuid, p_id uuid, p_job uuid, p_case uuid, p_actor uuid, p_command uuid, p_authorization uuid)", "0723_lp6c_money_binding.sql"],
    ["app.write_recovery_allocation(p_tenant uuid, p_job uuid, p_session text, p_command jsonb, p_artifact jsonb)", "0723_lp6c_money_binding.sql"],
    ["app.lock_recovery_payer_job(p_tenant uuid, p_job uuid, p_actor uuid)", "0723_lp6c_money_binding.sql"],
    ["app.assert_receipt_fact_scope(p_tenant uuid, p_job uuid, p_session_digest text)", "0723_lp6c_money_binding.sql"],
    ["app.write_receipt_allocation_facts(p_tenant uuid, p_job uuid, p_session_digest text, p_command jsonb, p_artifact jsonb)", "0723_lp6c_money_binding.sql"],
    ["app.lp3_authorize(p_tenant uuid, p_actor uuid, p_command uuid, p_authorization uuid, p_command_type text, p_action text, p_subject_type text, p_subject text, p_hash text, p_version integer, p_amount bigint, p_currency text, p_recipient text, p_policy text, p_payload text, p_job uuid, p_expected integer)", "0723_lp6c_money_binding.sql"],
    ["app.switch_job_live(p_tenant uuid, p_activation uuid, p_cap_snapshot uuid, p_obligation uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_net bigint, p_cap bigint, p_mode character varying, p_terms character varying, p_policy character varying, p_actor uuid, p_activated timestamp with time zone, p_command uuid, p_authorization uuid)", "0723_lp6c_money_binding.sql", 1],
    ["app.record_simulated_settlement(p_tenant uuid, p_id uuid, p_obligation uuid, p_provider_event character varying, p_amount bigint, p_simulated_at timestamp with time zone, p_actor uuid, p_command uuid, p_authorization uuid)", "0723_lp6c_money_binding.sql", 1],
    ["app.record_builder_attested_acceptance(p_tenant uuid, p_acceptance uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_total bigint, p_expected integer, p_actor uuid, p_customer character varying, p_method character varying, p_accepted_at timestamp with time zone, p_evidence uuid, p_command uuid, p_authorization uuid)", "0723_lp6c_money_binding.sql", 1],
    ["app.record_quote_disposition(p_tenant uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_actor uuid, p_kind character varying, p_occurred timestamp with time zone, p_command uuid, p_authorization uuid)", "0723_lp6c_money_binding.sql", 1],
    ["app.lp5_bind_effect(p_command uuid, p_authorization uuid, p_adapter text, p_reference jsonb)", "0724_lp6c_customer_portal_delegation.sql"],
    ["app.begin_command(p_version text, p_command_id uuid, p_command_type text, p_semantic_key text, p_resource jsonb, p_expected_revisions jsonb, p_significant_input jsonb)", "0724_lp6c_customer_portal_delegation.sql"],
    ["app.complete_command(p_command_id uuid, p_outcome jsonb)", "0724_lp6c_customer_portal_delegation.sql"],
    ["app.mon1_company_actor(t uuid, digest text)", "0723_lp6c_money_binding.sql"],
    ["app.xa_client_view_authority(p_job uuid, p_request uuid, p_actor uuid, p_email text)", "0686_extra_client_authority_loss.sql"],
    ["app.xa_client_decide(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_token_hash text, p_email text, p_hash text, p_net bigint, p_reject boolean, p_reason text, p_role_name text, p_tester text)", "0686_extra_client_authority_loss.sql"],
    ["identity.extra_customer_use(t uuid, j uuid, c uuid, digest text, session_digest text, operation text)", "0686_extra_client_authority_loss.sql"],
    ["app.connector_promotion(p_session uuid, p_namespace text, p_event text, p_command uuid, p_result jsonb)", "0754_connector_promotion_list_closed_job.sql"],
    ["app.guard_practice_material_requirement()", "0690_import_ancestry_record_anchor.sql"],
    ["app.ch4_read_work_facts(t uuid, j uuid, digest text)", "0690_import_ancestry_record_anchor.sql"],
    ["app.read_job_sources(t uuid, j uuid, digest text, source text)", "0690_import_ancestry_record_anchor.sql"],
    ["app.ch4_require_command_owner(t uuid, j uuid, digest text)", "0690_import_ancestry_record_anchor.sql"],
    ["app.final_check_builder(t uuid, j uuid, d text, locking boolean)", "0735_per_firm_final_check_terms.sql"],
    ["app.evidence_pack_v3_owner(t uuid, c uuid, d text)", "0735_per_firm_final_check_terms.sql"],
    ["app.adopt_invoiced_job_v3(t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text)", "0690_import_ancestry_record_anchor.sql"],
    ["app.apply_recovery_timeline_signal(p_tenant uuid, p_signal jsonb)", "0690_import_ancestry_record_anchor.sql"],
    ["app.final_check_practice_owns_job(t uuid, j uuid, d text)", "0701_final_check_owner_v1_adoption_edge.sql"],
    // 0735 re-creates these with their full latest bodies, checking the job's own firm acceptance.
    ["app.lock_final_account(p_tenant uuid, p_job uuid, p_actor uuid, p_command uuid, p_revision uuid, p_expected integer, p_declaration text)", "0735_per_firm_final_check_terms.sql"],
    ["app.final_check_require_worker(p_tenant uuid, p_job uuid)", "0735_per_firm_final_check_terms.sql"],
    ["app.final_check_worker(t uuid, j uuid)", "0735_per_firm_final_check_terms.sql"],
    ["app.surface_shadow_signal_early(p_tenant uuid, p_job uuid, p_signal uuid, p_firing uuid, p_decision uuid, p_disclosure uuid, p_rule text, p_version text, p_source uuid, p_object_version text, p_facts jsonb)", "0735_per_firm_final_check_terms.sql"],
    ["app.accept_final_check_terms(p_tenant uuid, p_actor uuid, p_command uuid, p_version text)", "0735_per_firm_final_check_terms.sql"],
    ["app.guard_final_lock_disclosure_terms()", "0735_per_firm_final_check_terms.sql"],
    ["app.current_firm_profile_key()", "0757_practice_firm_name.sql"],
    ["app.job_saved_firm_name(j uuid)", "0757_practice_firm_name.sql"],
    ["app.store_extra_pack_artifact(p_command uuid, p_job uuid, p_extra uuid, p_digest text, p_artifact jsonb)", "0744_extra_pack_source_bijection.sql"],
  ] as readonly (readonly [string, string, number?])[]) {
    const source = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    if (identity!.startsWith("app.decision_check_command(")) {
      expect(source).toContain("rv.semantic_key='import:'||next_job.id::text AND rv.result->>'jobId'=next_job.id::text AND rv.result->>'sourceJobId'=source.id::text");
    }
    fullBodies.set(identity!, source.split(`FUNCTION ${identity!.split("(")[0]}(`)[overload + 1]!.split("AS $$")[1]!.split(/\$\$\s*;/u)[0]!);
  }
  // Saved-estimate successor: retain recovery's predecessor entry above.
  const savedEstimateSql = await readFile(new URL("../migrations/0737_real_fc_revealed_estimate.sql", import.meta.url), "utf8");
  fullBodies.set("app.read_final_check_reveal(t uuid, j uuid, d text)", savedEstimateSql.split("AS $$")[1]!.split("$$;")[0]!);
  // LP-6d (0740, the last migration) recreates its guarded routines: their exact bodies are 0740's, which
  // already carry every listed predecessor patch (0642's xa_issue_link authority, 0728's xa_approve) plus the
  // LP-6d binding prefix. lp6d-routines.test.ts pins each one to its latest predecessor body.
  const lp6dSql = await readFile(new URL("../migrations/0749_lp6d_remaining_routines.sql", import.meta.url), "utf8");
  const argNames = (args: string) => args.split(",").map(arg => arg.trim().split(/\s+/u)[0]!).filter(Boolean).join(",");
  const lp6dBodies = new Map<string, string>();
  for (const m of lp6dSql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([\w.]+)\(([\s\S]*?)\)\s*RETURNS[\s\S]*?AS \$\$([\s\S]*?)\$\$\s*;/gu)) lp6dBodies.set(`${m[1]}(${argNames(m[2]!)})`, m[3]!);
  // LATER-SAFETY-183 changes only xa_price after LP-6d, retaining its binding prefix.
  const pricePermissionSql = await readFile(new URL("../migrations/0752_extra_price_permission_order.sql", import.meta.url), "utf8");
  lp6dBodies.set("app.xa_price(p_job,p_variation,p_command,p_actor,p_net,p_revise)", pricePermissionSql.split("AS $$")[1]!.split("$$;")[0]!);
  // LP6D-WORKER-PRESENCE: only these three definitions supersede historical bodies.
  const presenceSql = await readFile(new URL("../migrations/0753_lp6d_worker_binding_presence.sql", import.meta.url), "utf8");
  for (const m of presenceSql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(([\s\S]*?)\)\s*RETURNS[\s\S]*?AS \$\$([\s\S]*?)\$\$\s*;/gu))
    lp6dBodies.set(`${m[1]}(${argNames(m[2]!)})`, m[3]!);
  // LATER-SAFETY-189: xa_proceed's latest body preserves covered reads and requires the raiser for writes.
  const proceedRaiserSql = await readFile(new URL("../migrations/0760_extra_proceed_raiser_authority.sql", import.meta.url), "utf8");
  lp6dBodies.set("app.xa_proceed(p_job,p_extra,p_actor,p_body)", proceedRaiserSql.split("AS $$")[1]!.split("$$;")[0]!);
  // LP-10 preserves the LP-6d sink body and moves only its outbox row lock.
  for (const [key, before, after] of [
    ["app.guard_recovery_message_sink()", "FOR SHARE OF mem,o)", "FOR SHARE OF mem)"],
    ...["app.lp6d_share_sink_authorization(p_tenant,p_outbox)", "app.lp6d_share_sink_authorization_worker(p_tenant,p_outbox)"]
      .map(key => [key, "FOR SHARE OF a;", "FOR SHARE OF a;\n PERFORM 1 FROM app.action_outbox WHERE tenant_id=p_tenant AND id=p_outbox FOR SHARE;"]),
  ] as [string, string, string][]) {
    const body = lp6dBodies.get(key)!;
    expect(body.split(before)).toHaveLength(2);
    lp6dBodies.set(key, body.replace(before, after));
  }
  const lp6dKey = (row: { nspname: string; proname: string; args: string }) => `${row.nspname}.${row.proname}(${argNames(row.args)})`;
  const namedAdditions = [
    "final_check_read_authority", "admit_final_check_cycle", "final_check_cycle_claim", "final_check_cycle_finish",
    "ent3b_close_abandoned_visit",
    "require_receipt_final_check", "connector_promotion", "order_attestation_actor", "platform_invoice_read",
    "retention_timer", "retention_timer_book", "xa_proceed", "xa_proceed_breaches",
    "xa_proceed_view", "xa_wait_deadline", "customer_practice_pay_now", "store_extra_pack_artifact",
    "guard_variation_final_account_lock",
    "company_final_check_authority", "company_final_check_read", "company_final_check_terms",
    "company_final_check_disposition", "company_final_check_lock", "company_final_check_request_run", "company_final_check_reveal",
    "final_check_bound_practice", "final_check_request_scope", "final_check_job_scope", "final_check_job_terms", "final_check_runtime_job_terms",
  ];
  for (const name of namedAdditions) {
    expect(replayRoutines.filter(row => row.proname === name)).toHaveLength(1);
    expect(afterRoutines.some(row => row.proname === name)).toBe(false);
  }
  const lp11Sql = await readFile(new URL("../migrations/0762_lp11_bound_tenant_rls.sql", import.meta.url), "utf8");
  for (const signature of [
    "infrastructure.discover_readiness_plans()", "app.serialize_final_check_evidence()",
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
    expect((await c.admin.query(
      "SELECT p.prosrc FROM pg_proc p WHERE p.pronamespace='connector'::regnamespace AND p.proname=$1", [routine],
    )).rows).toEqual([{ prosrc: source }]);
  }
  for (const match of lp11Sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+\$\$(.*?)\$\$;/gsu))
    lp6dBodies.set(`${match[1]}(${argNames(match[2]!)})`, match[3]!);
  for (const row of replayRoutines) {
    const identity = `${row.nspname}.${row.proname}(${row.args})`;
    const prior = afterRoutines.find(r => `${r.nspname}.${r.proname}(${r.args})` === identity);
    // 0751 succeeds LP-6d for this exact overload; check it before LP-6d's generic body handling.
    if (identity === "app.accounting_export(t uuid, digest text, operation text, source text, v jsonb)") {
      const parts = prior!.definition.split("$function$");
      parts[1] = fullBodies.get(identity)!;
      expect(row.definition).toBe(parts.join("$function$"));
      continue;
    }
    if (prior) {
      let definition = prior.definition;
      const lp6dBody = lp6dBodies.get(lp6dKey(row));
      if (lp6dBody !== undefined) {
        // 0740 owns this routine's latest definition (some change language, e.g. contractor_session sql -> plpgsql).
        expect(row.definition.split("$function$")[1], identity).toBe(lp6dBody);
        continue;
      }
      if (fullBodies.has(identity)) {
        const parts = definition.split("$function$");
        parts[1] = fullBodies.get(identity)!;
        definition = parts.join("$function$");
      }
      for (const [before, after] of patches.get(identity) ?? []) {
        expect(definition.split(before)).toHaveLength(2);
        definition = definition.replace(before, after);
      }
      expect(row.definition).toBe(definition);
    } else {
      // Metadata equality above binds the exact overload; pin its latest successor body, including 0681.
      // Bodies come from the latest listed successor that actually (re)creates the routine; an ACL-only
      // successor (for example 0725's GRANT on extra_customer_use) does not redefine its body.
      const create = `FUNCTION ${row.nspname}.${row.proname}(`;
      const defines = (sql: string) => new RegExp(`CREATE (?:OR REPLACE )?${create.replace(/[.()]/gu, "\\$&")}`, "u").test(sql);
      const listed = successors.filter(p => p.upgrade.some(change => change.section === "routines" && change.after?.nspname === row.nspname && change.after?.proname === row.proname && change.after?.args === row.args));
      let sql: string | undefined;
      for (const candidate of listed.reverse()) {
        const text = await readFile(new URL(`../migrations/${candidate.migration}`, import.meta.url), "utf8");
        if (defines(text)) { sql = text; break; }
      }
      expect(sql).toBeDefined();
      const body = lp6dBodies.get(lp6dKey(row)) ?? fullBodies.get(identity) ?? sql!.split(new RegExp(`CREATE (?:OR REPLACE )?${create.replace(/[.()]/gu, "\\$&")}`, "u"))[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(row.definition.split("$function$")[1]).toBe(body);
    }
  }
}, 120_000);
