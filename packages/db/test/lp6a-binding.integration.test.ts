import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
const refused = { code: "42501", message: "REQUEST_BINDING_REFUSED" };
async function session() {
  const a = await jobDoorsActor(db.owner), id = randomUUID(), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`, a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person, a.tenant, a.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [id, a.person, credential]);
  return { ...a, id, credential };
}
const bind = (c: Pick<PoolClient,"query">, s: Awaited<ReturnType<typeof session>>, tenant = s.tenant) =>
  c.query("SELECT app.bind_request('real',$1,$2)", [s.credential, tenant]);
async function request(work: (c: PoolClient) => Promise<void>) {
  const c = await db.runtime.connect();
  try { await c.query("BEGIN"); await work(c); }
  finally { await c.query("ROLLBACK"); c.release(); }
}
async function failure(c: PoolClient, sql: string, params: unknown[] = [], expected = refused) {
  await c.query("SAVEPOINT attack");
  try { await expect(c.query(sql, params)).rejects.toMatchObject(expected); }
  finally { await c.query("ROLLBACK TO attack"); await c.query("RELEASE attack"); }
}

it("fails closed on unbound/GUC/signed-context forgery, invalid credentials and wrong tenant/kind", async () => {
  const s = await session();
  await request(async c => {
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),set_config('app.signed_context','forged',true)", [s.tenant, s.member]);
    for (const fn of ["current_actor", "current_tenant"]) await failure(c, `SELECT app.${fn}()`);
    for (const credential of [null, "", "bad", randomBytes(32).toString("hex")])
      await failure(c, "SELECT app.bind_request('real',$1,$2)", [credential, s.tenant]);
    await failure(c, "SELECT app.bind_request('real',$1,$2)", [s.credential, randomUUID()]);
    await failure(c, "SELECT app.bind_request('practice',$1,$2)", [s.credential, s.tenant]);
    await failure(c, "SELECT app.bind_request('contractor_practice',$1,$2)", [s.credential, s.tenant]);
    await failure(c, "SELECT app.bind_request(NULL,$1,$2)", [s.credential, s.tenant]);
    await bind(c, s);
    expect((await c.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows[0]).toEqual({ actor: s.member, tenant: s.tenant });
  });
});

it("derives a tenant-selected actor and forbids replacement of an established binding", async () => {
  const s = await session(), other = await jobDoorsActor(db.owner);
  const member = randomUUID();
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [other.tenant, member, other.account, s.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [s.person, other.tenant, member]);
  await request(async c => {
    await bind(c, s, other.tenant);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(member);
    await bind(c, s, other.tenant); // same-session retry is idempotent
    await failure(c, "SELECT app.bind_request('real',$1,$2)", [s.credential, s.tenant]);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(member);
  });
  const replacement = await session();
  await request(async c => {
    await bind(c, s);
    await failure(c, "SELECT app.bind_request('real',$1,$2)", [replacement.credential, replacement.tenant]);
  });
});

it.each(["expired", "revoked", "membership_revoked", "membership_expired", "contractor_revoked"])("refuses %s live authority", async state => {
  const s = await session();
  if (state === "expired") await db.owner.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [s.id]);
  if (state === "revoked") await db.owner.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [s.id]);
  if (state === "membership_revoked") await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [s.tenant, s.member]);
  if (state === "membership_expired") await db.owner.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [s.tenant, s.member]);
  if (state === "contractor_revoked") {
    await db.owner.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'fictional@builder.invalid')", [s.tenant,s.member]);
    await db.owner.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)", [s.tenant,randomUUID(),s.member]);
  }
  await request(c => failure(c, "SELECT app.bind_request('real',$1,$2)", [s.credential, s.tenant]));
});

it("does not retain authority through commit, rollback, savepoints or backend reuse", async () => {
  const s = await session(), pool = db.freshRuntime(), c = await pool.connect();
  try {
    const pid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    for (const finish of ["COMMIT", "ROLLBACK"]) {
      await c.query("BEGIN"); await bind(c,s); await c.query(finish);
      await expect(c.query("SELECT app.current_actor()")).rejects.toMatchObject(refused);
      expect((await c.query("SELECT pg_backend_pid() pid")).rows[0].pid).toBe(pid);
    }
    await c.query("BEGIN; SAVEPOINT before_bind"); await bind(c,s);
    await c.query("SAVEPOINT after_bind");
    await c.query("SET LOCAL TimeZone='Pacific/Auckland'; SET LOCAL DateStyle='German, DMY'");
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)", [randomUUID(),randomUUID()]);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(s.member);
    await c.query("ROLLBACK TO after_bind");
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(s.member);
    await c.query("ROLLBACK TO before_bind");
    await failure(c,"SELECT app.current_actor()"); await bind(c,s); await c.query("COMMIT");
  } finally { await c.query("ROLLBACK"); c.release(); }
  const reused = await pool.connect();
  try { await expect(reused.query("SELECT app.current_tenant()")).rejects.toMatchObject(refused); }
  finally { reused.release(); await pool.end(); }
});

it("keeps concurrent requests isolated and takes only a session SHARE row lock", async () => {
  const a = await session(), b = await session();
  await Promise.all([a,b].map(s => request(async c => {
    await bind(c,s);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(s.member);
    const locks = (await c.query(`SELECT mode,relation::regclass::text rel FROM pg_locks
      WHERE pid=pg_backend_pid() AND locktype='relation' AND mode IN ('RowShareLock','RowExclusiveLock')`)).rows;
    expect(locks.filter(r => r.mode === "RowShareLock").map(r => r.rel)).toEqual(["identity.session"]);
    expect(locks.filter(r => r.mode === "RowExclusiveLock").map(r => r.rel)).toEqual(["control_plane.request_binding"]);
  })));
});

it("session revocation waits for a bound request, then prevents subsequent binds", async () => {
  const s = await session(), c = await db.runtime.connect(), revoker = await db.owner.connect();
  try {
    await c.query("BEGIN"); await bind(c,s);
    await revoker.query("BEGIN; SET LOCAL lock_timeout='100ms'");
    await expect(revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [s.id])).rejects.toMatchObject({ code: "55P03" });
    await revoker.query("ROLLBACK"); await c.query("COMMIT");
    await revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [s.id]);
    await request(client => failure(client,"SELECT app.bind_request('real',$1,$2)",[s.credential,s.tenant]));
  } finally { await c.query("ROLLBACK"); await revoker.query("ROLLBACK"); c.release(); revoker.release(); }
});

it("denies private helpers, table access and owner assumption, including worker/identity paths", async () => {
  for (const sql of ["SELECT * FROM control_plane.request_binding", "TRUNCATE control_plane.request_binding",
    "SELECT app.lp6_session_authority('real','fake',NULL)", "SELECT app.lp6_bound_request()", "SET ROLE jobguard_binding_owner"])
    await expect(db.runtime.query(sql)).rejects.toMatchObject({ code:"42501" });
  const rows = (await db.owner.query(`SELECT r.rolname,pg_has_role(r.oid,'jobguard_binding_owner','SET') can_set,
    has_function_privilege(r.oid,'app.lp6_session_authority(text,text,uuid)','EXECUTE') helper
    FROM pg_roles r WHERE r.rolname IN ('jobguard_runtime','jobguard_identity','jobguard_infrastructure')`)).rows;
  expect(rows).toHaveLength(3);
  for (const r of rows) expect(r).toMatchObject({can_set:false,helper:false});
  expect((await db.owner.query("SELECT count(*)::int n FROM pg_auth_members WHERE roleid='jobguard_binding_owner'::regrole OR member='jobguard_binding_owner'::regrole")).rows[0].n).toBe(0);
  expect((await db.owner.query("SELECT relpersistence,relrowsecurity FROM pg_class WHERE oid='control_plane.request_binding'::regclass")).rows[0]).toEqual({relpersistence:"u",relrowsecurity:false});
  const paths=(await db.owner.query("SELECT proconfig FROM pg_proc WHERE proname IN ('bind_request','current_actor','current_tenant','lp6_session_authority','lp6_bound_request')")).rows;
  expect(paths).toHaveLength(5);
  for (const path of paths) expect(path.proconfig).toEqual(["search_path=pg_catalog, pg_temp"]);
});

it("expires an already-bound request and refuses a bind waiting behind revocation",async()=>{
  const s=await session();
  await db.owner.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[s.id]);
  await request(async c=>{
    await bind(c,s);await c.query("SELECT pg_sleep(1.05)");
    await failure(c,"SELECT app.current_actor()");
  });
  const live=await session(),revoker=await db.owner.connect();
  try{
    await revoker.query("BEGIN");await revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[live.id]);
    await request(async c=>{
      await c.query("SET LOCAL lock_timeout='100ms'");
      await failure(c,"SELECT app.bind_request('real',$1,$2)",[live.credential,live.tenant],{code:"55P03",message:expect.any(String)});
    });
    await revoker.query("COMMIT");
    await request(c=>failure(c,"SELECT app.bind_request('real',$1,$2)",[live.credential,live.tenant]));
  }finally{await revoker.query("ROLLBACK");revoker.release();}
});

it("rejects unsafe administrative provisioning before installing any binding object",async()=>{
  const sql=await readFile(new URL("../migrations/0520_lp6a_request_binding.sql",import.meta.url),"utf8");
  const admin=await db.owner.connect();
  try{
    for(const defect of ["ALTER ROLE jobguard_binding_owner LOGIN","GRANT jobguard_binding_owner TO jobguard_runtime",
      "GRANT jobguard_runtime TO jobguard_binding_owner",
      "GRANT jobguard_binding_owner TO jobguard_migration WITH INHERIT FALSE, SET TRUE",
      "GRANT jobguard_binding_owner TO jobguard_identity WITH ADMIN TRUE, INHERIT FALSE, SET FALSE"]){
      await admin.query("BEGIN");await admin.query(defect);
      await expect(admin.query(sql)).rejects.toMatchObject({code:"42501",message:"jobguard_binding_owner has unsafe posture or membership"});
      await admin.query("ROLLBACK");
    }
  }finally{await admin.query("ROLLBACK");admin.release();}
});

it("accepts only the exact temporary migration membership while executing as that role",async()=>{
  const sql=await readFile(new URL("../migrations/0520_lp6a_request_binding.sql",import.meta.url),"utf8");
  const preflight=sql.slice(0,sql.indexOf("-- Temporary schema CREATE"));
  const admin=await db.owner.connect();
  try{
    for(const [inheritOption,setOption,adminOption,allowed] of [
      [true,true,false,true],[false,true,false,false],[true,false,false,false],[true,true,true,false],
    ] as const){
      await admin.query("BEGIN");
      await admin.query(`GRANT jobguard_binding_owner TO jobguard_migration WITH INHERIT ${inheritOption}, SET ${setOption}, ADMIN ${adminOption}`);
      await admin.query("SET LOCAL ROLE jobguard_migration");
      if(allowed)await admin.query(preflight);
      else await expect(admin.query(preflight)).rejects.toMatchObject({code:"42501",message:"jobguard_binding_owner has unsafe posture or membership"});
      await admin.query("ROLLBACK");
    }
  }finally{await admin.query("ROLLBACK");admin.release();}
});
