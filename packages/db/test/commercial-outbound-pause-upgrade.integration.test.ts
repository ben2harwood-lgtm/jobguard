import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { snapshot, predecessorCatalogue } from "./contractor-entitlement-fixtures.js";

const own = "0474_commercial_outbound_pause.sql";
let cluster: Cluster;
beforeAll(async () => { cluster = await startBeforeMigration(own); }, 120_000);
afterAll(async () => { await cluster?.close(); });
it("upgrades without rewriting any predecessor data or authority and migrates twice safely", async () => {
  const before = await snapshot(cluster.admin), catalog = await predecessorCatalogue(cluster.admin);
  await applyMigration(cluster, own);
  expect(await snapshot(cluster.admin)).toEqual(before);
  expect(await predecessorCatalogue(cluster.admin)).toEqual(catalog);
  const state = (await cluster.admin.query("SELECT * FROM outbound_control.state")).rows;
  expect(state).toEqual([{singleton:true,paused:false,revision:0,paused_by:null,resume_requested_by:null,resume_request_id:null}]);
  await migrate(cluster.admin);
  expect((await cluster.admin.query("SELECT * FROM outbound_control.state")).rows).toEqual(state);
  expect((await cluster.admin.query("SELECT * FROM outbound_control.event")).rows).toEqual([]);
  expect((await cluster.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='outbound_control' AND c.relkind='r' ORDER BY 1`)).rows).toEqual([
    {relname:"event",owner:"jobguard_migration",relrowsecurity:false},
    {relname:"state",owner:"jobguard_migration",relrowsecurity:false},
  ]);
  for (const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_identity","jobguard_shadow"]) {
    expect((await cluster.admin.query(`SELECT has_table_privilege($1,'outbound_control.state','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') state,
      has_table_privilege($1,'outbound_control.event','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') event,
      has_function_privilege($1,'outbound_control.command(uuid,text,integer,uuid)','EXECUTE') command`, [role])).rows).toEqual([{state:false,event:false,command:false}]);
  }
  expect((await cluster.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
    has_function_privilege('jobguard_outbound_operator',p.oid,'EXECUTE') operator
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='outbound_control' ORDER BY 1`)).rows).toEqual([
    {proname:"claims_enabled",owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:true,operator:false},
    {proname:"command",owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:false,operator:true},
  ]);
});
