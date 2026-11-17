import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { migrate, registerNorthsideRun } from "../src/index.js";
import { startBeforeMigration, applyMigration, startSession, type Cluster } from "./contractor-practice-session-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
const migration = "0761_northside_hosted_agreement.sql";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await startBeforeMigration(migration); }, 240000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("own-step upgrade preserves populated predecessor rows, types and existing routine ACL; old partial runs can retry", async () => {
  const f = await startSession(c, false, false);
  await registerNorthsideRun(c.runtime, f.p, f.context); // Previous deployed path stopped on its first operative invite.
  const tables = ["control_plane.contractor_practice_session", "app.commercial_track_assignment", "app.membership", "app.northside_run", "app.audit_event"];
  const before = await proofBefore(c.admin, tables);
  for (const table of tables) expect(Object.keys(before[table]!.rows).length).toBeGreaterThan(0);
  const security = async () => (await c.admin.query("SELECT proowner,proacl,prosecdef,proconfig,provolatile FROM pg_proc WHERE oid='app.northside_register(uuid,jsonb)'::regprocedure")).rows;
  const originalSecurity = await security();
  await applyMigration(c, migration);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect(await security()).toEqual(originalSecurity);
  for (let pass = 0; pass < 2; pass++) {
    await migrate(c.admin);
    await c.admin.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
    expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  }
  await registerNorthsideRun(c.runtime, f.p, f.context);
  expect((await c.admin.query("SELECT status FROM app.contractor_agreement_status_revision WHERE tenant_id=$1", [f.p.tenantId])).rows).toEqual([{ status: "active" }]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.enterprise_agreement_version WHERE tenant_id=$1", [f.p.tenantId])).rows[0].n).toBe(1);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  // New entrypoint has only exact runtime EXECUTE. Agreement tables remain private, immutable and forced-RLS.
  expect((await c.admin.query("SELECT has_function_privilege('jobguard_runtime','app.ef_derive_northside(uuid,uuid,text)','EXECUTE') runtime, has_function_privilege('jobguard_identity','app.ef_derive_northside(uuid,uuid,text)','EXECUTE') identity")).rows[0]).toEqual({ runtime: true, identity: false });
  for (const name of ["contractor_agreement_status_revision", "enterprise_agreement_version"]) {
    expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'INSERT') writable FROM pg_class WHERE oid=$1::regclass", [`app.${name}`])).rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true, writable: false });
  }
}, 240000);
