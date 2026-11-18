import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorRepository } from "../src/contractor-repository.js";
import { contractorSessionContext } from "../src/contractor-session-context.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { PracticeWorkerSwitchRepository } from "../src/practice-worker-switch-repository.js";
import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  db = await jobDoorsDatabase(true);
}, 300_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.close();
});
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
    expect((await c.query("SELECT * FROM app.account")).rows).toEqual([]);
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

it("enforces SSO-required against persisted sessions before request binding", async () => {
  const a = await session();
  const connection = randomUUID();
  const subject = randomBytes(32).toString("hex");
  const ssoSession = randomUUID();
  const ssoCredential = randomBytes(32).toString("hex");
  await db.owner.query(`INSERT INTO identity.sso_connection(tenant_id,id,metadata)
    VALUES($1,$2,$3)`, [a.tenant, connection, {
    version: "sso-metadata.v1", protocol: "saml2", provider: "in-process-test-idp",
    id: connection, tenantId: a.tenant,
  }]);
  await db.owner.query(`INSERT INTO identity.sso_required_event(tenant_id,id,revision,required,connection_id,actor_membership_id,actor_kind,reason)
    VALUES($1,$2,1,true,$3,$4,'admin','Fictional SSO policy for an isolated fixture')`,
    [a.tenant, randomUUID(), connection, a.member]);
  await db.owner.query(`INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id)
    VALUES($1,$2,$3,$4,$5,$6)`, [a.tenant, connection, subject, "a".repeat(64), a.person, a.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`,
    [ssoSession, a.person, ssoCredential]);
  await db.owner.query(`INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id)
    VALUES($1,$2,$3,$4)`, [a.tenant, connection, subject, ssoSession]);

  const client = await db.runtime.connect();
  try {
    await client.query("BEGIN");
    await refused(client, "SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
    await client.query("SELECT app.bind_request('real',$1,$2)", [ssoCredential, a.tenant]);
    expect((await client.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows)
      .toEqual([{ actor: a.member, tenant: a.tenant }]);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("issues and binds a synthetic home session through the normal SQL entry point", async () => {
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional home')", [DEMO_TENANT_ID, DEMO_ACCOUNT_ID]);
  await db.owner.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role)
    VALUES($1,$2,$3,$4,'owner')`, [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  const credential = randomBytes(32).toString("hex");
  await db.runtime.query("SELECT app.issue_practice_session($1)", [credential]);
  const client = await db.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT app.bind_request('practice',$1,$2)", [credential, DEMO_TENANT_ID]);
    expect((await client.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows)
      .toEqual([{ actor: DEMO_MEMBERSHIP_ID, tenant: DEMO_TENANT_ID }]);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("binds the effective contractor membership after the checked practice switch", async () => {
  const credential = randomUUID();
  const contractors = new ContractorRepository(db.runtime);
  const principal = await contractors.startPractice(credential);
  await seedActiveContractorAgreement(db.owner, principal.tenantId);
  const member = await jobDoorsActor(db.owner, principal.tenantId);
  await db.owner.query("UPDATE app.membership SET role='supervisor' WHERE tenant_id=$1 AND id=$2", [member.tenant, member.member]);
  await db.owner.query("INSERT INTO app.contractor_member VALUES($1,$2,NULL,'supervisor@fictional.invalid')", [member.tenant, member.member]);

  const repository = new PracticeWorkerSwitchRepository(db.runtime);
  await expect(repository.switchOn(await contractorSessionContext(db.runtime, credential), principal, credential, {
    version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: member.member,
  })).resolves.toMatchObject({ state: "acting", workerMembershipId: member.member });

  const client = await db.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT app.bind_request('contractor_practice',$1,$2)", [credential, principal.tenantId]);
    expect((await client.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows)
      .toEqual([{ actor: member.member, tenant: principal.tenantId }]);
  } finally { await client.query("ROLLBACK"); client.release(); }
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

it("tests each permissive tenant policy independently for wrong-tenant visibility and proposed rows", async () => {
  const a = await session(), b = await session();
  const policies = await db.owner.query(`SELECT p.schemaname,p.tablename,p.policyname,p.qual,p.with_check,p.cmd
    FROM pg_policies p JOIN information_schema.columns c
      ON c.table_schema=p.schemaname AND c.table_name=p.tablename AND c.column_name='tenant_id'
    WHERE p.schemaname NOT LIKE 'pg_%' AND p.schemaname NOT IN ('information_schema')
      AND p.permissive='PERMISSIVE'
    ORDER BY p.tablename,p.policyname`);
  expect(policies.rows.length).toBeGreaterThan(100);
  // The owner connection can evaluate every row type. Each expression is
  // evaluated on its own, so another permissive policy cannot mask its result.
  const c = await db.owner.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)", [a.credential, a.tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [b.tenant]);
    for (const p of policies.rows) {
      for (const expression of [p.qual, p.with_check ?? (p.cmd === "ALL" || p.cmd === "UPDATE" ? p.qual : null)].filter(Boolean)) {
        // Evaluate the actual catalogue expression against the table's row type.
        // No production policy or grant is modified to isolate an OR branch.
        const result = await c.query(`SELECT (${expression}) IS TRUE AS allowed
          FROM json_populate_record(NULL::${ident(p.schemaname)}.${ident(p.tablename)},$1::json) AS ${ident(p.tablename)}`,
        [JSON.stringify({ tenant_id: b.tenant })]);
        expect(result.rows[0].allowed, `${p.schemaname}.${p.tablename}/${p.policyname}: ${expression}`).toBe(false);

      }
    }
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("lists owner-rights views with direct or transitive dependencies on tenant tables", async () => {
  const views = await db.owner.query(`
    WITH RECURSIVE dependencies(view_id, base_id) AS (
      SELECT r.ev_class, d.refobjid
      FROM pg_rewrite r JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass
      JOIN pg_class v ON v.oid=r.ev_class AND v.relkind='v'
      WHERE d.refclassid='pg_class'::regclass AND r.ev_class<>d.refobjid
      UNION
      SELECT path.view_id, d.refobjid
      FROM dependencies path JOIN pg_rewrite r ON r.ev_class=path.base_id
      JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass
      WHERE d.refclassid='pg_class'::regclass AND r.ev_class<>d.refobjid
    )
    SELECT DISTINCT format('%I.%I',n.nspname,v.relname) AS view
    FROM dependencies path JOIN pg_class v ON v.oid=path.view_id
    JOIN pg_namespace n ON n.oid=v.relnamespace
    JOIN pg_class b ON b.oid=path.base_id AND b.relkind IN ('r','p')
    JOIN pg_attribute tenant ON tenant.attrelid=b.oid AND tenant.attname='tenant_id' AND NOT tenant.attisdropped
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
      AND NOT coalesce('security_invoker=true'=ANY(v.reloptions),false)
    ORDER BY 1`);
  expect(views.rows).toEqual([]);
});

it("uses invoker RLS through pool reuse after either transaction outcome", async () => {
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
        await refused(reused, "SELECT app.current_tenant()");
        expect((await reused.query("SELECT * FROM app.account")).rows).toEqual([]);
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
