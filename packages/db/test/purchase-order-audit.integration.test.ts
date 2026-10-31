import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authenticatePracticeSession, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID,
  issuePracticeSession, migrate } from "../src/index.js";
import { MaterialApplication } from "../../../apps/api/src/material.application.js";
import { PurchaseOrderApplication } from "../../../apps/api/src/purchase-order.application.js";
import { PurchaseOrderActionRepository } from "../src/purchase-order-action-repository.js";
import { FakeMerchantOrderPort } from "../src/purchase-order-action.js";
import { ActionExecutor, operateOutbox } from "../src/outbox.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
let upgradeRevisionId: string;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "jobguard-po-audit-"));
  const port = await freePort(58000, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  const connection = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo" };
  admin = new Pool({ ...connection, user: "postgres", password: "synthetic" });
  // Install current main first, retain a real synthetic PO, then apply this branch's
  // migration through the normal runner. Fresh install is covered by tenancy's runner.
  await migrate({ query: async (sql: string, values?: unknown[]) => {
    if (sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration")
      && String(values?.[0]).endsWith("_dark_merchant_order.sql")) return { rows: [{}], rowCount: 1 };
    return admin.query(sql, values);
  } } as Pick<Pool, "query">);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  const account = randomUUID();
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional order account')", [DEMO_TENANT_ID, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
  // Login setup only: no additional runtime privileges or grants.
  await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic'");
  runtime = new Pool({ ...connection, user: "jobguard_runtime", password: "synthetic", max: 5 });
  const legacy = await fixture();
  upgradeRevisionId = (await legacy.orders.revise(legacy.job, legacy.input)).id;
  await migrate(admin);
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture(pack = false) {
  // Match the applications' server UTC date; delivery date remains independent.
  const asOf = new Date().toISOString().slice(0, 10);
  const day = (offset: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const token = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, token);
  const job = (await admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",
    [DEMO_TENANT_ID, auth.digest])).rows[0].id as string;
  const scope = randomUUID();
  await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",
    [DEMO_TENANT_ID, scope, job]);
  const materials = new MaterialApplication(runtime, token), orders = new PurchaseOrderApplication(runtime, token);
  const rate = { version: "material-rate-command.v1", merchantName: `Fictional supplier ${randomUUID()}`, sku: "AUDIT-1",
    description: "Synthetic item", pricePence: pack ? 20000 : 2000, priceUnit: pack ? "box" : "each", taxBasis: "net",
    effectiveFrom: day(0), effectiveTo: day(30), sourceLabel: "synthetic audit fixture", expectedVersion: 0,
    ...(pack ? { packEachQuantity: "10" } : {}) };
  const saved = await materials.addRate(rate);
  const requirement = await materials.addRequirement(job, { version: "material-requirement-command.v1", scopeItemId: scope,
    skuId: saved.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  const input = { version: "purchase-order-draft.v1", commandId: randomUUID(), requirementId: requirement.id, quantity: "10",
    unitPricePence: 2000, recipient: "orders@fictional.invalid", requiredDate: "2026-10-20", expectedRevision: 0 };
  const command = (order: Awaited<ReturnType<PurchaseOrderApplication["revise"]>>, recipient = input.recipient) => ({
    version: "purchase-order-placement.v1", command: { version: "command.v1", commandId: randomUUID(),
      commandType: "purchase_order.place", semanticKey: randomUUID(), actorMembershipId: auth.membershipId,
      subjectType: "purchase_order", subjectRef: order.id, action: { actionType: "purchase_order.simulate", recipient,
        contentHash: order.authorityHash, aggregateRevision: order.revision, amountPence: order.orderNetPence,
        currency: "GBP", policyVersion: "synthetic-po.v1", expiresAt: "2099-01-01T00:00:00Z" } } });
  return { job, materials, orders, input, rate, command, day, auth, saved };
}

async function effects() {
  const counts: Record<string, number> = {};
  for (const table of ["decision", "decision_resolution", "action_authorization", "purchase_order_placement", "audit_event",
    "action_outbox", "command_receipt", "watchdog_command_identity", "watchdog_command_result"]) {
    counts[table] = Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`, [DEMO_TENANT_ID])).rows[0].n);
  }
  return counts;
}

describe("purchase-order audit with authenticated applications and PostgreSQL", () => {
  it("normalizes box agreement before purchase-order comparison", async () => {
    const f = await fixture(true);
    await f.orders.revise(f.job, f.input);
    expect((await f.orders.view(f.job)).order).toMatchObject({ orderNetPence: 20000, agreedNetPence: 20000, differencePence: 0 });
  });
  it.each(["future", "expired"])("purchase-order comparison excludes %s rate revisions", async period => {
    const f = await fixture();
    await f.materials.addRate({ ...f.rate, expectedVersion: 1, pricePence: 2500,
      effectiveFrom: period === "future" ? f.day(31) : f.day(-30),
      effectiveTo: period === "future" ? f.day(60) : f.day(-1) });
    await f.orders.revise(f.job, f.input);
    expect((await f.orders.view(f.job)).order).toMatchObject({ agreedNetPence: 20000, differencePence: 0 });
  });
  it("rejects fresh placement of superseded revision", async () => {
    const f = await fixture(), first = await f.orders.revise(f.job, f.input), command = f.command(first);
    await f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11", recipient: "other@fictional.invalid" });
    const before = await effects();
    await expect(f.orders.place(f.job, command)).rejects.toThrow("PURCHASE_ORDER_AUTHORITY_STALE");
    expect(await effects()).toEqual(before);
  });
  it("refuses changed revision as replay of placed order", async () => {
    const f = await fixture(), first = await f.orders.revise(f.job, f.input), firstCommand = f.command(first);
    const placed = await f.orders.place(f.job, firstCommand);
    const original = (await admin.query(`SELECT p.revision_id,o.content_hash FROM app.purchase_order_placement p
      JOIN app.action_outbox o ON(o.tenant_id,o.id)=(p.tenant_id,p.outbox_action_id) WHERE p.tenant_id=$1 AND p.id=$2`,
      [DEMO_TENANT_ID, placed.placementId])).rows;
    const second = await f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11", recipient: "other@fictional.invalid" });
    const before = await effects();
    await expect(f.orders.place(f.job, f.command(second, "other@fictional.invalid"))).rejects.toThrow("PURCHASE_ORDER_AUTHORITY_STALE");
    expect(await effects()).toEqual(before);
    expect((await admin.query(`SELECT p.revision_id,o.content_hash FROM app.purchase_order_placement p
      JOIN app.action_outbox o ON(o.tenant_id,o.id)=(p.tenant_id,p.outbox_action_id) WHERE p.tenant_id=$1 AND p.id=$2`,
      [DEMO_TENANT_ID, placed.placementId])).rows).toEqual(original);
    expect(original).toEqual([{ revision_id: first.id, content_hash: first.authorityHash }]);
    // A genuine receipt replay remains valid after later edits and writes nothing.
    expect(await f.orders.place(f.job, firstCommand)).toEqual(placed);
    expect(await effects()).toEqual(before);
  });
});


// Dark seam called directly with deterministic fakes; no HTTP or worker registration.
async function darkFixture() {
  const f = await fixture(), revision = await f.orders.revise(f.job, f.input);
  const repo = new PurchaseOrderActionRepository(runtime);
  const scope = { version: "merchant-order-scope.v1", jobId: f.job, revisionId: revision.id };
  const preview = await repo.preview(f.auth.context, scope);
  const approved = { version: "command.v1", commandId: randomUUID(), commandType: "purchase_order.send.dark",
    semanticKey: `merchant-order:${f.job}:${revision.id}`, actorMembershipId: f.auth.membershipId,
    subjectType: "purchase_order", subjectRef: revision.id,
    action: { actionType: "purchase_order.send.dark", recipient: preview.order.recipient, contentHash: preview.contentHash,
      aggregateRevision: revision.revision, amountPence: preview.amountPence, currency: "GBP", policyVersion: "dark-merchant-order.v1",
      expiresAt: "2099-01-01T00:00:00Z" } };
  const port = new FakeMerchantOrderPort();
  const executor = new ActionExecutor(runtime, new Map([[port.name, port]]), { emit() {} });
  const manual = { version: "manual-order-attestation.v1", jobId: f.job, revisionId: revision.id,
    commandId: randomUUID(), supplierReference: `synthetic-${randomUUID()}` };
  return { ...f, revision, repo, scope, preview, approved, port, executor, manual };
}

describe("M2-1 dark approved merchant action on PostgreSQL", () => {
  it("upgrades main with a pre-existing order intact and needs no backfill", async () => {
    expect((await admin.query("SELECT id FROM app.purchase_order_revision WHERE tenant_id=$1 AND id=$2",
      [DEMO_TENANT_ID, upgradeRevisionId])).rows).toEqual([{ id: upgradeRevisionId }]);
  });
  it("concurrent confirmation and executor replay commit one effect and one fake merchant order", async () => {
    const f = await darkFixture();
    const [one, two] = await Promise.all([f.repo.approve(f.auth.context, f.scope, f.approved),
      f.repo.approve(f.auth.context, f.scope, f.approved)]);
    expect(two).toEqual(one);
    await Promise.all([f.executor.execute(f.auth.context, one.outboxActionId), f.executor.execute(f.auth.context, one.outboxActionId)]);
    expect(f.port.placedCount).toBe(1);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",
      [DEMO_TENANT_ID, one.outboxActionId])).rows[0].status).toBe("succeeded");
    await expect(f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11" })).rejects.toThrow("ORDER_ALREADY_COMMITTED");
  });
  it("changed quantity cancels the queued old authority before any fake delivery", async () => {
    const f = await darkFixture(), queued = await f.repo.approve(f.auth.context, f.scope, f.approved);
    await f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11" });
    await f.executor.execute(f.auth.context, queued.outboxActionId);
    expect(f.port.placedCount).toBe(0);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",
      [DEMO_TENANT_ID, queued.outboxActionId])).rows[0].status).toBe("cancelled");
  });
  it("changed semantic payload and wrong-job/cross-tenant ids fail without another effect", async () => {
    const f = await darkFixture(); await f.repo.approve(f.auth.context, f.scope, f.approved);
    const before = await effects();
    await expect(f.repo.approve(f.auth.context, f.scope, { ...f.approved, action: { ...f.approved.action, amountPence: 1 } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(f.repo.approve(f.auth.context, f.scope, { ...f.approved, commandId: randomUUID(), action: { ...f.approved.action, amountPence: 1 } })).rejects.toThrow("COMMAND_CONFLICT");
    await expect(f.repo.preview(f.auth.context, { ...f.scope, jobId: randomUUID() })).rejects.toThrow();
    await expect(f.repo.preview(testTenantContext(randomUUID()), f.scope)).rejects.toThrow();
    expect(await effects()).toEqual(before);
  });
  it("refuses another active owner's supplied id without recording an attestation or audit", async () => {
    const f = await darkFixture(), otherOwner = randomUUID(), otherIdentity = randomUUID();
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [otherIdentity]);
    await admin.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role)
      SELECT tenant_id,$1,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4`,
      [otherOwner, otherIdentity, DEMO_TENANT_ID, f.auth.membershipId]);
    const before = await effects();
    await expect(f.repo.attestManual(f.auth.context, { ...f.manual, actorMembershipId: otherOwner })).rejects.toThrow();
    expect(await effects()).toEqual(before);
    expect((await admin.query("SELECT count(*)::int n FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND job_id=$2",
      [DEMO_TENANT_ID, f.job])).rows[0].n).toBe(0);
  });
  it("rechecks a verified session's owner membership after revocation, even on replay", async () => {
    const f = await darkFixture();
    await f.repo.attestManual(f.auth.context, f.manual);
    const before = await effects();
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
      [DEMO_TENANT_ID, f.auth.membershipId]);
    try {
      await expect(f.repo.attestManual(f.auth.context, f.manual)).rejects.toThrow("ORDER_ACTION_INVALID");
      await expect(f.repo.attestManual(f.auth.context, { ...f.manual, commandId: randomUUID() })).rejects.toThrow("ORDER_ACTION_INVALID");
      expect(await effects()).toEqual(before);
      expect((await admin.query("SELECT count(*)::int n FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND job_id=$2",
        [DEMO_TENANT_ID, f.job])).rows[0].n).toBe(1);
    } finally {
      await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",
        [DEMO_TENANT_ID, f.auth.membershipId]);
    }
  });
  it("manual placement is append-only, replayable, and mutually exclusive with either send route", async () => {
    const f = await darkFixture(), before = await effects();
    const fact = await f.repo.attestManual(f.auth.context, f.manual);
    expect(await f.repo.attestManual(f.auth.context, f.manual)).toEqual(fact);
    expect((await admin.query("SELECT actor_membership_id FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND id=$2",
      [DEMO_TENANT_ID, fact.attestationId])).rows).toEqual([{ actor_membership_id: f.auth.membershipId }]);
    expect((await admin.query(`SELECT actor_ref FROM app.audit_event WHERE tenant_id=$1 AND event_type='purchase_order.manual_attested'
      AND payload->'references'->>'attestationId'=$2`, [DEMO_TENANT_ID, fact.attestationId])).rows)
      .toEqual([{ actor_ref: `membership:${f.auth.membershipId}` }]);
    expect((await effects()).action_outbox).toBe(before.action_outbox);
    expect((await effects()).action_authorization).toBe(before.action_authorization);
    await expect(f.repo.approve(f.auth.context, f.scope, f.approved)).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    await expect(f.orders.place(f.job, f.command(f.revision))).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    await expect(withTenant(runtime, f.auth.context, db => db.$client.query("UPDATE app.purchase_order_manual_attestation SET supplier_reference_hash=$1 WHERE tenant_id=$2",
      ["a".repeat(64), DEMO_TENANT_ID]))).rejects.toThrow(/permission denied/u);
    await expect(withTenant(runtime, f.auth.context, db => db.$client.query("DELETE FROM app.purchase_order_manual_attestation WHERE tenant_id=$1",
      [DEMO_TENANT_ID]))).rejects.toThrow(/permission denied/u);
  });
  it("one supplier reference cannot attest two drafts at the same merchant", async () => {
    const f = await darkFixture(); await f.repo.attestManual(f.auth.context, f.manual);
    const nextScope = randomUUID();
    await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [DEMO_TENANT_ID, nextScope, f.job]);
    const requirement = await f.materials.addRequirement(f.job, { version: "material-requirement-command.v1", scopeItemId: nextScope,
      skuId: f.saved.skuId, quantity: "1", unit: "each", expectedRevision: 0 });
    const revision = await f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), requirementId: requirement.id });
    await expect(f.repo.attestManual(f.auth.context, { ...f.manual, commandId: randomUUID(), revisionId: revision.id })).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    expect((await admin.query("SELECT count(*)::int n FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND merchant_id=$2",
      [DEMO_TENANT_ID, f.saved.merchantId])).rows[0].n).toBe(1);
  });
  it("cancellation never becomes a retry or a second placement", async () => {
    const f = await darkFixture(), queued = await f.repo.approve(f.auth.context, f.scope, f.approved);
    await operateOutbox(runtime, f.auth.context, queued.outboxActionId, "cancel");
    await f.executor.execute(f.auth.context, queued.outboxActionId);
    await expect(operateOutbox(runtime, f.auth.context, queued.outboxActionId, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(f.port.placedCount).toBe(0);
  });
});
