// NOT RUN locally: real PostgreSQL evidence is required from CI.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cluster } from "./enterprise-live-prompt-fixtures.js";
const tables = ["extra_completion_observation", "extra_office_prompt_signal", "extra_prompt", "extra_prompt_citation", "extra_prompt_rule_settings", "materials_issue_fact", "prompt_resolution"];
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
describe("ENT-8A-P actual catalogue", () => {
 it("new tables have migration ownership, FORCE RLS and no runtime or shadow direct writes", async () => {
  const rows = await c.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables]);
  expect(rows.rows).toEqual(tables.map(relname => ({ relname, owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true })));
  for (const table of tables) for (const role of ["jobguard_runtime", "jobguard_infrastructure", "jobguard_shadow", "jobguard_shadow_emergency_access"]) {
   const result = await c.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') permitted", [role, `app.${table}`]);
   expect(result.rows[0]?.permitted, `${role} ${table}`).toBe(false);
  }
 });
 it("all new tables have nonnullable tenant keys and tenant-qualified foreign keys", async () => {
  for (const table of tables) {
   const column = await c.admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='tenant_id'", [`app.${table}`]);
   expect(column.rows).toEqual([{ attnotnull: true }]);
   const fks = await c.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f'", [`app.${table}`]);
   expect(fks.rows.length).toBeGreaterThan(0);
   for (const fk of fks.rows) expect(fk.definition).toMatch(/^FOREIGN KEY \(tenant_id,/u);
  }
 });
 it("private evaluator and provenance helpers are not runtime entrypoints", async () => {
  const rows = await c.admin.query(`SELECT p.proname,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') permitted FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN('lp_surface','lp_evaluate','ent4b_origin_provenance')`);
  expect(rows.rows.length).toBeGreaterThanOrEqual(3);
  for (const row of rows.rows) expect(row.permitted, row.proname).toBe(false);
 });
 it("every new routine pins search_path and denies PUBLIC and infrastructure execution", async () => {
  const rows = await c.admin.query(`SELECT p.oid,p.proname,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'lp\\_%' ESCAPE '\\'`);
  expect(rows.rows.length).toBeGreaterThan(0);
  for (const row of rows.rows) {
   expect(row.proconfig).toContain("search_path=pg_catalog");
   const publicAcl = await c.admin.query("SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1 AND a.grantee=0 AND a.privilege_type='EXECUTE'", [row.oid]);
   expect(publicAcl.rows).toEqual([]);
   for (const role of ["jobguard_infrastructure", "jobguard_shadow", "jobguard_shadow_emergency_access"]) expect((await c.admin.query("SELECT has_function_privilege($1,$2::oid,'EXECUTE') allowed", [role,row.oid])).rows[0]?.allowed).toBe(false);
  }
 });
});
