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
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY 1,2,3`)).rows;
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
  const replayRoutines = await routines(), replayCatalog = await catalog();
  expect(metadata(replayRoutines)).toEqual(expected.routines);
  expect(relationMetadata(replayCatalog)).toEqual(expected.relations);
  expect(await policies()).toEqual(expected.policies);
  // Preserve all raw predecessor catalogue fields, including policy identities.
  for (const row of beforeCatalog) {
    if (row.nspname === "app" && ["customer_portal_session", "customer_portal_grant"].includes(row.relname)) {
      // 0687 adds exactly the private owner's SELECT and one tenant-scoped read policy.
      // Complete ACL/policy metadata is checked against its exact proof above;
      // retain every raw predecessor policy object, owner and RLS flag here.
      const current = replayCatalog.find(r => r.nspname === row.nspname && r.relname === row.relname)!;
      expect({ ...current, relacl: row.relacl, policies: row.policies }).toEqual(row);
      expect(current.policies).toHaveLength((row.policies?.length ?? 0) + 1);
      for (const policy of row.policies ?? []) expect(current.policies).toContainEqual(policy);
      expect(current.policies.some((policy: { polname: string }) => policy.polname === "lp6_customer_binding_read")).toBe(true);
    } else expect(replayCatalog).toContainEqual(row);
  }
  const authority = await readFile(new URL("../migrations/0642_extra_client_send_authority.sql", import.meta.url), "utf8");
  const attribution = await readFile(new URL("../migrations/0644_extra_customer_approval.sql", import.meta.url), "utf8");
  const replacements = (source: string) => [...source.matchAll(/changed:=replace\((?:original|changed),'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/g)]
    .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")] as const);
  const authorityChanges = replacements(authority), attributionChanges = replacements(attribution);
  expect(authorityChanges).toHaveLength(3); expect(attributionChanges).toHaveLength(1);
  const practiceOwner = await readFile(new URL("../migrations/0667_final_check_practice_owner_check.sql", import.meta.url), "utf8");
  const lockAnchor = "BEGIN\n PERFORM app.final_lock_require_owner(p_tenant,p_actor);", lockGuard = "\n" + practiceOwner.split("$guard$")[1]!;
  const patches = new Map([
    ["app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamp with time zone, p_authorization uuid, p_outbox uuid)", authorityChanges.slice(0, 2)],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", authorityChanges.slice(2)],
    ["app.northside_capture_action()", attributionChanges],
    // 0667 inserts only the practice-owner guard after lock_final_account's first owner check.
    ["app.lock_final_account(p_tenant uuid, p_job uuid, p_actor uuid, p_command uuid, p_revision uuid, p_expected integer, p_declaration text)", [[lockAnchor, lockAnchor + lockGuard] as const]],
  ]);
  // Exact existing replacements only; all their privileges and unrelated definitions remain frozen.
  const fullBodies = new Map<string, string>();
  for (const [identity, migration, overload = 0] of [
    ["app.current_actor()", "0687_lp6c_customer_portal_delegation.sql"],
    ["app.current_tenant()", "0687_lp6c_customer_portal_delegation.sql"],
    ["identity.customer_portal_message(t uuid, j uuid, c uuid, digest text, input jsonb)", "0687_lp6c_customer_portal_delegation.sql"],
    ["app.lp5_command_result(p_command_id uuid, p_outcome jsonb)", "0634_extra_proceed_statement.sql"],
    ["app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text)", "0635_extra_same_step.sql"],
    ["app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text)", "0636_extra_withdraw_roles.sql"],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", "0636_extra_withdraw_roles.sql"],
    ["app.xa_requirement(p_rules jsonb, p_net bigint)", "0637_extra_working_day_wait.sql"],
    ["app.xa_escalate()", "0637_extra_working_day_wait.sql"],
    ["app.xa_queue(p_member uuid)", "0637_extra_working_day_wait.sql"],
    ["app.valid_approval_rules(d jsonb)", "0638_extra_rule_wait_schema.sql"],
    ["app.retention_records(t uuid, digest text, j uuid, cid uuid, v jsonb, expected text)", "0646_retention_timer_runtime_rules.sql"],
    ["app.notice_fixture_records(j uuid, n uuid, digest text, operation text, v jsonb)", "0647_notice_live_job_check.sql"],
    ["app.pay_now_fake_attempt(t uuid, digest text, j uuid, operation text, v jsonb)", "0648_pay_now_catch_statement.sql"],
    ["app.demo_issue_customer_link(t uuid, j uuid, c uuid, session_digest text, link_digest text, content text)", "0650_demo_customer_link_reference.sql"],
    ["identity.dark_emergency(s text, csrf text, t uuid, p jsonb)", "0655_emergency_token_minted.sql"],
    ["app.replace_fee_reservation_book(p_tenant uuid, p_book jsonb, p_result jsonb)", "0656_fee_result_malformed_proof.sql"],
    ["app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)", "0658_lp6b_effective_session_actor.sql"],
    ["app.ch6_integrity_authority(t uuid, j uuid, digest text)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.ch6_integrity_sources(t uuid, j uuid, d text)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.ch6_record_integrity_review(t uuid, j uuid, digest text, review jsonb, source_snapshot jsonb)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.decision_check_command(p_digest text, p_command jsonb, p_phase text, p_data jsonb)", "0660_baseline_ancestry_audit_trust.sql"],
    ["app.interim_draft_records(t uuid, digest text, j uuid, operation text, v jsonb)", "0665_interim_read_authority.sql"],
    ["app.ch5_history_actor(t uuid, j uuid, d text)", "0668_import_company_owner_history.sql"],
    ["app.configure_recovery_demo(p_job uuid, p_command uuid, p_scenario character varying)", "0670_recovery_demo_replay_job.sql"],
    ["app.ent4b_fact_guard()", "0673_duplicate_unlink_command_binding.sql"],
    ["app.work_order_commit(actor uuid, payload jsonb)", "0676_work_order_expected_revision.sql"],
    ["app.sync_snapshot_generation(u uuid, r bigint, s bigint, h text, e text)", "0679_sync_checkpoint_synthetic_guard.sql"],
    ["app.reverse_synthetic_landing(p_tenant uuid, p_reversal uuid, p_derivation uuid, p_journal uuid, p_allocation uuid, p_amount bigint, p_reason character varying)", "0682_synthetic_reversal_replay_match.sql"],
    ["app.final_check_require_invoice_actor(p_tenant uuid, p_job uuid, p_actor uuid)", "0686_lp6c_money_binding.sql"],
    ["app.assert_financial_authorization(t uuid, a uuid, p character varying, n bigint, c character, h character)", "0686_lp6c_money_binding.sql"],
    ["app.post_plan_obligation(j uuid, b uuid, r uuid, i uuid, n bigint, c character, s character varying, pk character varying, pr character varying, h character, a uuid, au uuid)", "0686_lp6c_money_binding.sql"],
    ["app.post_plan_settlement(j uuid, b uuid, o uuid, cl uuid, r uuid, n bigint, c character, s character varying, pr character varying, h character, a uuid, au uuid)", "0686_lp6c_money_binding.sql"],
    ["app.reverse_journal(j uuid, b uuid, o uuid, s character varying, pr character varying, h character, a uuid, au uuid)", "0686_lp6c_money_binding.sql"],
    ["app.record_builder_attested_acceptance(p_tenant uuid, p_acceptance uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_total bigint, p_expected integer, p_actor uuid, p_customer character varying, p_method character varying, p_accepted_at timestamp with time zone, p_evidence uuid)", "0686_lp6c_money_binding.sql"],
    ["app.record_quote_disposition(p_tenant uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_actor uuid, p_kind character varying, p_occurred timestamp with time zone)", "0686_lp6c_money_binding.sql"],
    ["app.switch_job_live(p_tenant uuid, p_activation uuid, p_cap_snapshot uuid, p_obligation uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_net bigint, p_cap bigint, p_mode character varying, p_terms character varying, p_policy character varying, p_actor uuid, p_activated timestamp with time zone)", "0686_lp6c_money_binding.sql"],
    ["app.record_simulated_settlement(p_tenant uuid, p_id uuid, p_obligation uuid, p_provider_event character varying, p_amount bigint, p_simulated_at timestamp with time zone)", "0686_lp6c_money_binding.sql"],
    ["app.reserve_customer_invoice_number(p_tenant uuid)", "0686_lp6c_money_binding.sql"],
    ["app.issue_practice_customer_invoice(p_tenant uuid, p_job uuid, p_final_revision uuid, p_actor uuid, p_command uuid, p_recipient text, p_issued_on date)", "0686_lp6c_money_binding.sql"],
    ["app.switch_job_live_v3(p_tenant uuid, p_activation uuid, p_terms uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_actor uuid, p_command uuid, p_authorization uuid)", "0686_lp6c_money_binding.sql"],
    ["app.final_lock_require_owner(p_tenant uuid, p_actor uuid)", "0686_lp6c_money_binding.sql"],
    ["app.issue_lock_bound_customer_invoice(p_tenant uuid, p_job uuid, p_revision uuid, p_actor uuid, p_command uuid, p_kind text, p_recipient text, p_issued_on date, p_source_hash text)", "0686_lp6c_money_binding.sql"],
    ["app.approve_recovery_case_terms(p_tenant uuid, p_id uuid, p_job uuid, p_case uuid, p_actor uuid, p_command uuid, p_authorization uuid)", "0686_lp6c_money_binding.sql"],
    ["app.write_recovery_allocation(p_tenant uuid, p_job uuid, p_session text, p_command jsonb, p_artifact jsonb)", "0686_lp6c_money_binding.sql"],
    ["app.lock_recovery_payer_job(p_tenant uuid, p_job uuid, p_actor uuid)", "0686_lp6c_money_binding.sql"],
    ["app.assert_receipt_fact_scope(p_tenant uuid, p_job uuid, p_session_digest text)", "0686_lp6c_money_binding.sql"],
    ["app.write_receipt_allocation_facts(p_tenant uuid, p_job uuid, p_session_digest text, p_command jsonb, p_artifact jsonb)", "0686_lp6c_money_binding.sql"],
    ["app.lp3_authorize(p_tenant uuid, p_actor uuid, p_command uuid, p_authorization uuid, p_command_type text, p_action text, p_subject_type text, p_subject text, p_hash text, p_version integer, p_amount bigint, p_currency text, p_recipient text, p_policy text, p_payload text, p_job uuid, p_expected integer)", "0686_lp6c_money_binding.sql"],
    ["app.switch_job_live(p_tenant uuid, p_activation uuid, p_cap_snapshot uuid, p_obligation uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_net bigint, p_cap bigint, p_mode character varying, p_terms character varying, p_policy character varying, p_actor uuid, p_activated timestamp with time zone, p_command uuid, p_authorization uuid)", "0686_lp6c_money_binding.sql", 1],
    ["app.record_simulated_settlement(p_tenant uuid, p_id uuid, p_obligation uuid, p_provider_event character varying, p_amount bigint, p_simulated_at timestamp with time zone, p_actor uuid, p_command uuid, p_authorization uuid)", "0686_lp6c_money_binding.sql", 1],
    ["app.record_builder_attested_acceptance(p_tenant uuid, p_acceptance uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_total bigint, p_expected integer, p_actor uuid, p_customer character varying, p_method character varying, p_accepted_at timestamp with time zone, p_evidence uuid, p_command uuid, p_authorization uuid)", "0686_lp6c_money_binding.sql", 1],
    ["app.record_quote_disposition(p_tenant uuid, p_event uuid, p_job uuid, p_document uuid, p_version integer, p_hash character, p_expected integer, p_actor uuid, p_kind character varying, p_occurred timestamp with time zone, p_command uuid, p_authorization uuid)", "0686_lp6c_money_binding.sql", 1],
    ["app.lp5_bind_effect(p_command uuid, p_authorization uuid, p_adapter text, p_reference jsonb)", "0687_lp6c_customer_portal_delegation.sql"],
    ["app.begin_command(p_version text, p_command_id uuid, p_command_type text, p_semantic_key text, p_resource jsonb, p_expected_revisions jsonb, p_significant_input jsonb)", "0687_lp6c_customer_portal_delegation.sql"],
    ["app.complete_command(p_command_id uuid, p_outcome jsonb)", "0687_lp6c_customer_portal_delegation.sql"],
    ["app.mon1_company_actor(t uuid, digest text)", "0686_lp6c_money_binding.sql"],
  ] as readonly (readonly [string, string, number?])[]) {

    const source = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    if (identity!.startsWith("app.decision_check_command(")) {
      expect(source).toContain("rv.semantic_key='import:'||next_job.id::text AND rv.result->>'jobId'=next_job.id::text AND rv.result->>'sourceJobId'=source.id::text");
    }
    fullBodies.set(identity!, source.split(`FUNCTION ${identity!.split("(")[0]}(`)[overload + 1]!.split("AS $$")[1]!.split(/\$\$\s*;/u)[0]!);
  }
  const namedAdditions = [
    "connector_promotion", "order_attestation_actor", "platform_invoice_read",
    "retention_timer", "retention_timer_book", "xa_proceed", "xa_proceed_breaches",
    "xa_proceed_view", "xa_wait_deadline", "customer_practice_pay_now", "store_extra_pack_artifact",
  ];
  for (const name of namedAdditions) {
    expect(replayRoutines.filter(row => row.proname === name)).toHaveLength(1);
    expect(afterRoutines.some(row => row.proname === name)).toBe(false);
  }
  for (const row of replayRoutines) {
    const identity = `${row.nspname}.${row.proname}(${row.args})`;
    const prior = afterRoutines.find(r => `${r.nspname}.${r.proname}(${r.args})` === identity);
    if (prior) {
      let definition = prior.definition;
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
      const source = successors.findLast(p => p.upgrade.some(change => change.section === "routines" && change.after?.nspname === row.nspname && change.after.proname === row.proname && change.after.args === row.args));
      expect(source).toBeDefined();
      const sql = await readFile(new URL(`../migrations/${source!.migration}`, import.meta.url), "utf8");
      const body = sql.split(`FUNCTION ${row.nspname}.${row.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(row.definition.split("$function$")[1]).toBe(body);
    }
  }
}, 120_000);
