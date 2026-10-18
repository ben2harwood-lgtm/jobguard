// LATER-B11: made-up data only. NOT RUN locally: the builder cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  UserCommandDispatcher, appendAuditBatch, verifyAuditChain, withTenant,
  type AuditEvent, type CommandMutation,
} from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 60_000);
afterAll(async () => { await c?.close(); });

async function acceptedJob() {
  const tenant = randomUUID(), user = randomUUID(), account = randomUUID();
  const member = randomUUID(), job = randomUUID(), quote = randomUUID();
  const hash = "a".repeat(64), context = testTenantContext(tenant);
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await c.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional contention builder')", [account, tenant]);
  await c.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  await c.admin.query("INSERT INTO app.job(id,tenant_id,title,status,revision) VALUES($1,$2,'Fictional contention job','accepted',1)", [job, tenant]);
  await c.admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [quote, tenant, job, hash]);
  await c.admin.query("UPDATE app.job SET accepted_quote_version_id=$3 WHERE tenant_id=$1 AND id=$2", [tenant, job, quote]);
  await withTenant(c.runtime, context, db => appendAuditBatch(db, [{
    id: randomUUID(), version: "audit.v1", actorRef: `membership:${member}`,
    eventType: "synthetic.contention.fixture", subjectType: "job", subjectRef: job, payload: {},
  }]));
  const command = {
    version: "command.v1", commandId: randomUUID(), commandType: "job.switch_live",
    semanticKey: `job:${job}:switch_live`, actorMembershipId: member, subjectType: "job", subjectRef: job,
    action: { actionType: "switch_live", recipient: null, contentHash: hash, aggregateRevision: 1,
      amountPence: 10000, currency: "GBP", policyVersion: "pilot-no-charge-v1", expiresAt: new Date("2099-01-01T00:00:00Z") },
  };
  return { tenant, job, quote, context, command };
}

async function auditChain(tenant: string): Promise<AuditEvent[]> {
  const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [tenant])).rows;
  return rows.map(row => ({ id: row.id, version: row.version, tenantId: row.tenant_id,
    sequence: Number(row.sequence), actorRef: row.actor_ref, eventType: row.event_type,
    subjectType: row.subject_type, subjectRef: row.subject_ref, occurredAt: row.occurred_at,
    payload: row.payload, payloadHash: row.payload_hash, previousHash: row.previous_hash, eventHash: row.event_hash }));
}

async function observeBlocking(pool: Pool, waiter: () => number | undefined, blocker: number, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout;
  do {
    const waiting = (await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock'
        AND $2::int=ANY(pg_blocking_pids(pid))
    ) AS blocked`, [waiter() ?? null, blocker])).rows[0]!.blocked;
    if (waiting) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  throw new Error("No business-row contention observed before command completion");
}

it("[L022] business-row contention is observed before command completion", async () => {
  const f = await acceptedJob(), before = await auditChain(f.tenant);
  expect(before).toHaveLength(1);
  // Runtime cannot lock app.job directly; only the competing test fixture uses admin.
  const blocker = await c.admin.connect();
  let pending: ReturnType<UserCommandDispatcher["dispatch"]> | undefined;
  let settled = false, waiterPid: number | undefined, mutations = 0;
  const transition: CommandMutation<{ jobId: string; revision: number; status: string }> = {
    async mutate(db) {
      mutations++;
      const backend = (await db.$client.query("SELECT pg_backend_pid() pid, current_user AS role")).rows[0]!;
      waiterPid = backend.pid;
      expect(backend.role).toBe("ent4b_login");
      const row = (await db.$client.query(`SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)`, [f.tenant, f.job, f.quote])).rows[0]!;
      return { jobId: f.job, revision: row.revision, status: row.status };
    },
  };
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenant]);
    const blockerPid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0]!.pid as number;
    const locked = await blocker.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [f.tenant, f.job]);
    expect(locked.rows).toEqual([{ id: f.job }]);
    pending = new UserCommandDispatcher(c.runtime).dispatch(f.context, f.command, transition);
    // Attach both outcomes immediately so a database failure cannot become an unhandled rejection.
    void pending.then(() => { settled = true; }, () => { settled = true; });
    try {
      await observeBlocking(c.admin, () => waiterPid, blockerPid);
      expect(waiterPid).not.toBe(blockerPid);
      expect(settled).toBe(false);
      expect((await c.admin.query("SELECT status,revision FROM app.job WHERE tenant_id=$1 AND id=$2", [f.tenant, f.job])).rows).toEqual([{ status: "accepted", revision: 1 }]);
      expect(await auditChain(f.tenant)).toEqual(before);
    } finally {
      await blocker.query("ROLLBACK");
    }
    await expect(pending).resolves.toEqual({ jobId: f.job, status: "live", revision: 2 });
    await expect(new UserCommandDispatcher(c.runtime).dispatch(f.context, f.command, transition)).resolves.toEqual({ jobId: f.job, status: "live", revision: 2 });
    expect(mutations).toBe(1);
    expect((await c.admin.query("SELECT status,revision FROM app.job WHERE tenant_id=$1 AND id=$2", [f.tenant, f.job])).rows).toEqual([{ status: "live", revision: 2 }]);
    const receipts = await c.admin.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.tenant, f.command.commandId]);
    expect(receipts.rows).toEqual([{ status: "succeeded" }]);
    const after = await auditChain(f.tenant);
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({ eventType: "command.succeeded", subjectRef: f.job, previousHash: before[0]!.eventHash });
    expect(() => verifyAuditChain(after)).not.toThrow();
  } finally {
    try {
      await blocker.query("ROLLBACK");
    } finally {
      blocker.release();
      await pending?.catch(() => undefined);
    }
  }
}, 30_000);

it("[L022] blocking observer refuses a SELECT-only substitute while the same business row is locked", async () => {
  const f = await acceptedJob(), blocker = await c.admin.connect(), reader = await c.runtime.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenant]);
    const blockerPid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0]!.pid as number;
    await blocker.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [f.tenant, f.job]);
    await reader.query("BEGIN");
    await reader.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenant]);
    const readerPid = (await reader.query("SELECT pg_backend_pid() pid")).rows[0]!.pid as number;
    expect(readerPid).not.toBe(blockerPid);
    expect((await reader.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2", [f.tenant, f.job])).rows).toEqual([{ id: f.job }]);
    await expect(observeBlocking(c.admin, () => readerPid, blockerPid, 150)).rejects.toThrow("No business-row contention observed before command completion");
  } finally {
    try {
      await blocker.query("ROLLBACK");
    } finally {
      blocker.release();
      try {
        await reader.query("ROLLBACK");
      } finally {
        reader.release();
      }
    }
  }
});
