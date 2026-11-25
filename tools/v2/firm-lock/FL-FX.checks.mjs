// V2-FL-FX (migration 2057): firm check inside the two definers FL-F (#978) found leaking.
import { readFileSync } from "node:fs";

const routines = ["app.require_current_job_parties(uuid,uuid)", "app.require_watchdog_live(uuid)"];

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  const query = (context, sql, params) => withTenant(runtime, context, db => db.$client.query(sql, params));
  let prepared;
  const prepare = () => prepared ??= (async () => {
    const { firmA, firmB } = await contexts();
    assert.equal(firmA.tenantId, firmB.tenantId, "both practice firms share one tenant");
    const { rows: [job] } = await query(firmA, "SELECT id FROM app.job WHERE status='live' AND practice_session_digest IS NOT NULL ORDER BY id LIMIT 1");
    assert.ok(job, "positive control: firm A has a live practice job");
    assert.equal((await query(firmB, "SELECT id FROM app.job WHERE id=$1", [job.id])).rowCount, 0);
    return { firmA, firmB, jobId: job.id };
  })();

  test("FL-FX: firm B cannot read firm A's party snapshot; firm A still can", async () => {
    const { firmA, firmB, jobId } = await prepare();
    const { rows: [own] } = await query(firmA, "SELECT app.require_current_job_parties($1,$2) AS snapshot", [firmA.tenantId, jobId]);
    assert.ok(own.snapshot?.bindingId, "firm A reads its own party snapshot");
    await assert.rejects(query(firmB, "SELECT app.require_current_job_parties($1,$2)", [firmB.tenantId, jobId]),
      error => error.code === "P0002" && error.message === "NOT_FOUND");
  });

  test("FL-FX: firm B cannot learn that firm A's job is live; firm A still can", async () => {
    const { firmA, firmB, jobId } = await prepare();
    assert.equal((await query(firmA, "SELECT app.require_watchdog_live($1)", [jobId])).rowCount, 1);
    await assert.rejects(query(firmB, "SELECT app.require_watchdog_live($1)", [jobId]),
      error => error.code === "42501" && error.message === "JOB_NOT_FOUND");
  });

  test("FL-FX: 2057 keeps owner, definer, settings and grants, and applies twice unchanged", async () => {
    await prepare();
    const catalog = async () => (await admin.query(`SELECT p.oid::regprocedure::text AS signature, p.proowner::regrole::text AS owner,
      p.prosecdef, p.proconfig, p.proacl::text, p.prosrc, has_function_privilege('jobguard_runtime', p.oid, 'EXECUTE') AS runtime
      FROM pg_proc p WHERE p.oid = ANY($1::regprocedure[]) ORDER BY 1`, [routines])).rows;
    const before = await catalog();
    assert.equal(before.length, 2);
    for (const row of before) {
      assert.equal(row.owner, "jobguard_migration");
      assert.equal(row.prosecdef, true);
      assert.deepEqual(row.proconfig, ["search_path=pg_catalog, app"]);
      assert.equal(row.runtime, true);
      assert.match(row.prosrc, /V2-FL-FX/u, `${row.signature} carries the firm check`);
    }
    const migration = readFileSync(new URL("../migrations/2057_v2_definer_firm_check.sql", import.meta.url), "utf8");
    for (let i = 0; i < 2; i++) {
      await admin.query(migration);
      assert.deepEqual(await catalog(), before);
    }
  });
}
