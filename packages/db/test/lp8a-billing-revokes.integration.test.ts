import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
async function attack(c: PoolClient, sql: string, values: unknown[] = [], code = "42501") {
  await c.query("SAVEPOINT attack");
  try { await expect(c.query(sql, values)).rejects.toMatchObject({ code }); }
  finally { await c.query("ROLLBACK TO attack; RELEASE attack"); }
}
describe("LP-8a runtime privilege withdrawal", () => {
  it("refuses table and column INSERT and both number allocator writes", async () => {
    const tables = ["customer_invoice", "customer_invoice_evidence", "customer_credit_note", "customer_payment", "customer_payment_reversal", "customer_invoice_sequence", "customer_credit_note_sequence"];
    const c = await db.runtime.connect();
    try {
      await c.query("BEGIN");
      for (const table of tables) {
        const columns = await c.query(`SELECT a.attname,has_column_privilege(current_user,c.oid,a.attnum,'INSERT') allowed
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
          WHERE n.nspname='app' AND c.relname=$1`, [table]);
        expect(columns.rows.length).toBeGreaterThan(0);
        for (const col of columns.rows) expect(col.allowed, `${table}.${col.attname}`).toBe(false);
        await attack(c, `INSERT INTO app.${table} DEFAULT VALUES`);
        await attack(c, `INSERT INTO app.${table}(id) VALUES(gen_random_uuid())`);
      }
      for (const table of tables.slice(-2)) await attack(c, `UPDATE app.${table} SET next_number=next_number+1`);
      await attack(c, "SELECT app.reserve_customer_invoice_number($1)", [randomUUID()]);
    } finally { await c.query("ROLLBACK"); c.release(); }
  });
  it("refuses unbound pointer changes despite forged tenant and actor GUCs", async () => {
    const actor = await jobDoorsActor(db.owner), c = await db.runtime.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)", [actor.tenant, actor.member]);
      await attack(c, "SELECT app.advance_final_account_draft($1,$2,$3,1)", [actor.tenant, randomUUID(), randomUUID()]);
    } finally { await c.query("ROLLBACK"); c.release(); }
  });
  it("requires the bound active owner even when a valid owner's actor GUC is forged", async () => {
    const actor = await jobDoorsActor(db.owner), other = await jobDoorsActor(db.owner, actor.tenant);
    const credential = randomBytes(32).toString("hex");
    await db.owner.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2", [actor.tenant, other.member]);
    await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${other.person}@fictional.invalid`, other.person]);
    await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [other.person, other.tenant, other.member]);
    await db.owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')", [randomUUID(), other.person, credential]);
    const c = await db.runtime.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT app.bind_request('real',$1,$2)", [credential, actor.tenant]);
      await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)", [actor.tenant, actor.member]);
      await attack(c, "SELECT app.advance_final_account_draft($1,$2,$3,1)", [actor.tenant, randomUUID(), randomUUID()]);
    } finally { await c.query("ROLLBACK"); c.release(); }
  });
  it("advances only the exact next revision of the same job and draft, with an exact retry", async () => {
    const actor = await jobDoorsActor(db.owner), credential = randomBytes(32).toString("hex");
    await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${actor.person}@fictional.invalid`, actor.person]);
    await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [actor.person, actor.tenant, actor.member]);
    await db.owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')", [randomUUID(), actor.person, credential]);
    const seed = async (tenant: string) => {
      const job = randomUUID(), quote = randomUUID(), draft = randomUUID(), revision = randomUUID();
      await db.owner.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional LP8a account','live')", [tenant, job]);
      await db.owner.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1000,'accepted')", [quote, tenant, job, "a".repeat(64)]);
      await db.owner.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft, tenant, job]);
      await db.owner.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
        VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1000,200,1200,false,'[]')`, [revision, tenant, job, draft, "a".repeat(64), quote]);
      return { job, quote, draft, revision };
    };
    const a = await seed(actor.tenant), b = await seed(actor.tenant), foreign = await jobDoorsActor(db.owner), f = await seed(foreign.tenant);
    const next = randomUUID();
    await db.owner.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
      VALUES($1,$2,$3,$4,2,$5,$6,$7,'GBP','candidate_m1_standard_v1',1000,200,1200,false,'[]')`, [next, actor.tenant, a.job, a.draft, a.revision, "b".repeat(64), a.quote]);
    const c = await db.runtime.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT app.bind_request('real',$1,$2)", [credential, actor.tenant]);
      await c.query("SELECT set_config('app.tenant_id',$1,true)", [actor.tenant]);
      const advance = "SELECT app.advance_final_account_draft($1,$2,$3,$4)";
      await attack(c, advance, [actor.tenant, a.draft, b.revision, 1], "22023");
      await attack(c, advance, [actor.tenant, a.draft, f.revision, 1], "22023");
      await attack(c, advance, [foreign.tenant, f.draft, f.revision, 1]);
      await attack(c, advance, [actor.tenant, a.draft, next, 2], "40001");
      await attack(c, advance, [actor.tenant, a.draft, a.revision, null], "22023");
      await c.query(advance, [actor.tenant, a.draft, a.revision, 1]);
      await c.query(advance, [actor.tenant, a.draft, a.revision, 1]);
      await c.query(advance, [actor.tenant, a.draft, next, 2]);
      await attack(c, advance, [actor.tenant, a.draft, a.revision, 1], "40001");
      expect((await c.query("SELECT current_revision_id,revision FROM app.final_account_draft WHERE tenant_id=$1 AND id=$2", [actor.tenant, a.draft])).rows[0]).toEqual({ current_revision_id: next, revision: 2 });
    } finally { await c.query("ROLLBACK"); c.release(); }
  });

});
