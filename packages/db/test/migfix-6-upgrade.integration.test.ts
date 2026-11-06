import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { legacyRecoveryFixture } from "./migfix-6-fixture.js";
import { migrate } from "../src/migrate.js";
const migration = "0631_legacy_recovery_money_integrity.sql";
let c: Cluster | undefined;
const previousEnvironment = process.env.JOBGUARD_ENV;
afterAll(async () => {
  await c?.close();
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
});
it("upgrades populated v1 history without changing rows, RLS, grants or unrelated bodies, and replays safely", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration(migration, "jobguard_synthetic_demo");
  const legacy = await legacyRecoveryFixture(c.admin, c.runtime);
  const w = await legacy.world(false); await legacy.openCase(w, 250000);
  const p = legacy.payload(w, await legacy.receipt(w, 100000), 100000, 100000);
  await legacy.land(p);
  const before = await snapshot(c.admin);
  const catalog = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
    p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('app','identity','control_plane','audit_control','worm_control') AND p.prokind='f' ORDER BY 1,2,3`)).rows;
  const policies = async () => (await c!.admin.query("SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows;
  const relations = async () => (await c!.admin.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
  const prior = await catalog(), oldPolicies = await policies(), oldRelations = await relations();
  await applyMigration(c, migration);
  expect(await snapshot(c.admin)).toEqual(before);
  expect(await policies()).toEqual(oldPolicies); expect(await relations()).toEqual(oldRelations);
  const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
  const live = await catalog();
  for (const row of prior) {
    const current = live.find(x => x.nspname === row.nspname && x.proname === row.proname && x.args === row.args);
    if (row.nspname === 'app' && ['approve_synthetic_landing','reverse_synthetic_landing'].includes(row.proname)) {
      const body = sql.split(`CREATE OR REPLACE FUNCTION app.${row.proname}(`)[1]!.split('AS $$')[1]!.split('$$;')[0];
      expect(current).toEqual({ ...row, definition: current.definition });
      expect(current.definition.split('$function$')[1]).toEqual(body);
    } else expect(current).toEqual(row);
  }
  expect(live).toHaveLength(prior.length);
  const bound = (await c.admin.query("SELECT convalidated,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.landing_allocation'::regclass AND conname='landing_allocation_eligible_within_gross'")).rows;
  expect(bound).toEqual([{ convalidated: true, definition: 'CHECK ((eligible_net_pence <= gross_pence))' }]);
  await migrate(c.admin); await migrate(c.admin);
  // 0634 adds only its empty table and one command registry row; everything else compares exactly.
  const replayed = await snapshot(c.admin), registry = replayed["app.command_type_registry"] as { command_type: string }[];
  expect(registry.filter(r => r.command_type !== "RecordExtraProceed")).toEqual(before["app.command_type_registry"]);
  expect(registry.filter(r => r.command_type === "RecordExtraProceed")).toEqual([{ audit_class: "operational", command_type: "RecordExtraProceed", completion_adapter: "extra_proceed",
    lock_adapter: "route_before_begin", outbox_class: null, permission_rule: "active_member", version: "repository-command.v1" }]);
  expect({ ...replayed, "app.command_type_registry": before["app.command_type_registry"] }).toEqual({ ...before, "app.extra_proceed_statement": [] });
  await legacy.reverse(p.allocationId, 40000);
  expect((await legacy.derivations(w.job)).at(-1)).toMatchObject({ landed: 60000, credit: 0, liability: 6000, delta: -4000 });
  expect(legacy.net(await legacy.journal(w.job))).toBe(6000);
}, 180000);
