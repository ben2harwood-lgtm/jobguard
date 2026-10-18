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
// Rulings 104(b) and 113: only objects created by 0188 and 0193 extend the snapshot.
// Existing rows, routine privileges, relations and policies still compare in full.
async function with0188Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
 const additions0193 = await get0193Additions(before, after);
 const tables = ["practice_supplier_credit_case_binding", "practice_supplier_credit_review_payment"];
 const routineNames = ["pf1b_pin_time", "pf1b_require_side_effect", "pf1b_review_supplier_credit", "pf1b_source_bundle", "pf1b_validate_side"];
 const routines = after.routines.filter(r => r.nspname === "app" && routineNames.includes(r.proname));
 expect(routines.map(r => r.proname).sort()).toEqual(routineNames);
 // Index identity is bound to the two exact new tables, not a name-prefix exemption.
 const indexes = (await f.admin.query(`SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[]) ORDER BY i.relname`, [tables])).rows.map(r => r.relname);
 expect(indexes).toHaveLength(5); // two primary keys and the three UNIQUE constraints in 0188
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
 const additive = <T>(old: T[], added: T[], live: T[]): T[] => {
  const expected = [...old];
  for (const row of added) expected.splice(live.indexOf(row), 0, row);
  return expected;
 };
 return {
  rows: { ...before.rows, "app.practice_supplier_credit_case_binding": [], "app.practice_supplier_credit_review_payment": [], ...additions0193.rows },
  routines: additive(before.routines, after.routines.filter(row => routines.includes(row) || additions0193.routines.includes(row)), after.routines),
  relations: additive(before.relations, after.relations.filter(row => relations.includes(row) || additions0193.relations.includes(row)), after.relations),
  policies: additive(before.policies, after.policies.filter(row => policies.includes(row) || additions0193.policies.includes(row)), after.policies),
 };
}
// Ruling 113: additive allowance for exactly the objects created by 0193.
// The replaced ent4b_origin_provenance routine is NOT an addition: its existing
// catalogue row (including owner, grants and configuration) still compares in full.
async function get0193Additions(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
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
 const expected = await with0188Additions(before);
 expect(await snapshot()).toEqual(expected);
 await migrate(f.admin);
 expect(await snapshot()).toEqual(expected);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows[0].n).toBe(1);
}, 60000);
