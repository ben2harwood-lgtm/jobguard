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
 expect(policies.map(p => [p.tablename, p.policyname]).sort()).toEqual(tables.map(t => [t, "tenant_isolation"]).sort());
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
// Rulings 104(b) and 113: only objects created by 0188, the LATER-B14 0193 routines and MON-3-P-A's trial-claim migration may extend the snapshot.
// Ruling 113 also extends it to ENT-8A-P's own live-prompt objects (livePromptAdditions).
// Existing rows, routine privileges, relations and policies still compare in full.
async function with0188And0192Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const livePrompt = await livePromptAdditions(before, after);
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
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  const expected = [...old];
  for (const row of [...added].sort((a, b) => live.indexOf(a) - live.indexOf(b))) expected.splice(live.indexOf(row), 0, row);
  return expected;
 };
 return {
  rows: { ...before.rows, ...subscription.rows, ...livePrompt.rows, "app.practice_supplier_credit_case_binding": [], "app.practice_supplier_credit_review_payment": [], "app.trial_identity_key_claim": [], "app.trial_identity_snapshot": [] },
  routines: additive(before.routines, [...after.routines.filter(r => routines.includes(r) || routines0193.includes(r)), ...subscription.routines, ...livePrompt.routines], after.routines),
  relations: additive(before.relations, [...relations, ...subscription.relations, ...livePrompt.relations], after.relations),
  policies: additive(before.policies, [...policies, ...subscription.policies, ...livePrompt.policies], after.policies),
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
 const expected = await withOidcAdditions(await contractorAgreementAdditions(await with0188And0192Additions(before)));
 expect(await snapshot()).toEqual(expected);
 await migrate(f.admin);
 expect(await snapshot()).toEqual(expected);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows[0].n).toBe(1);
}, 60000);
