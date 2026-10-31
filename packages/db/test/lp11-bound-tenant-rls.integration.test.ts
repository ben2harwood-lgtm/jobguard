import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
const ident = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function session() {
  const actor = await jobDoorsActor(db.owner), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)",
    [`${actor.person}@fictional.invalid`, actor.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",
    [actor.person, actor.tenant, actor.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`,
  [randomUUID(), actor.person, credential]);
  return { ...actor, credential };
}
async function refused(client: PoolClient, sql: string, params: unknown[] = []) {
  await client.query("SAVEPOINT attack");
  try { await expect(client.query(sql, params)).rejects.toMatchObject({ code: "42501" }); }
  finally { await client.query("ROLLBACK TO attack; RELEASE attack"); }
}

it("has no caller-selected tenant policy, including owner and identity alternatives", async () => {
  const policies = await db.owner.query(`SELECT schemaname,tablename,policyname,qual,with_check
    FROM pg_policies WHERE schemaname IN ('app','identity','control_plane')`);
  expect(policies.rows.length).toBeGreaterThan(100);
  for (const policy of policies.rows) {
    expect(`${policy.qual} ${policy.with_check}`, JSON.stringify(policy)).not.toContain("app.tenant_id");
  }
});

it("binds with real credential validation and ignores forged tenant settings for reads and writes", async () => {
  const a = await session(), b = await session(), c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
    for (const fake of [b.tenant, "malformed", ""]) {
      await c.query("SELECT set_config('app.tenant_id',$1,true)", [fake]);
      expect((await c.query("SELECT tenant_id FROM app.account")).rows).toEqual([{ tenant_id: a.tenant }]);
      expect((await c.query("SELECT * FROM app.account WHERE tenant_id=$1 OR id=$2", [b.tenant, b.account])).rows).toEqual([]);
    }
    // Test-only non-owner grants preserve the original RLS backstop after LP-1's
    // write revocation. Runtime itself receives no additional write capability.
    await c.query("ROLLBACK");
    await db.owner.query(`CREATE ROLE lp11_fixture NOLOGIN INHERIT NOSUPERUSER NOBYPASSRLS;
      GRANT jobguard_runtime TO lp11_fixture;
      GRANT INSERT,UPDATE,DELETE ON app.account TO lp11_fixture`);
    const owner = await db.owner.connect();
    try {
      await owner.query("BEGIN");
      await owner.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
      await owner.query("SET LOCAL ROLE lp11_fixture");
      await owner.query("SELECT set_config('app.tenant_id',$1,true)", [b.tenant]);
      await refused(owner, "INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'forbidden')", [randomUUID(), b.tenant]);
      await refused(owner, "UPDATE app.account SET tenant_id=$1 WHERE id=$2", [b.tenant, a.account]);
      expect((await owner.query("UPDATE app.account SET name='forbidden' WHERE id=$1", [b.account])).rowCount).toBe(0);
      expect((await owner.query("DELETE FROM app.account WHERE id=$1", [b.account])).rowCount).toBe(0);
      const id = randomUUID();
      await owner.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'permitted')", [id, a.tenant]);
      expect((await owner.query("UPDATE app.account SET name='updated' WHERE id=$1", [id])).rowCount).toBe(1);
      expect((await owner.query("DELETE FROM app.account WHERE id=$1", [id])).rowCount).toBe(1);
    } finally { await owner.query("ROLLBACK"); owner.release(); }
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("tests each converted USING and WITH CHECK independently, without another OR policy masking it", async () => {
  const a = await session(), b = await session();
  const policies = await db.owner.query(`SELECT schemaname,tablename,policyname,qual,with_check
    FROM pg_policies WHERE schemaname IN ('app','identity','control_plane')
    AND (qual LIKE '%current_tenant()%' OR with_check LIKE '%current_tenant()%')`);
  expect(policies.rows.length).toBeGreaterThan(100);
  // Owner connection permits evaluating identity-schema row types too; the
  // actual policy expression still calls the same protected binding accessor.
  const c = await db.owner.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [b.tenant]);
    for (const p of policies.rows) {
      for (const expression of [p.qual, p.with_check].filter(expression => expression?.includes("current_tenant()"))) {
        // Evaluate the actual catalogue expression against the table's row type.
        // No production policy or grant is modified to isolate an OR branch.
        const result = await c.query(`SELECT (${expression}) IS TRUE AS allowed
          FROM json_populate_record(NULL::${ident(p.schemaname)}.${ident(p.tablename)},$1::json) AS ${ident(p.tablename)}`,
        [JSON.stringify({ tenant_id: b.tenant })]);
        expect(result.rows[0].allowed, `${p.schemaname}.${p.tablename}/${p.policyname}: ${expression}`).toBe(false);
        const positive = await c.query(`SELECT (${expression}) IS TRUE AS allowed
          FROM json_populate_record(NULL::${ident(p.schemaname)}.${ident(p.tablename)},$1::json) AS ${ident(p.tablename)}`,
        [JSON.stringify({ tenant_id: a.tenant })]);
        expect(positive.rows[0].allowed, `${p.tablename}/${p.policyname} positive`).toBe(true);
      }
    }
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("uses invoker RLS for every runtime-readable view and refuses unbound pool reuse", async () => {
  const views = await db.owner.query(`SELECT n.nspname,c.relname,c.reloptions FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname='app'
    AND has_table_privilege('jobguard_runtime',c.oid,'SELECT')`);
  expect(views.rows.length).toBeGreaterThan(0);
  for (const v of views.rows) expect(v.reloptions, v.relname).toContain("security_invoker=true");
  const a = await session(), pool = db.freshRuntime();
  try {
    let pid: number | undefined;
    for (const finish of ["COMMIT", "ROLLBACK"]) {
      const c = await pool.connect();
      try {
        const currentPid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
        if (pid !== undefined) expect(currentPid).toBe(pid);
        pid = currentPid;
        await c.query("BEGIN");
        await c.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
        for (const v of views.rows) {
          const rows = await c.query(`SELECT DISTINCT tenant_id FROM ${ident(v.nspname)}.${ident(v.relname)}`);
          expect(rows.rows.every(row => row.tenant_id === a.tenant)).toBe(true);
        }
        await c.query(finish);
      } finally { await c.query("ROLLBACK"); c.release(); }
      const reused = await pool.connect();
      try {
        await reused.query("BEGIN");
        await reused.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenant]);
        await refused(reused, "SELECT * FROM app.account");
        // Empty relations may avoid evaluating the accessor at all. Either a
        // permission refusal or no rows is a closed boundary.
        for (const v of views.rows) {
          await reused.query("SAVEPOINT empty_view");
          try {
            const result = await reused.query(`SELECT * FROM ${ident(v.nspname)}.${ident(v.relname)}`);
            expect(result.rows).toEqual([]);
          } catch (error) { expect(error).toMatchObject({ code: "42501" }); }
          finally { await reused.query("ROLLBACK TO empty_view; RELEASE empty_view"); }
        }
      } finally { await reused.query("ROLLBACK"); reused.release(); }
    }
  } finally { await pool.end(); }
});
