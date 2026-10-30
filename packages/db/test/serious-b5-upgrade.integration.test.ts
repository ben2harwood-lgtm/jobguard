// Dispatcher/CI only: upgrade/data/catalogue evidence requires real PostgreSQL.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { asFixtureTenant, closeLockFixture, createLockFixture, LOCK_OWNER, seedAccount, type LockFixture } from "./final-account-lock.integration.test.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const own = "0187_final_account_sources_and_pdf.sql";
let f: LockFixture;
beforeAll(async () => { f = await createLockFixture(false); }, 60000);
afterAll(async () => { if (f) await closeLockFixture(f); });
async function snapshot() {
 const tables = (await f.admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows;
 const rows: Record<string, unknown> = {};
 for (const t of tables) {
  const identifier = (s: string) => `"${s.replaceAll('"','""')}"`;
  rows[`${t.schemaname}.${t.tablename}`] = (await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') data FROM ${identifier(t.schemaname)}.${identifier(t.tablename)} t`)).rows[0].data;
 }
 const routines = (await f.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner,p.proacl,p.prosecdef,p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2,3`)).rows;
 const relations = (await f.admin.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
 const policies = (await f.admin.query("SELECT * FROM pg_policies WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY schemaname,tablename,policyname")).rows;
 return { rows, routines, relations, policies };
}
// Ruling 110: only 0188's named objects may extend this snapshot. Existing rows
// (including full routine privileges/configuration and relation/policy metadata)
// remain compared without dropping fields or accepting arbitrary later additions.
const billingTables = ["billing_export_batch", "billing_export_line", "billing_status_import", "billing_fact", "billing_line_match", "billing_quarantine", "billing_allocation_run", "billing_application_event", "contractor_receipt_line_allocation", "billing_export_delivery"];
const billingRoutines = ["app.cb_authority(uuid,uuid,boolean)", "app.cb_begin(uuid,uuid,uuid,text,jsonb)", "app.cb_complete(uuid,uuid,uuid,jsonb)", "app.cb_unresolved(uuid,uuid)", "app.cb_candidates(uuid,uuid,uuid)", "app.cb_line_id(uuid,uuid)", "app.cb_csv_cell(text)", "app.cb_csv(jsonb)", "app.cb_export(uuid,uuid,uuid,jsonb,text,text)", "app.cb_ingest(uuid,uuid,uuid,jsonb)", "app.cb_inputs(uuid,uuid)", "app.cb_add(numeric,numeric,numeric,numeric)", "app.cb_validate(uuid,text,text,jsonb)", "app.cb_derive(uuid,uuid,uuid,text,text,text,jsonb)", "app.cb_delivery(uuid,uuid,uuid,jsonb)", "app.cb_audit(uuid,uuid,text,uuid)", "app.cb_delivery_step(uuid,uuid,uuid,text,jsonb)"];
// Ruling 110: 0188's billing objects extend the snapshot additively, in the same style as
// livePromptAdditions/subscriptionAdditions, so every object is reconstructed at its exact
// server-sort position in `after` and no pre-existing row/privilege is dropped.
async function billingAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const allowedRoutines = (await f.admin.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) args
  FROM pg_proc p WHERE p.oid=ANY(ARRAY(SELECT unnest($1::text[])::regprocedure::oid))`, [billingRoutines])).rows;
 expect(allowedRoutines).toHaveLength(billingRoutines.length);
 const isBillingRoutine = (r: typeof after.routines[number]) => r.nspname==='app' && allowedRoutines.some(a => a.proname===r.proname && a.args===r.args);
 const routines = after.routines.filter(isBillingRoutine);
 expect(routines).toHaveLength(billingRoutines.length);
 // Bind indexes to these exact new tables through pg_index, never a name prefix.
 const indexes = (await f.admin.query(`SELECT c.relname FROM pg_index i
  JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[])`, [billingTables])).rows.map(r => r.relname as string);
 expect(indexes).toContain("billing_line_match_export_line_unique");
 const relationNames = new Set([...billingTables, ...indexes]);
 const relations = after.relations.filter(r => r.nspname==='app' && relationNames.has(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(r => r.schemaname==='app' && billingTables.includes(r.tablename) && r.policyname==='tenant_isolation');
 expect(policies).toHaveLength(billingTables.length);
 for (const table of billingTables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname===r.nspname && b.proname===r.proname && b.args===r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname===r.nspname && b.relname===r.relname)).toBe(false);
 return {
  rows: Object.fromEntries(billingTables.map(t => [`app.${t}`, []])),
  routines,
  relations,
  policies,
 };
}
// Standing ruling 113: additive MON-2A-P objects only. Keep every predecessor
// row and privilege in the comparison; no prefix or whole-schema exemption.
async function subscriptionAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["subscription_agreement_revision", "subscription_plan_change", "subscription_change_outcome", "subscription_period", "subscription_place", "subscription_place_binding", "subscription_period_line", "subscription_correction_disposition", "subscription_alert", "platform_statement", "platform_statement_line", "subscription_review", "subscription_operations_card", "subscription_onboarding", "subscription_simulated_work", "subscription_simulated_attempt", "subscription_simulated_result"];
 const routineNames = ["mon2_approve", "mon2_audit", "mon2_authorized", "mon2_boundary", "mon2_command", "mon2_consistency", "mon2_correction_open", "mon2_issue", "mon2_read", "mon2_review", "mon2_source"];
 const routines = after.routines.filter(r => r.nspname === "app" && routineNames.includes(r.proname));
 expect(routines.map(r => r.proname).sort()).toEqual(routineNames);
 const catalogue = "subscription_plan_catalogue";
 const indexes = (await f.admin.query(`SELECT n.nspname,i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE (n.nspname='app' AND t.relname=ANY($1::text[]))
   OR (n.nspname='control_plane' AND t.relname=$2)`, [tables, catalogue])).rows;
 expect(indexes).toHaveLength(28); // 18 primary keys and ten UNIQUE constraints in 0193
 const relationKeys = [...tables.map(t => `app.${t}`), `control_plane.${catalogue}`, ...indexes.map(i => `${i.nspname}.${i.relname}`)];
 const relations = after.relations.filter(r => relationKeys.includes(`${r.nspname}.${r.relname}`));
 expect(relations.map(r => `${r.nspname}.${r.relname}`).sort()).toEqual([...relationKeys].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual([...tables.map(t => [t, "tenant_isolation"]),
  ["subscription_agreement_revision", "meter_lifecycle_source_read"]].sort());
 const rows: Record<string, unknown> = Object.fromEntries(tables.map(t => [`app.${t}`, []]));
 rows[`control_plane.${catalogue}`] = [
  { version: "subscription_pricing_policy_v4", plan: "Solo", terms_version: "subscription_terms_v1", monthly_pence: 2900, included: 4, extras_cap: 1, maximum_pence: 4900, annual_enabled: false },
  { version: "subscription_pricing_policy_v4", plan: "Builder", terms_version: "subscription_terms_v1", monthly_pence: 6900, included: 7, extras_cap: 5, maximum_pence: 16900, annual_enabled: false },
 ];
 // Match the snapshot's PostgreSQL jsonb-text ordering, without taking expected
 // seed values from live rows (JSON key/locale order can differ from JavaScript).
 rows[`control_plane.${catalogue}`] = (await f.admin.query(
  "SELECT value FROM jsonb_array_elements($1::jsonb) ORDER BY value::text", [JSON.stringify(rows[`control_plane.${catalogue}`])])).rows.map(r => r.value);
 for (const key of Object.keys(rows)) expect(Object.keys(before.rows)).not.toContain(key);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 return { rows, routines, relations, policies };
}
// Per C135 (SV5PRE): additive allowance for exactly the objects created by the final-check prerequisites migration (0204).
// Its two invoice routines and lock_final_account are restated, not added: their existing catalogue rows still compare in full.
async function finalCheckAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["final_check_manifest", "final_check_manifest_source", "shadow_final_check_completion", "shadow_final_check_reveal_proof", "shadow_final_check_run_binding", "shadow_final_check_source_attempt"];
 const indexNames = [
  "final_check_manifest_processing_identity", "final_check_manifest_pkey", "final_check_manifest_tenant_id_job_id_id_key", "final_check_manifest_tenant_id_job_id_id_lock_id_evidence_c_key", "final_check_manifest_tenant_id_job_id_lock_id_key",
  "final_check_manifest_source_pkey", "final_check_manifest_source_tenant_id_job_id_manifest_id_up_key", "final_check_one_empty_descriptor",
  "shadow_final_check_completion_pkey", "shadow_final_check_reveal_pro_tenant_id_job_id_run_id_signa_key", "shadow_final_check_reveal_proof_pkey",
  "shadow_final_check_run_bindin_tenant_id_job_id_execution_id_key", "shadow_final_check_run_bindin_tenant_id_job_id_run_id_manif_key", "shadow_final_check_run_binding_pkey",
  "shadow_final_check_source_att_tenant_id_job_id_manifest_id__key", "shadow_final_check_source_att_tenant_id_job_id_manifest_id_key1", "shadow_final_check_source_attempt_pkey"];
 const routineIdentities = [
  ["final_check_require_invoice_actor", "p_tenant uuid, p_job uuid, p_actor uuid"], ["final_check_require_worker", "p_tenant uuid, p_job uuid"],
  ["guard_final_check_attempt", ""], ["guard_final_check_binding", ""], ["guard_final_check_generated_fact", ""], ["guard_final_check_manifest", ""], ["guard_final_check_result", ""],
  ["publish_final_check_certificate", ""], ["require_authoritative_final_check", "p_tenant uuid, p_job uuid"], ["serialize_final_check_evidence", ""], ["serialize_final_check_invalidation", ""],
  ["verify_final_check_run", "p_tenant uuid, p_job uuid, p_run uuid, p_lock uuid, p_cutoff timestamp with time zone"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policyPairs = [["final_check_manifest", "shadow_proof"], ["final_check_manifest", "tenant_isolation"], ["final_check_manifest_source", "shadow_source"], ["final_check_manifest_source", "tenant_isolation"],
  ["shadow_final_check_completion", "tenant_isolation"], ["shadow_final_check_reveal_proof", "shadow_proof"], ["shadow_final_check_reveal_proof", "tenant_isolation"],
  ["shadow_final_check_run_binding", "shadow_proof"], ["shadow_final_check_run_binding", "tenant_isolation"], ["shadow_final_check_source_attempt", "shadow_proof"], ["shadow_final_check_source_attempt", "tenant_isolation"]];
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual([...policyPairs].sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
// ENT-7 leftovers (0322): one private correction table and one checked command only.
async function enterpriseReconciliationAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["enterprise_duplicate_correction"];
 const indexNames = ["enterprise_duplicate_correction_pkey", "enterprise_duplicate_correction_tenant_id_command_id_key", "enterprise_duplicate_correction_tenant_id_link_id_key"];
 const routineIdentities = [["ef_reconcile_exported_duplicate", "p_session uuid, p_command uuid, p_job uuid, p_duplicate uuid, p_canonical uuid"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}

// ENT-7c (0298/0337): only the fee book's two tables, their current indexes, policies and three routines.
async function enterprisePostingAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["platform_enterprise_fee", "platform_enterprise_fee_line"];
 const indexNames = ["platform_enterprise_fee_pkey", "platform_enterprise_fee_line_pkey",
  "enterprise_fee_section_accrual", "enterprise_fee_section_compensation"];
 const routineIdentities = [
  ["ef_posted_net", "t uuid, p_agreement uuid"],
  ["ef_post_statement", "p_session uuid, p_command uuid, p_statement uuid, p_authorization uuid"],
  ["ef_read_postings", "p_session uuid, p_statement uuid"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
// ENT-7b (0290): only the enterprise fee statement's own four tables, their indexes, policies and seven routines.
async function enterpriseStatementAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["enterprise_fee_statement", "enterprise_fee_statement_approval", "enterprise_fee_statement_dispute", "enterprise_fee_statement_section"];
 const indexNames = [
  "enterprise_fee_statement_pkey", "enterprise_fee_statement_tenant_id_command_id_key", "enterprise_fee_statement_tenant_id_period_revision_key",
  "enterprise_fee_statement_tenant_id_predecessor_id_key", "enterprise_fee_statement_approval_pkey", "enterprise_fee_statement_approval_tenant_id_command_id_key",
  "enterprise_fee_statement_approva_tenant_id_authorization_id_key", "enterprise_fee_statement_dispute_pkey",
  "enterprise_fee_statement_dispute_tenant_id_command_id_key", "enterprise_fee_statement_dispute_tenant_id_statement_id_key", "enterprise_fee_statement_section_pkey"];
 const routineIdentities = [
  ["ef_approve_statement", "p_session uuid, p_command uuid, p_statement uuid, p_content_hash text, p_total_pence bigint, p_expires_at timestamp with time zone"],
  ["ef_audit", "a uuid, p_type text, p_subject_type text, p_subject uuid, payload jsonb"], ["ef_dispute_statement", "p_session uuid, p_command uuid, p_statement uuid, p_reason text"],
  ["ef_prepare_statement", "p_session uuid, p_command uuid, p_period text"], ["ef_read_statement", "p_session uuid, p_statement uuid"],
  ["ef_statement_begin", "p_session uuid, p_period text"], ["ef_statement_sections", "t uuid, p_period text"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
// ENT-7a (0276): only the enterprise fee derivation's own three tables, their indexes, policies and six routines.
async function enterpriseFeeAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["enterprise_agreement_version", "enterprise_fee_contribution", "enterprise_fee_derivation"];
 const indexNames = [
  "enterprise_agreement_version_pkey", "enterprise_agreement_version_tenant_id_effective_from_key",
  "enterprise_fee_contribution_pkey", "enterprise_fee_contribution_tenant_id_derivation_id_allocat_key",
  "enterprise_fee_derivation_pkey", "enterprise_fee_derivation_tenant_id_agreement_version_id_pe_key", "enterprise_fee_derivation_tenant_id_command_id_key"];
 const routineIdentities = [
  ["ef_actor", "p_session uuid"], ["ef_derive", "p_session uuid, p_command uuid, p_agreement uuid, p_period text"], ["ef_immutable", ""],
  ["ef_inputs", "t uuid, ag app.enterprise_agreement_version, p_period text"], ["ef_read", "p_session uuid, p_derivation uuid"], ["ef_round_half_even", "n numeric, d numeric"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
// M4-8-S m48-b1 (0258): only the receipt-line source bridge's own five tables, their indexes, policies and six routines.
async function receiptFactAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["receipt_allocation_fact_command", "receipt_allocation_fact_line", "receipt_allocation_fact_review", "receipt_allocation_fact_revision", "receipt_allocation_fact_source"];
 const indexNames = [
  "receipt_allocation_fact_command_pkey", "receipt_allocation_fact_command_tenant_id_job_id_command_id_key",
  "receipt_allocation_fact_line_pkey", "receipt_allocation_fact_line_tenant_id_job_id_id_key", "receipt_allocation_fact_line_tenant_id_source_id_line_id_key",
  "receipt_allocation_fact_review_pkey", "receipt_allocation_fact_review_tenant_id_command_id_key", "receipt_allocation_fact_review_tenant_id_job_id_id_key",
  "receipt_allocation_fact_revis_tenant_id_job_id_id_payment_i_key", "receipt_allocation_fact_revision_pkey", "receipt_allocation_fact_revision_tenant_id_command_id_key",
  "receipt_allocation_fact_revision_tenant_id_job_id_id_key", "receipt_allocation_fact_revision_tenant_id_review_id_key",
  "receipt_allocation_fact_sourc_tenant_id_allocation_revision_key", "receipt_allocation_fact_sourc_tenant_id_job_id_id_invoice_i_key",
  "receipt_allocation_fact_source_pkey", "receipt_allocation_fact_source_tenant_id_job_id_id_key", "receipt_allocation_one_receipt_interpretation"];
 const routineIdentities = [
  ["assert_receipt_fact_bound", "parts jsonb, limit_n numeric, limit_d numeric"], ["assert_receipt_fact_scope", "p_tenant uuid, p_job uuid, p_session_digest text"],
  ["guard_receipt_fact_line", ""], ["read_receipt_allocation_facts", "p_tenant uuid, p_job uuid, p_session_digest text, p_selector jsonb, p_expected jsonb"],
  ["receipt_fact_projection_safe", "p jsonb"], ["write_receipt_allocation_facts", "p_tenant uuid, p_job uuid, p_session_digest text, p_command jsonb, p_artifact jsonb"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "receipt_fact_tenant"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
// ENT-9C (0296): exactly two owner-only historical tables and three checked routines.
async function baselineAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["enterprise_baseline_batch", "enterprise_baseline_team"];
 const identities = [
  ["enterprise_baseline_actor", "p_session uuid"],
  ["enterprise_baseline_import", "p_session uuid, p_history text, p_hash text, p_bindings jsonb"],
  ["enterprise_baseline_read", "p_session uuid, p_batch uuid"],
 ];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...identities].sort());
 const privileges = (await f.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
  has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
  has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
  EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public
  FROM pg_proc p WHERE p.oid=ANY(ARRAY['app.enterprise_baseline_actor(uuid)'::regprocedure,
   'app.enterprise_baseline_import(uuid,text,text,jsonb)'::regprocedure,'app.enterprise_baseline_read(uuid,uuid)'::regprocedure]) ORDER BY p.proname`)).rows;
 expect(privileges).toEqual(identities.map(([proname]) => ({ proname, owner: "jobguard_migration", prosecdef: true,
  proconfig: ["search_path=pg_catalog"], runtime: proname !== "enterprise_baseline_actor", infrastructure: false, public: false })));
 const indexes = (await f.admin.query(`SELECT t.relname table_name,i.relname,x.indisunique,
  ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY k(attnum,n)
   JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum ORDER BY k.n) columns
  FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='app' AND t.relname=ANY($1::text[])`, [tables])).rows;
 expect(indexes.map(r => [r.table_name, r.indisunique, r.columns]).sort()).toEqual([
  [tables[0], true, ["tenant_id", "id"]], [tables[0], true, ["tenant_id", "source_namespace", "source_batch_id"]],
  [tables[1], true, ["tenant_id", "batch_id", "source_team_id"]], [tables[1], true, ["tenant_id", "batch_id", "team_id"]],
 ].sort());
 const names = [...tables, ...indexes.map(r => r.relname)];
 const relations = after.relations.filter(r => r.nspname === "app" && names.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...names].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 const policyRows = await Promise.all(policies.map(async p => [p.tablename, p.policyname,
  (await f.admin.query("SELECT $1::name[]::text[] roles", [p.roles])).rows[0].roles, p.cmd]));
 expect(policyRows.sort()).toEqual(tables.map(t => [t, "tenant_isolation", ["jobguard_migration"], "ALL"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
// Rulings 104(b) and 113: only objects created by 0188, the LATER-B14 0193 routines and MON-3-P-A's trial-claim migration may extend the snapshot.
// Ruling 113 also extends it to ENT-8A-P's own live-prompt objects (livePromptAdditions).
// Existing rows, routine privileges, relations and policies still compare in full.
async function with0188And0192Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const livePrompt = await livePromptAdditions(before, after);
 const admission = await trialAdmissionAdditions(before, after);
 const finalCheck = await finalCheckAdditions(before, after);
 const eligibility = after.routines.filter(r => r.nspname === "app" && r.proname === "mon3_read_eligibility");
 expect(eligibility.map(r => r.proname)).toEqual(["mon3_read_eligibility"]);
 expect(before.routines.some(r => r.nspname === "app" && r.proname === "mon3_read_eligibility")).toBe(false);
 const receiptFacts = await receiptFactAdditions(before, after);
 const baseline = await baselineAdditions(before, after);
 const enterpriseFee = await enterpriseFeeAdditions(before, after);
 const enterpriseStatement = await enterpriseStatementAdditions(before, after);
 const enterprisePosting = await enterprisePostingAdditions(before, after);
 const enterpriseReconciliation = await enterpriseReconciliationAdditions(before, after);
 const tables = ["practice_supplier_credit_case_binding", "practice_supplier_credit_review_payment", "trial_identity_key_claim", "trial_identity_snapshot"];
 const routineNames = ["claim_trial_identity_keys", "pf1b_pin_time", "pf1b_require_side_effect", "pf1b_review_supplier_credit", "pf1b_source_bundle", "pf1b_validate_side", "trial_identity_claim_on_insert"];
 const routines = after.routines.filter(r => r.nspname === "app" && routineNames.includes(r.proname));
 expect(routines.map(r => r.proname).sort()).toEqual(routineNames);
 // Ruling 113: 0193 adds only these three routines to the captured catalogues.
 // Its two triggers are not relations, and it creates no tables, indexes or policies.
 const routine0193Identities = [
  ["decision_check_command", "p_digest text, p_command jsonb, p_phase text, p_data jsonb"],
  ["guard_decision_check_receipt", ""],
  ["require_completed_decision_check", ""],
 ];
 const routines0193 = after.routines.filter(r => r.nspname === "app" && routine0193Identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines0193.map(r => [r.proname, r.args])).toEqual(routine0193Identities);
 for (const r of routines0193) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname)).toBe(false);
 // Index identity is bound to the four exact new tables, not a name-prefix exemption.
 const indexRows = (await f.admin.query(`SELECT t.relname table_name,i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows;
 expect(indexRows.filter(r => tables.slice(0, 2).includes(r.table_name))).toHaveLength(5); // 0188 unchanged
 expect(indexRows.filter(r => r.table_name === "trial_identity_snapshot")).toHaveLength(4); // PK + three UNIQUEs
 expect(indexRows.filter(r => r.table_name === "trial_identity_key_claim")).toHaveLength(1); // PK
 const indexes = indexRows.map(r => r.relname);
 const relationNames = [...tables, ...indexes];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname])).toEqual(tables.map(t => [t, "tenant_isolation"]));
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 // Insert only the named new rows at their server-sort positions. This preserves every
 // pre-existing expected row verbatim and avoids host-dependent JS/SQL collation.
 const subscription = await subscriptionAdditions(before, after);
 const billing = await billingAdditions(before, after);
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  const expected = [...old];
  for (const row of [...added].sort((a, b) => live.indexOf(a) - live.indexOf(b))) expected.splice(live.indexOf(row), 0, row);
  return expected;
 };
 return {
  rows: { ...before.rows, ...admission.rows, ...subscription.rows, ...livePrompt.rows, ...finalCheck.rows, ...billing.rows, ...receiptFacts.rows, ...baseline.rows, ...enterpriseFee.rows, ...enterpriseStatement.rows, ...enterprisePosting.rows, ...enterpriseReconciliation.rows, "app.practice_supplier_credit_case_binding": [], "app.practice_supplier_credit_review_payment": [], "app.trial_identity_key_claim": [], "app.trial_identity_snapshot": [] },
  routines: additive(before.routines, [...after.routines.filter(r => routines.includes(r) || routines0193.includes(r)), ...admission.routines, ...subscription.routines, ...livePrompt.routines, ...finalCheck.routines, ...billing.routines, ...receiptFacts.routines, ...baseline.routines, ...enterpriseFee.routines, ...enterpriseStatement.routines, ...enterprisePosting.routines, ...enterpriseReconciliation.routines, ...eligibility], after.routines),
  relations: additive(before.relations, [...relations, ...admission.relations, ...subscription.relations, ...livePrompt.relations, ...finalCheck.relations, ...billing.relations, ...receiptFacts.relations, ...baseline.relations, ...enterpriseFee.relations, ...enterpriseStatement.relations, ...enterprisePosting.relations, ...enterpriseReconciliation.relations], after.relations),
  policies: additive(before.policies, [...policies, ...admission.policies, ...subscription.policies, ...livePrompt.policies, ...finalCheck.policies, ...billing.policies, ...receiptFacts.policies, ...baseline.policies, ...enterpriseFee.policies, ...enterpriseStatement.policies, ...enterprisePosting.policies, ...enterpriseReconciliation.policies], after.policies),
 };
}
// Standing ruling 113: additive expectations for ENT-10-OIDC-B objects only.
async function withOidcAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const names = ["oidc_claim", "oidc_complete", "oidc_create", "oidc_fail", "oidc_link", "oidc_save"];
 const routines = after.routines.filter(r => r.nspname === "identity" && names.includes(r.proname));
 expect(routines.map(r => r.proname)).toEqual(names);
 const relations = after.relations.filter(r => r.nspname === "identity" && ["oidc_assertion_use", "oidc_assertion_use_pkey", "oidc_assertion_use_tenant_id_connection_id_request_id_key", "oidc_request", "oidc_request_pkey"].includes(r.relname));
 expect(relations.map(r => r.relname)).toEqual(["oidc_assertion_use", "oidc_assertion_use_pkey", "oidc_assertion_use_tenant_id_connection_id_request_id_key", "oidc_request", "oidc_request_pkey"]);
 const policies = after.policies.filter(p => p.schemaname === "identity" && (["oidc_request", "oidc_assertion_use"].includes(p.tablename) || (p.tablename === "sso_connection" && p.policyname === "oidc_hide_from_saml_view")));
 expect(policies.map(p => p.policyname)).toEqual(["tenant_isolation", "tenant_isolation", "oidc_hide_from_saml_view"]);
 expect(before.rows).not.toHaveProperty("identity.oidc_request");
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname)).toBe(false);
 const additive = <T>(old:T[], added:T[], live:T[]):T[] => { const expected=[...old]; for(const row of added)expected.splice(live.indexOf(row),0,row);return expected; };
 return { rows:{...before.rows,"identity.oidc_request":[],"identity.oidc_assertion_use":[]}, routines:additive(before.routines,routines,after.routines), relations:additive(before.relations,relations,after.relations), policies:additive(before.policies,policies,after.policies) };
}
// Ruling 113: additive allowance for exactly the objects created by ENT-8A-P's live-prompt migration.
// The replaced ent4b_origin_provenance routine is NOT an addition: its existing
// catalogue row (including owner, grants and configuration) still compares in full.
async function livePromptAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = [
  "extra_prompt_rule_settings",
  "extra_prompt",
  "extra_prompt_citation",
  "prompt_resolution",
  "materials_issue_fact",
  "extra_completion_observation",
  "extra_office_prompt_signal"
];
 const indexNames = [
  "extra_prompt_rule_settings_pkey",
  "extra_prompt_rule_settings_tenant_id_client_contract_versio_key",
  "extra_prompt_pkey",
  "extra_prompt_tenant_id_job_id_id_key",
  "extra_prompt_tenant_id_job_id_coalescing_key_key",
  "extra_prompt_citation_pkey",
  "extra_prompt_citation_tenant_id_job_id_id_key",
  "extra_prompt_citation_tenant_id_prompt_id_source_kind_sourc_key",
  "prompt_resolution_pkey",
  "prompt_resolution_tenant_id_job_id_id_key",
  "prompt_resolution_tenant_id_prompt_id_key",
  "prompt_resolution_tenant_id_command_id_key",
  "materials_issue_fact_pkey",
  "materials_issue_fact_tenant_id_job_id_id_key",
  "materials_issue_fact_tenant_id_source_id_event_id_key",
  "extra_completion_observation_pkey",
  "extra_completion_observation_tenant_id_job_id_id_key",
  "extra_completion_observation_tenant_id_command_id_key",
  "extra_office_prompt_signal_pkey",
  "extra_office_prompt_signal_tenant_id_job_id_id_key",
  "extra_office_prompt_signal_tenant_id_prompt_id_variation_id_key"
];
 const routineIdentities = [
  ["lp_authority", "p_session uuid, p_job uuid, p_action text"],
  ["lp_surface", "p_job uuid, p_command uuid, p_rule text, p_key text, p_work text, p_sources jsonb, p_settings uuid"],
  ["lp_png_completion_tags", "p_bytes bytea"],
  ["lp_evaluate", "p_job uuid, p_command uuid"],
  ["lp_read", "p_session uuid, p_input jsonb"],
  ["lp_citations_valid", "p_job uuid, p_prompt uuid"],
  ["lp_command", "p_session uuid, p_input jsonb, p_source_bytes bytea"],
  ["lp_span_valid", "p_text text, p_locator jsonb"],
  ["lp_finish", "p_session uuid, p_command uuid, p_result jsonb"],
  ["lp_visit_evaluate", "p_actor uuid, p_job uuid, p_command uuid"],
  ["lp_require_audit", ""],
  ["lp_office_advisory", ""],
  ["lp_sources", "p_session uuid, p_job uuid"],
  ["lp_observation_prompt", "p_session uuid, p_job uuid, p_observation uuid"],
  ["lp_receipt_immutable", ""]
];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename) && p.policyname === "tenant_isolation");
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 return {
  rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])),
  routines,
  relations,
  policies,
 };
}

// Standing ruling 113: extend only MON-8-P-A's exact newly created objects (layered on the expected snapshot above).
async function contractorAgreementAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const table = "contractor_agreement_status_revision";
 const names = ["mon8_agreement_status_guard", "mon8_contractor_agreement_context"];
 const routines = after.routines.filter(r => r.nspname === "app" && names.includes(r.proname));
 expect(routines.map(r => r.proname).sort()).toEqual(names);
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
 JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='app' AND t.relname=$1 ORDER BY i.relname`, [table])).rows.map(r => r.relname);
 expect(indexes).toHaveLength(2);
 const relations = after.relations.filter(r => r.nspname === "app" && [table, ...indexes].includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([table, ...indexes].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && p.tablename === table);
 expect(policies.map(p => p.policyname)).toEqual(["tenant_isolation"]);
 expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  // Earlier additions were inserted using the final catalogue's positions. Order
  // the complete expected set at those positions, retaining every prior value.
  const position = (row: T) => live.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
  return [...old, ...added].sort((a, b) => position(a) - position(b));
 };
 return { rows: { ...before.rows, [`app.${table}`]: [] }, routines: additive(before.routines, routines, after.routines),
  relations: additive(before.relations, relations, after.relations), policies: additive(before.policies, policies, after.policies) };
}
// SV6-PERSIST-A / C253: exactly 0260 additions. No predecessor exclusion or wildcard.
async function attributionAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["recovery_attribution_revision","recovery_attribution_command","recovery_attribution_reassessment"];
 const indexNames=["recovery_attribution_revision_pkey","ra_revision_subject_revision","ra_revision_subject_id","recovery_attribution_command_pkey","recovery_attribution_reassessment_pkey"];
 const routineIdentities=[
  ["recovery_attribution_immutable",""],
  // SV-6 / 0340: exact private resolver identity, with no new access allowance.
  ["recovery_attribution_sources","t uuid, j uuid, p jsonb, actor uuid"],
  ["append_recovery_attribution","p_document jsonb, p_actor uuid, p_command jsonb, p_cause text, p_source text"],
  ["assess_recovery_attribution","p_job uuid, p_session text, p_command jsonb"],
  // M4-9-S / 0302: exact additive routine identities, no table/row allowance.
  ["read_success_fee_v3","p_job uuid, p_session text"],
  ["write_success_fee_v3","p_job uuid, p_session text, p_command jsonb, p_artifact jsonb"],
 ];
 const routines=after.routines.filter(r=>r.nspname==="app"&&routineIdentities.some(([name,args])=>r.proname===name&&r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...routineIdentities].sort());
 const resolver=routines.find(r=>r.proname==="recovery_attribution_sources");
 expect(resolver).toMatchObject({prosecdef:false,proacl:"{jobguard_migration=X/jobguard_migration}",proconfig:["search_path=pg_catalog, app","TimeZone=UTC"]});
 expect((await f.admin.query("SELECT pg_get_userbyid($1::oid) owner",[resolver!.proowner])).rows).toEqual([{owner:"jobguard_migration"}]);
 const indexes=(await f.admin.query("SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname",[tables])).rows.map(r=>r.relname);
 expect(indexes).toEqual([...indexNames].sort());
 const names=[...tables,...indexNames];
 const relations=after.relations.filter(r=>r.nspname==="app"&&names.includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...names].sort());
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.flatMap(t=>[[t,"tenant_isolation"],[t,"attribution_read"]]).sort());
 for(const t of tables)expect(Object.keys(before.rows)).not.toContain('app.'+t);
 for(const r of relations)expect(before.relations.some(b=>b.nspname===r.nspname&&b.relname===r.relname)).toBe(false);
 for(const r of routines)expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>['app.'+t,[]]))},
  routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
// Per C135 (SV-5): exact additions created by the separable final-check persistence migration (0205), layered on the expected snapshot above.
async function separableFinalCheckAdditions(prior: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const tables = ["final_check_disposition_binding", "final_check_processing_source", "final_check_reveal_proof", "final_check_run_binding", "final_check_source_attempt"];
 const indexNames = ["final_check_classification_job_identity", "final_check_disposition_binding_pkey", "final_check_disposition_binding_tenant_id_command_id_key", "final_check_disposition_binding_tenant_id_job_id_signal_id_key",
  "final_check_disposition_job_identity", "final_check_processing_source_pkey", "final_check_processing_source_identity", "final_check_reveal_proof_pkey", "final_check_run_binding_pkey",
  "final_check_run_binding_tenant_id_job_id_manifest_id_key", "final_check_run_binding_tenant_id_job_id_run_id_lock_id_key", "final_check_source_attempt_pkey", "final_check_source_attempt_tenant_id_job_id_manifest_id_sou_key"];
 const routineIdentities = [["append_final_check_audit", "e uuid, actor text, j uuid, k text, refs jsonb"], ["begin_final_check", "t uuid, j uuid, detector text, policy text"], ["complete_final_check", "t uuid, j uuid, m uuid, p jsonb"],
  ["final_check_builder", "t uuid, j uuid, d text, locking boolean"], ["final_check_context", "t uuid"], ["final_check_freeze_processing_inventory", ""], ["final_check_guard_fact", ""], ["final_check_guard_manifest", ""], ["final_check_post_lock_link", ""], ["final_check_refuse_held_case", ""],
  ["final_check_worker", "t uuid, j uuid"], ["read_final_check_disputes", "t uuid, j uuid, d text"], ["read_final_check_manifest", "t uuid, j uuid, m uuid"], ["read_final_check_reveal", "t uuid, j uuid, d text"],
  ["record_final_check_disposition", "t uuid, j uuid, d text, p jsonb"], ["record_final_check_source_result", "t uuid, j uuid, m uuid, s uuid, attempt uuid, p jsonb"]];
 const routines = after.routines.filter(r => r.nspname === "app" && routineIdentities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args]).sort()).toEqual([...routineIdentities].sort());
 const relationNames = [...tables, ...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(prior.rows)).not.toContain(`app.${table}`);
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  const position = (row: T) => live.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
  return [...old, ...added].sort((a, b) => position(a) - position(b));
 };
 return { rows: { ...prior.rows, ...Object.fromEntries(tables.map(t => [`app.${t}`, []])) }, routines: additive(prior.routines, routines, after.routines),
  relations: additive(prior.relations, relations, after.relations), policies: additive(prior.policies, policies, after.policies) };
}
// CH-4-C / ruling 113: 0201 creates eight routines and no tables, indexes or policies.
// Replaced routines retain their complete predecessor catalogue rows in the comparison.
async function workStateCommandAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const identities = [
  ["ch4_admit_place", "t uuid, j uuid, action text"],
  ["ch4_command_work_facts", "t uuid, j uuid, digest text"],
  ["ch4_legacy_command_owned", "t uuid, cid uuid"],
  ["ch4_link_post_lock_job", "t uuid, j uuid, digest text, input jsonb"],
  ["ch4_record_work_state", "t uuid, j uuid, digest text, input jsonb"],
  ["ch4_require_command_owner", "t uuid, j uuid, digest text"],
  ["ch4_require_open", "t uuid, j uuid"],
  ["ch4_work_state_command", "t uuid, j uuid, digest text, input jsonb"],
 ];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args])).toEqual(identities);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return { ...before, routines: [...before.routines, ...routines].sort((a, b) => position(a) - position(b)) };
}
// SV-7A (0303): only the intake and authorized SHARE-lock routines, migration-owned, definer, runtime EXECUTE only.
async function sourceIntakeAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const identities = [["sv7a_intake_job_source", "t uuid, j uuid, digest text, source text, input jsonb"], ["sv7a_require_watchdog_live_lock", "t uuid, j uuid, digest text"]];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args])).toEqual(identities);
 for (const r of routines) expect(r).toMatchObject({ prosecdef: true, proacl: "{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}", proconfig: ["search_path=pg_catalog"] });
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return { ...before, routines: [...before.routines, ...routines].sort((a, b) => position(a) - position(b)) };
}
// Dispatcher-assigned catalogue rows: only objects created by 0208.
async function smallTripAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const tables = ["job_small_trip_event", "job_small_trip_observation"];
 const routines = after.routines.filter(r => r.nspname === "app" && r.proname === "mon1_capture_small_trip"
  && r.args === "t uuid, j uuid, source_kind text, source_id uuid");
 expect(routines).toHaveLength(1);
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
 JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect(indexes).toHaveLength(7); // two primary keys and five UNIQUE constraints in 0208
 const relations = after.relations.filter(r => r.nspname === "app" && [...tables, ...indexes].includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...tables, ...indexes].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.flatMap(t =>
  [[t, "meter_lifecycle_source_read"], [t, "tenant_isolation"]]).sort());
 for (const t of tables) expect(Object.keys(before.rows)).not.toContain(`app.${t}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  const position = (row: T) => live.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
  return [...old, ...added].sort((a, b) => position(a) - position(b));
 };
 return { rows: { ...before.rows, ...Object.fromEntries(tables.map(t => [`app.${t}`, []])) },
  routines: additive(before.routines, routines, after.routines),
  relations: additive(before.relations, relations, after.relations), policies: additive(before.policies, policies, after.policies) };
}
// 0209 exact additions, including source grants/policies. This fixture migrates
// only: lifecycle routines remain invokers until the administrative finalizer.
async function lifecycleSourceAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const tables = ["meter_lifecycle_scope", "meter_lifecycle_source", "meter_lifecycle_source_ref", "meter_lifecycle_computation",
  "meter_lifecycle_day_ledger", "meter_lifecycle_place_binding", "meter_lifecycle_correction", "meter_lifecycle_alert"];
 const indexNames = [...tables.map(t => `${t}_pkey`), "meter_lifecycle_scope_tenant_id_kind_key",
  "meter_lifecycle_source_tenant_id_scope_id_command_id_key", "meter_lifecycle_source_tenant_id_scope_id_period_start_revi_key",
  // 0300 replaces the source-only UNIQUE with source + recipe, preserving both projections.
  "meter_lifecycle_computation_tenant_id_scope_id_source_id_re_key"];
 const identities = [
  ["mon1_counted_meter_today", "t uuid, digest text"],
  ["mon1_lifecycle_actor", "t uuid, digest text, mutation boolean"],
  ["mon1_lifecycle_capture", "t uuid, digest text, command uuid, start_day date, expected integer"],
  ["mon1_lifecycle_read", "t uuid, digest text, computation uuid"],
  ["mon1_lifecycle_rebuild", "t uuid, digest text, p_source uuid"],
 ];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args])).toEqual(identities);
 const role = (await f.admin.query(`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls
  FROM pg_roles WHERE rolname='jobguard_meter'`)).rows;
 expect(role).toEqual([{ rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
  rolinherit: false, rolreplication: false, rolbypassrls: false }]);
 const owner = (await f.admin.query("SELECT oid FROM pg_roles WHERE rolname='jobguard_migration'")).rows[0].oid;
 const aclItems = async (acl: unknown) => (await f.admin.query("SELECT $1::aclitem[]::text[] acl", [acl])).rows[0].acl as string[];
 for (const r of routines) {
  expect(r.proowner).toBe(owner);
  expect(r.prosecdef).toBe(false);
  expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  expect((await aclItems(r.proacl)).sort()).toEqual(["jobguard_migration=X/jobguard_migration",
   `${r.proname === "mon1_lifecycle_actor" ? "jobguard_meter" : "jobguard_runtime"}=X/jobguard_migration`].sort());
 }
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
 JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort()); // eight primary keys and four UNIQUE constraints in 0209
 const relations = after.relations.filter(r => r.nspname === "app" && [...tables, ...indexes].includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...tables, ...indexNames].sort());
 for (const r of relations) {
  expect(r.relowner).toBe(owner);
  if (tables.includes(r.relname)) {
   expect(r.relrowsecurity).toBe(true);
   expect(r.relforcerowsecurity).toBe(true);
   const privileges = r.relname === "meter_lifecycle_place_binding" || r.relname === "meter_lifecycle_correction" ? "r" : "ar";
   expect((await aclItems(r.relacl)).sort()).toEqual(["jobguard_migration=arwdDxt/jobguard_migration", `jobguard_meter=${privileges}/jobguard_migration`,
    ...(privileges === "ar" ? ["jobguard_meter_owner=ar/jobguard_migration"] : [])].sort());
  }
 }
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
 for (const p of policies) {
  expect((await f.admin.query("SELECT $1::name[]::text[] roles", [p.roles])).rows[0].roles.sort()).toEqual(["jobguard_meter", "jobguard_meter_owner", "jobguard_migration"]);
  expect(p.permissive).toBe("PERMISSIVE");
  expect(p.cmd).toBe("ALL");
  expect(p.qual).toBe("(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)");
  expect(p.with_check).toBe(p.qual);
 }
 // Source rows already captured by the subscription/trip additions above
 // must match these exact grants too. All other predecessor ACLs gain only r.
 const sourceTables = ["membership", "subscription_agreement_revision", "job_activation", "job_activation_terms", "job", "job_party_binding", "job_work_state_event", "final_account_lock", "job_small_trip_event", "job_small_trip_observation", "job_link"];
 const laterSources = ["subscription_agreement_revision", "job_small_trip_event", "job_small_trip_observation"];
 const expectedRelations = await Promise.all(before.relations.map(async r => {
  if (r.nspname !== "app" || !sourceTables.includes(r.relname)) return r;
  const base = laterSources.includes(r.relname)
   ? ["jobguard_migration=arwdDxt/jobguard_migration", ...(r.relname === "subscription_agreement_revision" ? [] : ["jobguard_runtime=r/jobguard_migration"])]
   : (await f.admin.query("SELECT coalesce($1::aclitem[],acldefault('r',$2::oid))::text[] acl", [r.relacl,r.relowner])).rows[0].acl as string[];
  expect(base).not.toContain("jobguard_meter_owner=r/jobguard_migration");
  const relacl = (await f.admin.query("SELECT $1::text[]::aclitem[] acl", [[...base,"jobguard_meter_owner=r/jobguard_migration"]])).rows[0].acl;
  return { ...r, relacl };
 }));
 expect(expectedRelations.filter(r => r.nspname === "app" && sourceTables.includes(r.relname))).toHaveLength(11);
 const expectedRoutines = await Promise.all(before.routines.map(async r => {
  if (r.nspname !== "app" || r.proname !== "mon1_company_actor" || r.args !== "t uuid, digest text") return r;
  expect(await aclItems(r.proacl)).toEqual(["jobguard_migration=X/jobguard_migration"]);
  const proacl = (await f.admin.query("SELECT $1::text[]::aclitem[] acl", [["jobguard_migration=X/jobguard_migration","jobguard_meter_owner=X/jobguard_migration"]])).rows[0].acl;
  return { ...r, proacl };
 }));
 expect(expectedRoutines.filter(r => r.nspname === "app" && r.proname === "mon1_company_actor" && r.args === "t uuid, digest text")).toHaveLength(1);
 const sourcePolicies = after.policies.filter(p => p.schemaname === "app" && sourceTables.includes(p.tablename) && p.policyname === "meter_lifecycle_source_read");
 expect(sourcePolicies.map(p => p.tablename).sort()).toEqual([...sourceTables].sort());
 for (const p of sourcePolicies) {
  expect((await f.admin.query("SELECT $1::name[]::text[] roles", [p.roles])).rows[0].roles).toEqual(["jobguard_meter_owner"]);
  expect(p.permissive).toBe("PERMISSIVE");
  expect(p.cmd).toBe("SELECT");
  expect(p.qual).toBe("(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)");
  expect(p.with_check).toBeNull();
 }
 const newSourcePolicies = sourcePolicies.filter(p => !laterSources.includes(p.tablename));
 expect(before.policies.filter(p => p.schemaname === "app" && laterSources.includes(p.tablename) && p.policyname === "meter_lifecycle_source_read")).toEqual(sourcePolicies.filter(p => laterSources.includes(p.tablename)));
 for (const p of newSourcePolicies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 for (const t of tables) expect(Object.keys(before.rows)).not.toContain(`app.${t}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  const position = (row: T) => live.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
  return [...old, ...added].sort((a, b) => position(a) - position(b));
 };
 return { rows: { ...before.rows, ...Object.fromEntries(tables.map(t => [`app.${t}`, []])) },
  routines: additive(expectedRoutines, routines, after.routines),
  relations: additive(expectedRelations, relations, after.relations), policies: additive(before.policies, [...policies, ...newSourcePolicies], after.policies) };
}
// Dispatcher-assigned catalogue row: 0244 creates only this private routine.
async function placeAdmissionAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const routines = after.routines.filter(r => r.nspname === "app" && r.proname === "mon1_admit_place"
  && r.args === "t uuid, j uuid, source_kind text, source_id uuid");
 expect(routines).toHaveLength(1);
 const owner = (await f.admin.query("SELECT oid FROM pg_roles WHERE rolname='jobguard_migration'")).rows[0].oid;
 for (const r of routines) {
  expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
  expect(r.proowner).toBe(owner);
  expect(r.prosecdef).toBe(false);
  expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  const acl = (await f.admin.query("SELECT $1::aclitem[]::text[] acl", [r.proacl])).rows[0].acl;
  expect(acl).toEqual(["jobguard_migration=X/jobguard_migration"]);
 }
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return { ...before, routines: [...before.routines, ...routines].sort((a, b) => position(a) - position(b)) };
}
// Dispatcher-assigned catalogue row: 0361 creates only this private refusal routine.
async function jobImportV3Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const routines = after.routines.filter(r => r.nspname === "app" && r.proname === "adopt_in_flight_job_v3"
  && r.args === "t uuid, source_job_id uuid, session_digest text, command_id uuid, authorization_id uuid, snapshot jsonb");
 expect(routines).toHaveLength(1);
 const owner = (await f.admin.query("SELECT oid FROM pg_roles WHERE rolname='jobguard_migration'")).rows[0].oid;
 for (const r of routines) {
  expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
  expect(r.proowner).toBe(owner);
  expect(r.prosecdef).toBe(true);
  expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  const acl = (await f.admin.query("SELECT $1::aclitem[]::text[] acl", [r.proacl])).rows[0].acl;
  expect(acl).toEqual(["jobguard_migration=X/jobguard_migration"]);
 }
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return { ...before, routines: [...before.routines, ...routines].sort((a, b) => position(a) - position(b)) };
}
// Standing ruling 113: only this exact new read-only signature extends the snapshot.
async function with0200Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const additions=after.routines.filter(r=>r.nspname==="app" && r.proname==="mon8_retained_contractor_workspace" && r.args==="s uuid, q jsonb");
 expect(additions).toHaveLength(1);
 expect(before.routines.some(r=>r.nspname==="app" && r.proname==="mon8_retained_contractor_workspace")).toBe(false);
 expect(additions[0]).toMatchObject({prosecdef:true,proconfig:["search_path=pg_catalog"]});
 const grants=(await f.admin.query(`SELECT pg_get_userbyid(p.proowner) owner,
 ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE' ORDER BY 1) executors
 FROM pg_proc p WHERE p.oid='app.mon8_retained_contractor_workspace(uuid,jsonb)'::regprocedure`)).rows;
 expect(grants).toEqual([{owner:"jobguard_migration",executors:["jobguard_migration","jobguard_runtime"]}]);
 const position=(row:unknown)=>after.routines.findIndex(r=>JSON.stringify(r)===JSON.stringify(row));
 return {...before,routines:[...before.routines,...additions].sort((a,b)=>position(a)-position(b))};
}
// C248/C249: one added guard; C238 retains its exact identity and privileges.
// SV-5 catch/readers (0281–0283, 0295): five catch routines and the private practice-source predicate;
// their table, triggers and constraint sit outside this snapshot.
async function catchAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const identities = [["confirm_final_check_catch", "t uuid, j uuid, d text, p jsonb"], ["final_check_claim_catch_case", ""], ["final_check_open_catch_case", ""],
  ["final_check_refuse_catch_claim", ""], ["request_final_check_run", "t uuid, j uuid, d text"],
  ["final_check_practice_source_current", "s app.final_check_processing_source"]];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines).toHaveLength(identities.length);
 const helper = routines.find(r => r.proname === "final_check_practice_source_current");
 expect(helper).toMatchObject({prosecdef:true,proconfig:["search_path=pg_catalog, app"]});
 const helperAcl = (await f.admin.query(`SELECT pg_get_userbyid(p.proowner) owner,
  ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE' ORDER BY 1) executors
  FROM pg_proc p WHERE p.oid='app.final_check_practice_source_current(app.final_check_processing_source)'::regprocedure`)).rows;
 expect(helperAcl).toEqual([{owner:"jobguard_migration",executors:["jobguard_migration"]}]);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return { ...before, routines: [...before.routines, ...routines].sort((a, b) => position(a) - position(b)) };
}
// DEMO-I: exactly the private lifecycle objects installed by 0313; no extra grants.
async function demoRunAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["small_builder_demo_run","small_builder_demo_receipt","small_builder_demo_report"];
 const indexes=["small_builder_demo_run_pkey","small_builder_demo_run_tenant_id_predecessor_id_key","small_builder_demo_receipt_pkey","small_builder_demo_report_pkey"];
 const identities=[
  ["small_builder_demo","t uuid, digest text, operation text, run uuid, v jsonb"],
  ["small_builder_demo_audit","t uuid, actor uuid, command uuid, kind text, hash text, result_hash text"],
  ["small_builder_demo_guard",""],
 ];
 const routines=after.routines.filter(r=>r.nspname==="app"&&identities.some(([name,args])=>r.proname===name&&r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...identities].sort());
 const acl=(await f.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
  ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE' ORDER BY 1) executors
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.proname`,[identities.map(([name])=>name)])).rows;
 expect(acl).toEqual(identities.map(([name])=>({proname:name,owner:"jobguard_migration",prosecdef:name==="small_builder_demo",proconfig:["search_path=pg_catalog"],executors:name==="small_builder_demo"?["jobguard_migration","jobguard_runtime"]:["jobguard_migration"]})));
 const installedIndexes=(await f.admin.query("SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname",[tables])).rows.map(r=>r.relname);
 expect(installedIndexes).toEqual([...indexes].sort());
 const relations=after.relations.filter(r=>r.nspname==="app"&&[...tables,...indexes].includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...tables,...indexes].sort());
 const tableAcl=(await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,
  EXISTS(SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee<>c.relowner) non_owner_grants
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[tables])).rows;
 expect(tableAcl).toEqual([...tables].sort().map(relname=>({relname,owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true,non_owner_grants:false})));
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 const policyRows=await Promise.all(policies.map(async p=>[p.tablename,p.policyname,
  (await f.admin.query("SELECT $1::name[]::text[] roles",[p.roles])).rows[0].roles]));
 expect(policyRows.sort()).toEqual(tables.map(t=>[t,"tenant_scope",["jobguard_migration"]]).sort());
 for(const t of tables)expect(Object.keys(before.rows)).not.toContain(`app.${t}`);
 for(const r of relations)expect(before.relations.some(b=>b.nspname===r.nspname&&b.relname===r.relname)).toBe(false);
 for(const r of routines)expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},
  routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
async function with0245Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const additions=after.routines.filter(r=>r.nspname==='app' && r.proname==='guard_post_lock_upload_transition' && r.args==='');
 expect(additions).toHaveLength(1);
 expect(before.routines.some(r=>r.nspname==='app' && r.proname==='guard_post_lock_upload_transition')).toBe(false);
 expect(additions[0]).toMatchObject({prosecdef:true,proconfig:['search_path=pg_catalog, app']});
 const guards=(await f.admin.query(`SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='app.evidence_upload'::regclass
  AND tgfoid='app.guard_post_lock_upload_transition()'::regprocedure ORDER BY tgname`)).rows;
 expect(guards).toEqual([{tgname:'b_final_check_upload_transition',tgenabled:'O'}]);
 const acl=(await f.admin.query(`SELECT pg_get_userbyid(p.proowner) owner,
  ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE' ORDER BY 1) executors
  FROM pg_proc p WHERE p.oid IN ('app.guard_post_lock_upload_transition()'::regprocedure,'app.serialize_final_check_evidence()'::regprocedure)`)).rows;
 expect(acl).toEqual(Array.from({length:2},()=>({owner:'jobguard_migration',executors:['jobguard_migration']})));
 const restated=(rows:typeof before.routines)=>rows.filter(r=>r.nspname==='app' && r.proname==='serialize_final_check_evidence' && r.args==='');
 expect(restated(before.routines)).toHaveLength(1);
 expect(restated(after.routines)).toEqual(restated(before.routines));
 const position=(row:unknown)=>after.routines.findIndex(r=>JSON.stringify(r)===JSON.stringify(row));
 return {...before,routines:[...before.routines,...additions].sort((a,b)=>position(a)-position(b))};
}
// CH-5 / 0362: exactly one immutable import aggregate, its policy and checked writer.
async function invoicedImportAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const relations = after.relations.filter(r => r.nspname === "app" && r.relname === "job_import_v3");
 const policies = after.policies.filter(r => r.schemaname === "app" && r.tablename === "job_import_v3");
 const routines = after.routines.filter(r => r.nspname === "app" && r.proname === "adopt_invoiced_job_v3"
  && r.args === "t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text");
 expect(relations).toHaveLength(1); expect(policies).toHaveLength(1); expect(routines).toHaveLength(1);
 expect(relations[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
 expect(policies[0]).toMatchObject({ policyname: "tenant_isolation", cmd: "ALL", permissive: "PERMISSIVE" });
 // pg returns name[] as a string; reuse the catalogue cast used above.
 const roles = (await f.admin.query("SELECT $1::name[]::text[] roles", [policies[0].roles])).rows[0].roles;
 expect(roles.sort()).toEqual(["jobguard_migration", "jobguard_runtime"]);
 expect(policies[0].qual).toBe("(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)");
 expect(policies[0].with_check).toBe(policies[0].qual);
 expect(routines[0]).toMatchObject({ prosecdef: true, proconfig: ["search_path=pg_catalog, app"] });
 expect((await f.admin.query(`SELECT pg_get_userbyid(p.proowner) owner,
 ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE' ORDER BY 1) executors
 FROM pg_proc p WHERE p.oid='app.adopt_invoiced_job_v3(uuid,uuid,text,uuid,uuid,jsonb,text)'::regprocedure`)).rows)
 .toEqual([{owner:"jobguard_migration",executors:["jobguard_migration","jobguard_runtime"]}]);
 expect(before.rows["app.job_import_v3"]).toBeUndefined(); expect(after.rows["app.job_import_v3"]).toEqual([]);
 // Primary/unique indexes have their own relation catalogue rows.
 const indexes = after.relations.filter(r => r.nspname === "app" && r.relname.startsWith("job_import_v3_"));
 expect(indexes).toHaveLength(5);
 const ordered = <T>(all: T[], rows: T[]) => rows.sort((a,b) => all.findIndex(x=>JSON.stringify(x)===JSON.stringify(a))-all.findIndex(x=>JSON.stringify(x)===JSON.stringify(b)));
 return {...before, rows:{...before.rows,"app.job_import_v3":[]},
  relations:ordered(after.relations,[...before.relations,...relations,...indexes]),
  policies:ordered(after.policies,[...before.policies,...policies]), routines:ordered(after.routines,[...before.routines,...routines])};
}
// M4-8-S part 2 (0335): exact additive money consumer. No predecessor
// routine/ACL/row is excluded from comparison. The legacy table gains one guard.
async function storedReceiptCaseAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["stored_receipt_case_binding","stored_receipt_case_command","stored_receipt_case_allocation"];
 const indexNames=["stored_receipt_case_binding_pkey","srcb_work","srcb_subject","stored_receipt_case_command_pkey","srcc_job","stored_receipt_case_allocation_pkey","srca_job","srca_fact","srca_command"];
 const identities=[["allocate_stored_receipt_line","t uuid, j uuid, d text, p jsonb"],["stored_receipt_case_facts","t uuid, j uuid, f uuid, c uuid, w uuid"],["guard_legacy_stored_receipt_cash",""],["receipt_fact_invoice_line","t uuid, j uuid, i uuid, l uuid, r uuid, k uuid, ch uuid"],["receipt_fact_watermark","t uuid, j uuid"],["receipt_fact_proposal","t uuid, j uuid, p jsonb"],["receipt_fact_source_approved","t uuid, j uuid, f uuid"]];
 const routines=after.routines.filter(r=>r.nspname==="app" && identities.some(([name,args])=>r.proname===name && r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...identities].sort());
 for(const r of routines) {
  expect(before.routines.some(b=>b.nspname===r.nspname && b.proname===r.proname && b.args===r.args)).toBe(false);
  expect(r.proconfig).toEqual(["search_path=pg_catalog, app"]);
  expect(r.prosecdef).toBe(["allocate_stored_receipt_line","guard_legacy_stored_receipt_cash"].includes(r.proname));
  const acl=(await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl;
  expect(acl.sort()).toEqual(["jobguard_migration=X/jobguard_migration",...(r.proname==="allocate_stored_receipt_line"?["jobguard_runtime=X/jobguard_migration"]:[])].sort());
 }
 const names=[...tables,...indexNames];
 const relations=after.relations.filter(r=>r.nspname==="app" && names.includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...names].sort());
 for(const r of relations) expect(before.relations.some(b=>b.nspname===r.nspname && b.relname===r.relname)).toBe(false);
 for(const table of tables) {
  expect(before.rows).not.toHaveProperty(`app.${table}`);
  expect(after.rows[`app.${table}`]).toEqual([]);
  const relation=relations.find(r=>r.relname===table)!;
  expect(relation.relrowsecurity).toBe(true);expect(relation.relforcerowsecurity).toBe(true);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[relation.relacl])).rows[0].acl).toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 }
 const policies=after.policies.filter(p=>p.schemaname==="app" && tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.map(t=>[t,"stored_receipt_tenant"]).sort());
 for(const policy of policies) expect((await f.admin.query("SELECT $1::name[]::text[] roles",[policy.roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const guards=(await f.admin.query("SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='app.recovery_case_allocation'::regclass AND tgfoid='app.guard_legacy_stored_receipt_cash()'::regprocedure")).rows;
 expect(guards).toEqual([{tgname:"stored_receipt_cash_guard",tgenabled:"O"}]);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
// M4-9-S: exact private catch ledger additions, no predecessor catalogue relaxed.
async function successFeeCatchAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["success_fee_command","success_fee_review","success_fee_derivation","success_fee_source","success_fee_journal","success_fee_journal_line"];
 const indexes=[
  "success_fee_command_pkey","success_fee_command_tenant_id_job_id_command_id_key",
  "success_fee_review_pkey","success_fee_review_tenant_id_job_id_id_key",
  "success_fee_derivation_pkey","success_fee_derivation_tenant_id_job_id_id_key",
  "success_fee_derivation_tenant_id_job_id_revision_key","success_fee_derivation_tenant_id_review_id_key",
  "success_fee_source_pkey","success_fee_journal_pkey","success_fee_journal_tenant_id_job_id_id_key",
  // 0489 replaces per-derivation uniqueness with positive/compensation uniqueness.
  "success_fee_positive_derivation","success_fee_compensation_original","success_fee_journal_line_pkey",
  "success_fee_source_tenant_id_derivation_id_allocation_id_key",
  "success_fee_source_tenant_id_derivation_id_recovery_allocat_key",
 ];
 const identities=["check_success_fee_journal","check_success_fee_derivation"];
 const routines=after.routines.filter(r=>r.nspname==="app"&&identities.includes(r.proname));
 expect(routines.map(r=>r.proname).sort()).toEqual([...identities].sort());
 for(const r of routines){
  expect(r.args).toBe("");expect(r.prosecdef).toBe(true);expect(r.proconfig).toEqual(["search_path=pg_catalog, app"]);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl).toEqual(["jobguard_migration=X/jobguard_migration"]);
  expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 }
 const names=[...tables,...indexes],relations=after.relations.filter(r=>r.nspname==="app"&&names.includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...names].sort());
 for(const table of tables){
  expect(before.rows).not.toHaveProperty(`app.${table}`);expect(after.rows[`app.${table}`]).toEqual([]);
  const r=relations.find(r=>r.relname===table)!;expect(r.relrowsecurity).toBe(true);expect(r.relforcerowsecurity).toBe(true);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.relacl])).rows[0].acl).toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 }
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.map(t=>[t,"success_fee_tenant"]).sort());
 for(const p of policies)expect((await f.admin.query("SELECT $1::name[]::text[] roles",[p.roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},
  routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
// MON-4A 0359: enumerate only the two new immutable tables and five routines.
async function paymentFeeAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["payment_fee_statement","payment_fee_command"];
 const indexes=["payment_fee_statement_pkey","pf_stmt_job","pf_stmt_receipt","payment_fee_command_pkey"];
 const identities=[
  ["payment_fee_receipt_sources","t uuid, j uuid, payment uuid, actor uuid"],
  ["payment_fee_actor","j uuid, d text"],["payment_fee_current","t uuid, j uuid, s uuid, actor uuid"],
  ["read_payment_fees","j uuid, d text"],["write_payment_fee","j uuid, d text, p jsonb"],
 ];
 const routines=after.routines.filter(r=>r.nspname==="app"&&identities.some(([name,args])=>r.proname===name&&r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...identities].sort());
 for(const r of routines){
  expect(r.proconfig).toEqual(["search_path=pg_catalog, app"]);
  const exposed=["read_payment_fees","write_payment_fee"].includes(r.proname);
  expect(r.prosecdef).toBe(exposed);
  const acl=(await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl;
  expect(acl.sort()).toEqual(["jobguard_migration=X/jobguard_migration",...(exposed?["jobguard_runtime=X/jobguard_migration"]:[])].sort());
  expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 }
 const relations=after.relations.filter(r=>r.nspname==="app"&&[...tables,...indexes].includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...tables,...indexes].sort());
 for(const t of tables){
  expect(before.rows).not.toHaveProperty(`app.${t}`);expect(after.rows[`app.${t}`]).toEqual([]);
  const relation=relations.find(r=>r.relname===t)!;expect(relation.relrowsecurity).toBe(true);expect(relation.relforcerowsecurity).toBe(true);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[relation.relacl])).rows[0].acl).toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 }
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.map(t=>[t,"payment_fee_tenant"]).sort());
 for(const policy of policies)expect((await f.admin.query("SELECT $1::name[]::text[] roles",[policy.roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
// M4-10-S: exact additive 0490 table/index/routine/privilege expectations.
async function simulationStatementAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["platform_fee_statement","platform_fee_statement_command"];
 const indexes=["platform_fee_statement_pkey","platform_fee_statement_tenant_id_job_id_id_key","platform_fee_statement_tenant_id_sequence_key","platform_fee_statement_tenant_id_job_id_source_hash_key","platform_fee_statement_command_pkey"];
 const identities=[
  ["platform_fee_statement_sources","t uuid, j uuid, actor uuid"],
  ["read_platform_fee_statements","p_job uuid, p_session text"],
  ["write_platform_fee_statement","p_job uuid, p_session text, p_command jsonb"],
 ];
 const routines=after.routines.filter(r=>r.nspname==="app"&&identities.some(([name,args])=>r.proname===name&&r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...identities].sort());
 for(const r of routines){
  expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  const exposed=["read_platform_fee_statements","write_platform_fee_statement"].includes(r.proname);
  expect(r.prosecdef).toBe(exposed);
  const acl=(await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl;
  expect(acl.sort()).toEqual(["jobguard_migration=X/jobguard_migration",...(exposed?["jobguard_runtime=X/jobguard_migration"]:[])].sort());
  expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 }
 const relations=after.relations.filter(r=>r.nspname==="app"&&[...tables,...indexes].includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...tables,...indexes].sort());
 for(const t of tables){
  expect(before.rows).not.toHaveProperty(`app.${t}`);expect(after.rows[`app.${t}`]).toEqual([]);
  const relation=relations.find(r=>r.relname===t)!;expect(relation.relrowsecurity).toBe(true);expect(relation.relforcerowsecurity).toBe(true);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[relation.relacl])).rows[0].acl).toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 }
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.map(t=>[t,"success_fee_tenant"]).sort());
 for(const policy of policies)expect((await f.admin.query("SELECT $1::name[]::text[] roles",[policy.roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
async function simulationCollectionAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["platform_fee_attempt", "platform_fee_attempt_event", "platform_fee_collection_command"];
 const indexes=["platform_fee_attempt_pkey","platform_fee_attempt_tenant_id_job_id_id_key","platform_fee_attempt_event_pkey","platform_fee_collection_command_pkey"];
 const identities=[
  ["read_platform_fee_collection","p_job uuid, p_session text"],
  ["write_platform_fee_collection","p_job uuid, p_session text, p_command jsonb"],
 ];
 const routines=after.routines.filter(r=>r.nspname==="app"&&identities.some(([name,args])=>r.proname===name&&r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...identities].sort());
 for(const r of routines){
  expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  const exposed=["read_platform_fee_collection","write_platform_fee_collection"].includes(r.proname);
  expect(r.prosecdef).toBe(exposed);
  const acl=(await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl;
  expect(acl.sort()).toEqual(["jobguard_migration=X/jobguard_migration",...(exposed?["jobguard_runtime=X/jobguard_migration"]:[])].sort());
  expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 }
 const relations=after.relations.filter(r=>r.nspname==="app"&&[...tables,...indexes].includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...tables,...indexes].sort());
 for(const t of tables){
  expect(before.rows).not.toHaveProperty(`app.${t}`);expect(after.rows[`app.${t}`]).toEqual([]);
  const relation=relations.find(r=>r.relname===t)!;expect(relation.relrowsecurity).toBe(true);expect(relation.relforcerowsecurity).toBe(true);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[relation.relacl])).rows[0].acl).toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 }
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.map(t=>[t,"success_fee_tenant"]).sort());
 for(const policy of policies)expect((await f.admin.query("SELECT $1::name[]::text[] roles",[policy.roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
async function simulationMoneyAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after=await snapshot();
 const tables=["simulation_money_run", "simulation_money_review"];
 const indexes=["simulation_money_run_pkey","simulation_money_run_tenant_id_job_id_id_key","simulation_money_review_pkey"];
 const identities=[
  ["simulation_money_sources","t uuid, j uuid, actor uuid"],
  ["simulation_money_run","p_job uuid, p_session text, p_command jsonb"],
 ];
 const routines=after.routines.filter(r=>r.nspname==="app"&&identities.some(([name,args])=>r.proname===name&&r.args===args));
 expect(routines.map(r=>[r.proname,r.args]).sort()).toEqual([...identities].sort());
 for(const r of routines){
  expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  const exposed=r.proname==="simulation_money_run";
  expect(r.prosecdef).toBe(exposed);
  const acl=(await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl;
  expect(acl.sort()).toEqual(["jobguard_migration=X/jobguard_migration",...(exposed?["jobguard_runtime=X/jobguard_migration"]:[])].sort());
  expect(before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).toBe(false);
 }
 const relations=after.relations.filter(r=>r.nspname==="app"&&[...tables,...indexes].includes(r.relname));
 expect(relations.map(r=>r.relname).sort()).toEqual([...tables,...indexes].sort());
 for(const t of tables){
  expect(before.rows).not.toHaveProperty(`app.${t}`);expect(after.rows[`app.${t}`]).toEqual([]);
  const relation=relations.find(r=>r.relname===t)!;expect(relation.relrowsecurity).toBe(true);expect(relation.relforcerowsecurity).toBe(true);
  expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[relation.relacl])).rows[0].acl).toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 }
 const policies=after.policies.filter(p=>p.schemaname==="app"&&tables.includes(p.tablename));
 expect(policies.map(p=>[p.tablename,p.policyname]).sort()).toEqual(tables.map(t=>[t,"success_fee_tenant"]).sort());
 for(const policy of policies)expect((await f.admin.query("SELECT $1::name[]::text[] roles",[policy.roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const additive=<T>(old:T[],added:T[],live:T[])=>[...old,...added].sort((a,b)=>live.findIndex(r=>JSON.stringify(r)===JSON.stringify(a))-live.findIndex(r=>JSON.stringify(r)===JSON.stringify(b)));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t=>[`app.${t}`,[]]))},routines:additive(before.routines,routines,after.routines),relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}
// 0306 adds only these objects; every predecessor catalogue row still compares in full.
// LP-2 adds a private, tenant-checked permit table and five exact routines.
// Keep predecessor facts intact except the three explicitly withdrawn EXECUTE ACLs.
async function jobDoorAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const table = "lp_job_insert_permit", names = [table, `${table}_pkey`];
 expect(before.rows).not.toHaveProperty(`app.${table}`);
 expect(after.rows[`app.${table}`]).toEqual([]);
 const relations = after.relations.filter(r => r.nspname === "app" && names.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual(names);
 const relation = relations.find(r => r.relname === table)!;
 const owner = (await f.admin.query("SELECT oid FROM pg_roles WHERE rolname='jobguard_migration'")).rows[0].oid;
 for (const r of relations) expect(r.relowner).toBe(owner);
 expect(relation.relrowsecurity).toBe(true); expect(relation.relforcerowsecurity).toBe(true);
 expect((await f.admin.query("SELECT $1::aclitem[]::text[] acl",[relation.relacl])).rows[0].acl)
  .toEqual(["jobguard_migration=arwdDxt/jobguard_migration"]);
 const policies = after.policies.filter(p => p.schemaname === "app" && p.tablename === table);
 expect(policies).toHaveLength(1);
 expect(policies[0]).toMatchObject({policyname:"tenant_isolation",permissive:"PERMISSIVE",cmd:"ALL"});
 expect((await f.admin.query("SELECT $1::name[]::text[] roles",[policies[0].roles])).rows[0].roles).toEqual(["jobguard_migration"]);
 const tenantCheck = "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)";
 expect(policies[0].qual).toBe(tenantCheck); expect(policies[0].with_check).toBe(tenantCheck);
 const signatures = ["app.lp_job_insert_shape(app.job)","app.lp_job_permit_consumed()","app.lp_ordinary_job_initial_shape()",
  "app.create_practice_sandbox_job(uuid,uuid,uuid,text)","app.start_quote_from_review(uuid,uuid,integer,uuid,uuid,uuid,uuid,text)"];
 const identities = (await f.admin.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) args
  FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[])`,[signatures])).rows;
 expect(identities).toHaveLength(5);
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(i => i.proname === r.proname && i.args === r.args));
 expect(routines).toHaveLength(5);
 for (const r of routines) {
  expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
  expect(r.proowner).toBe(relation.relowner); expect(r.proconfig).toEqual(["search_path=pg_catalog"]);
  expect(r.prosecdef).toBe(!["lp_job_insert_shape","lp_ordinary_job_initial_shape"].includes(r.proname));
  const acl = (await f.admin.query("SELECT $1::aclitem[]::text[] acl",[r.proacl])).rows[0].acl as string[];
  const executors = ["jobguard_migration=X/jobguard_migration"];
  if (["create_practice_sandbox_job","start_quote_from_review"].includes(r.proname)) executors.push("jobguard_runtime=X/jobguard_migration");
  expect(acl.sort()).toEqual(executors.sort());
 }
 const withdrawn = (await f.admin.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) args
  FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[])`,[["app.guard_imported_job()",
   "app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint)",
   "app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz)"]])).rows;
 expect(withdrawn).toHaveLength(3);
 const ownerAcl = (await f.admin.query("SELECT $1::text[]::aclitem[] acl",[["jobguard_migration=X/jobguard_migration"]])).rows[0].acl;
 const previous = before.routines.map(r => withdrawn.some(i => r.nspname === "app" && r.proname === i.proname && r.args === i.args)
  ? {...r,proacl:ownerAcl,...(r.proname === "guard_imported_job" ? {prosecdef:false,proconfig:["search_path=pg_catalog"]} : {})} : r);
 const additive = <T>(old:T[],added:T[],live:T[]) => [...old,...added].sort((a,b) => live.findIndex(r => JSON.stringify(r) === JSON.stringify(a)) - live.findIndex(r => JSON.stringify(r) === JSON.stringify(b)));
 return {rows:{...before.rows,[`app.${table}`]:[]},routines:additive(previous,routines,after.routines),
  relations:additive(before.relations,relations,after.relations),policies:additive(before.policies,policies,after.policies)};
}

async function evidencePackV3Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const tables = ["evidence_pack_v3", "evidence_pack_v3_approval", "evidence_pack_v3_check", "evidence_pack_v3_request"];
 // PostgreSQL shortens generated constraint-name components to fit its identifier limit.
 const indexNames = ["evidence_pack_v3_pkey", "evidence_pack_v3_tenant_id_job_id_case_id_id_key",
  "evidence_pack_v3_approval_pkey", "evidence_pack_v3_check_pkey", "evidence_pack_v3_request_pkey",
  "evidence_pack_v3_request_tenant_id_job_id_case_id_command_i_key"];
 const identities = [
  ["canonical_evidence_pack_v3", "v jsonb"], ["evidence_pack_v3_owner", "t uuid, c uuid, d text"],
  ["evidence_pack_v3_ordinary", "t uuid, c uuid"], ["evidence_pack_v3_material", "t uuid, c uuid, ordinary_only boolean"],
  ["read_evidence_pack_v3", "t uuid, c uuid, d text"], ["request_evidence_pack_v3", "t uuid, c uuid, d text, q jsonb"],
  ["prepare_evidence_pack_v3", "t uuid, cid uuid"], ["complete_evidence_pack_v3_check", "t uuid, cid uuid, h text"],
  ["finish_evidence_pack_v3", "t uuid, cid uuid, m jsonb, artifact text, mh text"]];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name,args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname,r.args]).sort()).toEqual([...identities].sort());
 const privileges = (await f.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,
  ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
   FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE' ORDER BY 1) executors
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.proname`, [identities.map(([name]) => name)])).rows;
 const runtime = ["read_evidence_pack_v3", "request_evidence_pack_v3"];
 const shadow = ["prepare_evidence_pack_v3", "complete_evidence_pack_v3_check", "finish_evidence_pack_v3"];
 expect(privileges).toEqual(identities.map(([proname]) => ({proname,owner:"jobguard_migration",
  executors:["jobguard_migration",...(runtime.includes(proname!) ? ["jobguard_runtime"] : shadow.includes(proname!) ? ["jobguard_shadow"] : [])]
 })).sort((a,b) => a.proname!.localeCompare(b.proname!)));
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='app' AND t.relname=ANY($1::text[])`, [tables])).rows.map(r => r.relname);
 expect([...indexes].sort()).toEqual([...indexNames].sort());
 const relationNames = [...tables,...indexNames];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename,p.policyname]).sort()).toEqual(tables.map(t => [t,"tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 for (const p of policies) expect(before.policies.some(b => b.schemaname === p.schemaname && b.tablename === p.tablename && b.policyname === p.policyname)).toBe(false);
 const position = (rows: unknown[],row: unknown) => rows.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return {rows:{...before.rows,...Object.fromEntries(tables.map(t => [`app.${t}`,[]]))},
  routines:[...before.routines,...routines].sort((a,b) => position(after.routines,a)-position(after.routines,b)),
  relations:[...before.relations,...relations].sort((a,b) => position(after.relations,a)-position(after.relations,b)),
  policies:[...before.policies,...policies].sort((a,b) => position(after.policies,a)-position(after.policies,b))};
}
// m4-withheld-source / 0489: one private validator, with no runtime execute grant.
async function withheldSourceAddition(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const routines = after.routines.filter(r => r.nspname === "app" && r.proname === "success_fee_withheld_source");
 expect(routines).toHaveLength(1);
 expect(routines[0]).toMatchObject({args:"t uuid, j uuid, allocation uuid",prosecdef:false,
  proacl:"{jobguard_migration=X/jobguard_migration}",proconfig:["search_path=pg_catalog"]});
 expect((await f.admin.query("SELECT pg_get_userbyid($1::oid) owner",[routines[0]!.proowner])).rows).toEqual([{owner:"jobguard_migration"}]);
 expect(before.routines.some(r => r.nspname === "app" && r.proname === "success_fee_withheld_source")).toBe(false);
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return {...before,routines:[...before.routines,...routines].sort((a,b)=>position(a)-position(b))};
}
// CH-9 part 2: exact read-only additions; all predecessor catalogue rows remain compared.
async function valueSourceAdditions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const identities = [["read_value_business", "digest text"], ["read_value_job", "j uuid, digest text"]];
 const routines = after.routines.filter(r => r.nspname === "app" && identities.some(([name, args]) => r.proname === name && r.args === args));
 expect(routines.map(r => [r.proname, r.args])).toEqual(identities);
 for (const r of routines) {
  expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname && b.args === r.args)).toBe(false);
  expect(r).toMatchObject({ prosecdef: true, proacl: "{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}",
   proconfig: r.proname === "read_value_job" ? ["search_path=pg_catalog, app", "TimeZone=UTC"] : ["search_path=pg_catalog, app"] });
  expect((await f.admin.query("SELECT pg_get_userbyid($1::oid) owner", [r.proowner])).rows).toEqual([{ owner: "jobguard_migration" }]);
 }
 const position = (row: typeof routines[number]) => after.routines.findIndex(r => JSON.stringify(r) === JSON.stringify(row));
 return { ...before, routines: [...before.routines, ...routines].sort((a, b) => position(a) - position(b)) };
}

it("SERIOUS-B5 upgrades from 0164 without rewriting data, historical PDF hashes or privileges, then replays safely", async () => {
 const position = MIGRATION_URLS.findIndex(u => u.pathname.endsWith(`/${own}`));
 expect(position).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for (const url of MIGRATION_URLS.slice(0, position)) {
  await f.admin.query(await readFile(url, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const a = await seedAccount(f.admin);
 await asFixtureTenant(f.admin, a.tenantId, db => db.query("SELECT app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)", [a.tenantId,a.jobId,a.revisionId,LOCK_OWNER,randomUUID(),"practice-customer@example.invalid","2026-10-16"]));
 const before = await snapshot();
 await migrate(f.admin);
 const expected = await separableFinalCheckAdditions(await workStateCommandAdditions(await with0200Additions(await contractorAgreementAdditions(await with0188And0192Additions(before)))));
 Object.assign(expected, await smallTripAdditions(expected));
 Object.assign(expected, await lifecycleSourceAdditions(expected));
 Object.assign(expected, await placeAdmissionAdditions(expected));
 Object.assign(expected, await jobImportV3Additions(expected));
 Object.assign(expected, await with0245Additions(expected));
 Object.assign(expected, await attributionAdditions(expected));
 Object.assign(expected, await catchAdditions(expected));
 Object.assign(expected, await invoicedImportAdditions(expected));
 Object.assign(expected, await storedReceiptCaseAdditions(expected));
 Object.assign(expected, await paymentFeeAdditions(expected));
 Object.assign(expected, await successFeeCatchAdditions(expected));
 Object.assign(expected, await simulationStatementAdditions(expected));
 Object.assign(expected, await simulationCollectionAdditions(expected));
 Object.assign(expected, await simulationMoneyAdditions(expected));
 Object.assign(expected, await sourceIntakeAdditions(expected));
 Object.assign(expected, await evidencePackV3Additions(expected));
 Object.assign(expected, await demoRunAdditions(expected));
 Object.assign(expected, await jobDoorAdditions(expected));
 Object.assign(expected, await withOidcAdditions(expected));
 Object.assign(expected, await valueSourceAdditions(expected));
 Object.assign(expected, await withheldSourceAddition(expected));
 expect(await snapshot()).toEqual(expected);
 await migrate(f.admin);
 expect(await snapshot()).toEqual(expected);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows[0].n).toBe(1);
}, 60000);

// MON-3-P-B: ONLY the four new side tables and five new routines from 0235.
async function trialAdmissionAdditions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
 const tables = ["trial_admission", "trial_business_verification", "trial_card_attempt", "trial_card_result", "trial_start", "trial_end_source", "trial_subscription_source"];
 const names = ["mon3_admit", "mon3_audit", "mon3_owner", "mon3_record_card_fixture", "mon3_request_card", "mon3_activate", "mon3_build_source", "mon3_capture_lifecycle", "mon3_pin_source", "mon3_read_lifecycle", "mon3_require_registered_admission", "mon3_simulate_card", "mon3_trial_date", "mon3_validate_billing"].sort();
 const routines = after.routines.filter(r => r.nspname === "app" && names.includes(r.proname));
 expect(routines.map(r => r.proname).sort()).toEqual(names);
 const indexRows = (await f.admin.query(`SELECT t.relname table_name,i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows;
 for (const [table, count] of [["trial_admission",4],["trial_business_verification",2],["trial_card_attempt",3],["trial_card_result",2],["trial_start",3],["trial_end_source",1],["trial_subscription_source",1]] as const) expect(indexRows.filter(r => r.table_name === table)).toHaveLength(count);
 const relationNames = [...tables, ...indexRows.map(r => r.relname as string)];
 const relations = after.relations.filter(r => r.nspname === "app" && relationNames.includes(r.relname));
 expect(relations.map(r => r.relname).sort()).toEqual([...relationNames].sort());
 const policies = after.policies.filter(p => p.schemaname === "app" && tables.includes(p.tablename));
 expect(policies.map(p => [p.tablename,p.policyname]).sort()).toEqual(tables.map(t => [t,"tenant_isolation"]).sort());
 for (const table of tables) expect(Object.keys(before.rows)).not.toContain(`app.${table}`);
 for (const r of routines) expect(before.routines.some(b => b.nspname === r.nspname && b.proname === r.proname)).toBe(false);
 for (const r of relations) expect(before.relations.some(b => b.nspname === r.nspname && b.relname === r.relname)).toBe(false);
 return { rows: Object.fromEntries(tables.map(t => [`app.${t}`, []])), routines, relations, policies };
}
