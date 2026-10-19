import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActionExecutor,
  EvidencePackRepository,
  FakeRecoveryMessageAdapter,
  RecoveryMessageRepository,
  appendOutboundAction,
  ingestProviderEvent,
  migrate,
  operateOutbox,
  reconcileOutbox,
  withTenant,
  type OutboundAction,
  type OutboundAdapter,
  type SafeTelemetry} from "../src/index.js";

const TENANT = "91000000-0000-4000-8000-000000000001";
const ACCOUNT = "92000000-0000-4000-8000-000000000001";
const USER = "93000000-0000-4000-8000-000000000001";
const MEMBER = "94000000-0000-4000-8000-000000000001";
const context = testTenantContext(TENANT);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

let postgres: EmbeddedPostgres;
let admin: Pool;
let runtime: Pool;
let infrastructure: Pool;
let databaseDir: string;
let sequence = 1;
const adminCredential = randomUUID(), runtimeCredential = randomUUID(), infrastructureCredential = randomUUID();

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jobguard-later-outbox-"));
  const port = await freePort(57500, 400);
  postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: adminCredential,
    persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--encoding=UTF8", "--lc-messages=C"],
    onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: adminCredential });
  await migrate(admin);
  await admin.query(`
    INSERT INTO control_plane.tenant(id) VALUES('${TENANT}');
    INSERT INTO identity.identity_user(id) VALUES('${USER}');
    INSERT INTO app.account(id,tenant_id,name) VALUES('${ACCOUNT}','${TENANT}','Synthetic');
    INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
      VALUES('${MEMBER}','${TENANT}','${ACCOUNT}','${USER}','owner');
    CREATE ROLE outbox_runtime LOGIN PASSWORD '${runtimeCredential}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
    GRANT jobguard_runtime TO outbox_runtime;
    CREATE ROLE outbox_infrastructure LOGIN PASSWORD '${infrastructureCredential}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
    GRANT jobguard_infrastructure TO outbox_infrastructure;
  `);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "outbox_runtime", password: runtimeCredential, application_name: "outbox-test-business-worker", max: 5 });
  infrastructure = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "outbox_infrastructure", password: infrastructureCredential });
  admin.on("error", () => undefined);
  runtime.on("error", () => undefined);
  infrastructure.on("error", () => undefined);
}, 60_000);

afterAll(async () => {
  await closeTestPools(infrastructure, runtime, admin);
  await postgres?.stop();
  // CI owns removal of this isolated temporary database directory.
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

async function appendAction(options: { expiresAt?: string; rollback?: boolean; adapter?: OutboundAction["adapter"] } = {}) {
  const { authorizationId, content } = await createAuthorization(options.expiresAt);
  const suffix = String(sequence++).padStart(12, "0");
  const id = `98000000-0000-4000-8000-${suffix}`;
  const action: OutboundAction = {
    version: "outbound-action.v1",
    id,
    authorizationId,
    adapter: options.adapter ?? "fake_capture",
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

const events = async (id: string) => withTenant(runtime, context, async db =>
  (await db.$client.query("SELECT event_type,payload FROM app.audit_event WHERE subject_ref=$1 ORDER BY sequence", [id])).rows);

describe("LATER-B9 PostgreSQL outcome guarantees", () => {
  it("ruling 112 owner retry delivers once after definite failure while automatic execution honours back-off", async () => {
    await installLegacySyntheticPartyFixtures(admin);
    const fixture = await seedEvidencePackFixture(admin);
    const ctx = testTenantContext(fixture.tenantId);
    const actor = { membershipId: fixture.memberId, actorRef: `membership:${fixture.memberId}` };
    const caseId = fixture.customerCaseId;
    await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)",
      [randomUUID(), fixture.tenantId, fixture.jobId, caseId, randomUUID(), hash(`open:${caseId}`)]);
    const packs = new EvidencePackRepository(runtime), messages = new RecoveryMessageRepository(runtime);
    const pack = await packs.generate(ctx, caseId, { commandId: randomUUID() }, actor.actorRef);
    await packs.approveAttachment(ctx, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    const ready = await messages.read(ctx, caseId);
    const preview = (await messages.preview(ctx, caseId, { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id }, actor)).latest!;
    const approved = (await messages.command(ctx, caseId, {
      version: "recovery-message-command.v1", commandId: randomUUID(), action: "approve", messageId: preview.id, expectedRevision: preview.revision,
      recipient: preview.message.recipient, body: preview.message.body, amountPence: preview.message.amountPence, packId: preview.message.packId, contentHash: preview.message.contentHash,
    }, actor)).latest!;
    const failed = await messages.command(ctx, caseId, {
      version: "recovery-message-command.v1", commandId: randomUUID(), action: "advance", messageId: approved.id, expectedRevision: approved.revision, outcome: "definite_failure",
    }, actor);
    expect(failed.latest!.status).toBe("retryable");
    expect(failed.latest!.attempts).toBe(1);
    expect(failed.sinkCount).toBe(0);
    const actionId = approved.approval!.outboxActionId;
    const due = await admin.query("SELECT next_attempt_at>clock_timestamp() AS future FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, actionId]);
    expect(due.rows[0].future).toBe(true);
    const fake = new FakeRecoveryMessageAdapter(runtime, "success");
    let automaticCalls = 0;
    const automaticAdapter: OutboundAdapter = {
      name: fake.name, supportsProviderDeduplication: fake.supportsProviderDeduplication,
      deliver: action => { automaticCalls++; return fake.deliver(ctx, action); },
      reconcile: key => fake.reconcile(ctx, key),
    };
    const executor = new ActionExecutor(runtime, new Map([[fake.name, automaticAdapter]]), telemetry);
    await executor.execute(ctx, actionId);
    expect(automaticCalls).toBe(0);
    expect(await messages.read(ctx, caseId)).toEqual(failed);
    const retry = {
      version: "recovery-message-command.v1" as const, commandId: randomUUID(), action: "advance" as const,
      messageId: approved.id, expectedRevision: failed.latest!.revision, outcome: "success" as const,
    };
    const delivered = await messages.command(ctx, caseId, retry, actor);
    expect(delivered.latest!.status).toBe("simulated_delivery");
    expect(delivered.latest!.attempts).toBe(2);
    expect(delivered.sinkCount).toBe(1);
    expect(delivered.latest!.history.map(event => event.kind)).toEqual(["previewed", "approved", "started", "retryable", "started", "succeeded"]);
    expect(await messages.command(ctx, caseId, retry, actor)).toEqual(delivered);
    await executor.execute(ctx, actionId);
    expect(automaticCalls).toBe(0);
    expect(await messages.read(ctx, caseId)).toEqual(delivered);
  });
  it("L027 future next_attempt_at prevents claim; at due time only one concurrent executor claims", async () => {
    const action = await appendAction(); let calls = 0;
    const executor = new ActionExecutor(runtime, new Map([["fake_capture", adapter(async () => {
      calls++; return { kind: "succeeded", providerReference: "synthetic" };
    })]]), telemetry);
    await admin.query("UPDATE app.action_outbox SET next_attempt_at=clock_timestamp()+interval '1 hour' WHERE id=$1", [action.id]);
    await executor.execute(context, action.id);
    expect(calls).toBe(0); expect(await events(action.id)).toHaveLength(0);
    await admin.query("UPDATE app.action_outbox SET next_attempt_at=clock_timestamp() WHERE id=$1", [action.id]);
    await Promise.all([executor.execute(context, action.id), executor.execute(context, action.id)]);
    expect(calls).toBe(1); expect(await events(action.id)).toHaveLength(1);
  });
  it("L019 safeRetry cannot release unknown; concurrent reconciliation records evidence once", async () => {
    const action = await appendAction();
    const fake = adapter(async () => ({ kind: "outcome_unknown", code: "timeout" }), async () => "not_found");
    await new ActionExecutor(runtime, new Map([[fake.name, fake]]), telemetry).execute(context, action.id);
    await expect(operateOutbox(runtime, context, action.id, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(await statusOf(action.id)).toBe("outcome_unknown");
    let arrived = 0, release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    fake.reconcile = async () => { if (++arrived === 2) release(); await barrier; return "not_found"; };
    await Promise.all([reconcileOutbox(runtime, context, action.id, fake), reconcileOutbox(runtime, context, action.id, fake)]);
    expect(await statusOf(action.id)).toBe("retryable");
    const history = await events(action.id); expect(history).toHaveLength(2);
    expect(history[1].payload.references.reconciliation).toBe("not_found");
  });
  it.each(["succeeded", "retryable", "outcome_unknown"] as const)("L020 committed %s has one event; duplicate execution has none", async kind => {
    const action = await appendAction();
    const fake = adapter(async () => kind === "succeeded" ? { kind, providerReference: "synthetic" } : { kind, code: "synthetic" });
    const executor = new ActionExecutor(runtime, new Map([[fake.name, fake]]), telemetry);
    await executor.execute(context, action.id); await executor.execute(context, action.id);
    expect(await events(action.id)).toEqual([{ event_type: `outbox.${kind}`, payload: expect.any(Object) }]);
  });
  it("L020 refusal is audited and invalid operator command rolls back with no event", async () => {
    const action = await appendAction({ expiresAt: "2000-01-01T00:00:00Z" });
    const fake = adapter(async () => { throw new Error("must not send"); });
    await new ActionExecutor(runtime, new Map([[fake.name, fake]]), telemetry).execute(context, action.id);
    expect(await statusOf(action.id)).toBe("cancelled"); expect(await events(action.id)).toHaveLength(1);
    await expect(operateOutbox(runtime, context, action.id, "retry")).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(await events(action.id)).toHaveLength(1);
  });
  it("L020 audit failure rolls back durable outcome and attempt together", async () => {
    const action = await appendAction();
    await admin.query(`CREATE FUNCTION app.later_b9_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.subject_ref='${action.id}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER later_b9_reject_audit BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.later_b9_reject_audit()`);
    const fake = adapter(async () => ({ kind: "succeeded", providerReference: "synthetic" }));
    await expect(new ActionExecutor(runtime, new Map([[fake.name, fake]]), telemetry).execute(context, action.id)).rejects.toThrow("synthetic audit failure");
    expect(await statusOf(action.id)).toBe("executing"); expect(await events(action.id)).toHaveLength(0);
    const attempts = await admin.query("SELECT outcome FROM app.action_attempt WHERE action_id=$1", [action.id]);
    expect(attempts.rows).toEqual([{ outcome: "started" }]);
  });
  it("L020 duplicate callbacks are idempotent", async () => {
    const input = { adapter: "fake_capture" as const, providerEventId: "later-b9-event", providerEffectKey: "later-b9-effect",
      eventKind: "delivered", occurredAt: new Date(), rawBody: new TextEncoder().encode("synthetic"), signature: "synthetic" };
    await withTenant(runtime, context, async db => {
      await ingestProviderEvent(db, TENANT, input, { verify: async () => true });
      await ingestProviderEvent(db, TENANT, input, { verify: async () => true });
    });
    expect((await admin.query("SELECT id FROM app.provider_event_inbox WHERE provider_event_id=$1", [input.providerEventId])).rowCount).toBe(1);
  });
});
