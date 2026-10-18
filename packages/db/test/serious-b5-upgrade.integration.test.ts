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
// Ruling 104(b): only the objects created by 0188 may extend the snapshot.
// Existing rows, routine privileges, relations and policies still compare in full.
async function with0188Additions(before: Awaited<ReturnType<typeof snapshot>>) {
 const after = await snapshot();
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
  rows: { ...before.rows, "app.practice_supplier_credit_case_binding": [], "app.practice_supplier_credit_review_payment": [] },
  routines: additive(before.routines, routines, after.routines),
  relations: additive(before.relations, relations, after.relations),
  policies: additive(before.policies, policies, after.policies),
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
