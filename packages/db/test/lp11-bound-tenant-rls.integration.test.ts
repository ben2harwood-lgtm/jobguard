import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
const ident = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function session(tenant?: string) {
  const actor = await jobDoorsActor(db.owner, tenant), credential = randomBytes(32).toString("hex");
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

it("keeps the exact inherited binding signatures and private helpers closed to runtime", async () => {
  const signatures = (await db.owner.query(`SELECT p.oid::regprocedure::text signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY 1`,
  [["bind_request", "current_actor", "current_tenant", "lp6_bound_request", "lp6_session_authority"]])).rows;
  expect(signatures.map(row => row.signature)).toEqual([
    "app.bind_request(text,text,uuid)", "app.current_actor()", "app.current_tenant()",
    "app.lp6_bound_request()", "app.lp6_session_authority(text,text,uuid)",
  ]);
  const a = await session(), c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)", [a.tenant, a.member]);
    await refused(c, "SELECT app.lp6_bound_request()");
    await refused(c, "SELECT * FROM app.lp6_session_authority('real',$1,$2)", [a.credential, a.tenant]);
    for (const table of ["request_binding", "worker_action_binding"]) {
      await refused(c, `SELECT * FROM control_plane.${table}`);
    }
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("refuses unbound forgery and wrong-tenant or same-tenant actor rebinding without changing rows", async () => {
  const a = await session(), b = await session(), coworker = await session(a.tenant);
  const before = (await db.owner.query("SELECT * FROM app.account WHERE tenant_id=ANY($1::uuid[]) ORDER BY id", [[a.tenant, b.tenant]])).rows;
  const c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),
      set_config('app.signed_context','forged',true)`, [b.tenant, b.member]);
    for (const fn of ["current_actor", "current_tenant"]) await refused(c, `SELECT app.${fn}()`);
    await refused(c, "SELECT * FROM app.account");
    await refused(c, "SELECT app.bind_request('real',$1,$2)", [a.credential, b.tenant]);
    await c.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
    await refused(c, "SELECT app.bind_request('real',$1,$2)", [coworker.credential, a.tenant]);
    await refused(c, "SELECT app.bind_request('real',$1,$2)", [b.credential, b.tenant]);
    expect((await c.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows)
      .toEqual([{ actor: a.member, tenant: a.tenant }]);
    expect((await c.query("SELECT * FROM app.account WHERE tenant_id=$1", [b.tenant])).rows).toEqual([]);
  } finally { await c.query("ROLLBACK"); c.release(); }
  expect((await db.owner.query("SELECT * FROM app.account WHERE tenant_id=ANY($1::uuid[]) ORDER BY id", [[a.tenant, b.tenant]])).rows).toEqual(before);
});

it("has no caller-selected tenant policy, including owner and identity alternatives", async () => {
  const policies = await db.owner.query(`SELECT schemaname,tablename,policyname,qual,with_check
    FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND schemaname !~ '^pg_'`);
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
    FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND schemaname !~ '^pg_'
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
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname !~ '^pg_'
    AND has_table_privilege('jobguard_runtime',c.oid,'SELECT')`);
  expect(views.rows.length).toBeGreaterThan(0);
  for (const v of views.rows) expect(v.reloptions, v.relname).toContain("security_invoker=true");
  const a = await session(), b = await session(), pool = db.freshRuntime();
  try {
    let pid: number | undefined;
    for (const [actor, finish] of [[a, "COMMIT"], [b, "ROLLBACK"], [a, "COMMIT"]] as const) {
      const c = await pool.connect();
      try {
        const currentPid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
        if (pid !== undefined) expect(currentPid).toBe(pid);
        pid = currentPid;
        await c.query("BEGIN");
        await c.query("SELECT app.bind_request('real',$1,$2)", [actor.credential, actor.tenant]);
        expect((await c.query("SELECT tenant_id FROM app.account")).rows).toEqual([{ tenant_id: actor.tenant }]);
        for (const v of views.rows) {
          const rows = await c.query(`SELECT DISTINCT tenant_id FROM ${ident(v.nspname)}.${ident(v.relname)}`);
          expect(rows.rows.every(row => row.tenant_id === actor.tenant)).toBe(true);
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


it("upgrades the latest predecessor without changing rows, columns, policy roles or policy alternatives", async () => {
  const predecessor = await jobDoorsDatabase(true, "0810_lp11_bound_tenant_rls.sql");
  const policies = async () => (await predecessor.owner.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname !~ '^pg_'
    ORDER BY schemaname,tablename,policyname`)).rows;
  const columns = async () => (await predecessor.owner.query(`SELECT n.nspname,c.relname,a.attname,a.atttypid,a.atttypmod,a.attnotnull
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('app','identity','control_plane','connector') AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY n.nspname,c.relname,a.attnum`)).rows;
  try {
    const actor = await jobDoorsActor(predecessor.owner);
    const beforePolicies = await policies(), beforeColumns = await columns();
    const routineBodies = async () => (await predecessor.owner.query(`SELECT n.nspname,p.proname,
      pg_get_function_identity_arguments(p.oid) args,p.prosrc,p.proowner,p.prosecdef,p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('app','identity','control_plane','connector') AND p.prokind='f'
      ORDER BY n.nspname,p.proname,args`)).rows;
    const beforeRoutines = await routineBodies();
    const beforeAccount = (await predecessor.owner.query("SELECT * FROM app.account WHERE tenant_id=$1", [actor.tenant])).rows;
    const beforeMembership = (await predecessor.owner.query("SELECT * FROM app.membership WHERE tenant_id=$1", [actor.tenant])).rows;
    await predecessor.owner.query(await readFile(new URL("../migrations/0810_lp11_bound_tenant_rls.sql", import.meta.url), "utf8"));
    const afterPolicies = await policies();
    expect(afterPolicies).toHaveLength(beforePolicies.length);
    const pattern = /(?:pg_catalog\.)?current_setting\('app\.tenant_id'(?:::text)?(?:,\s*true)?\)/g;
    const converted = (value: string | null) => value?.replace(pattern, "(app.current_tenant())::text") ?? null;
    // Compare parsed expressions, allowing PostgreSQL to normalize parentheses.
    // The independent catalogue proof must still provide exact before/after rows.
    for (let i = 0; i < beforePolicies.length; i++) {
      const before = beforePolicies[i]!, after = afterPolicies[i]!;
      const { qual, with_check, ...metadata } = before;
      expect({ ...after, qual, with_check }).toEqual({ ...metadata, qual, with_check });
      for (const field of ["qual", "with_check"] as const) {
        if (!before[field]?.includes("app.tenant_id")) expect(after[field]).toBe(before[field]);
        else {
          expect(after[field]).toContain("app.current_tenant()");
          expect(after[field]).not.toContain("app.tenant_id");
          const expected = converted(before[field]);
          const c = await predecessor.owner.connect();
          try {
            await c.query("BEGIN");
            await c.query(`CREATE TEMP TABLE ${ident(before.tablename)} (LIKE ${ident(before.schemaname)}.${ident(before.tablename)})`);
            await c.query(`ALTER TABLE ${ident(before.tablename)} ENABLE ROW LEVEL SECURITY`);
            await c.query(`CREATE POLICY expected ON ${ident(before.tablename)} USING (${expected})`);
            const normalized = (await c.query("SELECT qual FROM pg_policies WHERE schemaname LIKE 'pg_temp_%' AND tablename=$1 AND policyname='expected'", [before.tablename])).rows[0].qual;
            expect(after[field], `${before.schemaname}.${before.tablename}/${before.policyname}/${field}`).toBe(normalized);
          } finally { await c.query("ROLLBACK"); c.release(); }
        }
      }
    }
    // In particular, retain LP-6d's private practice projection, LP-6e's audit
    // attribution and LP-10's exact worker checks; LP-11 recreates none of them.
    expect(await routineBodies()).toEqual(beforeRoutines);
    expect(await columns()).toEqual(beforeColumns);
    expect((await predecessor.owner.query("SELECT * FROM app.account WHERE tenant_id=$1", [actor.tenant])).rows).toEqual(beforeAccount);
    expect((await predecessor.owner.query("SELECT * FROM app.membership WHERE tenant_id=$1", [actor.tenant])).rows).toEqual(beforeMembership);
    expect((await predecessor.owner.query("SELECT reloptions FROM pg_class WHERE oid='app.ledger_balance'::regclass")).rows[0].reloptions)
      .toEqual(expect.arrayContaining(["security_barrier=true", "security_invoker=true"]));
  } finally { await predecessor.close(); }
}, 300_000);


it("checks every runtime permissive alternative even when it has no converted tenant expression", async () => {
  const a = await session(), b = await session();
  const alternatives = (await db.owner.query(`SELECT n.nspname,c.relname,p.polname,p.polcmd,
    pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) with_check
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE p.polpermissive AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
    AND EXISTS(SELECT 1 FROM unnest(p.polroles) r(roleid) WHERE CASE WHEN r.roleid=0 THEN true ELSE pg_has_role('jobguard_runtime',r.roleid,'USAGE') END)
    AND (has_table_privilege('jobguard_runtime',c.oid,'SELECT') OR has_table_privilege('jobguard_runtime',c.oid,'INSERT')
      OR has_table_privilege('jobguard_runtime',c.oid,'UPDATE') OR has_table_privilege('jobguard_runtime',c.oid,'DELETE'))`)).rows;
  expect(alternatives.length).toBeGreaterThan(100);
  const c = await db.owner.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [b.tenant]);
    for (const p of alternatives) {
      // ALL/UPDATE inherit USING when WITH CHECK is absent; an omitted USING
      // for a read alternative is TRUE and must not silently escape this test.
      const expressions = p.polcmd === 'a' ? [p.with_check ?? 'true']
        : p.polcmd === '*' || p.polcmd === 'w' ? [p.qual ?? 'true', p.with_check ?? p.qual ?? 'true']
          : [p.qual ?? 'true'];
      for (const expression of expressions) {
        const result = await c.query(`SELECT (${expression}) IS TRUE allowed
          FROM json_populate_record(NULL::${ident(p.nspname)}.${ident(p.relname)},$1::json) AS ${ident(p.relname)}`,
        [JSON.stringify({ tenant_id: b.tenant })]);
        expect(result.rows[0].allowed, `${p.nspname}.${p.relname}/${p.polname}: ${expression}`).toBe(false);
      }
    }
  } finally { await c.query("ROLLBACK"); c.release(); }
});
