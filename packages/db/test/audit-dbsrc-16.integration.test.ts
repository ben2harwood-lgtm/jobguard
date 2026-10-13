import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiscrepancyRepository, MaterialRepository, migrate, PurchaseOrderRepository,
  SupplierDocumentRepository, SupplierMatchRepository } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-audit-dbsrc-16-"));
  const port = await freePort(60300, 40);
  pg = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  const connection = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" };
  admin = new Pool(connection); await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  // Reuse the existing runtime role: no new role or grant is required by this repair.
  runtime = new Pool({ ...connection, options: "-c role=jobguard_runtime" });
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin);
  if (pg) await pg.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const tenant = randomUUID(), job = randomUUID(), context = testTenantContext(tenant);
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)", [tenant]);
  await importWatchdogFixtureJob(admin, tenant, job);
  const materials = new MaterialRepository(runtime), orders = new PurchaseOrderRepository(runtime);
  const addOrder = async (sku: string, pricePence: number) => {
    const scope = randomUUID();
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
    const rate = await materials.addRate(context, { merchantName: "Fictional supplier", sku, description: "Synthetic audit item",
      pricePence, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
    const requirement = await materials.addRequirement(context, { jobId: job, scopeItemId: scope, skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
    const input = { version: "purchase-order-draft.v1" as const, requirementId: requirement.id, quantity: "10", unitPricePence: pricePence,
      recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 };
    const order = await orders.revise(context, job, input);
    return { order, input };
  };
  const { order } = await addOrder("MAT-B", 2000);
  const docs = new SupplierDocumentRepository(runtime), matches = new SupplierMatchRepository(runtime);
  await docs.intake(context, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
  await docs.intake(context, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
  const view = await docs.view(context, job), documentId = view.facts[0]!.document_id as string;
  const confirm = (quantity = "10", unitPricePence = 2500, netPence = 25000, expectedRevision = 0) => docs.confirm(context, job,
    { version: "supplier-fact-correction.v1", documentId, commandId: randomUUID(), documentType: "invoice", quantity, unitPricePence, netPence, expectedRevision });
  return { tenant, job, context, order, orders, addOrder, docs, matches, documentId, confirm };
}

describe("AUDIT-FIX-DBSRC-16 real PostgreSQL regressions", () => {
  it("does not match an invoice to an unrelated same-job order", async () => {
    const f = await fixture(); await f.confirm();
    const c = await f.addOrder("MAT-C", 100);
    const unrelated = await f.orders.revise(f.context, f.job, { ...c.input, expectedRevision: 1 });
    const match = await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 });
    expect(match.proposal.orderVersionId).toBe(f.order.id);
    expect(match.proposal.orderVersionId).not.toBe(unrelated.id);
    expect((await new DiscrepancyRepository(runtime).evaluate(f.context, f.job, { commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" })).finding)
      .toMatchObject({ pricePence: 5000, quantityPence: 4000, totalPence: 9000 });
  });

  it.each([["0.29", 100, 29], ["0.5", 101, 50]] as const)("confirms exact fractional quantities with half-even rounding: %s", async (quantity, unitPricePence, netPence) => {
    const f = await fixture();
    await expect(f.confirm(quantity, unitPricePence, netPence)).resolves.toMatchObject({ revision: 1 });
    const facts = (await f.docs.view(f.context, f.job)).facts[0]!.confirmed;
    expect(Number(facts.quantity_decimal)).toBe(Number(quantity));
    expect(Number(facts.unit_price_pence)).toBe(unitPricePence); expect(Number(facts.net_pence)).toBe(netPence);
    await expect(f.confirm(quantity, unitPricePence, netPence + 1, 1)).rejects.toThrow("ARITHMETIC_MISMATCH");
    expect(Number((await admin.query("SELECT count(*) n FROM app.supplier_fact_revision WHERE tenant_id=$1 AND job_id=$2", [f.tenant, f.job])).rows[0].n)).toBe(1);
  });

  it("later deliveries reduce the outstanding quantity cumulatively", async () => {
    const f = await fixture();
    const original = (await admin.query("SELECT * FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2", [f.tenant, f.job])).rows[0];
    await f.docs.appendReceipt(f.context, f.job, { accepted: "1", rejected: "0", expectedRevision: 1 });
    expect((await f.docs.view(f.context, f.job)).receipt).toMatchObject({ ordered: "10", delivered: "11", accepted: "9", rejected: "0", missing: "1", revision: 2 });
    expect((await admin.query("SELECT * FROM app.goods_receipt WHERE tenant_id=$1 AND id=$2", [f.tenant, original.id])).rows[0]).toEqual(original);
    await f.confirm();
    const match = await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 });
    expect(match.proposal.received).toBe("9 each");
  });

  it("matches received goods after an entirely rejected later delivery", async () => {
    const f = await fixture(); await f.confirm();
    await f.docs.appendReceipt(f.context, f.job, { accepted: "0", rejected: "1", expectedRevision: 1 });
    const match = await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 });
    expect(match.proposal).toMatchObject({ state: "matched", received: "8 each" });
    const receipts = (await admin.query("SELECT id,accepted_quantity::text accepted FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision", [f.tenant, f.job])).rows;
    expect(match.proposal.receiptVersionIds).toEqual(receipts.map(r => r.id));
    expect((await admin.query("SELECT receipt_version_id,quantity_decimal::text quantity FROM app.supplier_match_allocation WHERE tenant_id=$1 AND job_id=$2", [f.tenant, f.job])).rows)
      .toEqual([{ receipt_version_id: receipts[0].id, quantity: "8.000000" }]);
    expect((await f.docs.view(f.context, f.job)).receipt).toMatchObject({ accepted: "8", rejected: "1", missing: "2" });
  });

  it("rejects allocations outside the correction source versions", async () => {
    const f = await fixture(); await f.confirm();
    const first = await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 }), p = first.proposal;
    await f.docs.appendReceipt(f.context, f.job, { accepted: "1", rejected: "0", expectedRevision: 1 });
    const later = (await admin.query("SELECT id FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 AND revision=2", [f.tenant, f.job])).rows[0].id;
    const tables = ["supplier_match_revision", "supplier_match_allocation", "audit_event", "watchdog_command_result", "watchdog_command_identity"];
    const counts = async () => Promise.all(tables.map(async table => Number((await admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`, [f.tenant])).rows[0].n)));
    const before = await counts();
    await expect(f.matches.correct(f.context, f.job, { version: "supplier-match-correction.v1", commandId: randomUUID(), proposalId: p.id, expectedRevision: first.revision,
      orderVersionId: p.orderVersionId, receiptVersionIds: p.receiptVersionIds, billVersionId: p.billVersionId, allocations: [{ receiptVersionId: later, quantity: "1" }] }))
      .rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    expect(await counts()).toEqual(before);
    expect(await f.matches.view(f.context, f.job)).toEqual(first);
  });

  it("returns the proposal actually corrected when a newer proposal exists", async () => {
    const f = await fixture(); await f.confirm();
    const first = await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 }), p = first.proposal;
    await f.confirm("10", 2400, 24000, 1);
    const newer = await f.matches.create(f.context, f.job, { commandId: randomUUID(), expectedRevision: 0 });
    expect(newer.proposal.id).not.toBe(p.id);
    const correction = { version: "supplier-match-correction.v1" as const, commandId: randomUUID(), proposalId: p.id, expectedRevision: first.revision,
      orderVersionId: p.orderVersionId, receiptVersionIds: p.receiptVersionIds, billVersionId: p.billVersionId, allocations: [{ receiptVersionId: p.receiptVersionIds[0], quantity: "7" }] };
    const result = await f.matches.correct(f.context, f.job, correction);
    expect(result).toMatchObject({ proposal: { id: p.id, received: "7 each" }, revision: 2 });
    expect(result.history).toHaveLength(2);
    expect(await f.matches.correct(f.context, f.job, correction)).toEqual(result);
    expect((await f.matches.view(f.context, f.job)).proposal!.id).toBe(newer.proposal.id);
    expect((await admin.query("SELECT result FROM app.watchdog_command_result WHERE tenant_id=$1 AND command_id=$2", [f.tenant, correction.commandId])).rows[0].result).toEqual(result);
  });
});
