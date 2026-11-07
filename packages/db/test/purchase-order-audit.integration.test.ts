import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authenticatePracticeSession, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID,
  issuePracticeSession, migrate, practiceMaterialPool } from "../src/index.js";
import { MaterialApplication } from "../../../apps/api/src/material.application.js";
import { MerchantOrderApplication } from "../../../apps/api/src/merchant-order.application.js";
import { PurchaseOrderApplication } from "../../../apps/api/src/purchase-order.application.js";
import { PurchaseOrderActionRepository } from "../src/purchase-order-action-repository.js";
import { FakeMerchantOrderPort } from "../src/purchase-order-action.js";
import { ActionExecutor, operateOutbox } from "../src/outbox.js";
import { withTenant } from "../src/tenant-context.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { testTenantContext, testBoundTenantContext } from "./tenant-context-test-utils.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { MaterialRepository } from "../src/material-repository.js";
import { PurchaseOrderRepository } from "../src/purchase-order-repository.js";
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
      && ["_dark_merchant_order.sql", "_order_attestation_session.sql"].some(stem => String(values?.[0]).endsWith(stem))) return { rows: [{}], rowCount: 1 };
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
  return { job, materials, orders, input, rate, command, day, auth, saved, token };
}

async function effects(tenantId = DEMO_TENANT_ID) {
  const counts: Record<string, number> = {};
  for (const table of ["purchase_order_manual_attestation", "decision", "decision_resolution", "action_authorization", "purchase_order_placement", "audit_event",
    "action_outbox", "command_receipt", "watchdog_command_identity", "watchdog_command_result"]) {
    counts[table] = Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`, [tenantId])).rows[0].n);
  }
  return counts;
}

describe("purchase-order audit with authenticated applications and PostgreSQL", () => {
  async function practiceManual() {
    const f = await fixture(), revision = await f.orders.revise(f.job, f.input);
    const request = { version: "merchant-order-screen.v1", kind: "manual", revisionId: revision.id,
      commandId: randomUUID(), supplierReference: `synthetic-${randomUUID()}` };
    return { ...f, request, application: new MerchantOrderApplication(runtime, f.token) };
  }
  it("records and replays the practice owner's own manual placement", async () => {
    const f = await practiceManual();
    const fact = await f.application.execute(f.job, f.request);
    expect(fact).toMatchObject({ fact: "owner_attestation", providerConfirmed: false, realExternalActions: 0 });
    const attestationId = (fact as { attestationId: string }).attestationId;
    expect((await admin.query("SELECT actor_membership_id FROM app.purchase_order_manual_attestation WHERE id=$1", [attestationId])).rows)
      .toEqual([{ actor_membership_id: f.auth.membershipId }]);
    const before = await effects();
    expect(await f.application.execute(f.job, f.request)).toEqual(fact);
    expect(await effects()).toEqual(before);
  });
  it("refuses a practice session whose membership is no longer an owner", async () => {
    const f = await practiceManual(), before = await effects();
    await admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, f.auth.membershipId]);
    try {
      const repo = new PurchaseOrderActionRepository(practiceMaterialPool(runtime, f.auth.digest));
      const { kind: _kind, ...request } = f.request;
      await expect(repo.attestManual(f.auth.context, { ...request, version: "manual-order-attestation.v1", jobId: f.job },
        { sessionDigest: f.auth.digest })).rejects.toThrow();
      await expect(f.application.execute(f.job, f.request)).rejects.toThrow();
      expect(await effects()).toEqual(before);
    } finally {
      await admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, f.auth.membershipId]);
    }
  });
  it("refuses a practice digest used for another tenant's order", async () => {
    const f = await practiceManual(), company = await darkFixture();
    const before = await effects(company.auth.context.tenantId), practiceBefore = await effects();
    const repo = new PurchaseOrderActionRepository(practiceMaterialPool(runtime, f.auth.digest));
    await expect(repo.attestManual(company.auth.context, company.manual, { sessionDigest: f.auth.digest })).rejects.toThrow();
    await expect(f.application.execute(company.job, { ...f.request, revisionId: company.revision.id })).rejects.toThrow();
    expect(await effects(company.auth.context.tenantId)).toEqual(before);
    expect(await effects()).toEqual(practiceBefore);
  });
  it("refuses another practice session's job even in the same tenant", async () => {
    const f = await practiceManual(), other = await practiceManual(), before = await effects();
    await expect(f.application.execute(other.job, other.request)).rejects.toThrow("NOT_FOUND");
    const repo = new PurchaseOrderActionRepository(practiceMaterialPool(runtime, f.auth.digest));
    const { kind: _kind, ...request } = other.request;
    await expect(repo.attestManual(f.auth.context, { ...request, version: "manual-order-attestation.v1", jobId: other.job },
      { sessionDigest: f.auth.digest })).rejects.toThrow();
    expect(await effects()).toEqual(before);
  });
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
  const company = await meterCompany({ admin, runtime } as WorkFixture);
  const auth = { context: company.context, membershipId: company.actorId, digest: company.digest };
  const materialsRepo = new MaterialRepository(runtime), ordersRepo = new PurchaseOrderRepository(runtime);
  const materials = { addRequirement: (jobId: string, raw: any) => materialsRepo.addRequirement(auth.context, { ...raw, jobId }) };
  const orders = {
    revise: (jobId: string, raw: any) => ordersRepo.revise(auth.context, jobId, raw),
    place: (jobId: string, raw: any) => ordersRepo.place(auth.context, jobId, raw.command),
  };
  const today = new Date().toISOString().slice(0, 10);
  const saved = await materialsRepo.addRate(auth.context, { merchantName: `Fictional ${randomUUID()}`, sku: "SESSION-1",
    description: "Synthetic", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: today,
    sourceLabel: "Synthetic session fixture", expectedVersion: 0 });
  const requirement = await materials.addRequirement(company.jobId, { scopeItemId: company.scopeId, skuId: saved.skuId,
    quantity: "10", unit: "each", expectedRevision: 0 });
  const input = { version: "purchase-order-draft.v1" as const, commandId: randomUUID(), requirementId: requirement.id,
    quantity: "10", unitPricePence: 2000, recipient: "orders@fictional.invalid", requiredDate: "2030-02-15", expectedRevision: 0 };
  const command = (order: any) => ({ command: { version: "command.v1", commandId: randomUUID(), commandType: "purchase_order.place",
    semanticKey: randomUUID(), actorMembershipId: auth.membershipId, subjectType: "purchase_order", subjectRef: order.id,
    action: { actionType: "purchase_order.simulate", recipient: input.recipient, contentHash: order.authorityHash,
      aggregateRevision: order.revision, amountPence: order.orderNetPence, currency: "GBP", policyVersion: "synthetic-po.v1", expiresAt: "2099-01-01T00:00:00Z" } } });
  const f = { auth, job: company.jobId, materials, orders, input, saved, command };
  const revision = await orders.revise(f.job, input);
  const scoped = runtime;
  const repo = new PurchaseOrderActionRepository(scoped);
  const scope = { version: "merchant-order-scope.v1", jobId: f.job, revisionId: revision.id };
  const preview = await repo.preview(f.auth.context, scope);
  const approved = { version: "command.v1", commandId: randomUUID(), commandType: "purchase_order.send.dark",
    semanticKey: `merchant-order:${f.job}:${revision.id}`, actorMembershipId: f.auth.membershipId,
    subjectType: "purchase_order", subjectRef: revision.id,
    action: { actionType: "purchase_order.send.dark", recipient: preview.order.recipient, contentHash: preview.contentHash,
      aggregateRevision: revision.revision, amountPence: preview.amountPence, currency: "GBP", policyVersion: "dark-merchant-order.v1",
      expiresAt: "2099-01-01T00:00:00Z" } };
  const port = new FakeMerchantOrderPort();
  const executor = new ActionExecutor(scoped, new Map([[port.name, port]]), { emit() {} });
  const manual = { version: "manual-order-attestation.v1", jobId: f.job, revisionId: revision.id,
    commandId: randomUUID(), supplierReference: `synthetic-${randomUUID()}` };
  return { ...f, revision, repo, scope, preview, approved, port, executor, manual };
}

// Main's practice-session dark fixture (pre-catch-up darkFixture), kept for the session-owned hiding check.
async function practiceDarkFixture() {
  const f = await fixture(), revision = await f.orders.revise(f.job, f.input);
  const scoped = practiceMaterialPool(runtime, f.auth.digest);
  const repo = new PurchaseOrderActionRepository(scoped);
  const scope = { version: "merchant-order-scope.v1", jobId: f.job, revisionId: revision.id };
  const preview = await repo.preview(f.auth.context, scope);
  const approved = { version: "command.v1", commandId: randomUUID(), commandType: "purchase_order.send.dark",
    semanticKey: `merchant-order:${f.job}:${revision.id}`, actorMembershipId: f.auth.membershipId,
    subjectType: "purchase_order", subjectRef: revision.id,
    action: { actionType: "purchase_order.send.dark", recipient: preview.order.recipient, contentHash: preview.contentHash,
      aggregateRevision: revision.revision, amountPence: preview.amountPence, currency: "GBP", policyVersion: "dark-merchant-order.v1",
      expiresAt: "2099-01-01T00:00:00Z" } };
  const manual = { version: "manual-order-attestation.v1", jobId: f.job, revisionId: revision.id,
    commandId: randomUUID(), supplierReference: `synthetic-${randomUUID()}` };
  return { ...f, revision, repo, scope, preview, approved, manual };
}

describe("M2-1 dark approved merchant action on PostgreSQL", () => {
  it("upgrades main with a pre-existing order intact and needs no backfill", async () => {
    expect((await admin.query("SELECT id FROM app.purchase_order_revision WHERE tenant_id=$1 AND id=$2",
      [DEMO_TENANT_ID, upgradeRevisionId])).rows).toEqual([{ id: upgradeRevisionId }]);
  });
  it("keeps session-owned order material hidden from unscoped and other-session readers", async () => {
    const f = await practiceDarkFixture();
    const otherToken = await issuePracticeSession(runtime);
    const other = await authenticatePracticeSession(runtime, otherToken);
    const before = await effects();
    for (const pool of [runtime, practiceMaterialPool(runtime, other.digest)]) {
      const repo = new PurchaseOrderActionRepository(pool);
      await expect(repo.preview(f.auth.context, f.scope)).rejects.toThrow("ORDER_AUTHORITY_STALE");
      await expect(repo.approve(f.auth.context, f.scope, f.approved)).rejects.toThrow("ORDER_AUTHORITY_STALE");
      await expect(repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest })).rejects.toThrow("ORDER_AUTHORITY_STALE");
    }
    expect(await effects()).toEqual(before);
    expect((await f.repo.preview(f.auth.context, f.scope)).contentHash).toBe(f.preview.contentHash);
  });
  it("concurrent confirmation and executor replay commit one effect and one fake merchant order", async () => {
    const f = await darkFixture();
    const [one, two] = await Promise.all([f.repo.approve(f.auth.context, f.scope, f.approved),
      f.repo.approve(f.auth.context, f.scope, f.approved)]);
    expect(two).toEqual(one);
    await Promise.all([f.executor.execute(f.auth.context, one.outboxActionId), f.executor.execute(f.auth.context, one.outboxActionId)]);
    expect(f.port.placedCount).toBe(1);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",
      [f.auth.context.tenantId, one.outboxActionId])).rows[0].status).toBe("succeeded");
    await expect(f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11" })).rejects.toThrow("ORDER_ALREADY_COMMITTED");
  });
  it("checked completion rejects a full artifact bound to a false revision authority and rolls back", async () => {
    const f = await darkFixture();
    // Simulate an application read bug. All commands, grants, outbox writes and
    // completion predicates still execute on real PostgreSQL as the runtime role.
    const scoped = runtime;
    const spoofed = { connect: async () => {
      const client = await scoped.connect();
      return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
        const result = await client.query(sql, values);
        if (sql.startsWith("SELECT r.id,r.draft_id")) {
          return { ...result, rows: result.rows.map(row => ({ ...row, authority_hash: "f".repeat(64) })) };
        }
        return result;
      } };
    } } as unknown as Pool;
    const repo = new PurchaseOrderActionRepository(spoofed);
    const preview = await repo.preview(f.auth.context, f.scope);
    expect(preview.order.revisionAuthorityHash).not.toBe(f.revision.authorityHash);
    const before = await effects(f.auth.context.tenantId);
    await expect(repo.approve(f.auth.context, f.scope, { ...f.approved,
      action: { ...f.approved.action, contentHash: preview.contentHash } })).rejects.toThrow("AUTHORIZATION_INVALID");
    expect(await effects(f.auth.context.tenantId)).toEqual(before);
    const valid = await f.repo.approve(f.auth.context, f.scope, f.approved);
    expect(valid).toMatchObject({ environment: "synthetic_demo", realExternalActions: 0 });
    expect((await admin.query(`SELECT version,payload->'references'->>'auditTrust' trust FROM app.audit_event
      WHERE tenant_id=$1 AND event_type='command.succeeded' AND payload->'references'->>'commandId'=$2`,
      [f.auth.context.tenantId, f.approved.commandId])).rows).toEqual([{ version: "audit.v2", trust: "checked_operation" }]);
  });
  it("changed quantity cancels the queued old authority before any fake delivery", async () => {
    const f = await darkFixture(), queued = await f.repo.approve(f.auth.context, f.scope, f.approved);
    await f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11" });
    await f.executor.execute(f.auth.context, queued.outboxActionId);
    expect(f.port.placedCount).toBe(0);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",
      [f.auth.context.tenantId, queued.outboxActionId])).rows[0].status).toBe("cancelled");
  });
  it("changed semantic payload and wrong-job/cross-tenant ids fail without another effect", async () => {
    const f = await darkFixture(); await f.repo.approve(f.auth.context, f.scope, f.approved);
    const before = await effects(f.auth.context.tenantId);
    await expect(f.repo.approve(f.auth.context, f.scope, { ...f.approved, action: { ...f.approved.action, amountPence: 1 } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(f.repo.approve(f.auth.context, f.scope, { ...f.approved, commandId: randomUUID(), action: { ...f.approved.action, amountPence: 1 } })).rejects.toThrow("COMMAND_CONFLICT");
    await expect(f.repo.preview(f.auth.context, { ...f.scope, jobId: randomUUID() })).rejects.toThrow();
    await expect(f.repo.preview(testTenantContext(randomUUID()), f.scope)).rejects.toThrow();
    expect(await effects(f.auth.context.tenantId)).toEqual(before);
  });
  async function sessionFor(f: Awaited<ReturnType<typeof darkFixture>>, role = "owner", tenantId = f.auth.context.tenantId) {
    const user = randomUUID(), actor = randomUUID(), digest = createHash("sha256").update(randomUUID()).digest("hex");
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await admin.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role)
      SELECT tenant_id,$1,account_id,$2,$3 FROM app.membership WHERE tenant_id=$4 LIMIT 1`, [actor,user,role,tenantId]);
    await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user,tenantId,actor]);
    await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fictional.invalid`,user]);
    await admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
      VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')`, [randomUUID(),user,digest,randomUUID()]);
    return { actor, digest, context: verifiedTenantContextFromMembership({ tenantId, membershipId: actor, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential: digest }) };
  }
  it("the session alone supplies the recorded actor, including another owner's session and replay conflicts", async () => {
    const f = await darkFixture(), other = await sessionFor(f);
    const before = await effects(f.auth.context.tenantId);
    await expect(f.repo.attestManual(f.auth.context, f.manual,
      { sessionDigest: f.auth.digest, actorMembershipId: other.actor })).rejects.toThrow();
    expect(await effects(f.auth.context.tenantId)).toEqual(before);
    // ORDER_OTHER_OWNER_BINDING: bind the very session whose actor must be recorded.
    const fact = await f.repo.attestManual(other.context, f.manual, { sessionDigest: other.digest });
    expect((await admin.query("SELECT actor_membership_id FROM app.purchase_order_manual_attestation WHERE id=$1", [fact.attestationId])).rows)
      .toEqual([{ actor_membership_id: other.actor }]);
    expect((await admin.query("SELECT actor_ref FROM app.audit_event WHERE tenant_id=$1 AND event_type='purchase_order.manual_attested'", [f.auth.context.tenantId])).rows)
      .toEqual([{ actor_ref: `membership:${other.actor}` }]);
    await expect(f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await f.repo.attestManual(other.context, f.manual, { sessionDigest: other.digest })).toEqual(fact);
  });

  it.each(["revoked", "expired", "forged"])("%s practice digest refuses with no attestation or audit", async boundary => {
    const f = await fixture(), revision = await f.orders.revise(f.job, f.input);
    // Keep the real material scope, so RLS cannot mask a missing actor digest check.
    const pool = practiceMaterialPool(runtime, f.auth.digest), repo = new PurchaseOrderActionRepository(pool);
    const manual = { version: "manual-order-attestation.v1", jobId: f.job, revisionId: revision.id,
      commandId: randomUUID(), supplierReference: `synthetic-${randomUUID()}` };
    expect((await repo.preview(f.auth.context, { version: "merchant-order-scope.v1", jobId: f.job, revisionId: revision.id })).order.revisionId)
      .toBe(revision.id);
    const token = boundary === "forged" ? randomUUID() : f.token;
    const digest = createHash("sha256").update(token).digest("hex");
    if (boundary === "revoked") await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [digest]);
    if (boundary === "expired") await admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [digest]);
    const before = await effects();
    await expect(repo.attestManual(f.auth.context, manual, { sessionDigest: digest })).rejects.toThrow("ORDER_ACTION_INVALID");
    expect(await effects()).toEqual(before);
    // Bypass TypeScript validation too: the practice bridge must not resolve an actor. Since LP-6b a revoked or
    // expired session is already refused when the request is bound, before the bridge runs.
    const bridge = withTenant(pool, f.auth.context, db => db.$client.query(
      "SELECT * FROM app.authenticate_practice_session($1,$2)", [digest, f.auth.context.tenantId]));
    if (boundary === "forged") expect((await bridge).rows).toEqual([]);
    else await expect(bridge).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await effects()).toEqual(before);
    const { jobId: _jobId, ...request } = manual;
    await expect(new MerchantOrderApplication(runtime, token).execute(f.job,
      { ...request, version: "merchant-order-screen.v1", kind: "manual" })).rejects.toThrow("UNAUTHENTICATED");
    expect(await effects()).toEqual(before);
  });
  it.each(["revoked_session", "expired_session", "revoked_owner", "expired_owner", "admin", "finance", "foreign", "missing", "malformed"])("%s refuses with no attestation or audit", async boundary => {
    const f = await darkFixture(), other = await sessionFor(f, ["admin","finance"].includes(boundary) ? boundary : "owner");
    let digest: string | undefined = other.digest;
    if (boundary === "revoked_session") await admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [digest]);
    if (boundary === "expired_session") await admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [digest]);
    if (boundary === "revoked_owner") await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1", [other.actor]);
    if (boundary === "expired_owner") await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [other.actor]);
    if (boundary === "foreign") digest = (await darkFixture()).auth.digest;
    if (boundary === "missing") digest = undefined;
    if (boundary === "malformed") digest = "bad";
    const before = await effects(f.auth.context.tenantId);
    await expect(f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: digest! })).rejects.toThrow();
    // Attack the database wrapper as runtime too, bypassing TypeScript validation.
    await expect(withTenant(runtime, f.auth.context, db => db.$client.query(
      "SELECT app.order_attestation_actor($1,$2)", [f.auth.context.tenantId,digest ?? null]))).rejects.toThrow("ORDER_ACTION_INVALID");
    expect(await effects(f.auth.context.tenantId)).toEqual(before);
  });
  it("keeps the identity bridge private and exposes only the narrow actor lookup", async () => {
    expect((await admin.query(`SELECT
      has_function_privilege('jobguard_runtime','app.order_attestation_actor(uuid,text)','EXECUTE') narrow,
      has_function_privilege('jobguard_runtime','app.mon1_company_actor(uuid,text)','EXECUTE') bridge,
      has_function_privilege('jobguard_infrastructure','app.order_attestation_actor(uuid,text)','EXECUTE') infrastructure`)).rows)
      .toEqual([{ narrow:true, bridge:false, infrastructure:false }]);
  });
  it("a transient database check failure leaves the order pending without an audit outcome", async () => {
    const f = await darkFixture(), queued = await f.repo.approve(f.auth.context, f.scope, f.approved);
    const pool = { connect: async () => {
      const client = await runtime.connect();
      return { release: () => client.release(), query: (sql: string, values?: unknown[]) => {
        if (sql.includes("SELECT app.require_watchdog_live")) throw new Error("synthetic connection failure");
        return client.query(sql,values);
      } };
    } } as unknown as Pool;
    const before = await effects(f.auth.context.tenantId);
    await expect(new ActionExecutor(pool,new Map([[f.port.name,f.port]]),{emit(){}}).execute(f.auth.context,queued.outboxActionId))
      .rejects.toThrow("synthetic connection failure");
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [queued.outboxActionId])).rows).toEqual([{status:"pending"}]);
    expect(await effects(f.auth.context.tenantId)).toEqual(before);
    expect(f.port.placedCount).toBe(0);
  });
  it("a job leaving live cancels once on PostgreSQL without an aborted transaction or adapter call", async () => {
    const f = await darkFixture(), queued = await f.repo.approve(f.auth.context, f.scope, f.approved);
    await admin.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.auth.context.tenantId,f.job]);
    await f.executor.execute(f.auth.context, queued.outboxActionId);
    await f.executor.execute(f.auth.context, queued.outboxActionId);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [queued.outboxActionId])).rows).toEqual([{status:"cancelled"}]);
    expect((await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='outbox.cancelled'", [f.auth.context.tenantId,queued.outboxActionId])).rows)
      .toEqual([expect.objectContaining({payload: expect.objectContaining({ references: expect.objectContaining({ reason: "order_authority_stale" }) })})]);
    expect(f.port.placedCount).toBe(0);
    await expect(operateOutbox(runtime, f.auth.context, queued.outboxActionId, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
  });
  it("refuses another active owner's supplied id without recording an attestation or audit", async () => {
    const f = await darkFixture(), otherOwner = randomUUID(), otherIdentity = randomUUID();
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [otherIdentity]);
    await admin.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role)
      SELECT tenant_id,$1,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4`,
      [otherOwner, otherIdentity, f.auth.context.tenantId, f.auth.membershipId]);
    const before = await effects(f.auth.context.tenantId);
    await expect(f.repo.attestManual(f.auth.context, { ...f.manual, actorMembershipId: otherOwner }, { sessionDigest: f.auth.digest })).rejects.toThrow();
    expect(await effects(f.auth.context.tenantId)).toEqual(before);
    expect((await admin.query("SELECT count(*)::int n FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND job_id=$2",
      [f.auth.context.tenantId, f.job])).rows[0].n).toBe(0);
  });
  it("rechecks a verified session's owner membership after revocation, even on replay", async () => {
    const f = await darkFixture();
    await f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest });
    const before = await effects(f.auth.context.tenantId);
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
      [f.auth.context.tenantId, f.auth.membershipId]);
    try {
      await expect(f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest })).rejects.toThrow("ORDER_ACTION_INVALID");
      await expect(f.repo.attestManual(f.auth.context, { ...f.manual, commandId: randomUUID() }, { sessionDigest: f.auth.digest })).rejects.toThrow("ORDER_ACTION_INVALID");
      expect(await effects(f.auth.context.tenantId)).toEqual(before);
      expect((await admin.query("SELECT count(*)::int n FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND job_id=$2",
        [f.auth.context.tenantId, f.job])).rows[0].n).toBe(1);
    } finally {
      await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",
        [f.auth.context.tenantId, f.auth.membershipId]);
    }
  });
  it("manual placement is append-only, replayable, and mutually exclusive with either send route", async () => {
    const f = await darkFixture(), before = await effects(f.auth.context.tenantId);
    const [fact, concurrent] = await Promise.all([
      f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest }),
      f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest }),
    ]);
    expect(concurrent).toEqual(fact);
    const nextDigest = createHash("sha256").update(randomUUID()).digest("hex");
    await admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
      SELECT $1,user_id,'synthetic_demo',$2,$3,clock_timestamp()+interval '1 hour'
      FROM identity.session WHERE token_digest=$4`, [randomUUID(),nextDigest,randomUUID(),f.auth.digest]);
    expect(await f.repo.attestManual(await testBoundTenantContext(admin,f.auth.context.tenantId,f.auth.membershipId,nextDigest), f.manual, { sessionDigest: nextDigest })).toEqual(fact);
    expect((await effects(f.auth.context.tenantId)).purchase_order_manual_attestation).toBe(before.purchase_order_manual_attestation! + 1);
    expect((await effects(f.auth.context.tenantId)).audit_event).toBe(before.audit_event! + 1);
    expect(await f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest })).toEqual(fact);
    expect((await admin.query("SELECT actor_membership_id FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND id=$2",
      [f.auth.context.tenantId, fact.attestationId])).rows).toEqual([{ actor_membership_id: f.auth.membershipId }]);
    expect((await admin.query(`SELECT actor_ref FROM app.audit_event WHERE tenant_id=$1 AND event_type='purchase_order.manual_attested'
      AND payload->'references'->>'attestationId'=$2`, [f.auth.context.tenantId, fact.attestationId])).rows)
      .toEqual([{ actor_ref: `membership:${f.auth.membershipId}` }]);
    expect((await effects(f.auth.context.tenantId)).action_outbox).toBe(before.action_outbox);
    expect((await effects(f.auth.context.tenantId)).action_authorization).toBe(before.action_authorization);
    await expect(f.repo.approve(f.auth.context, f.scope, f.approved)).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    await expect(f.orders.place(f.job, f.command(f.revision))).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    await expect(withTenant(runtime, f.auth.context, db => db.$client.query("UPDATE app.purchase_order_manual_attestation SET supplier_reference_hash=$1 WHERE tenant_id=$2",
      ["a".repeat(64), f.auth.context.tenantId]))).rejects.toThrow(/permission denied/u);
    await expect(withTenant(runtime, f.auth.context, db => db.$client.query("DELETE FROM app.purchase_order_manual_attestation WHERE tenant_id=$1",
      [f.auth.context.tenantId]))).rejects.toThrow(/permission denied/u);
  });
  it("one supplier reference cannot attest two drafts at the same merchant", async () => {
    const f = await darkFixture(); await f.repo.attestManual(f.auth.context, f.manual, { sessionDigest: f.auth.digest });
    const nextScope = randomUUID();
    await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [f.auth.context.tenantId, nextScope, f.job]);
    const requirement = await f.materials.addRequirement(f.job, { version: "material-requirement-command.v1", scopeItemId: nextScope,
      skuId: f.saved.skuId, quantity: "1", unit: "each", expectedRevision: 0 });
    const revision = await f.orders.revise(f.job, { ...f.input, commandId: randomUUID(), requirementId: requirement.id });
    await expect(f.repo.attestManual(f.auth.context, { ...f.manual, commandId: randomUUID(), revisionId: revision.id }, { sessionDigest: f.auth.digest })).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    expect((await admin.query("SELECT count(*)::int n FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND merchant_id=$2",
      [f.auth.context.tenantId, f.saved.merchantId])).rows[0].n).toBe(1);
  });
  it("cancellation never becomes a retry or a second placement", async () => {
    const f = await darkFixture(), queued = await f.repo.approve(f.auth.context, f.scope, f.approved);
    await operateOutbox(runtime, f.auth.context, queued.outboxActionId, "cancel");
    await f.executor.execute(f.auth.context, queued.outboxActionId);
    await expect(operateOutbox(runtime, f.auth.context, queued.outboxActionId, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(f.port.placedCount).toBe(0);
  });
});
