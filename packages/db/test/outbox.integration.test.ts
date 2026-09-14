import { closeTestPools } from "./pool-test-utils.js";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActionExecutor,
  appendOutboundAction,
  ingestProviderEvent,
  migrate,
  operateOutbox,
  reconcileOutbox,
  withTenant,
  type OutboundAction,
  type OutboundAdapter,
  type SafeTelemetry,
  type VerifiedTenantContext,
} from "../src/index.js";

const TENANT = "91000000-0000-4000-8000-000000000001";
const ACCOUNT = "92000000-0000-4000-8000-000000000001";
const USER = "93000000-0000-4000-8000-000000000001";
const MEMBER = "94000000-0000-4000-8000-000000000001";
const context = { tenantId: TENANT } as VerifiedTenantContext;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

let postgres: EmbeddedPostgres;
let admin: Pool;
let runtime: Pool;
let infrastructure: Pool;
let databaseDir: string;
let sequence = 1;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jobguard-outbox-"));
  const port = 57500 + Math.floor(Math.random() * 400);
  postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "test-only",
    persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C"],
    onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "test-only" });
  await migrate(admin);
  await admin.query(`
    INSERT INTO control_plane.tenant(id) VALUES('${TENANT}');
    INSERT INTO identity.identity_user(id) VALUES('${USER}');
    INSERT INTO app.account(id,tenant_id,name) VALUES('${ACCOUNT}','${TENANT}','Synthetic');
    INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES('${MEMBER}','${TENANT}','${ACCOUNT}','${USER}','owner');
    CREATE ROLE outbox_runtime LOGIN PASSWORD 'runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
    GRANT jobguard_runtime TO outbox_runtime;
    CREATE ROLE outbox_infrastructure LOGIN PASSWORD 'infra-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
    GRANT jobguard_infrastructure TO outbox_infrastructure;
  `);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "outbox_runtime", password: "runtime-only", application_name: "outbox-test-business-worker", max: 5 });
  infrastructure = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "outbox_infrastructure", password: "infra-only" });
  admin.on("error", () => undefined);
  runtime.on("error", () => undefined);
  infrastructure.on("error", () => undefined);
}, 60_000);

afterAll(async () => {
  await closeTestPools(infrastructure, runtime, admin);
  await postgres?.stop();
  await rm(databaseDir, { recursive: true, force: true });
});

async function createAuthorization(expiresAt = "2099-01-01T00:00:00Z") {
  const suffix = String(sequence++).padStart(12, "0");
  const decisionId = `95000000-0000-4000-8000-${suffix}`;
  const resolutionId = `96000000-0000-4000-8000-${suffix}`;
  const authorizationId = `97000000-0000-4000-8000-${suffix}`;
  const content = `approved immutable document ${suffix}`;
  await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','synthetic-document','send_quote')", [decisionId, TENANT]);
  await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolutionId, TENANT, decisionId, MEMBER]);
  await admin.query(
    `INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
       VALUES($1,$2,$3,$4,$5,'send_quote','customer@example.test',$6,1,'pilot-v1',$7)`,
    [authorizationId, TENANT, decisionId, resolutionId, MEMBER, hash(content), expiresAt],
  );
  return { authorizationId, content };
}

async function appendAction(options: { expiresAt?: string; rollback?: boolean } = {}) {
  const { authorizationId, content } = await createAuthorization(options.expiresAt);
  const suffix = String(sequence++).padStart(12, "0");
  const id = `98000000-0000-4000-8000-${suffix}`;
  const action: OutboundAction = {
    version: "outbound-action.v1",
    id,
    authorizationId,
    adapter: "fake_capture",
    providerEffectKey: `effect:${suffix}`,
    actionType: "send_quote",
    recipient: "customer@example.test",
    contentHash: hash(content),
    immutableContent: content,
    aggregateRevision: 1,
    amountPence: null,
    currency: null,
    policyVersion: "pilot-v1",
    authorizationExpiresAt: new Date(options.expiresAt ?? "2099-01-01T00:00:00Z"),
  };
  const operation = withTenant(runtime, context, async (db) => {
    await appendOutboundAction(db, TENANT, action);
    if (options.rollback) throw new Error("synthetic rollback");
  });
  if (options.rollback) await expect(operation).rejects.toThrow("synthetic rollback");
  else await operation;
  return action;
}

const telemetryEvents: Array<{ name: string; fields: Readonly<Record<string, string | number>> }> = [];
const telemetry: SafeTelemetry = { emit: (name, fields) => telemetryEvents.push({ name, fields }) };
const adapter = (deliver: OutboundAdapter["deliver"], reconcile: OutboundAdapter["reconcile"] = async () => "unknown"): OutboundAdapter => ({
  name: "fake_capture",
  supportsProviderDeduplication: false,
  deliver,
  reconcile,
});
const statusOf = (id: string) => withTenant(runtime, context, async (db) =>
  (await db.$client.query<{ status: string }>("SELECT status FROM app.action_outbox WHERE id=$1", [id])).rows[0]?.status);

describe("transactional outbox and fake worker execution", () => {
  it("publishes no routing signal and sends nothing when the business transaction rolls back", async () => {
    const action = await appendAction({ rollback: true });
    expect((await infrastructure.query("SELECT * FROM infrastructure.outbox_signal WHERE action_id=$1", [action.id])).rows).toEqual([]);
    let calls = 0;
    await new ActionExecutor(runtime, new Map([["fake_capture", adapter(async () => { calls++; return { kind: "succeeded", providerReference: "impossible" }; })]]), telemetry).execute(context, action.id);
    expect(calls).toBe(0);
  });

  it("discovers committed work after routing delay and duplicate jobs execute one provider effect", async () => {
    const action = await appendAction();
    expect((await infrastructure.query("SELECT action_id FROM infrastructure.outbox_signal WHERE action_id=$1", [action.id])).rows).toEqual([{ action_id: action.id }]);
    let calls = 0;
    const executor = new ActionExecutor(runtime, new Map([["fake_capture", adapter(async () => ({ kind: "succeeded", providerReference: `fake:${++calls}` }))]]), telemetry);
    await Promise.all([executor.execute(context, action.id), executor.execute(context, action.id)]);
    await executor.execute(context, action.id);
    expect(calls).toBe(1);
    expect(await statusOf(action.id)).toBe("succeeded");
  });

  it("recovers restarts before and after a provider call without an unsafe double-send", async () => {
    const beforeCall = await appendAction();
    await admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp()-interval '6 minutes' WHERE id=$1", [beforeCall.id]);
    let calls = 0;
    const successful = adapter(async () => ({ kind: "succeeded", providerReference: `fake:${++calls}` }), async () => "not_found");
    const executor = new ActionExecutor(runtime, new Map([["fake_capture", successful]]), telemetry);
    await executor.execute(context, beforeCall.id);
    expect(await statusOf(beforeCall.id)).toBe("outcome_unknown");
    expect(await reconcileOutbox(runtime, context, beforeCall.id, successful)).toBe("not_found");
    await executor.execute(context, beforeCall.id);
    expect(calls).toBe(1);

    const afterCall = await appendAction();
    const ambiguous = adapter(async () => { calls++; return { kind: "outcome_unknown", code: "connection_lost_after_accept" }; }, async () => "succeeded");
    const ambiguousExecutor = new ActionExecutor(runtime, new Map([["fake_capture", ambiguous]]), telemetry);
    await ambiguousExecutor.execute(context, afterCall.id);
    await ambiguousExecutor.execute(context, afterCall.id);
    expect(await statusOf(afterCall.id)).toBe("outcome_unknown");
    expect(await reconcileOutbox(runtime, context, afterCall.id, ambiguous)).toBe("succeeded");
    expect(await statusOf(afterCall.id)).toBe("succeeded");
    expect(calls).toBe(2);
  });

  it("keeps ambiguous outcomes operator-visible and requires reconciliation before safe retry", async () => {
    const action = await appendAction();
    let calls = 0;
    const unknown = adapter(async () => { calls++; return { kind: "outcome_unknown", code: "timeout" }; }, async () => "unknown");
    const executor = new ActionExecutor(runtime, new Map([["fake_capture", unknown]]), telemetry);
    await executor.execute(context, action.id);
    await executor.execute(context, action.id);
    await expect(operateOutbox(runtime, context, action.id, "retry")).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(await reconcileOutbox(runtime, context, action.id, unknown)).toBe("unknown");
    expect(calls).toBe(1);
    expect(telemetryEvents).toContainEqual(expect.objectContaining({ name: "outbox.unknown_outcome" }));
    await operateOutbox(runtime, context, action.id, "retry", true);
    expect(await statusOf(action.id)).toBe("retryable");
  });

  it("does not send expired authorization", async () => {
    const action = await appendAction({ expiresAt: "2000-01-01T00:00:00Z" });
    let calls = 0;
    await new ActionExecutor(runtime, new Map([["fake_capture", adapter(async () => { calls++; return { kind: "succeeded", providerReference: "no" }; })]]), telemetry).execute(context, action.id);
    expect(calls).toBe(0);
    expect(await statusOf(action.id)).toBe("cancelled");
  });

  it("delivers the exact approved bytes even when a mutable source changes", async () => {
    const action = await appendAction();
    let delivered: Readonly<OutboundAction> | undefined;
    let mutableSource = action.immutableContent;
    mutableSource = "replacement document generated after approval";
    await new ActionExecutor(runtime, new Map([["fake_capture", adapter(async (value) => { delivered = value; return { kind: "succeeded", providerReference: "fake:immutable" }; })]]), telemetry).execute(context, action.id);
    expect(mutableSource).not.toBe(action.immutableContent);
    expect(delivered?.immutableContent).toBe(action.immutableContent);
    expect(hash(delivered!.immutableContent)).toBe(delivered?.contentHash);
    const invalid = { ...action, id: "99000000-0000-4000-8000-000000000099", providerEffectKey: "effect:invalid", immutableContent: "changed" };
    await expect(withTenant(runtime, context, (db) => appendOutboundAction(db, TENANT, invalid))).rejects.toThrow("CONTENT_HASH_MISMATCH");
  });

  it("deduplicates duplicate, out-of-order, and differently identified provider effects", async () => {
    const raw = new TextEncoder().encode('{"synthetic":true}');
    const verifier = { verify: async () => true };
    await withTenant(runtime, context, async (db) => {
      const base = { adapter: "fake_capture" as const, providerEventId: "event-1", providerEffectKey: "provider-effect-1", eventKind: "delivered", occurredAt: new Date("2026-01-02"), rawBody: raw, signature: "valid" };
      await ingestProviderEvent(db, TENANT, base, verifier);
      await ingestProviderEvent(db, TENANT, base, verifier);
      await ingestProviderEvent(db, TENANT, { ...base, providerEventId: "event-2" }, verifier);
      await ingestProviderEvent(db, TENANT, { ...base, providerEventId: "event-0", eventKind: "accepted", occurredAt: new Date("2026-01-01") }, verifier);
    });
    await withTenant(runtime, context, async (db) => {
      const rows = (await db.$client.query<{ event_kind: string; count: number }>("SELECT event_kind,count(*)::int count FROM app.provider_event_inbox WHERE provider_effect_key='provider-effect-1' GROUP BY event_kind ORDER BY event_kind")).rows;
      expect(rows).toEqual([{ event_kind: "accepted", count: 1 }, { event_kind: "delivered", count: 1 }]);
    });
  });

  it("makes stale claims unknown rather than auto-resending them", async () => {
    const action = await appendAction();
    await admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp()-interval '6 minutes' WHERE id=$1", [action.id]);
    let calls = 0;
    await new ActionExecutor(runtime, new Map([["fake_capture", adapter(async () => { calls++; return { kind: "succeeded", providerReference: "no" }; })]]), telemetry).execute(context, action.id);
    expect(calls).toBe(0);
    expect(await statusOf(action.id)).toBe("outcome_unknown");
  });

  it("releases the business transaction before the fake external call and isolates infrastructure credentials", async () => {
    const action = await appendAction();
    let runtimeTransaction = "";
    const inspecting = adapter(async () => {
      runtimeTransaction = (await admin.query<{ state: string }>("SELECT state FROM pg_stat_activity WHERE usename='outbox_runtime' AND application_name='outbox-test-business-worker' ORDER BY query_start DESC LIMIT 1")).rows[0]?.state ?? "none";
      return { kind: "succeeded", providerReference: "fake:outside-transaction" };
    });
    await new ActionExecutor(runtime, new Map([["fake_capture", inspecting]]), telemetry).execute(context, action.id);
    expect(runtimeTransaction).not.toBe("idle in transaction");
    expect((await runtime.query("SELECT current_user AS role")).rows[0]?.role).toBe("outbox_runtime");
    expect((await admin.query("SELECT has_schema_privilege('outbox_infrastructure','app','USAGE') AS allowed")).rows[0]?.allowed).toBe(false);
    await expect(infrastructure.query("SELECT * FROM app.action_outbox")).rejects.toMatchObject({ code: "42501" });
  });
});
