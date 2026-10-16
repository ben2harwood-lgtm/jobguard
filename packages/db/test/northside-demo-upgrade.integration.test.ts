import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, company, start, end, lookup } from "./practice-worker-switch-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
import { chainWorld, submitted } from "./extra-approval-chain-fixtures.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
import { migrate, registerNorthsideRun, withTenant } from "../src/index.js";
const migration = "0166_northside_run_attribution.sql";
let c: Cluster;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await startBeforeMigration(migration); }, 240000);
afterAll(async () => { await c?.close(); });

it("own-step populated upgrade preserves every predecessor row/type/function, existing switch lookup and approval snapshot", async () => {
  const f = await company(c); await start(c, f);
  const w = await chainWorld(c); await submitted(c, w, 150000);
  const tables = ["control_plane.contractor_practice_session", "control_plane.practice_company_marker", "control_plane.practice_worker_switch", "app.command_receipt", "app.audit_event", "app.membership", "app.role_grant", "app.import_batch", "app.work_order", "app.work_order_revision", "app.client_contract_version", "app.extra_origin", "app.extra_approval_request"];
  const before = await proofBefore(c.admin, tables);
  for (const table of tables) expect(Object.keys(before[table]!.rows).length).toBeGreaterThan(0);
  const functions = async () => (await c.admin.query("SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,p.proacl,p.proowner,p.proconfig FROM pg_proc p WHERE p.pronamespace IN ('app'::regnamespace,'identity'::regnamespace) AND p.prokind='f' ORDER BY 1")).rows;
  const priorFunctions = await functions(), priorActor = await lookup(c, f);
  await applyMigration(c, migration);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  const afterFunctions = await functions();
  for (const fn of priorFunctions) expect(afterFunctions.find(now => now.name === fn.name)).toEqual(fn);
  expect(await lookup(c, f)).toEqual(priorActor);
  for (const table of ["northside_run", "northside_action_attribution"]) {
    expect((await c.admin.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
    const catalog = (await c.admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('jobguard_runtime',c.oid,'INSERT') i,has_table_privilege('jobguard_runtime',c.oid,'UPDATE') u,has_table_privilege('jobguard_runtime',c.oid,'DELETE') d,has_table_privilege('jobguard_runtime',c.oid,'TRUNCATE') t FROM pg_class c WHERE c.oid=$1::regclass", [`app.${table}`])).rows[0];
    expect(catalog).toEqual({ relrowsecurity: true, relforcerowsecurity: true, i: false, u: false, d: false, t: false });
  }
  await migrate(c.admin); await migrate(c.admin);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  await end(c, f);
  await registerNorthsideRun(c.runtime, f.p, f.context);
  // The snapshot belongs only to the authorized run tenant, including missing-context pooled reads.
  expect((await c.runtime.query("SELECT * FROM app.northside_run")).rows).toEqual([]);
  expect(await withTenant(c.runtime, await w.ctx, db => db.$client.query("SELECT * FROM app.northside_run"))).toMatchObject({ rows: [] });
}, 240000);

it("own-step comparator detects timestamp/type changes and missing rows; later additions do not count as rewrites", async () => {
  const before = await proofBefore(c.admin, ["control_plane.contractor_practice_session"]);
  for (const control of ["time", "type", "delete"] as const) await rolledBack(c.admin, async db => {
    if (control === "time") {
      await db.query("SET LOCAL session_replication_role=replica");
      await db.query("UPDATE control_plane.contractor_practice_session SET created_at=created_at+interval '1 microsecond',expires_at=expires_at+interval '1 microsecond'");
    } else if (control === "type") await db.query("ALTER TABLE control_plane.contractor_practice_session ALTER COLUMN created_at TYPE timestamp(3) with time zone");
    else { await db.query("SET LOCAL session_replication_role=replica"); await db.query("DELETE FROM control_plane.contractor_practice_session"); }
    const diff = await proofDifferences(db, before);
    expect(control === "type" ? diff.types.length : diff.rows.length).toBeGreaterThan(0);
  });
  const { ContractorRepository } = await import("../src/index.js");
  await new ContractorRepository(c.runtime).startPractice(randomUUID());
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
});
