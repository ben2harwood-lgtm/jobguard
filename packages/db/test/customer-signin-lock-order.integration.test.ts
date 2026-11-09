import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, ownerTx, type Cluster } from "./contractor-practice-session-fixtures.js";

// Real PostgreSQL only. The batch-42 migration must be merged before this suite runs.
// Do not retry 40P01: a deadlock, timeout or unexpected refusal must fail the test.
let c: Cluster;
const digest = () => createHash("sha256").update(randomUUID()).digest("hex");
beforeAll(async () => {
  c = await cluster();
  expect((await c.admin.query("SELECT to_regprocedure('identity.extra_customer_use(uuid,uuid,uuid,text,text,text)') routine")).rows[0].routine).not.toBeNull();
}, 120_000);
afterAll(async () => { await c?.close(); });

async function world() {
  const tenant = randomUUID(), account = randomUUID(), member = randomUUID(), user = randomUUID(), job = randomUUID(), builder = digest();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fixture.invalid`, user]);
  await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional lock test')", [tenant, account]);
  await ownerTx(c, tenant, db => db.$client.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, user]));
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenant, member]);
  await c.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fictional-csrf-token',clock_timestamp()+interval '1 hour','synthetic_demo')", [randomUUID(), user, builder]);
  await c.admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional portal job')", [tenant, job]);
  const customer = (await c.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2", [tenant, job])).rows[0].customer_id as string;
  return { tenant, job, customer, builder };
}
type World = Awaited<ReturnType<typeof world>>;
const reference = (w: World) => `customer-signin-reference.v1:${w.tenant}/${w.job}/${w.customer}/${randomBytes(32).toString("base64url")}`;
async function issue(db: PoolClient, w: World, link = digest()) {
  return (await db.query("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id", [w.tenant, w.builder, w.job, w.customer, link, reference(w)])).rows[0].id as string;
}
async function use(db: PoolClient, w: World, token: string, session: string, operation: string) {
  return db.query("SELECT coalesce(identity.extra_customer_use($1,$2,$3,$4,$5,$6),identity.customer_portal_use($1,$2,$3,$4,$5,$6)) result", [w.tenant, w.job, w.customer, token, session, operation]);
}
async function begin(db: PoolClient) {
  await db.query("BEGIN");
  await db.query("SET LOCAL statement_timeout='15s'");
  await db.query("SET LOCAL ROLE jobguard_identity");
}
// Capture errors immediately while the other connection deliberately owns the lock.
async function outcome(work: Promise<unknown>) {
  try { await work; return "ok"; }
  catch (error) { return (error as { code?: string }).code ?? String(error); }
}
async function advisoryLocks(db: PoolClient, pid: number, w: World) {
  const rows = (await db.query(`SELECT l.mode,l.granted,k.seed FROM pg_locks l
    LEFT JOIN (SELECT seed,hashtextextended(CASE WHEN seed=54 THEN $2 ELSE $2||':'||$3 END,seed) key
      FROM unnest(ARRAY[54,417,387]) seed) k
      ON l.classid::bigint=((k.key>>32)&4294967295) AND l.objid::bigint=(k.key&4294967295) AND l.objsubid=1
    WHERE l.pid=$1 AND l.locktype='advisory' ORDER BY k.seed`, [pid, w.tenant, w.job])).rows;
  // NULL means an advisory lock on another tenant/job or an unexpected namespace.
  expect(rows.every(row => row.seed !== null)).toBe(true);
  return rows;
}
async function waitOn387(db: PoolClient, pid: number, w: World) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const locks = await advisoryLocks(db, pid, w);
    if (locks.some(row => row.seed === 387 && !row.granted)) return locks;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Customer operation did not reach the contested job lock 387");
}

for (const operation of ["redeem", "resolve", "signout"] as const) {
  for (const competing of ["issue", "revoke", "resolve"] as const) {
    it(`${operation} versus ${competing}: 50 same-job rounds, both lock owners, no lost writes`, async () => {
      const w = await world();
      const left = await c.admin.connect(), right = await c.admin.connect();
      try {
        const leftPid = (await left.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
        const rightPid = (await right.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
        for (let round = 0; round < 50; round++) {
          const link = digest(), session = digest();
          // Existing owner-fixture technique: age issuance, never bypass the real rate gate.
          await c.admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '2 minutes',expires_at=expires_at-interval '2 minutes' WHERE tenant_id=$1 AND job_id=$2", [w.tenant, w.job]);
          await begin(right);
          const grant = await issue(right, w, link);
          if (operation !== "redeem") await use(right, w, link, session, "redeem");
          await right.query("COMMIT");
          const before = Number((await c.admin.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1", [w.tenant])).rows[0].n);
          // Permit replacement on this round without waiting a real minute.
          await c.admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '2 minutes',expires_at=expires_at-interval '2 minutes' WHERE tenant_id=$1 AND id=$2", [w.tenant, grant]);
          await begin(left); await begin(right);
          const clientFirst = round % 2 === 1;
          const client = () => use(left, w, operation === "redeem" ? link : session, session, operation);
          const competitor = () => competing === "issue" ? issue(right, w)
            : competing === "revoke" ? right.query("SELECT identity.customer_portal_revoke($1,$2,$3,$4)", [w.tenant, w.builder, w.job, grant])
            : right.query("SELECT identity.customer_portal_use($1,$2,$3,$4,NULL,'resolve')", [w.tenant, w.job, w.customer, session]);
          let clientResult: string, competitorResult: string;
          if (clientFirst) {
            clientResult = await outcome(client());
            expect(clientResult).toBe("ok");
            expect(await advisoryLocks(left, leftPid, w)).toEqual([
              { seed: 54, mode: "ShareLock", granted: true },
              { seed: 387, mode: "ExclusiveLock", granted: true },
              { seed: 417, mode: "ExclusiveLock", granted: true },
            ]);
            const pending = outcome(competitor());
            await waitOn387(left, rightPid, w);
            await left.query("COMMIT");
            competitorResult = await pending;
            await right.query(competitorResult === "ok" ? "COMMIT" : "ROLLBACK");
          } else {
            // Force exactly the reported schedule: 387 held while fallback owns 54/417.
            await right.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2,387))", [w.tenant, w.job]);
            const pending = outcome(client());
            expect(await waitOn387(right, leftPid, w)).toEqual([
              { seed: 54, mode: "ShareLock", granted: true },
              { seed: 387, mode: "ExclusiveLock", granted: false },
              { seed: 417, mode: "ExclusiveLock", granted: true },
            ]);
            expect(await advisoryLocks(right, rightPid, w)).toEqual([{ seed: 387, mode: "ExclusiveLock", granted: true }]);
            competitorResult = await outcome(competitor());
            expect(competitorResult).toBe(operation === "redeem" && competing === "resolve" ? "42501" : "ok");
            await right.query(competitorResult === "ok" ? "COMMIT" : "ROLLBACK");
            clientResult = await pending;
            await left.query(clientResult === "ok" ? "COMMIT" : "ROLLBACK");
          }
          expect(clientResult).toBe(!clientFirst && competing !== "resolve" ? "42501" : "ok");
          expect(competitorResult).toBe(competing === "resolve" && ((clientFirst && operation === "signout") || (!clientFirst && operation === "redeem")) ? "42501" : "ok");
          const stored = (await c.admin.query("SELECT revoked_at,consumed_at FROM app.customer_portal_grant WHERE tenant_id=$1 AND id=$2", [w.tenant, grant])).rows[0];
          expect(stored.revoked_at !== null).toBe(competing !== "resolve");
          const outbox = (await c.admin.query("SELECT o.status FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [w.tenant, grant])).rows[0];
          expect(outbox.status).toBe(competing === "resolve" ? "pending" : "cancelled");
          const sessions = (await c.admin.query("SELECT revoked_at FROM app.customer_portal_session WHERE tenant_id=$1 AND grant_id=$2", [w.tenant, grant])).rows;
          const redeemed = operation !== "redeem" || clientResult === "ok";
          expect(sessions).toHaveLength(redeemed ? 1 : 0);
          expect(stored.consumed_at !== null).toBe(redeemed);
          if (sessions.length) expect(sessions[0].revoked_at !== null).toBe(operation === "signout" && clientResult === "ok");
          expect(Number((await c.admin.query("SELECT count(*) n FROM app.customer_portal_grant WHERE tenant_id=$1 AND job_id=$2 AND revoked_at IS NULL", [w.tenant, w.job])).rows[0].n)).toBe(competing === "revoke" ? 0 : 1);
          const writes = Number(competing !== "resolve") + Number(clientResult === "ok" && operation !== "resolve");
          expect(Number((await c.admin.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1", [w.tenant])).rows[0].n)).toBe(before + writes);
        }
      } finally {
        await Promise.all([left.query("ROLLBACK"), right.query("ROLLBACK")]);
        left.release(); right.release();
      }
    });
  }
}
