// 0518: the shadow-30000 guide's demo-only helpers, on real PostgreSQL. Each must refuse outside the synthetic database.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { cluster, type Cluster } from "./extra-fixtures.js";

const digest = "a".repeat(64), practiceTenant = "11111111-1111-4111-8111-111111111111";
const calls = (t: string, j: string) => [
 ["SELECT app.demo_request_source_hold($1,$2,$3)", [t, j, digest]],
 ["SELECT app.demo_source_hold_state($1,$2,$3)", [t, j, digest]],
 ["SELECT app.demo_shadow_review_inputs($1,$2,$3)", [t, j, digest]],
 ["SELECT app.demo_issue_customer_link($1,$2,$3,$4,$5,$6)", [t, j, randomUUID(), digest, "b".repeat(64), `/customer/sign-in#${t}/${j}/x/y`]],
] as const;
async function attempt(pool: Pool, tenant: string, sql: string, values: readonly unknown[]) {
 const client: PoolClient = await pool.connect();
 try {
  await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await client.query(sql, [...values]); return null;
 } catch (error) { return error as { code?: string; message: string }; }
 finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
}
describe("0518 demo-only guide helpers", () => {
 let c: Cluster, outside: Pool, outsideAdmin: Pool;
 beforeAll(async () => {
  c = await cluster();
  for (const pool of [c.admin, c.runtime]) pool.on("error", () => undefined);
  const control = new Pool({ ...c.config, database: "postgres" });
  // An exact copy of the migrated database under another name: same functions and grants, not the synthetic database.
  await control.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='jobguard_synthetic_demo'");
  await control.query("CREATE DATABASE jobguard_not_synthetic TEMPLATE jobguard_synthetic_demo");
  await control.end();
  outside = new Pool({ ...c.config, database: "jobguard_not_synthetic", user: "ent4b_login", max: 2 });
  outsideAdmin = new Pool({ ...c.config, database: "jobguard_not_synthetic", max: 1 });
 }, 300000);
 afterAll(async () => { await outside?.end(); await outsideAdmin?.end(); await c?.close(); });

 it("the migration is applied once and listed", async () => {
  expect((await c.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name='0518_shadow_demo_guide.sql'")).rows[0].n).toBe(1);
  const listed = JSON.parse(await readFile(new URL("./migration-proofs/legacy-migrations.json", import.meta.url), "utf8"));
  expect(JSON.stringify(listed)).toContain("0518_shadow_demo_guide.sql");
 });
 it.each([0, 1, 2, 3])("helper %i refuses outside the synthetic database, even for the runtime role", async index => {
  const [sql, values] = calls(practiceTenant, randomUUID())[index]!;
  const error = await attempt(outside, practiceTenant, sql, values);
  expect(error).toMatchObject({ code: "42501", message: "SYNTHETIC_MODE_REQUIRED" });
 });
 it("nothing is written outside the synthetic database", async () => {
  const rows = await outsideAdmin.query("SELECT (SELECT count(*)::int FROM infrastructure.demo_source_hold_request) holds,(SELECT count(*)::int FROM app.customer_portal_grant) grants");
  expect(rows.rows[0]).toEqual({ holds: 0, grants: 0 });
 });
 it.each([0, 1, 2, 3])("helper %i refuses a session that does not own the job, in the synthetic database too", async index => {
  const [sql, values] = calls(practiceTenant, randomUUID())[index]!;
  expect(await attempt(c.runtime, practiceTenant, sql, values)).toMatchObject({ message: "FINAL_CHECK_FORBIDDEN" });
 });
 it("only the runtime role may execute the helpers and only the worker role may read the request queue", async () => {
  const signatures = ["app.demo_request_source_hold(uuid,uuid,text)", "app.demo_source_hold_state(uuid,uuid,text)", "app.demo_shadow_review_inputs(uuid,uuid,text)", "app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text)"];
  for (const signature of signatures) {
   const row = (await c.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') runtime,has_function_privilege('jobguard_shadow',$1,'EXECUTE') shadow,has_function_privilege('jobguard_infrastructure',$1,'EXECUTE') infrastructure,has_function_privilege('public',$1,'EXECUTE') public", [signature])).rows[0];
   expect(row).toEqual({ runtime: true, shadow: false, infrastructure: false, public: false });
  }
  const queue = (await c.admin.query("SELECT has_table_privilege('jobguard_runtime','infrastructure.demo_source_hold_request','SELECT') runtime,has_table_privilege('jobguard_infrastructure','infrastructure.demo_source_hold_request','UPDATE') worker,has_table_privilege('jobguard_infrastructure','infrastructure.demo_source_hold_request','DELETE') removes")).rows[0];
  expect(queue).toEqual({ runtime: false, worker: true, removes: false });
 });
 it("the link helper keeps its narrow checks in the migration", async () => {
  const sql = await readFile(new URL("../migrations/0518_shadow_demo_guide.sql", import.meta.url), "utf8");
  const body = sql.slice(sql.indexOf("CREATE FUNCTION app.demo_issue_customer_link"), sql.indexOf("ALTER FUNCTION app.demo_issue_customer_link"));
  for (const check of ["current_database()<>'jobguard_synthetic_demo'", practiceTenant, "app.final_account_lock", "kind='jobguard_catch'", "\\.invalid$", "/customer/sign-in#", "interval '1 minute'"]) expect(body).toContain(check);
 });
});
