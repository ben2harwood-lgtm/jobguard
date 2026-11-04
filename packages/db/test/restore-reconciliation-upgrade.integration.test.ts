import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { snapshot, predecessorCatalogue } from "./contractor-entitlement-fixtures.js";
import { laterEmptyTables } from "./later-empty-tables.js";

const own = "0659_restore_reconciliation.sql";
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
  await migrate(cluster.admin);
  expect(await snapshot(cluster.admin)).toEqual({ ...before, ...laterEmptyTables });
  // 0660 adds exactly these rehearsal objects. Preserve the complete metadata and
  // bodies of every predecessor; the privacy/LP-0 suites verify the additions.
  const live = await predecessorCatalogue(cluster.admin);
  const tables = ["privacy_artifact", "privacy_command", "privacy_request", "privacy_subject"];
  const routines = ["privacy_command", "privacy_read"];
  const newRelations = live.relations.filter(row => row.nspname === "app" && tables.includes(row.relname));
  const newRoutines = live.routines.filter(row => row.nspname === "app" && routines.includes(row.proname));
  const newPolicies = live.policies.filter(row => row.schemaname === "app" && tables.includes(row.tablename));
  expect(newRelations.map(row => row.relname)).toEqual(tables);
  expect(newRoutines.map(row => [row.proname, row.args])).toEqual([
    ["privacy_command", "t uuid, digest text, v jsonb"], ["privacy_read", "t uuid, digest text, r uuid"],
  ]);
  expect(newPolicies.map(row => [row.tablename, row.policyname])).toEqual(tables.map(table => [table, "tenant_isolation"]));
  expect({
    relations: live.relations.filter(row => !newRelations.includes(row)),
    routines: live.routines.filter(row => !newRoutines.includes(row)),
    policies: live.policies.filter(row => !newPolicies.includes(row)),
  }).toEqual(catalog);
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
