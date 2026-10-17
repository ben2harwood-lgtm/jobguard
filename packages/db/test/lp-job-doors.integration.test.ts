import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertJob, jobDoorCounts, jobDoorsActor, jobDoorsDatabase, transaction, type InitialShape, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });

describe("LP-2 ordinary insertion boundary", () => {
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

describe("LP-2 effective routine and trigger catalogue", () => {
  it("[LP2-A14] every LP-2 helper is private and every definer has a fixed trusted search path", async () => {
    const names = ["guard_imported_job", "lp_job_insert_shape", "lp_job_permit_consumed", "lp_ordinary_job_initial_shape",
      "create_practice_sandbox_job", "start_quote_from_review"];
    const routines = (await db.owner.query(`SELECT p.proname,p.prosecdef,p.proconfig,r.rolname AS owner,
      has_function_privilege('lp2_login',p.oid,'EXECUTE') AS runtime,
      has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') AS infrastructure,
      has_function_privilege('jobguard_identity',p.oid,'EXECUTE') AS identity,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.proname`, [names])).rows;
    expect(routines).toHaveLength(names.length);
    for (const row of routines) {
      expect(row.owner).toBe("jobguard_migration"); expect(row.proconfig).toContain("search_path=pg_catalog");
      expect(row.infrastructure).toBe(false); expect(row.identity).toBe(false); expect(row.public).toBe(false);
      expect(row.runtime).toBe(["create_practice_sandbox_job", "start_quote_from_review"].includes(row.proname));
    }
    const triggers = (await db.owner.query(`SELECT tgname,tgtype::int,tgenabled FROM pg_trigger
      WHERE tgrelid='app.job'::regclass AND tgname IN('aaa_lp_ordinary_job_initial_shape','imported_job_command_only') ORDER BY tgname`)).rows;
    expect(triggers).toEqual([
      { tgname: "aaa_lp_ordinary_job_initial_shape", tgtype: 7, tgenabled: "O" },
      { tgname: "imported_job_command_only", tgtype: 7, tgenabled: "O" },
    ]);
  });
});
