// Q40 / FL-F is a draft report, not a fix. Expected failures must never be merged.
import { assessments, functionCatalog, reachableFunctions, reportRow, sourceCandidates } from "./FL-F.inventory.mjs";

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  const query = (context, sql, params) => withTenant(runtime, context, db => db.$client.query(sql, params));
  let fixture;
  async function targets() {
    return fixture ??= (async () => {
      const { firmA, firmB } = await contexts();
      assert.equal(firmA.tenantId, firmB.tenantId);
      const { rows: [progress] } = await query(firmA, `SELECT p.* FROM app.scope_progress p
        JOIN app.job j ON (j.tenant_id,j.id)=(p.tenant_id,p.job_id)
        WHERE j.status='live' AND p.stage IN ('not_started','complete') ORDER BY p.job_id,p.scope_item_id LIMIT 1`);
      assert.ok(progress, "positive control requires a firm A live job with progress");
      assert.equal((await query(firmB, "SELECT id FROM app.job WHERE id=$1", [progress.job_id])).rowCount, 0);
      assert.equal((await query(firmB, "SELECT scope_item_id FROM app.scope_progress WHERE job_id=$1", [progress.job_id])).rowCount, 0);
      const { rows: [keysA] } = await query(firmA, "SELECT app.current_firm_profile_key() AS key");
      const { rows: [keysB] } = await query(firmB, "SELECT app.current_firm_profile_key() AS key");
      assert.ok(keysA.key);
      assert.ok(keysB.key);
      assert.notEqual(keysA.key, keysB.key, "different protected firm keys, same tenant");
      return { firmA, firmB, progress };
    })();
  }

  async function transition(context, progress) {
    // Inspect the attempted write in the same transaction, then ALWAYS roll back.
    // No audit-free business mutation or fixture alteration is committed by this probe.
    const rollback = new Error("FL-F probe rollback");
    let result;
    try {
      await withTenant(runtime, context, async db => {
        const { rows: [row] } = await db.$client.query(`SELECT * FROM app.transition_scope_progress($1,$2,$3,$4,$5,$6)`,
          [context.tenantId, progress.job_id, progress.scope_item_id, progress.revision,
            "in_progress",
            progress.stage === "not_started" ? "start" : "rework"]);
        assert.equal(row.revision, progress.revision + 1);
        result = row;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    return result;
  }

  test("FL-F catalog: report installed overloads, owners, grants and nested candidates", async t => {
    const catalog = await functionCatalog(admin);
    const reached = reachableFunctions(catalog, sourceCandidates());
    const reachedIds = new Set(reached.map(row => row.oid));
    const reachable = [...reached, ...catalog.filter(row => row.definer && row.schema === "app" && row.runtime_execute && !reachedIds.has(row.oid))
      .map(row => ({ ...row, callers: ["no static root path found: retain as unclear candidate"] }))]
      .filter(row => row.definer && row.schema === "app").sort((a, b) => a.signature.localeCompare(b.signature));
    assert.ok(reachable.length > 0);
    for (const name of Object.keys(assessments)) {
      assert.ok(reachable.some(row => `${row.schema}.${row.name}` === name), `${name} must be in the installed callable graph`);
    }
    t.diagnostic(`app runtime-executable definers: ${catalog.filter(row => row.schema === "app" && row.definer && row.runtime_execute).length}; catalog/root/nested definer candidates: ${reachable.length}`);
    t.diagnostic("Conservative discovery, not a complete path proof: dynamic SQL, relation/view/policy/trigger paths and route mode fences still require inspection.");
    t.diagnostic("| Function | Owner / grant | Caller | Job rows | Class | Firm check / reason | Proof |\n|---|---|---|---|---|---|---|\n" + reachable.map(reportRow).join("\n"));
  });

  // These ordinary tests keep fixture/auth errors from being hidden inside a TODO.
  test("FL-F positive controls: firm A reads parties and live status while firm B cannot SELECT the job", async () => {
    const { firmA, progress } = await targets();
    const { rows: [row] } = await query(firmA, "SELECT app.require_current_job_parties($1,$2) AS snapshot", [firmA.tenantId, progress.job_id]);
    assert.ok(row.snapshot.bindingId);
    assert.equal((await query(firmA, "SELECT app.require_watchdog_live($1)", [progress.job_id])).rowCount, 1);
  });

  test("FL-F positive control: firm A can transition progress and the probe rolls back", async () => {
    const { firmA, progress } = await targets();
    await transition(firmA, progress);
    const { rows: [after] } = await query(firmA, "SELECT * FROM app.scope_progress WHERE job_id=$1 AND scope_item_id=$2", [progress.job_id, progress.scope_item_id]);
    assert.deepEqual(after, progress);
  });

  test.todo("FL-F parties: firm B must not obtain firm A's party snapshot (tenant-only definer; fix packet required)", async () => {
    const { firmB, progress } = await targets();
    await assert.rejects(query(firmB, "SELECT app.require_current_job_parties($1,$2)", [firmB.tenantId, progress.job_id]),
      error => ["42501", "P0002"].includes(error.code));
  });

  test.todo("FL-F lifecycle: firm B must not discover/lock firm A's live job (tenant-only definer; fix packet required)", async () => {
    const { firmB, progress } = await targets();
    await assert.rejects(query(firmB, "SELECT app.require_watchdog_live($1)", [progress.job_id]),
      error => ["42501", "P0002"].includes(error.code));
  });

  test.todo("FL-F progress: firm B must not transition firm A's progress (tenant-only definer; fix packet required)", async () => {
    const { firmA, firmB, progress } = await targets();
    try {
      await assert.rejects(transition(firmB, progress), error => ["42501", "P0002"].includes(error.code));
    } finally {
      const { rows: [after] } = await query(firmA, "SELECT * FROM app.scope_progress WHERE job_id=$1 AND scope_item_id=$2", [progress.job_id, progress.scope_item_id]);
      assert.deepEqual(after, progress, "cross-firm probe also rolled back");
    }
  });
}
