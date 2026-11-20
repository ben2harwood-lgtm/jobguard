import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { registerOutboxDiscoveryTask } from "../../../apps/api/src/outbox-discovery-task.js";
import { ActionExecutor, appendOutboundAction, migrate, operateOutbox, withTenant, type OutboundAdapter } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

type TaskList = Parameters<typeof registerOutboxDiscoveryTask>[0];
type Task = NonNullable<TaskList[string]>;

const { makeWorkerUtils } = createRequire(new URL("../../../apps/api/package.json", import.meta.url))("graphile-worker");
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, infrastructure: Pool, directory: string;
const tenants = [randomUUID(), randomUUID()];
const tenantOwners = new Map<string, string>();
const actions: { id: string; tenant: string }[] = [];
const tasks: TaskList = {};
registerOutboxDiscoveryTask(tasks);

// Real SQL on one checked-out queue connection, including fault/race interception below.
async function discover(intercept?: (client: PoolClient, sql: string, params?: unknown[]) => Promise<unknown>) {
  const client = await infrastructure.connect();
  try {
    const helpers = { withPgClient: async (fn: (pg: unknown) => unknown) => fn(intercept
      ? { query: (sql: string, params?: unknown[]) => intercept(client, sql, params) } : client) };
    await tasks.discover_outbox!({}, helpers as unknown as Parameters<Task>[1]);
  } finally { client.release(); }
}
const stamps = async () => (await admin.query("SELECT action_id,enqueued_at FROM infrastructure.outbox_signal ORDER BY action_id")).rows;
const jobs = async () => (await admin.query("SELECT j.id,j.key,j.payload,j.run_at FROM graphile_worker._private_jobs j JOIN graphile_worker._private_tasks t ON t.id=j.task_id WHERE t.identifier='execute_outbox' ORDER BY j.key")).rows;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-outbox-discovery-"));
  const port = await freePort(57500, 400);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "test-only",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "postgres" };
  admin = new Pool({ ...connection, user: "postgres", password: "test-only" });
  await migrate(admin);
  await admin.query(`CREATE ROLE discovery_runtime LOGIN PASSWORD 'runtime-only' INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE jobguard_runtime;
    CREATE ROLE discovery_queue LOGIN PASSWORD 'queue-only' INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE jobguard_infrastructure;
    CREATE SCHEMA graphile_worker AUTHORIZATION discovery_queue;
    GRANT CREATE ON DATABASE postgres TO discovery_queue`);
  runtime = new Pool({ ...connection, user: "discovery_runtime", password: "runtime-only" });
  infrastructure = new Pool({ ...connection, user: "discovery_queue", password: "queue-only", max: 2 });
  const utils = await makeWorkerUtils({ pgPool: infrastructure });
  await utils.migrate(); await utils.release();
  await admin.query("REVOKE CREATE ON DATABASE postgres FROM discovery_queue");
  for (const tenant of tenants) {
    const user = randomUUID(), account = randomUUID(), member = randomUUID();
    tenantOwners.set(tenant, member);
    const decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
    const content = "Fictional approved document", hash = createHash("sha256").update(content).digest("hex");
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional')", [account, tenant]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
    await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','fictional','send_quote')", [decision, tenant]);
    await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, member]);
    await admin.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
      VALUES($1,$2,$3,$4,$5,'send_quote','fictional@example.invalid',$6,1,'pilot-v1','2099-01-01')`, [authorization, tenant, decision, resolution, member, hash]);
    for (let i = 0; i < 105; i++) {
      const id = randomUUID();
      await withTenant(runtime, testTenantContext(tenant, { membershipId: member }), db => appendOutboundAction(db, tenant, {
        version: "outbound-action.v1", id, authorizationId: authorization, adapter: "fake_capture", providerEffectKey: `fictional:${id}`,
        actionType: "send_quote", recipient: "fictional@example.invalid", contentHash: hash, immutableContent: content,
        aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "pilot-v1", authorizationExpiresAt: new Date("2099-01-01"),
      }));
      actions.push({ id, tenant });
    }
  }
  // Old terminal actions must not starve later pending actions. Preserve the status guard.
  const oldest = actions.slice(0, 100).map(a => a.id);
  await admin.query("UPDATE app.action_outbox SET status='executing' WHERE id=ANY($1::uuid[])", [oldest]);
  await admin.query("UPDATE app.action_outbox SET status='succeeded' WHERE id=ANY($1::uuid[])", [oldest]);
}, 120_000);

afterAll(async () => {
  await closeTestPools(infrastructure, runtime, admin);
  await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("reaches all 210 signals across tenants, then cycles seen signals with stable deduplicated jobs", async () => {
  await discover();
  expect((await stamps()).filter(s => s.enqueued_at !== null)).toHaveLength(100);
  await discover();
  expect((await stamps()).filter(s => s.enqueued_at !== null)).toHaveLength(200);
  await discover();
  expect((await stamps()).every(s => s.enqueued_at !== null)).toBe(true);
  const before = await jobs();
  expect(before).toHaveLength(210);
  for (const a of actions) expect(before).toContainEqual(expect.objectContaining({ key: `outbox:${a.id}`, payload: { actionId: a.id, tenantId: a.tenant } }));
  const previous = await stamps();
  await discover();
  expect(await jobs()).toEqual(before); // preserve_run_at and job identities survive repeat discovery.
  expect(await stamps()).not.toEqual(previous);
});

it("concurrent locked batches skip occupied rows, reach the remainder, and never lose signals", async () => {
  await admin.query("UPDATE infrastructure.outbox_signal SET enqueued_at=NULL");
  let selected!: () => void, release!: () => void;
  const locked = new Promise<void>(resolve => { selected = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const first = discover(async (client, sql, params) => {
    const result = await client.query(sql, params);
    if (sql.startsWith("SELECT action_id")) { selected(); await resume; }
    return result;
  });
  try {
    await locked;
    await discover();
    expect((await stamps()).filter(s => s.enqueued_at !== null)).toHaveLength(100);
  } finally { release(); await first; }
  expect((await stamps()).filter(s => s.enqueued_at !== null)).toHaveLength(200);
  await discover();
  expect((await stamps()).every(s => s.enqueued_at !== null)).toBe(true);
  expect(await jobs()).toHaveLength(210);
});

it("real add_job failure rolls back prior enqueues and timestamps; restart rediscovers the batch", async () => {
  const beforeStamps = await stamps(), beforeJobs = await jobs();
  let enqueues = 0;
  await expect(discover(async (client, sql, params) => {
    if (sql.includes("graphile_worker.add_job") && ++enqueues === 2) {
      // Invoke the real Graphile function with a refused mode, after one successful enqueue.
      return client.query(sql.replace("'preserve_run_at'", "'synthetic_invalid_mode'"), params);
    }
    if (sql.includes("graphile_worker.add_job")) {
      // A fresh synthetic key makes rollback of a real insertion observable.
      return client.query(sql, [params![0], `${params![1]}:rollback-probe`]);
    }
    return client.query(sql, params);
  })).rejects.toThrow(/Invalid job_key_mode/);
  expect(enqueues).toBe(2);
  expect(await stamps()).toEqual(beforeStamps);
  expect(await jobs()).toEqual(beforeJobs);
  await discover();
  expect(await stamps()).not.toEqual(beforeStamps);
});

it("rediscovery leaves persisted due time, max attempts and terminal delivery authority with the executor", async () => {
  const retry = actions[205]!, unknown = actions[206]!, cancelled = actions[207]!;
  const calls = new Map<string, number>();
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
    async deliver(action) {
      calls.set(action.id, (calls.get(action.id) ?? 0) + 1);
      return action.id === unknown.id ? { kind: "outcome_unknown", code: "SYNTHETIC_UNKNOWN" } : { kind: "retryable", code: "SYNTHETIC_RETRY" };
    }, async reconcile() { return "unknown"; } };
  const executor = new ActionExecutor(runtime, new Map([[adapter.name, adapter]]), { emit() {} });
  const context = (tenant: string) => testTenantContext(tenant, { membershipId: tenantOwners.get(tenant)! });
  const execute = (a: typeof retry) => executor.execute(context(a.tenant), a.id);
  const rediscover = async () => { for (let i = 0; i < 3; i++) await discover(); };
  // A worker without this adapter can refuse now without stranding the durable signal.
  await new ActionExecutor(runtime, new Map(), { emit() {} }).execute(context(retry.tenant), retry.id);
  expect((await admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE action_id=$1", [retry.id])).rows[0].n).toBe(0);
  await rediscover();
  await executor.execute(context(tenants[0]!), retry.id); // Wrong tenant never delivers.
  expect(calls.size).toBe(0);
  await execute(retry); await execute(unknown);
  await operateOutbox(runtime, testTenantContext(cancelled.tenant, { membershipId: tenantOwners.get(cancelled.tenant)! }), cancelled.id, "cancel");
  await rediscover(); await execute(retry); await execute(unknown); await execute(cancelled); await execute(actions[0]!);
  expect(calls.get(retry.id)).toBe(1); expect(calls.get(unknown.id)).toBe(1);
  expect(calls.has(cancelled.id)).toBe(false); expect(calls.has(actions[0]!.id)).toBe(false);
  for (let attempt = 1; attempt < 5; attempt++) {
    await admin.query("UPDATE app.action_outbox SET next_attempt_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [retry.tenant, retry.id]);
    await rediscover(); await execute(retry);
  }
  await rediscover(); await execute(retry);
  expect(calls.get(retry.id)).toBe(5);
  expect((await admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [retry.id])).rows[0].status).toBe("dead_letter");
});

it("uses unchanged narrow queue grants without business-table access", async () => {
  for (const operation of ["SELECT", "UPDATE"]) expect((await admin.query("SELECT has_table_privilege('discovery_queue','infrastructure.outbox_signal',$1) allowed", [operation])).rows[0].allowed).toBe(true);
  for (const operation of ["INSERT", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) expect((await admin.query("SELECT has_table_privilege('discovery_queue','infrastructure.outbox_signal',$1) allowed", [operation])).rows[0].allowed).toBe(false);
  await expect(infrastructure.query("SELECT * FROM app.action_outbox")).rejects.toThrow(/permission denied/);
  await expect(infrastructure.query("SELECT * FROM app.action_authorization")).rejects.toThrow(/permission denied/);
  const posture = (await infrastructure.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=session_user")).rows[0];
  expect(posture).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
});
