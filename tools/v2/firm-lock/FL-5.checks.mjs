// Q39 / V2-FL-5, RED tenancy. Loaded by the full V2 seed suite's FL-1 loader.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";
import { firmLockCatalog, lockProblems } from "./guard.mjs";

const job = table => [table, "job_id"];
export const families = {
  inbox: ["app.inbox_decision_revision", "app.inbox_finding_revision", "app.inbox_metric_receipt", "app.inbox_outcome_event"].map(job),
  "practice exposure": [job("app.practice_exposure_schedule")],
  "practice feed": ["app.practice_feed_account", "app.practice_feed_command", "app.practice_feed_event",
    "app.practice_feed_job_owner", "app.practice_feed_receipt_match"].map(job),
  supplier: ["app.practice_supplier_credit_case_binding", "app.practice_supplier_credit_review_payment",
    "app.supplier_bill_supersession", "app.supplier_credit_consumption", "app.supplier_document", "app.supplier_document_intake",
    "app.supplier_document_version", "app.supplier_fact_proposal", "app.supplier_fact_revision",
    "app.supplier_line_match_correction", "app.supplier_line_match_snapshot", "app.supplier_match_allocation",
    "app.supplier_match_proposal", "app.supplier_match_revision"].map(job),
  attribution: [["app.northside_action_attribution", "source_id"]],
  sandbox: [job("app.sandbox_run"), ["app.sandbox_adapter_receipt", "run_id"],
    ["app.sandbox_run_event", "run_id"], ["app.sandbox_work", "run_id"]],
  synthetic: ["app.simulated_settlement_event", "app.synthetic_obligation", "app.synthetic_recovery_receipt"].map(job),
  watchdog: [job("app.watchdog_command_identity"), ["app.watchdog_command_result", "command_id"]],
  worm: [job("app.worm_command"), job("app.worm_synthetic_version"), ["app.worm_attempt", "command_id"]],
};
const tables = Object.values(families).flat().map(([table]) => table);
const migration = new URL("../migrations/2051_v2_firm_lock_supplier_feed_rest.sql", import.meta.url);

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  const read = (context, sql, values) => withTenant(runtime, context, db => db.$client.query(sql, values));

  test("FL-5: populated sandbox parent and all three children stay within their firm", async () => {
    const { firmA, firmB, firmBReal } = await contexts();
    await helpers.fl5SecondFirmJob();
    const runs = [];
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      for (const context of [firmA, firmB]) {
        const { rows: [own] } = await read(context, "SELECT id FROM app.job WHERE NOT EXISTS (SELECT FROM app.sandbox_run r WHERE r.job_id=job.id) ORDER BY id LIMIT 1");
        assert.ok(own, "positive control: each firm has its own job");
        const run = randomUUID();
        const work = randomUUID();
        runs.push([context, run]);
        // fixture: main's sandbox creation has no V2 route; owner inserts only in this test.
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [context.tenantId]);
        await client.query(`INSERT INTO app.sandbox_run(id,tenant_id,job_id,session_id,scenario,environment,status)
          VALUES($1,$2,$3,$4,'core-1000','synthetic_demo','active')`, [run, context.tenantId, own.id, randomUUID()]);
        await client.query(`INSERT INTO app.sandbox_run_event(id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash)
          VALUES($1,$2,$3,1,'created',0,$4,$5)`, [randomUUID(), context.tenantId, run, randomUUID(), "a".repeat(64)]);
        await client.query(`INSERT INTO app.sandbox_work(id,tenant_id,run_id,step,adapter,input_hash,amount_pence,currency,environment,approved)
          VALUES($1,$2,$3,1,'fake_quote_review',$4,0,'GBP','synthetic_demo',true)`, [work, context.tenantId, run, "a".repeat(64)]);
        await client.query(`INSERT INTO app.sandbox_adapter_receipt(id,tenant_id,run_id,work_id,attempt_number,adapter,input_hash,output_hash,fake_clock_tick,environment,external_action_count)
          VALUES($1,$2,$3,$4,1,'fake_quote_review',$5,$5,1,'synthetic_demo',0)`, [randomUUID(), context.tenantId, run, work, "a".repeat(64)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
    for (const [owner, run] of runs) {
      const other = owner === firmA ? firmB : firmA;
      for (const [table, key] of families.sandbox) {
        const column = table === "app.sandbox_run" ? "id" : key;
        const sql = `SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`;
        assert.equal((await read(owner, sql, [run])).rows[0].n, 1, `owner reads ${table}`);
        for (const outsider of [other, firmBReal]) {
          assert.equal((await read(outsider, sql, [run])).rows[0].n, 0, `other firm cannot read ${table}`);
        }
      }
    }
  });

  test("FL-5: exposure positive control and second-firm INSERT/UPDATE/DELETE refusal", async () => {
    const { firmA, firmB, firmBReal } = await contexts();
    const { rows: [own] } = await read(firmA, "SELECT id FROM app.job ORDER BY id LIMIT 1");
    assert.ok(own);
    const command = randomUUID();
    // fixture: exposure schedule has no V2 command route. Keep constraints and triggers enabled.
    await admin.query(`INSERT INTO app.practice_exposure_schedule(tenant_id,job_id,revision,command_id,request_hash,stages)
      SELECT $1,$2,coalesce(max(revision),0)+1,$3,$4,'[{}]'::jsonb
      FROM app.practice_exposure_schedule WHERE tenant_id=$1 AND job_id=$2`,
    [firmA.tenantId, own.id, command, "a".repeat(64)]);
    const sql = "SELECT * FROM app.practice_exposure_schedule WHERE command_id=$1";
    assert.equal((await read(firmA, sql, [command])).rows.length, 1, "firm A reads its row");
    for (const outsider of [firmB, firmBReal]) {
      assert.equal((await read(outsider, sql, [command])).rows.length, 0);
      await assert.rejects(read(outsider, `INSERT INTO app.practice_exposure_schedule
        (tenant_id,job_id,revision,command_id,request_hash,stages) VALUES($1,$2,1000000,$3,$4,'[{}]'::jsonb)`,
      [firmA.tenantId, own.id, randomUUID(), "a".repeat(64)]), error => error.code === "42501");
      for (const statement of [
        "UPDATE app.practice_exposure_schedule SET stages=stages WHERE command_id=$1",
        "DELETE FROM app.practice_exposure_schedule WHERE command_id=$1",
      ]) {
        // No widened grants: refusal can be permission denied or zero affected rows.
        try { assert.equal((await read(outsider, statement, [command])).rowCount, 0); }
        catch (error) { assert.equal(error.code, "42501"); }
      }
    }
    assert.equal((await admin.query(sql, [command])).rows.length, 1, "row survives every refused write");
  });

  registerFirmChecks(helpers, "FL-5", families);

  test("FL-5: all 37 catalog targets retain FORCE RLS and the full-key restrictive lock", async () => {
    const catalog = await firmLockCatalog(admin);
    const locked = new Set(catalog.filter(row => row.firm_policy).map(row => row.relation));
    assert.equal(new Set(tables).size, 37);
    for (const table of tables) {
      const row = catalog.find(entry => entry.relation === table);
      assert.ok(row, `${table} is still in the job-bound catalog`);
      assert.equal(row.runtime_access, true, `${table} remains runtime-accessible`);
      assert.deepEqual(lockProblems(row, locked), [], table);
      const { rows: [flags] } = await admin.query("SELECT relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [table]);
      assert.equal(flags.relforcerowsecurity, true, table);
    }
  });

  test("FL-5: first application with existing rows and replay preserve data, grants and policies", async () => {
    const client = await admin.connect();
    const snapshot = async () => ({
      policies: (await client.query(`SELECT polrelid::regclass::text AS relation,polname,polcmd,polpermissive,polroles,
        pg_get_expr(polqual,polrelid) AS using,pg_get_expr(polwithcheck,polrelid) AS check
        FROM pg_policy WHERE polrelid=ANY($1::regclass[]) ORDER BY 1,2`, [tables])).rows,
      grants: (await client.query("SELECT oid::regclass::text AS relation,relacl FROM pg_class WHERE oid=ANY($1::regclass[]) ORDER BY 1", [tables])).rows,
      rows: await Promise.all(tables.map(async table => [table,
        (await client.query(`SELECT to_jsonb(r) AS row FROM ${table} r ORDER BY to_jsonb(r)::text`)).rows])),
    });
    try {
      await client.query("BEGIN");
      const before = await snapshot();
      // Rehearse first installation against populated tables, without persisting a policy removal.
      for (const table of tables) await client.query(`DROP POLICY v2_practice_firm ON ${table}`);
      const sql = readFileSync(migration, "utf8");
      await client.query(sql);
      assert.deepEqual(await snapshot(), before, "first install changes only the previously absent firm locks");
      await client.query(sql);
      assert.deepEqual(await snapshot(), before, "second application is a no-op");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
}
