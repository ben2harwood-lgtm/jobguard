import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { goodsReceiptV1, supplierFactCorrectionV1 } from "@jobguard/core";
import { MaterialRepository, migrate, PurchaseOrderRepository, SupplierDocumentRepository } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "audit-supplier-document-pg-"));
  const port = await freePort(56600, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  // Disposable login inherits the existing runtime role, adding no protected-table grant.
  await admin.query("CREATE ROLE audit_supplier_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO audit_supplier_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "audit_supplier_login", password: "synthetic" });
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const tenant = randomUUID(), job = randomUUID(), scope = randomUUID(), context = testTenantContext(tenant);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await importWatchdogFixtureJob(admin, tenant, job);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
  const materials = new MaterialRepository(runtime), rate = await materials.addRate(context, {
    merchantName: "Fictional supplier", sku: "MAT-B", description: "Synthetic item", pricePence: 2000,
    priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0,
  });
  const requirement = await materials.addRequirement(context, { jobId: job, scopeItemId: scope,
    skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  await new PurchaseOrderRepository(runtime).revise(context, job, { version: "purchase-order-draft.v1",
    requirementId: requirement.id, quantity: "10", unitPricePence: 2000,
    recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const repo = new SupplierDocumentRepository(runtime);
  const invoice = await repo.intake(context, job, { version: "supplier-document-intake.v1", commandId: randomUUID(),
    fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 0 });
  await repo.intake(context, job, { version: "supplier-document-intake.v1", commandId: randomUUID(),
    fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 1 });
  return { tenant, job, context, repo, documentId: invoice.documentId };
}
async function counts(tenant: string, job: string) {
  const result: Record<string, number> = {};
  for (const table of ["supplier_fact_revision", "goods_receipt", "audit_event", "watchdog_command_identity", "watchdog_command_result"]) {
    const predicate = table === "audit_event" ? "tenant_id=$1"
      : table === "watchdog_command_result" ? "tenant_id=$1 AND command_id IN (SELECT command_id FROM app.watchdog_command_identity WHERE tenant_id=$1 AND job_id=$2)"
      : "tenant_id=$1 AND job_id=$2";
    result[table] = (await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE ${predicate}`,
      table === "audit_event" ? [tenant] : [tenant, job])).rows[0].n;
  }
  return result;
}

describe("night audit supplier document regressions (real PostgreSQL, dispatcher/CI only)", () => {
  it("confirms decimal quantities using exact arithmetic", async () => {
    const { repo, tenant, job, context, documentId } = await fixture();
    const input = supplierFactCorrectionV1.parse({ version: "supplier-fact-correction.v1", documentId,
      commandId: randomUUID(), documentType: "invoice", quantity: "1.1", unitPricePence: 100, netPence: 110, expectedRevision: 0 });
    await expect(repo.confirm(context, job, input)).resolves.toEqual({ revision: 1, replayed: false });
    expect((await admin.query("SELECT revision,quantity_decimal::text quantity,net_pence::text net FROM app.supplier_fact_revision WHERE tenant_id=$1 AND job_id=$2", [tenant, job])).rows)
      .toEqual([{ revision: 1, quantity: "1.100000", net: "110" }]);
    const beforeReplay = await counts(tenant, job);
    await expect(repo.confirm(context, job, input)).resolves.toEqual({ revision: 1, replayed: false });
    expect(await counts(tenant, job)).toEqual(beforeReplay);
  });

  it("rejects quantities beyond supported precision without writes", async () => {
    const { repo, tenant, job, context, documentId } = await fixture(), before = await counts(tenant, job);
    const confirmation = { version: "supplier-fact-correction.v1" as const, documentId, commandId: randomUUID(),
      documentType: "invoice" as const, quantity: "1.0000001", unitPricePence: 10000000, netPence: 10000001, expectedRevision: 0 };
    const receipt = { version: "goods-receipt.v1" as const, commandId: randomUUID(), accepted: "1.1234567", rejected: "0", expectedRevision: 1 };
    expect(() => supplierFactCorrectionV1.parse(confirmation)).toThrowError(expect.objectContaining({ name: "ZodError" }));
    expect(() => goodsReceiptV1.parse(receipt)).toThrowError(expect.objectContaining({ name: "ZodError" }));
    await expect(repo.confirm(context, job, confirmation)).rejects.toMatchObject({ name: "ZodError" });
    // The repository accepts the receipt's established fields; version is parsed at the application boundary.
    const { version: _version, ...receiptInput } = receipt;
    await expect(repo.appendReceipt(context, job, receiptInput)).rejects.toMatchObject({ name: "ZodError" });
    await expect(repo.appendReceipt(context, job, { ...receiptInput, accepted: "1", rejected: "1.1234567" })).rejects.toMatchObject({ name: "ZodError" });
    expect(await counts(tenant, job)).toEqual(before);
  });
});
