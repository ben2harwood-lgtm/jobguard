// Q37 / V2-FL-3 (2049): real runtime reads, never owner reads as isolation proof.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";
import { orderFixtures } from "./FL-3.fixtures.mjs";

const job = table => [table, "job_id"];
export const families = {
  "activation and import": ["app.activation_acceptance_operation_use", "app.imported_job_baseline", "app.late_source_import"].map(job),
  "materials and orders": ["app.material_requirement", "app.purchase_order_draft", "app.purchase_order_revision",
    "app.purchase_order_placement", "app.purchase_order_manual_attestation", "app.rate_book_observation"].map(job),
  "supplier receipts and discrepancies": ["app.goods_receipt", "app.discrepancy_finding_revision", "app.discrepancy_review_outcome"].map(job),
  "site, property and readiness": [...["app.planned_work_revision", "app.readiness_decision", "app.readiness_snapshot",
    "app.scheduled_readiness_plan", "app.scheduled_readiness_proposal", "app.stage_completion", "app.property_constraint_fact", "app.counterparty_check"].map(job),
  ["app.stage_review_event", "stage_completion_id"]],
  "commercial integrity": ["app.commercial_integrity_activity_fact", "app.commercial_integrity_value_fact"].map(job),
  "landing and allocations": ["app.landing_allocation", "app.landing_reversal", "app.receipt_line_allocation"].map(job),
  "contractor work orders": [...["app.contractor_party_binding", "app.work_order", "app.work_order_line", "app.site_visit", "app.contractor_receipt_line_allocation"].map(job),
  ["app.import_row_receipt", "work_order_id"], ["app.work_order_revision", "work_order_id"]],
};
const tables = Object.values(families).flat().map(([table]) => table).sort();
const migration = new URL("../migrations/2049_v2_firm_lock_orders_site.sql", import.meta.url);

// These are test-only synthetic fixtures: no route or command is added, no trigger
// or constraint is disabled. Existing suite rows continue to prove the V2 commands.
async function fixtures(helpers) {
  const { admin, runtime, withTenant, assert, contexts } = helpers;
  const { firmA, firmB } = await contexts();
  await helpers.fl3SecondFirmJob();
  const jobs = [];
  for (const context of [firmA, firmB]) {
    const { rows: [own] } = await withTenant(runtime, context, db => db.$client.query(
      "SELECT j.id FROM app.job j ORDER BY (status='live') DESC, EXISTS(SELECT FROM app.evidence_object e WHERE (e.tenant_id,e.job_id)=(j.tenant_id,j.id)) DESC, j.id LIMIT 1"));
    assert.ok(own, "each practice firm has its own visible job");
    jobs.push(own.id);
  }
  assert.notEqual(jobs[0], jobs[1], "the fixture jobs belong to different firms");
  await helpers.fl3OrderRows(jobs[0]);
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    for (const [index, context] of [firmA, firmB].entries()) {
      const tenant = context.tenantId, jobId = jobs[index];
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      const { rows: [audit] } = await client.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence LIMIT 1", [tenant]);
      assert.ok(audit, "use a genuine existing audit reference, never a made-up event");
      // fixture: commercial integrity capture has no V2 route.
      await client.query(`INSERT INTO app.commercial_integrity_activity_fact
        (id,tenant_id,job_id,activity_kind,occurred_at,synthetic) VALUES($1,$2,$3,'site_activity',clock_timestamp(),true)`,
      [randomUUID(), tenant, jobId]);
      await client.query(`INSERT INTO app.commercial_integrity_value_fact
        (id,tenant_id,job_id,value_kind,net_value_pence,currency,source_ref,occurred_at,synthetic)
        VALUES($1,$2,$3,'quoted',100,'GBP',$4,clock_timestamp(),true)`, [randomUUID(), tenant, jobId, randomUUID()]);
      // fixture: scheduled-readiness persistence has no V2 route.
      const taskId = randomUUID(), planHash = "a".repeat(64), proposalKey = randomUUID().replaceAll("-", "").repeat(2);
      const scope = { tenantId: tenant, jobId, taskId };
      await client.query(`INSERT INTO app.scheduled_readiness_plan
        (tenant_id,job_id,task_id,fact_revision,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,1,$4,$5,$6)`,
      [tenant, jobId, taskId, planHash, { version: "readiness-scheduled-plan.v1", synthetic: true, scope,
        factRevision: 1, status: "confirmed" }, audit.id]);
      await client.query(`INSERT INTO app.scheduled_readiness_proposal
        (tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [tenant, jobId, taskId, proposalKey, planHash, { version: "readiness-prevention-proposal.v1", scope,
        key: proposalKey, planHash, classification: "prevention", status: "proposal", feeEligible: false,
        programmeChanged: false, recoveryFeePence: 0 }, audit.id]);
    }
    const { rows: [audit] } = await client.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence LIMIT 1", [firmA.tenantId]);
    await orderFixtures(client, firmA.tenantId, jobs[0], audit.id);
    // Prove all deferred references before committing fixtures.
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { firmA, firmB, jobs };
}

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  let seeded;
  test("FL-3: synthetic scheduling and commercial fixtures belong to their own firm", async () => {
    seeded = await fixtures(helpers);
    for (const table of ["app.commercial_integrity_activity_fact", "app.commercial_integrity_value_fact",
      "app.scheduled_readiness_plan", "app.scheduled_readiness_proposal"]) {
      for (const [index, context] of [seeded.firmA, seeded.firmB].entries()) {
        const read = jobId => withTenant(runtime, context, db => db.$client.query(
          `SELECT 1 FROM ${table} WHERE job_id=$1`, [jobId]));
        assert.ok((await read(seeded.jobs[index])).rowCount > 0, `${table}: own firm positive control`);
        assert.equal((await read(seeded.jobs[1 - index])).rowCount, 0, `${table}: other firm is invisible`);
      }
    }
  });
  registerFirmChecks(helpers, "FL-3", families);
  test("FL-3: every family has a firm A row before its isolation result counts", async () => {
    const { firmA } = await contexts();
    for (const [family, members] of Object.entries(families)) {
      let count = 0;
      for (const [table] of members) count += (await withTenant(runtime, firmA, db => db.$client.query(`SELECT 1 FROM ${table} LIMIT 1`))).rowCount;
      assert.ok(count > 0, `${family}: an empty family cannot prove firm isolation`);
    }
  });

  test("FL-3: all 33 catalog tables have forced RLS and the restrictive firm policy", async () => {
    const { rows } = await admin.query(`SELECT c.oid::regclass::text AS name,c.relrowsecurity,c.relforcerowsecurity,
      p.polpermissive,p.polcmd::text,p.polroles,pg_get_expr(p.polqual,p.polrelid) AS expression
      FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid AND p.polname='v2_practice_firm'
      WHERE c.oid=ANY($1::regclass[]) ORDER BY 1`, [tables]);
    assert.equal(tables.length, 33);
    assert.deepEqual(rows.map(row => row.name), tables);
    const role = (await admin.query("SELECT 'jobguard_runtime'::regrole::oid AS id")).rows[0].id;
    for (const row of rows) {
      assert.equal(row.relrowsecurity, true, row.name);
      assert.equal(row.relforcerowsecurity, true, row.name);
      assert.equal(row.polpermissive, false, row.name);
      assert.equal(row.polcmd, "*", row.name);
      assert.deepEqual(row.polroles, [role], row.name);
      assert.match(row.expression, /EXISTS/u, row.name);
    }
  });

  test("FL-3: populated migration applies twice without changing rows, grants or policies", async () => {
    await contexts();
    const snapshot = async () => ({
      policies: (await admin.query(`SELECT polrelid::regclass::text AS name,polname,polpermissive,polcmd::text,polroles,
        pg_get_expr(polqual,polrelid) AS using,pg_get_expr(polwithcheck,polrelid) AS check
        FROM pg_policy WHERE polrelid=ANY($1::regclass[]) ORDER BY 1,2`, [tables])).rows,
      grants: (await admin.query("SELECT oid::regclass::text AS name,relacl::text FROM pg_class WHERE oid=ANY($1::regclass[]) ORDER BY 1", [tables])).rows,
      rows: await Promise.all(tables.map(async table => [table, (await admin.query(
        `SELECT to_jsonb(r) AS row FROM ${table} r ORDER BY to_jsonb(r)::text`)).rows])),
    });
    const before = await snapshot();
    for (let run = 0; run < 2; run++) {
      await admin.query(readFileSync(migration, "utf8"));
      assert.deepEqual(await snapshot(), before);
    }
  });

  test("FL-3: second firm cannot insert, update or delete the first firm's scheduling facts", async () => {
    assert.ok(seeded, "fixture setup ran in the full V2 seed suite");
    const { firmA, firmB, firmBReal } = await contexts();
    const { rows: [row] } = await withTenant(runtime, firmA, db => db.$client.query(
      "SELECT to_jsonb(p) AS payload FROM app.scheduled_readiness_plan p WHERE job_id=$1", [seeded.jobs[0]]));
    assert.ok(row, "positive control: firm A reads its own plan");
    const count = async () => (await admin.query("SELECT count(*)::int AS n FROM app.scheduled_readiness_plan")).rows[0].n;
    const before = await count();
    for (const other of [firmB, firmBReal]) {
      await assert.rejects(withTenant(runtime, other, db => db.$client.query(
        "INSERT INTO app.scheduled_readiness_plan SELECT * FROM jsonb_populate_record(NULL::app.scheduled_readiness_plan,$1)",
        [{ ...row.payload, task_id: randomUUID() }])), error => error.code === "42501" && /row-level security/u.test(error.message));
      for (const sql of ["UPDATE app.scheduled_readiness_plan SET payload=payload WHERE job_id=$1",
        "DELETE FROM app.scheduled_readiness_plan WHERE job_id=$1"]) {
        await assert.rejects(withTenant(runtime, other, db => db.$client.query(sql, [seeded.jobs[0]])),
          error => error.code === "42501");
      }
    }
    assert.equal(await count(), before);
  });
}
