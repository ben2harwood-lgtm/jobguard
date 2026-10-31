import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
const refused = { code: "42501", message: "REQUEST_BINDING_REFUSED" };
async function session(tenant?: Parameters<typeof jobDoorsActor>[1]) {
  const actor = await jobDoorsActor(db.owner, tenant), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${actor.person}@fictional.invalid`, actor.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [actor.person, actor.tenant, actor.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), actor.person, credential]);
  return { ...actor, credential };
}
type Actor = Awaited<ReturnType<typeof session>>;
async function request(pool: Pool, actor: Actor, bound: boolean, work: (c: PoolClient) => Promise<void>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (bound) await c.query("SELECT app.bind_request('real',$1,$2)", [actor.credential, actor.tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [actor.tenant]);
    await work(c);
  } finally { await c.query("ROLLBACK"); c.release(); }
}
async function failure(c: PoolClient, sql: string, values: unknown[], expected: object = refused) {
  await c.query("SAVEPOINT attack");
  try { await expect(c.query(sql, values)).rejects.toMatchObject(expected); }
  finally { await c.query("ROLLBACK TO attack"); }
}
interface Routine { name: string; names: string[]; types: string[]; executable: boolean }
async function routines() {
  const migration = readFileSync(new URL("../migrations/0525_lp6c_money_binding.sql", import.meta.url), "utf8");
  const names = [...migration.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\(/gu)].map(m => m[1]);
  const rows = (await db.owner.query<Routine>(`SELECT p.proname name,p.proargnames names,
    ARRAY(SELECT format_type(x,NULL) FROM unnest(p.proargtypes::oid[]) x) types,
    has_function_privilege('lp2_login',p.oid,'EXECUTE') executable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.proname,p.pronargs`, [names])).rows;
  expect(rows).toHaveLength(28);
  return rows.filter(r => r.name !== "mon1_company_actor");
}
function call(r: Routine, actor: Actor, change: { actor?: string; tenant?: string } = {}) {
  const values = r.names.slice(0, r.types.length).map(name => {
    if (name === "p_tenant" || name === "t") return change.tenant ?? actor.tenant;
    if (name === "p_actor") return change.actor ?? actor.member;
    if (name === "p_resource") return JSON.stringify({ tenantId: change.tenant ?? actor.tenant, actorMembershipId: change.actor ?? actor.member });
    return null;
  });
  return { sql: `SELECT app.${r.name}(${r.types.map((t, i) => `$${i + 1}::${t}`).join(",")})`, values };
}

it("rejects missing bindings and forged tenant GUCs at every old/new routine and private helper", async () => {
  const s = await session();
  for (const r of await routines()) {
    // Withdrawn overloads are attacked as owner as well, so their body guards are
    // exercised without granting runtime a historical/private capability.
    await request(r.executable ? db.runtime : db.owner, s, false, async c => {
      const attack = call(r, s);
      await failure(c, attack.sql, attack.values);
    });
    if (!r.executable) {
      const attack = call(r, s);
      await expect(db.runtime.query(attack.sql, attack.values)).rejects.toMatchObject({ code: "42501" });
    }
  }
});

it("rejects a different live member and another tenant before touching resources, commands or replay results", async () => {
  const s = await session(), peer = await session(s.tenant), other = await session();
  for (const r of await routines()) {
    await request(r.executable ? db.runtime : db.owner, s, true, async c => {
      for (const change of [{ actor: peer.member }, { tenant: other.tenant }]) {
        if (change.actor && !r.names.includes("p_actor") && r.name !== "begin_command") continue;
        // Implicit-tenant routines must reject a forged GUC too.
        if (change.tenant) await c.query("SELECT set_config('app.tenant_id',$1,true)", [other.tenant]);
        const attack = call(r, s, change);
        await failure(c, attack.sql, attack.values);
        await c.query("SELECT set_config('app.tenant_id',$1,true)", [s.tenant]);
      }
    });
  }
});

it("keeps bound identity separate from owner permission at LP-3 and surviving invoice runtime signatures", async () => {
  const s = await session();
  await db.owner.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [s.tenant, s.member]);
  for (const r of (await routines()).filter(r => r.executable && ["switch_job_live", "record_simulated_settlement", "record_builder_attested_acceptance", "record_quote_disposition", "issue_practice_customer_invoice", "issue_lock_bound_customer_invoice"].includes(r.name))) {
    await request(db.runtime, s, true, async c => {
      const attack = call(r, s);
      await failure(c, attack.sql, attack.values, { code: "42501", message: "FORBIDDEN" });
    });
  }
});

it("a bound owner still needs exact, unexpired, unconsumed approval for every LP-3 operation", async () => {
  const s = await session();
  // This private helper is the exact-approval choke point shared by the four
  // hardened signatures; invoking as owner does not grant it to runtime.
  for (const operation of ["job.switch_live", "synthetic.settlement", "quote.acceptance.attest", "quote.declined"]) {
    await request(db.owner, s, true, async c => {
      const command = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID(), job = randomUUID();
      const payload = "c".repeat(64), hash = "a".repeat(64), policy = "fictional-lp6c.v1";
      await c.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional LP6c approval')", [s.tenant, job]);
      await c.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,'processing',$6)`, [s.tenant, command, operation, `lp6c:${command}:lp3=${payload}`, hash, s.member]);
      await c.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,$4)", [s.tenant, decision, job, operation]);
      await c.query("INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [s.tenant, resolution, decision, s.member]);
      const sql = "SELECT app.lp3_authorize($1,$2,$3,$4,$5,$5,'job',$6,$7,1,100,'GBP',NULL,$8,$9,$10,0)";
      const values = [s.tenant, s.member, command, authorization, operation, job, hash, policy, payload, job];
      await failure(c, sql, values, { code: "42501", message: "LP3_EXACT_AUTHORIZATION_MISMATCH" });
      await c.query(`INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,
        content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,1,100,'GBP',$8,clock_timestamp()-interval '1 second')`,
      [s.tenant, authorization, decision, resolution, s.member, operation, hash, policy]);
      await failure(c, sql, values, { code: "42501", message: "LP3_EXACT_AUTHORIZATION_MISMATCH" });
      // Authorization rows are immutable. Roll back this fixture branch to issue
      // a new future-dated authorization, rather than update historical approval.
    });
    await request(db.owner, s, true, async c => {
      const command = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID(), job = randomUUID();
      const payload = "c".repeat(64), hash = "a".repeat(64), policy = "fictional-lp6c.v1";
      await c.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional LP6c approved')", [s.tenant, job]);
      await c.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,'processing',$6)`, [s.tenant, command, operation, `lp6c:${command}:lp3=${payload}`, hash, s.member]);
      await c.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,$4)", [s.tenant, decision, job, operation]);
      await c.query("INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [s.tenant, resolution, decision, s.member]);
      await c.query(`INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,
        content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,1,100,'GBP',$8,clock_timestamp()+interval '1 hour')`,
      [s.tenant, authorization, decision, resolution, s.member, operation, hash, policy]);
      const sql = "SELECT app.lp3_authorize($1,$2,$3,$4,$5,$5,'job',$6,$7,1,100,'GBP',NULL,$8,$9,$10,0)";
      const values = [s.tenant, s.member, command, authorization, operation, job, hash, policy, payload, job];
      await c.query(sql, values);
      expect((await c.query("SELECT count(*)::int n FROM app.activation_acceptance_operation_use WHERE tenant_id=$1 AND command_id=$2", [s.tenant, command])).rows[0].n).toBe(1);
      await failure(c, sql, values, { code: "42501", message: "LP3_EXACT_AUTHORIZATION_MISMATCH" });
    });
  }
});

it("meter credential bridge binds once and refuses credential substitution and worker permission", async () => {
  const s = await session(), peer = await session(s.tenant);
  await request(db.owner, s, false, async c => {
    expect((await c.query("SELECT app.mon1_company_actor($1,$2) actor", [s.tenant, s.credential])).rows[0].actor).toBe(s.member);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(s.member);
    await failure(c, "SELECT app.mon1_company_actor($1,$2)", [s.tenant, peer.credential]);
  });
  await db.owner.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [s.tenant, s.member]);
  await request(db.owner, s, false, c => failure(c, "SELECT app.mon1_company_actor($1,$2)", [s.tenant, s.credential], { code: "42501", message: "METER_FORBIDDEN" }));
});

// These ports have no separate approval parameter: owner permission and protected
// identity remain required; invoice issuance retains its own exact atomic approval.
it("permits a bound owner through the invoice owner/resource boundary and number path", async () => {
  const s = await session();
  await request(db.owner, s, true, async c => {
    await c.query("SELECT app.final_lock_require_owner($1,$2)", [s.tenant, s.member]);
  });
  await request(db.runtime, s, true, async c => {
    const result = await c.query("SELECT app.reserve_customer_invoice_number($1) n", [s.tenant]);
    expect(BigInt(result.rows[0].n)).toBeGreaterThan(0n);
  });
  await db.owner.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [s.tenant, s.member]);
  await request(db.owner, s, true, c => failure(c, "SELECT app.final_lock_require_owner($1,$2)", [s.tenant, s.member], { code: "42501", message: "FORBIDDEN" }));
});
