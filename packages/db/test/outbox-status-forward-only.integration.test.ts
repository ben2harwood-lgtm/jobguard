import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionExecutor, appendOutboundAction, migrate, operateOutbox, reconcileOutbox,
  withTenant, type OutboundAdapter } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenant = randomUUID(), account = randomUUID(), user = randomUUID(), member = randomUUID();
const context = testTenantContext(tenant);
const trigger = "action_outbox_status_forward_only";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, databaseDir: string;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jobguard-outbox-forward-"));
  const port = await freePort(57500, 400);
  postgres = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "test-only",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "test-only" });
  // Fresh empty database applies the entire chain, including 0851.
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  await admin.query(`CREATE ROLE outbox_forward_runtime LOGIN PASSWORD 'runtime-only'
    NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
    GRANT jobguard_runtime TO outbox_forward_runtime`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres",
    user: "outbox_forward_runtime", password: "runtime-only", max: 2 });
}, 120_000);

afterAll(async () => {
  await closeTestPools(runtime, admin);
  await postgres?.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
});

async function appendAction() {
  const id = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
  const content = `Synthetic approved document ${id}`;
  const hash = createHash("sha256").update(content).digest("hex");
  // Trusted owner fixtures, as in outbox.integration.test.ts; runtime cannot forge approval.
  await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','synthetic','send_quote')", [decision, tenant]);
  await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, member]);
  await admin.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,
    action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
    VALUES($1,$2,$3,$4,$5,'send_quote','customer@example.invalid',$6,1,'pilot-v1','2099-01-01')`,
  [authorization, tenant, decision, resolution, member, hash]);
  await withTenant(runtime, context, db => appendOutboundAction(db, tenant, {
    version: "outbound-action.v1", id, authorizationId: authorization, adapter: "fake_capture",
    providerEffectKey: `synthetic:${id}`, actionType: "send_quote", recipient: "customer@example.invalid",
    contentHash: hash, immutableContent: content, aggregateRevision: 1, amountPence: null,
    currency: null, policyVersion: "pilot-v1", authorizationExpiresAt: new Date("2099-01-01T00:00:00Z"),
  }));
  return id;
}

function worker(deliver: OutboundAdapter["deliver"], reconcile: OutboundAdapter["reconcile"] = async () => "unknown") {
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false, deliver, reconcile };
  return { adapter, executor: new ActionExecutor(runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined }) };
}
const snapshot = (id: string) => withTenant(runtime, context, async db =>
  (await db.$client.query("SELECT * FROM app.action_outbox WHERE id=$1", [id])).rows[0]);
const due = (id: string) => withTenant(runtime, context, async db => {
  await db.$client.query("UPDATE app.action_outbox SET next_attempt_at=clock_timestamp() WHERE id=$1", [id]);
});
const changeStatus = (id: string, status: string) => withTenant(runtime, context, async db => {
  await db.$client.query("UPDATE app.action_outbox SET status=$2 WHERE id=$1", [id, status]);
});

// Shared with the scratch negative control: it must fail when the trigger is absent.
async function refusesReset(query: (sql: string, params: string[]) => Promise<unknown>, id: string) {
  await expect(query("UPDATE app.action_outbox SET status='pending' WHERE id=$1", [id]))
    .rejects.toMatchObject({ code: "23514", message: "INVALID_TRANSITION" });
}

async function terminalAction(status: "succeeded" | "cancelled" | "dead_letter") {
  const id = await appendAction();
  let calls = 0;
  const { executor } = worker(async () => {
    calls++;
    // The real worker reads its committed claim before invoking the fake adapter.
    expect((await snapshot(id)).status).toBe("executing");
    return status === "dead_letter" ? { kind: "retryable", code: "SYNTHETIC_FAILURE" }
      : { kind: "succeeded", providerReference: "synthetic-effect" };
  });
  if (status === "cancelled") await operateOutbox(runtime, context, id, "cancel");
  else for (let attempt = 0; attempt < (status === "dead_letter" ? 5 : 1); attempt++) {
    await due(id);
    await executor.execute(context, id);
  }
  expect((await snapshot(id)).status).toBe(status);
  return { id, executor, calls: () => calls };
}

describe("LATER-SAFETY-125 outbox status transitions", () => {
  it("fresh migration installs a locked-down, order-independent status trigger", async () => {
    const result = await admin.query(`SELECT p.prosecdef,p.proconfig,r.rolname AS owner,
      t.tgenabled,pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_roles r ON r.oid=p.proowner
      WHERE t.tgrelid='app.action_outbox'::regclass AND t.tgname=$1`, [trigger]);
    expect(result.rows).toEqual([expect.objectContaining({ prosecdef: true,
      proconfig: ["search_path=pg_catalog"], owner: "jobguard_migration", tgenabled: "O" })]);
    expect(result.rows[0].definition).toContain("BEFORE UPDATE OF status");
    for (const role of ["jobguard_runtime", "jobguard_identity", "jobguard_infrastructure"]) {
      expect((await admin.query("SELECT has_function_privilege($1,'app.outbox_status_forward_only()','EXECUTE') AS allowed", [role])).rows[0].allowed).toBe(false);
    }
  });

  it("keeps retryable status for operator retry, then claims and succeeds", async () => {
    const id = await appendAction();
    let calls = 0;
    const { executor } = worker(async () => {
      expect((await snapshot(id)).status).toBe("executing");
      return ++calls === 1 ? { kind: "retryable", code: "SYNTHETIC_RETRY" }
        : { kind: "succeeded", providerReference: "synthetic-effect" };
    });
    expect((await snapshot(id)).status).toBe("pending");
    await executor.execute(context, id);
    expect((await snapshot(id)).status).toBe("retryable");
    await executor.execute(context, id);
    expect(calls).toBe(1); // Backoff remains enforced.
    await operateOutbox(runtime, context, id, "retry");
    expect((await snapshot(id)).status).toBe("retryable");
    await executor.execute(context, id);
    expect((await snapshot(id)).status).toBe("succeeded");
    expect(calls).toBe(2);
  });

  it.each(["succeeded", "not_found"] as const)("preserves unknown-outcome reconciliation: %s", async result => {
    const id = await appendAction();
    const { adapter, executor } = worker(async () => ({ kind: "outcome_unknown", code: "SYNTHETIC_TIMEOUT" }), async () => result);
    await executor.execute(context, id);
    expect((await snapshot(id)).status).toBe("outcome_unknown");
    await reconcileOutbox(runtime, context, id, adapter);
    expect((await snapshot(id)).status).toBe(result === "succeeded" ? "succeeded" : "retryable");
  });

  it.each(["succeeded", "cancelled", "dead_letter"] as const)("refuses %s reset without changing the row or repeating an effect", async status => {
    const action = await terminalAction(status);
    const before = await snapshot(action.id), calls = action.calls();
    await refusesReset((sql, params) => withTenant(runtime, context, db => db.$client.query(sql, params)), action.id);
    expect(await snapshot(action.id)).toEqual(before);
    await action.executor.execute(context, action.id);
    expect(action.calls()).toBe(calls);
    expect(await snapshot(action.id)).toEqual(before);
  });

  it("rejects every unlisted edge and permits only existing nonterminal edges and no-ops", async () => {
    const states = ["pending", "executing", "succeeded", "retryable", "outcome_unknown", "dead_letter", "cancelled"];
    const allowed: Record<string, string[]> = {
      pending: ["executing", "cancelled"], retryable: ["executing", "cancelled"],
      executing: ["succeeded", "retryable", "outcome_unknown", "dead_letter"],
      outcome_unknown: ["succeeded", "retryable", "cancelled"],
    };
    for (const from of states) for (const to of states) {
      const id = await appendAction();
      // Reach each starting state through permitted edges, without disabling guards.
      if (from === "cancelled") await changeStatus(id, from);
      else if (from !== "pending") {
        await changeStatus(id, "executing");
        if (from !== "executing") await changeStatus(id, from);
      }
      const before = await snapshot(id);
      if (from === to || allowed[from]?.includes(to)) {
        await changeStatus(id, to);
        expect((await snapshot(id)).status).toBe(to);
      } else {
        await expect(changeStatus(id, to)).rejects.toMatchObject({ code: "23514", message: "INVALID_TRANSITION" });
        expect(await snapshot(id)).toEqual(before);
      }
    }
  });

  it.each(["succeeded", "cancelled", "dead_letter"] as const)("scratch negative control: removing trigger breaks the %s refusal assertion, then restores it", async status => {
    const action = await terminalAction(status);
    const before = await snapshot(action.id);
    const scratch: PoolClient = await admin.connect();
    try {
      // Isolated transactional scratch schema state; rollback restores trigger and row.
      await scratch.query("BEGIN");
      await scratch.query(`DROP TRIGGER ${trigger} ON app.action_outbox`);
      await scratch.query("SET LOCAL ROLE jobguard_runtime");
      await scratch.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      await expect(refusesReset((sql, params) => scratch.query(sql, params), action.id))
        .rejects.toThrow(/promise resolved/u);
      expect((await scratch.query("SELECT status FROM app.action_outbox WHERE id=$1", [action.id])).rows[0].status).toBe("pending");
    } finally {
      await scratch.query("ROLLBACK");
      scratch.release();
    }
    expect(await snapshot(action.id)).toEqual(before);
    await refusesReset((sql, params) => withTenant(runtime, context, db => db.$client.query(sql, params)), action.id);
  });
});
