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
async function withoutBillingAdditions(after: Awaited<ReturnType<typeof snapshot>>, before: Awaited<ReturnType<typeof snapshot>>) {
 const rows = { ...after.rows };
 for (const table of billingTables) {
  expect(Object.hasOwn(before.rows, `app.${table}`)).toBe(false);
  expect(rows[`app.${table}`]).toEqual([]);
  delete rows[`app.${table}`];
 }
 // Bind indexes to these exact new tables through pg_index, never a name prefix.
 const indexes = (await f.admin.query(`SELECT c.relname FROM pg_index i
  JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='app' AND t.relname=ANY($1::text[])`, [billingTables])).rows.map(r => r.relname as string);
 expect(indexes).toContain("billing_line_match_export_line_unique");
 const relationNames = new Set([...billingTables, ...indexes]);
 expect(before.relations.filter(r => r.nspname==='app' && relationNames.has(r.relname))).toEqual([]);
 const allowedRoutines = (await f.admin.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) args
  FROM pg_proc p WHERE p.oid=ANY(ARRAY(SELECT unnest($1::text[])::regprocedure::oid))`, [billingRoutines])).rows;
 expect(allowedRoutines).toHaveLength(billingRoutines.length);
 const isBillingRoutine = (r: typeof after.routines[number]) => r.nspname==='app' && allowedRoutines.some(a => a.proname===r.proname && a.args===r.args);
 expect(before.routines.filter(isBillingRoutine)).toEqual([]);
 const isBillingPolicy = (r: typeof after.policies[number]) => r.schemaname==='app' && billingTables.includes(r.tablename) && r.policyname==='tenant_isolation';
 expect(after.policies.filter(isBillingPolicy)).toHaveLength(billingTables.length);
 return { rows,
  routines: after.routines.filter(r => !isBillingRoutine(r)),
  relations: after.relations.filter(r => !(r.nspname==='app' && relationNames.has(r.relname))),
  policies: after.policies.filter(r => !isBillingPolicy(r)) };
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
 const after = await snapshot();
 expect(await withoutBillingAdditions(after, before)).toEqual(before);
 await migrate(f.admin);
 expect(await snapshot()).toEqual(after);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows[0].n).toBe(1);
}, 60000);
