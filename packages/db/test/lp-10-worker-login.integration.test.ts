import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, worker: Pool, web: Pool, directory: string;
const t = randomUUID(), account = randomUUID(), person = randomUUID(), actor = randomUUID();
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-lp10-"));
  const port = await freePort(57500, 400);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "test-only",
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "test-only", database: "postgres" });
  await migrate(admin);
  await admin.query(`CREATE ROLE lp10_worker LOGIN PASSWORD 'fictional-worker' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
    GRANT jobguard_worker TO lp10_worker;
    CREATE ROLE lp10_web LOGIN PASSWORD 'fictional-web' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
    GRANT jobguard_runtime TO lp10_web;`);
  worker = new Pool({ host: "127.0.0.1", port, user: "lp10_worker", password: "fictional-worker", database: "postgres", max: 2 });
  web = new Pool({ host: "127.0.0.1", port, user: "lp10_web", password: "fictional-web", database: "postgres" });
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [t]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [person]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional LP10')", [account, t]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [actor, t, account, person]);
}, 120_000);
afterAll(async () => { await closeTestPools(web, worker, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });
async function enqueue() {
  const decision = randomUUID(), resolution = randomUUID(), auth = randomUUID(), id = randomUUID();
  const content = "Fictional approved document", hash = createHash("sha256").update(content).digest("hex");
  await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','fictional','send_quote')", [decision, t]);
  await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, t, decision, actor]);
  await admin.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at)
    VALUES($1,$2,$3,$4,$5,'send_quote',$6,1,'synthetic.v1','2099-01-01')`, [auth, t, decision, resolution, actor, hash]);
  await admin.query(`INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at)
    VALUES($1,$2,$3,'fake_capture',$1::text,'send_quote',$4,$5,1,'synthetic.v1','2099-01-01')`, [id, t, auth, hash, content]);
  return { id, auth };
}
const claim = async (id: string) => (await worker.query("SELECT app.claim_worker_action($1,ARRAY['fake_capture']) AS value", [id])).rows[0]!.value;
const complete = async (id: string, token: string) => (await worker.query("SELECT app.complete_worker_action($1,$2,'succeeded','fictional-receipt',NULL) AS value", [id, token])).rows[0]!.value;

describe("LP-10 real login authority", () => {
  it("web cannot bind, claim, complete, or directly change worker state", async () => {
    const { id } = await enqueue();
    for (const sql of ["SELECT app.bind_worker_action($1)", "SELECT app.claim_worker_action($1,ARRAY['fake_capture'])",
      "SELECT app.complete_worker_action($1,$1,'succeeded','fictional',NULL)", "UPDATE app.action_outbox SET status='succeeded' WHERE id=$1"]) {
      await expect(web.query(sql, [id])).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("worker cannot insert authorization/outbox/approval or assume runtime/owner", async () => {
    for (const sql of ["INSERT INTO app.action_outbox DEFAULT VALUES", "INSERT INTO app.action_authorization DEFAULT VALUES",
      "INSERT INTO app.decision_resolution DEFAULT VALUES", "SET ROLE jobguard_runtime", "SET ROLE jobguard_migration"]) {
      await expect(worker.query(sql)).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("binding derives the author and tenant and is transaction scoped", async () => {
    const { id } = await enqueue(), client = await worker.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [randomUUID()]);
      await client.query("SELECT app.bind_worker_action($1)", [id]);
      expect((await client.query("SELECT * FROM app.worker_action_context()")).rows).toEqual([{ action_id: id, tenant_id: t, actor_id: actor }]);
      await client.query("COMMIT");
      expect((await client.query("SELECT * FROM app.worker_action_context()")).rows).toEqual([]);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("two concurrent claimants and duplicate completions have one committed effect", async () => {
    const { id } = await enqueue();
    const values = await Promise.all([claim(id), claim(id)]);
    const accepted = values.filter(Boolean); expect(accepted).toHaveLength(1);
    expect(await complete(id, accepted[0].token)).toBe(true);
    expect(await complete(id, accepted[0].token)).toBe(false);
    expect((await admin.query("SELECT * FROM app.action_attempt WHERE action_id=$1", [id])).rows).toHaveLength(1);
    const events = (await admin.query("SELECT actor_ref,payload FROM app.audit_event WHERE subject_ref=$1 AND event_type='outbox.succeeded'", [id])).rows;
    expect(events).toHaveLength(1); expect(events[0].actor_ref).toBe("worker:lp10_worker");
    expect(events[0].payload.references).toMatchObject({ authorizingMembership: actor, executingWorker: "lp10_worker" });
  });
  it("lease expiry refuses blind reclaim and late completion", async () => {
    const { id } = await enqueue(), first = await claim(id);
    await admin.query("UPDATE app.action_outbox SET claimed_at=clock_timestamp()-interval '6 minutes' WHERE id=$1", [id]);
    expect(await claim(id)).toBeNull(); expect(await claim(id)).toBeNull();
    expect(await complete(id, first.token)).toBe(false);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [id])).rows[0].status).toBe("outcome_unknown");
  });
  it("audit failure rolls back the claim and attempt together", async () => {
    const { id } = await enqueue();
    await admin.query(`CREATE FUNCTION app.lp10_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional audit failure'; END $$;
      CREATE TRIGGER lp10_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.lp10_test_audit_failure()`);
    try {
      await expect(claim(id)).rejects.toThrow("fictional audit failure");
      expect((await admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [id])).rows[0].status).toBe("pending");
      expect((await admin.query("SELECT * FROM app.action_attempt WHERE action_id=$1", [id])).rows).toHaveLength(0);
    } finally {
      await admin.query("DROP TRIGGER lp10_test_audit_failure ON app.audit_event; DROP FUNCTION app.lp10_test_audit_failure()");
    }
  });
  it("revocation after claim refuses completion and preserves unknown delivery", async () => {
    const { id, auth } = await enqueue(), first = await claim(id);
    await admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE id=$1", [auth]);
    expect(await complete(id, first.token)).toBe(false);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [id])).rows[0].status).toBe("outcome_unknown");
  });
  it("revoked author at enqueue cannot claim", async () => {
    const { id } = await enqueue();
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1", [actor]);
    try { expect(await claim(id)).toMatchObject({ refused: true, code: "AUTHORIZATION_REVOKED" }); }
    finally { await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1", [actor]); }
  });
  it("retry due time and attempt fencing prevent stale completion", async () => {
    const { id } = await enqueue(), first = await claim(id);
    await worker.query("SELECT app.complete_worker_action($1,$2,'retryable',NULL,'fictional-unavailable')", [id, first.token]);
    expect(await claim(id)).toBeNull();
    await admin.query("UPDATE app.action_outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
    const second = await claim(id); expect(second.attempt).toBe(2); expect(second.token).not.toBe(first.token);
    expect(await complete(id, first.token)).toBe(false); expect(await complete(id, second.token)).toBe(true);
  });
});
