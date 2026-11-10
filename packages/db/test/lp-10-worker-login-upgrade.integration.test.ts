import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { migrate } from "../src/migrate.js";

let cluster: Cluster | undefined;
afterAll(async () => { await cluster?.close(); });
it("0980 preserves populated predecessor rows and routine bodies while closing web worker writes", async () => {
  cluster = await startBeforeMigration("0980_worker_login.sql");
  const db = cluster.admin;
  const before = await snapshot(db);
  const definitions = async () => (await db.query(`SELECT p.oid,p.proname,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('app','identity','control_plane','audit_control','outbound_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
  const routines = await definitions();
  await applyMigration(cluster, "0980_worker_login.sql");
  expect(await snapshot(db)).toEqual({ ...before, "control_plane.worker_action_binding": [] });
  const after = await definitions();
  for (const prior of routines) {
    const current = after.find(row => row.oid === prior.oid);
    expect(current).toEqual(prior);
  }
  expect((await db.query(`SELECT
    has_column_privilege('jobguard_runtime','app.action_outbox','status','UPDATE') web_update,
    has_table_privilege('jobguard_runtime','app.action_attempt','INSERT') web_attempt,
    has_function_privilege('jobguard_runtime','app.claim_worker_action(uuid,text[])','EXECUTE') web_claim,
    has_function_privilege('jobguard_worker','app.claim_worker_action(uuid,text[])','EXECUTE') worker_claim,
    has_function_privilege('jobguard_worker','outbound_control.claims_enabled()','EXECUTE') worker_pause_read`)).rows[0])
    .toEqual({ web_update: false, web_attempt: false, web_claim: false, worker_claim: true, worker_pause_read: true });
  // Migrator replay is harmless; rollback uses forward-fix, never reopened web grants.
  await migrate(db);
  expect(await snapshot(db)).toEqual({ ...before, "control_plane.worker_action_binding": [] });
}, 120_000);
