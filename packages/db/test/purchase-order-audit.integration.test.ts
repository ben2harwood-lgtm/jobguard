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
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "jobguard-po-audit-"));
  const port = await freePort(58000, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "postgres" };
  admin = new Pool({ ...connection, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  const account = randomUUID();
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional order account')", [DEMO_TENANT_ID, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
  // Login setup only: no additional runtime privileges or grants.
  await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic'");
  runtime = new Pool({ ...connection, user: "jobguard_runtime", password: "synthetic", max: 5 });
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture(pack = false) {
  const token = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, token);
  const job = (await admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",
    [DEMO_TENANT_ID, auth.digest])).rows[0].id as string;
  const scope = randomUUID();
  await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",
    [DEMO_TENANT_ID, scope, job]);
  const materials = new MaterialApplication(runtime, token), orders = new PurchaseOrderApplication(runtime, token);
  const rate = { version: "material-rate-command.v1", merchantName: `Fictional supplier ${randomUUID()}`, sku: "AUDIT-1",
    description: "Synthetic item", pricePence: pack ? 20000 : 2000, priceUnit: pack ? "box" : "each", taxBasis: "net",
    effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31", sourceLabel: "synthetic audit fixture", expectedVersion: 0,
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
  return { job, materials, orders, input, rate, command };
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
      effectiveFrom: period === "future" ? "2026-11-01" : "2026-09-01",
      effectiveTo: period === "future" ? "2026-11-30" : "2026-09-30" });
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
