import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
const read = async (client: PoolClient) =>
  (await client.query("SELECT app.bound_context_reader_test_caller() AS context")).rows[0].context;

beforeAll(async () => {
  db = await jobDoorsDatabase(true);
  // Test-only entry point models a migration-owned SECURITY DEFINER caller.
  // It accepts no identity input and forwards only the private reader result.
  await db.owner.query(`CREATE FUNCTION app.bound_context_reader_test_caller() RETURNS jsonb
    LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    SELECT app.bound_context_reader()
    $$;
    ALTER FUNCTION app.bound_context_reader_test_caller() OWNER TO jobguard_migration;
    REVOKE ALL ON FUNCTION app.bound_context_reader_test_caller() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.bound_context_reader_test_caller() TO jobguard_runtime;
    CREATE ROLE bound_context_other_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT USAGE ON SCHEMA app TO bound_context_other_login;`);
}, 300_000);
afterAll(async () => { await db?.close(); });

async function session() {
  const actor = await jobDoorsActor(db.owner);
  const credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${actor.person}@fictional.invalid`, actor.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [actor.person, actor.tenant, actor.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), actor.person, credential]);
  return { ...actor, credential };
}
const bind = (client: PoolClient, actor: Awaited<ReturnType<typeof session>>) =>
  client.query("SELECT app.bind_request('real',$1,$2)", [actor.credential, actor.tenant]);
async function refused(client: PoolClient, sql: string, values: unknown[] = []) {
  await client.query("SAVEPOINT refused_call");
  try { await expect(client.query(sql, values)).rejects.toMatchObject({ code: "42501" }); }
  finally { await client.query("ROLLBACK TO refused_call; RELEASE refused_call"); }
}

it("reads exactly each bound pair through a migration-owned definer and isolates concurrent requests", async () => {
  const first = await session(), second = await session();
  const a = await db.runtime.connect(), b = await db.runtime.connect();
  try {
    await a.query("BEGIN"); await b.query("BEGIN");
    await bind(a, first);
    expect(await read(b)).toBeNull();
    await bind(b, second);
    expect(await read(a)).toEqual({ actor_id: first.member, tenant_id: first.tenant });
    expect(await read(b)).toEqual({ actor_id: second.member, tenant_id: second.tenant });
    // Even another live request's exact pair in caller-controlled settings
    // cannot redirect the lookup away from this transaction's binding.
    await a.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true)", [second.member, second.tenant]);
    expect(await read(a)).toEqual({ actor_id: first.member, tenant_id: first.tenant });
    await refused(a, "SELECT app.bound_context_reader()");
    await refused(a, "SELECT app.bind_request('real',$1,$2)", [second.credential, second.tenant]);
    expect(await read(a)).toEqual({ actor_id: first.member, tenant_id: first.tenant });
    await a.query("COMMIT; BEGIN");
    expect(await read(a)).toBeNull();
    await b.query("ROLLBACK; BEGIN");
    expect(await read(b)).toBeNull();
  } finally {
    await a.query("ROLLBACK"); await b.query("ROLLBACK"); a.release(); b.release();
  }
});

it("returns SQL NULL when unbound and cannot turn caller settings or a failed credential into a binding", async () => {
  const actor = await session(), client = await db.runtime.connect();
  const count = async () => (await db.owner.query("SELECT count(*)::integer AS n FROM control_plane.request_binding")).rows[0].n;
  const before = await count();
  try {
    await client.query("BEGIN");
    expect(await read(client)).toBeNull();
    await client.query(`SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true),
      set_config('app.signed_context','forged',true)`, [actor.member, actor.tenant]);
    await refused(client, "SELECT app.bind_request('real',$1,$2)", [randomBytes(32).toString("hex"), actor.tenant]);
    expect(await read(client)).toBeNull();
    // NULL reading did not establish authority for the existing accessors.
    await refused(client, "SELECT app.current_actor(),app.current_tenant()");
    await client.query("COMMIT");
    expect(await count()).toBe(before);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("grants only migration execution, preserves accessor denial and rejects runtime, identity and unrelated logins", async () => {
  const client = await db.owner.connect();
  try {
    await client.query("BEGIN");
    for (const role of ["jobguard_runtime", "jobguard_identity", "jobguard_infrastructure", "lp2_login", "bound_context_other_login"]) {
      await client.query(`SET LOCAL ROLE ${role}`);
      await refused(client, "SELECT app.bound_context_reader()");
      await client.query("RESET ROLE");
      expect((await client.query("SELECT has_function_privilege($1,'app.bound_context_reader()','EXECUTE') AS allowed", [role])).rows).toEqual([{ allowed: false }]);
    }
    await client.query("SET LOCAL ROLE jobguard_migration");
    expect((await client.query("SELECT app.bound_context_reader() IS NULL AS unbound")).rows).toEqual([{ unbound: true }]);
    await refused(client, "SELECT app.current_actor()");
    await refused(client, "SELECT app.current_tenant()");
    await refused(client, "SELECT app.lp6_bound_request()");
    await refused(client, "SELECT * FROM control_plane.request_binding");
    await refused(client, "SELECT app.bind_request('real','forged',$1)", [randomUUID()]);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("returns NULL for an expired binding without modifying it", async () => {
  const actor = await session(), client = await db.owner.connect();
  try {
    await client.query("BEGIN; SET LOCAL ROLE jobguard_runtime");
    await bind(client, actor);
    await client.query("RESET ROLE");
    await client.query("UPDATE control_plane.request_binding SET expires_at=clock_timestamp()-interval '1 second' WHERE transaction_id=pg_current_xact_id()");
    const before = (await client.query("SELECT * FROM control_plane.request_binding WHERE transaction_id=pg_current_xact_id()")).rows;
    await client.query("SET LOCAL ROLE jobguard_migration");
    expect((await client.query("SELECT app.bound_context_reader() AS context")).rows).toEqual([{ context: null }]);
    await client.query("RESET ROLE");
    expect((await client.query("SELECT * FROM control_plane.request_binding WHERE transaction_id=pg_current_xact_id()")).rows).toEqual(before);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
