import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { migrate } from "../src/migrate.js";
import { lp11EmptyTables } from "./later-empty-tables.js";
import { discardDraftRegistryRow, invoiceSendRegistryRow } from "./lp5-command-catalog.js";

let cluster: Cluster | undefined;
afterAll(async () => { await cluster?.close(); });
it("0761 preserves populated predecessor rows and routine bodies while closing web worker writes", async () => {
  cluster = await startBeforeMigration("0761_worker_login.sql");
  const db = cluster.admin;
  const before = await snapshot(db);
  const definitions = async () => (await db.query(`SELECT p.oid,p.proname,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('app','identity','control_plane','audit_control','outbound_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
  const routines = await definitions();
  await applyMigration(cluster, "0761_worker_login.sql");
  expect(await snapshot(db)).toEqual({ ...before, "control_plane.worker_action_binding": [] });
  const after = await definitions();
  for (const prior of routines) {
    const current = after.find(row => row.oid === prior.oid);
    let expected = prior.definition;
    if (prior.proname === "guard_recovery_message_sink") {
      expect(expected).toContain("FOR SHARE OF mem,o)");
      expected = expected.replace("FOR SHARE OF mem,o)", "FOR SHARE OF mem)");
    }
    if (["lp6d_share_sink_authorization", "lp6d_share_sink_authorization_worker"].includes(prior.proname)) {
      expect(expected).toContain("FOR SHARE OF a;");
      expected = expected.replace("FOR SHARE OF a;", "FOR SHARE OF a;\n PERFORM 1 FROM app.action_outbox WHERE tenant_id=p_tenant AND id=p_outbox FOR SHARE;");
    }
    expect(current).toEqual({ ...prior, definition: expected });
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
  expect(await snapshot(db)).toEqual({ ...before, ...lp11EmptyTables, "control_plane.worker_action_binding": [], "app.command_type_registry": (await db.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify([...(before["app.command_type_registry"] as unknown[]), discardDraftRegistryRow, invoiceSendRegistryRow])])).rows[0].data });
}, 120_000);
