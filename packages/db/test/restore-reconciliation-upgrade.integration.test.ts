import { afterAll, beforeAll, expect, it } from "vitest";
import { darkOrderRegistryRow, rateSuggestionRegistryRow, contractorJobFinishRegistryRow } from "./lp5-command-catalog.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { migrate } from "../src/migrate.js";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { snapshot, predecessorCatalogue } from "./contractor-entitlement-fixtures.js";

const own = "0581_restore_reconciliation.sql";
let cluster: Cluster;
beforeAll(async () => { cluster = await startBeforeMigration(own); }, 120_000);
afterAll(async () => { await cluster?.close(); });
it("adds the resume guard without rewriting predecessor data or replacing the latest command routine", async () => {
  const before = await snapshot(cluster.admin), catalog = await predecessorCatalogue(cluster.admin);
  const state = (await cluster.admin.query("SELECT * FROM outbound_control.state")).rows;
  const command = (await cluster.admin.query("SELECT pg_get_functiondef('outbound_control.command(uuid,text,integer,uuid)'::regprocedure) definition")).rows;
  await applyMigration(cluster, own);
  expect(await snapshot(cluster.admin)).toEqual(before);
  expect(await predecessorCatalogue(cluster.admin)).toEqual(catalog);
  // Check 0581 against its exact predecessor before later migrations add their catalogues.
  await migrate(cluster.admin);
  // 0606, 0609 and 0990 add the dark-order, rate-acceptance and EndCheck rows.
  const registry = (await cluster.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)",
    [JSON.stringify([...(before["app.command_type_registry"] as unknown[]), darkOrderRegistryRow, rateSuggestionRegistryRow, contractorJobFinishRegistryRow])])).rows[0].data;
  expect(await snapshot(cluster.admin)).toEqual({ ...laterEmptyTables, ...before, "app.command_type_registry": registry });
  expect((await cluster.admin.query("SELECT * FROM outbound_control.state")).rows).toEqual(state);
  expect((await cluster.admin.query("SELECT pg_get_functiondef('outbound_control.command(uuid,text,integer,uuid)'::regprocedure) definition")).rows).toEqual(command);
  expect((await cluster.admin.query("SELECT * FROM outbound_control.reconciliation")).rows).toEqual([]);
  for (const role of ["jobguard_runtime", "jobguard_infrastructure", "jobguard_identity", "jobguard_shadow", "jobguard_outbound_operator"]) {
    expect((await cluster.admin.query(`SELECT
      has_table_privilege($1,'outbound_control.reconciliation','INSERT,UPDATE,DELETE,TRUNCATE') writes,
      has_function_privilege($1,'outbound_control.require_reconciliation()','EXECUTE') trigger_call`, [role])).rows).toEqual([{ writes: false, trigger_call: false }]);
    expect((await cluster.admin.query("SELECT has_function_privilege($1,'outbound_control.record_reconciliation(uuid,uuid)','EXECUTE') allowed", [role])).rows).toEqual([{allowed: role === "jobguard_outbound_operator"}]);
  }
  expect((await cluster.admin.query(`SELECT pg_get_userbyid(relowner) owner, relrowsecurity, relforcerowsecurity
    FROM pg_class WHERE oid='outbound_control.reconciliation'::regclass`)).rows).toEqual([
    {owner:"jobguard_migration",relrowsecurity:false,relforcerowsecurity:false},
  ]);
});
