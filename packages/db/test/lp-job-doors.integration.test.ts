import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertJob, jobDoorCounts, jobDoorsActor, jobDoorsDatabase, transaction, type InitialShape, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });

describe("LP-2 ordinary insertion boundary (tests first; implementation stopped)", () => {
  it("[LP2-A14] the private permit has a tenant key, forced RLS and no runtime table privilege", async () => {
    const object = (await db.owner.query(`SELECT r.rolname AS owner,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='app' AND c.relname='lp_job_insert_permit'`)).rows;
    expect(object).toEqual([{ owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true }]);
    const columns = (await db.owner.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a
      ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
      WHERE i.indrelid='app.lp_job_insert_permit'::regclass AND i.indisprimary ORDER BY a.attname`)).rows.map(row => row.attname);
    expect(columns).toEqual(["backend_pid", "job_id", "tenant_id", "transaction_id"]);
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect((await db.owner.query("SELECT has_table_privilege('lp2_login','app.lp_job_insert_permit',$1) AS allowed", [privilege])).rows)
        .toEqual([{ allowed: false }]);
    }
    const actor = await jobDoorsActor(db.owner);
    for (const sql of ["SELECT * FROM app.lp_job_insert_permit", "INSERT INTO app.lp_job_insert_permit DEFAULT VALUES",
      "UPDATE app.lp_job_insert_permit SET operation=operation", "DELETE FROM app.lp_job_insert_permit"]) {
      await expect(transaction(db.runtime, actor.tenant, client => client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("[LP2-A14] runtime cannot assume the permit owner or disable the job insertion guard", async () => {
    const actor = await jobDoorsActor(db.owner);
    for (const sql of ["SET LOCAL ROLE jobguard_migration", "ALTER TABLE app.job DISABLE TRIGGER ALL",
      "SET LOCAL session_replication_role='replica'"]) {
      await expect(transaction(db.runtime, actor.tenant, client => client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.owner.query("SELECT pg_has_role('lp2_login','jobguard_migration','SET') AS allowed")).rows)
      .toEqual([{ allowed: false }]);
  });

  it("[LP2-A02] ordinary safe draft insertion succeeds and persists through a fresh connection", async () => {
    const actor = await jobDoorsActor(db.owner), id = randomUUID();
    await transaction(db.runtime, actor.tenant, client => insertJob(client, actor.tenant, id));
    const client = await db.owner.connect();
    try {
      expect((await client.query(`SELECT status,revision,provenance,accepted_quote_version_id,baseline_quote_version_id,
        accepted_net_value_pence,recovery_cap_pence,fee_policy_version FROM app.job WHERE tenant_id=$1 AND id=$2`, [actor.tenant, id])).rows).toEqual([{
        status: "draft", revision: 0, provenance: "system_generated_quote", accepted_quote_version_id: null,
        baseline_quote_version_id: null, accepted_net_value_pence: null, recovery_cap_pence: null, fee_policy_version: null,
      }]);
    } finally { client.release(); }
  });

  const prohibited: Array<[string, InitialShape]> = [
    ...["quoting", "accepted", "live", "invoiced", "paid", "lost"].map(status => [`status ${status}`, { status }] as [string, InitialShape]),
    ["nonzero revision", { revision: 1 }],
    ["accepted quote pointer", { accepted_quote_version_id: randomUUID() }],
    ["baseline quote pointer", { baseline_quote_version_id: randomUUID() }],
    ["net value", { accepted_net_value_pence: 0 }],
    ["recovery cap", { recovery_cap_pence: 0 }],
    ["fee policy", { fee_policy_version: "reference_fee_policy_v1" }],
    ["complete initial commercial baseline", { baseline_quote_version_id: randomUUID(), accepted_net_value_pence: 100100,
      fee_policy_version: "reference_fee_policy_v1", recovery_cap_pence: 1502 }],
    ["state plus revision", { status: "quoting", revision: 5 }],
    ["all prohibited fields", { status: "live", revision: 3, accepted_quote_version_id: randomUUID(),
      baseline_quote_version_id: randomUUID(), accepted_net_value_pence: 100100, fee_policy_version: "reference_fee_policy_v1", recovery_cap_pence: 1502 }],
  ];
  it.each(prohibited)("[LP2-A02] runtime refuses %s before constraints and leaves no side effect", async (_name, shape) => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.runtime, actor.tenant, client => insertJob(client, actor.tenant, randomUUID(), shape))).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });
});
