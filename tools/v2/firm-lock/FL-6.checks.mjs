// FL-6 (Q44, migration 2054): discovered by the full V2 seed suite alongside FL-1.
import { readFileSync } from "node:fs";
import { firmLockCatalog, lockProblems } from "./guard.mjs";
import { registerFirmChecks } from "./checks-lib.mjs";

const migration = readFileSync(new URL("../migrations/2054_v2_own_tables_firm_lock.sql", import.meta.url), "utf8");

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;

  test("FL-6: every V2-owned job table has a working firm lock, without pending exemptions", async t => {
    const tables = (await firmLockCatalog(admin)).filter(row => row.kind === "direct" && row.relation.startsWith("app.v2_"));
    assert.ok(tables.length > 0, "positive control: V2 job tables exist");
    const failures = tables.map(row => ({ table: row.relation, problems: lockProblems(row) }))
      .filter(row => row.problems.length > 0);
    assert.deepEqual(failures, [], "every V2-owned job table must be firm-locked");
    for (const row of tables) t.diagnostic(`${row.relation}: firm-locked`);
  });

  test("FL-6: installs a missing policy and applies twice without changing grants or other policies", async () => {
    const client = await admin.connect();
    const snapshot = async () => ({
      policies: (await client.query(`SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies WHERE schemaname = 'app' ORDER BY tablename, policyname`)).rows,
      grants: (await client.query(`SELECT c.relname, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') ORDER BY c.relname`)).rows,
    });
    try {
      await client.query("BEGIN");
      const before = await snapshot();
      // FL-1 already locks this table. Remove only that policy inside a rolled-back
      // transaction to exercise 2054's missing-policy path on this base too.
      await client.query("DROP POLICY v2_practice_firm ON app.v2_work_plan_task");
      await client.query(migration);
      assert.deepEqual(await snapshot(), before, "2054 restores only the missing firm policy");
      await client.query(migration);
      assert.deepEqual(await snapshot(), before, "the second application is a no-op");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("FL-6: work-plan task read proof has persisted firm A rows", async () => {
    const { firmA } = await contexts();
    const { rowCount } = await withTenant(runtime, firmA, db => db.$client.query("SELECT job_id FROM app.v2_work_plan_task"));
    assert.ok(rowCount > 0, "firm A must read real persisted task rows before the firm A/B proof");
  });
  registerFirmChecks(helpers, "FL-6", { "V2 work-plan task": [["app.v2_work_plan_task", "job_id"]] });
}
