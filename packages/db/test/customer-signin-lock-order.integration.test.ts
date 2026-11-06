import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, ownerTx, type Cluster } from "./contractor-practice-session-fixtures.js";
import { ExtraApprovalRepository, appendAuditBatch, canonicalJson, type TenantTransaction } from "../src/index.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "../src/repository-command.js";
import { chainWorld, submitted, approveInput, emailOf, newToken } from "./extra-approval-chain-fixtures.js";

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
async function advisoryLocks(db: Pool | PoolClient, pid: number, w: { tenant: string; job: string }) {
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
            await advisoryLocks(c.admin, rightPid, w);
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
            await advisoryLocks(c.admin, rightPid, w);
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

it("matched extra-approver approval versus xa_withdraw: 50 same-job rounds, both lock owners, one outcome", async () => {
  const w = await chainWorld(c), repo = new ExtraApprovalRepository(c.runtime), context = await w.ctx;
  const actor = w.members.client_approver.member.membershipId, supervisor = w.members.supervisor.member.membershipId;
  const left = await c.admin.connect(), right = await c.admin.connect();
  try {
    const leftPid = (await left.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    const rightPid = (await right.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    for (let round = 0; round < 50; round++) {
      const s = await submitted(c, w, 150000), signin = digest(), session = digest();
      const target = { tenant: w.p.tenantId, job: s.jobId };
      await repo.approveExtraStep(context, w.members.supervisor.member, approveInput(s, 0));
      await repo.approveExtraStep(context, w.supervisor2.member, approveInput(s, 1));
      await repo.issueClientApproval(context, w.members.surveyor.member, {
        version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
        approverMembershipId: actor, recipient: await emailOf(c, w, actor), linkToken: newToken(),
        signinDigest: signin, expiresAt: new Date(Date.now() + 3600_000),
      });
      await begin(left);
      expect((await left.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,'redeem') result",
        [target.tenant, target.job, actor, signin, session])).rows[0].result).toMatchObject({ extraApprover: true });
      await left.query("COMMIT");
      await begin(left);
      await right.query("BEGIN");
      await right.query("SET LOCAL statement_timeout='15s'");
      await right.query("SET LOCAL ROLE jobguard_runtime");
      await right.query("SELECT set_config('app.tenant_id',$1,true)", [target.tenant]);
      const approval = () => left.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result", [
        target.tenant, target.job, actor, session, { version: "extra-customer.v1", action: "decide", jobId: target.job,
          requestId: s.requestId, commandId: randomUUID(), revisionHash: s.hash, netPence: s.net, decision: "approve" },
      ]);
      // A tenant writer uses exclusive 54; xa_begin itself uses shared 54 then 417.
      // This barrier makes a reversed 417-before-54 sign-in order form a real cycle,
      // rather than merely proving that two compatible shared tenant locks coexist.
      const tenantWriter = () => right.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [target.tenant]);
      const withdraw = async () => {
        await tenantWriter();
        const db = drizzle(right) as TenantTransaction, commandId = randomUUID();
        const content = { jobId: target.job, extraId: s.extraId, reasonCode: "not_done" };
        // Use the production command lifecycle, preserving raw SQLSTATEs (the
        // repository maps 40P01 to STALE_REVISION, which would conceal this failure).
        expect(await beginRepositoryCommand(db, { tenantId: target.tenant, actorMembershipId: supervisor, commandId,
          commandType: "WithdrawExtra", semanticKey: `extra-withdraw:${target.job}:${s.extraId}:${commandId}`,
          jobId: target.job, legacyJson: canonicalJson({ type: "WithdrawExtra", actor: supervisor, content }) })).toMatchObject({ kind: "claim" });
        await right.query("SELECT app.xa_withdraw($1,$2,$3,$4,'not_done')", [target.job, s.extraId, commandId, supervisor]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${supervisor}`,
          eventType: "contractor.extra.withdrawn", subjectType: "extra", subjectRef: s.extraId,
          payload: { references: { command: commandId, job: target.job, extra: s.extraId, environment: "synthetic_demo" },
            classifications: { action: "commercial" } } }]);
        return completeRepositoryCommand(db, commandId);
      };
      const waitOn54 = async (pid: number) => {
        for (let attempt = 0; attempt < 200; attempt++) {
          const locks = await advisoryLocks(c.admin, pid, target);
          if (locks.some(lock => lock.seed === 54 && !lock.granted)) return locks;
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        throw new Error("Extra-approver race did not reach contested tenant lock 54");
      };
      const clientFirst = round % 2 === 1;
      let clientResult: string, competitorResult: string;
      if (clientFirst) {
        clientResult = await outcome(approval());
        expect(clientResult).toBe("ok");
        expect(await advisoryLocks(c.admin, leftPid, target)).toEqual([
          { seed: 54, mode: "ShareLock", granted: true }, { seed: 417, mode: "ExclusiveLock", granted: true },
        ]);
        const pending = outcome(withdraw());
        expect(await waitOn54(rightPid)).toEqual([{ seed: 54, mode: "ExclusiveLock", granted: false }]);
        await left.query("COMMIT");
        competitorResult = await pending;
        await advisoryLocks(c.admin, rightPid, target);
        expect(competitorResult).toBe("23514");
        await right.query("ROLLBACK");
      } else {
        await tenantWriter();
        const pending = outcome(approval());
        expect(await waitOn54(leftPid)).toEqual(expect.arrayContaining([{ seed: 54, mode: "ShareLock", granted: false }]));
        competitorResult = await outcome(withdraw());
        expect(competitorResult).toBe("ok");
        const locks = await advisoryLocks(c.admin, rightPid, target);
        expect(locks).toHaveLength(3);
        expect(locks).toEqual(expect.arrayContaining([
          { seed: 54, mode: "ExclusiveLock", granted: true }, { seed: 54, mode: "ShareLock", granted: true },
          { seed: 417, mode: "ExclusiveLock", granted: true },
        ]));
        await right.query("COMMIT");
        clientResult = await pending;
        expect(clientResult).toBe("23514");
        await left.query("ROLLBACK");
      }
      expect([clientResult, competitorResult]).not.toContain("40P01");
      expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE tenant_id=$1 AND request_id=$2",
        [target.tenant, s.requestId])).rows).toEqual([{ kind: clientFirst ? "approved" : "withdrawn" }]);
      expect((await c.admin.query("SELECT actor_membership_id FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND request_id=$2 AND actor_kind='client_approver'",
        [target.tenant, s.requestId])).rows).toEqual(clientFirst ? [{ actor_membership_id: actor }] : []);
    }
  } finally {
    await Promise.all([left.query("ROLLBACK"), right.query("ROLLBACK")]);
    left.release(); right.release();
  }
}, 240_000);

it("matched extra-approver approval versus xa_withdraw without a barrier: 50 simultaneous same-job rounds, one outcome", async () => {
  const w = await chainWorld(c), repo = new ExtraApprovalRepository(c.runtime), context = await w.ctx;
  const actor = w.members.client_approver.member.membershipId, supervisor = w.members.supervisor.member.membershipId;
  const left = await c.admin.connect(), right = await c.admin.connect();
  try {
    const leftPid = (await left.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    const rightPid = (await right.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    for (let round = 0; round < 50; round++) {
      const s = await submitted(c, w, 150000), signin = digest(), session = digest();
      const target = { tenant: w.p.tenantId, job: s.jobId };
      await repo.approveExtraStep(context, w.members.supervisor.member, approveInput(s, 0));
      await repo.approveExtraStep(context, w.supervisor2.member, approveInput(s, 1));
      await repo.issueClientApproval(context, w.members.surveyor.member, {
        version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
        approverMembershipId: actor, recipient: await emailOf(c, w, actor), linkToken: newToken(),
        signinDigest: signin, expiresAt: new Date(Date.now() + 3600_000),
      });
      await begin(left);
      expect((await left.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,'redeem') result",
        [target.tenant, target.job, actor, signin, session])).rows[0].result).toMatchObject({ extraApprover: true });
      await left.query("COMMIT");
      await begin(left);
      await right.query("BEGIN");
      await right.query("SET LOCAL statement_timeout='15s'");
      await right.query("SET LOCAL ROLE jobguard_runtime");
      await right.query("SELECT set_config('app.tenant_id',$1,true)", [target.tenant]);
      // The approval enters through extra_customer_use; both paths acquire their
      // own production locks, with no exclusive tenant barrier or pre-held job lock.
      const approval = () => left.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result", [
        target.tenant, target.job, actor, session, { version: "extra-customer.v1", action: "decide", jobId: target.job,
          requestId: s.requestId, commandId: randomUUID(), revisionHash: s.hash, netPence: s.net, decision: "approve" },
      ]);
      const withdraw = async () => {
        const db = drizzle(right) as TenantTransaction, commandId = randomUUID();
        const content = { jobId: target.job, extraId: s.extraId, reasonCode: "not_done" };
        // Preserve raw SQLSTATEs: repository error mapping must not hide 40P01.
        expect(await beginRepositoryCommand(db, { tenantId: target.tenant, actorMembershipId: supervisor, commandId,
          commandType: "WithdrawExtra", semanticKey: `extra-withdraw:${target.job}:${s.extraId}:${commandId}`,
          jobId: target.job, legacyJson: canonicalJson({ type: "WithdrawExtra", actor: supervisor, content }) })).toMatchObject({ kind: "claim" });
        await right.query("SELECT app.xa_withdraw($1,$2,$3,$4,'not_done')", [target.job, s.extraId, commandId, supervisor]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${supervisor}`,
          eventType: "contractor.extra.withdrawn", subjectType: "extra", subjectRef: s.extraId,
          payload: { references: { command: commandId, job: target.job, extra: s.extraId, environment: "synthetic_demo" },
            classifications: { action: "commercial" } } }]);
        return completeRepositoryCommand(db, commandId);
      };
      const finish = async (db: PoolClient, pid: number, work: Promise<unknown>) => {
        const result = await outcome(work);
        const locks = await advisoryLocks(c.admin, pid, target);
        if (result === "ok") expect(locks).toEqual(expect.arrayContaining([
          { seed: 54, mode: "ShareLock", granted: true }, { seed: 417, mode: "ExclusiveLock", granted: true },
        ]));
        // Release the winner independently so the other operation can finish.
        await db.query(result === "ok" ? "COMMIT" : "ROLLBACK");
        return result;
      };
      const [clientResult, competitorResult] = await Promise.all([
        finish(left, leftPid, approval()), finish(right, rightPid, withdraw()),
      ]);
      expect([clientResult, competitorResult]).not.toContain("40P01");
      expect([clientResult, competitorResult].sort()).toEqual(["23514", "ok"]);
      expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE tenant_id=$1 AND request_id=$2",
        [target.tenant, s.requestId])).rows).toEqual([{ kind: clientResult === "ok" ? "approved" : "withdrawn" }]);
      expect((await c.admin.query("SELECT actor_membership_id FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND request_id=$2 AND actor_kind='client_approver'",
        [target.tenant, s.requestId])).rows).toEqual(clientResult === "ok" ? [{ actor_membership_id: actor }] : []);
    }
  } finally {
    await Promise.all([left.query("ROLLBACK"), right.query("ROLLBACK")]);
    left.release(); right.release();
  }
}, 240_000);
