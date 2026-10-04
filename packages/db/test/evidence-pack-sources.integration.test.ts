import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEvidencePackSources } from "../src/evidence-pack-sources.js";
import { migrate } from "../src/migrate.js";
import { withTenant, type VerifiedTenantContext } from "../src/tenant-context.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeTestPools } from "./pool-test-utils.js";

let pg: EmbeddedPostgres | undefined, admin: Pool | undefined, runtime: Pool, dir: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-evidence-sources-"));
  const port = 58750 + Math.floor(Math.random() * 100);
  const postgresLog: string[] = [];
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: message => { postgresLog.push(message); } });
  try { await pg.initialise(); await pg.start(); }
  catch (error) { throw new Error(`${String(error)}\n${postgresLog.join("\n")}`); }
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  await migrate(admin);
  fixture = await seedEvidencePackFixture(admin);
  await admin.query("CREATE ROLE evidence_sources_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO evidence_sources_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "evidence_sources_login", password: "synthetic" });
}, 60_000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });
const load = (caseId: string, tenantId = fixture.tenantId) => withTenant(runtime, { tenantId } as VerifiedTenantContext, db => loadEvidencePackSources(db, tenantId, caseId));

describe("evidence pack immutable sources", () => {
  it("maps stored exact versions, approval records and proof bytes without unrelated supplier rows", async () => {
    const result = await load(fixture.caseId);
    const ids = result.sources.map(source => source.sourceId);
    expect(ids).toContain(`quote_document_version:${fixture.quoteId}`);
    expect(ids).toContain(`quote_acceptance:${fixture.acceptanceId}`);
    expect(ids).toContain(`evidence_object:${fixture.proofId}`);
    expect(ids).toContain(`variation_revision:${fixture.variationRevisionId}`);
    expect(ids).toContain(`material_rate_revision:${fixture.rateId}`);
    expect(ids).toContain(`supplier_document_version:${fixture.supplierInvoiceVersionId}`);
    expect(ids).toContain(`supplier_document_version:${fixture.supplierDeliveryVersionId}`);
    expect(ids).not.toContain(`customer_invoice:${fixture.invoiceId}`);
    expect(ids).not.toContain(`supplier_document_version:${fixture.unrelatedSupplierVersionId}`);
    expect(result.omissions).toEqual([]);
    const quote = result.sources.find(source => source.kind === "accepted_quote")!;
    expect(JSON.parse(quote.content).record.snapshot.netPence).toBe(1880000);
    const proof = result.sources.find(source => source.sourceId === `evidence_object:${fixture.proofId}`)!;
    expect(JSON.parse(proof.content).originalBytesBase64).toBe(fixture.proofBytes.toString("base64"));
    expect(result.sources.every(source => source.jobId === fixture.jobId)).toBe(true);
    expect(await load(fixture.caseId)).toEqual(result);
  });
  it("maps a customer case to its actual issued invoice and excludes supplier records", async () => {
    const result = await load(fixture.customerCaseId);
    expect(result.sources.filter(source => source.kind === "invoice").map(source => source.sourceId)).toEqual([`customer_invoice:${fixture.invoiceId}`]);
    expect(result.sources.some(source => source.kind.startsWith("supplier_"))).toBe(false);
    const invoice = result.sources.find(source => source.kind === "invoice")!;
    expect(JSON.parse(invoice.content).record.invoice_number).toBe("FIXTURE-INVOICE-1");
  });
  it("rejects missing/wrong-job references instead of fabricating a document", async () => {
    await expect(load(fixture.badReferenceCaseId)).rejects.toMatchObject({ code: "EVIDENCE_PACK_SOURCE_NOT_FOUND" });
    await expect(load(fixture.crossJobReferenceCaseId)).rejects.toMatchObject({ code: "EVIDENCE_PACK_SOURCE_NOT_FOUND" });
    await expect(load(fixture.caseId, fixture.otherTenantId)).rejects.toMatchObject({ code: "EVIDENCE_PACK_CASE_NOT_FOUND" });
  });
  it("does not substitute a historical acceptance after the accepted baseline is cleared", async () => {
    await admin!.query("UPDATE app.job SET accepted_quote_version_id=NULL WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.jobId]);
    try {
      const result = await load(fixture.caseId);
      expect(result.sources.some(source => source.kind === "accepted_quote")).toBe(false);
      expect(result.omissions).toContain("Accepted quote and approval unavailable");
    } finally {
      await admin!.query("UPDATE app.job SET accepted_quote_version_id=$1 WHERE tenant_id=$2 AND id=$3", [fixture.quoteId, fixture.tenantId, fixture.jobId]);
    }
  });
  it("does not invent a variation requirement for an unchanged job", async () => {
    const unchanged = await seedEvidencePackFixture(admin!, { withVariation: false });
    const result = await load(unchanged.caseId, unchanged.tenantId);
    expect(result.sources.some(source => source.kind === "variation")).toBe(false);
    expect(result.omissions).toEqual([]);
  });
  it("reports missing accepted/proof records as omissions", async () => {
    const result = await load(fixture.emptyCaseId);
    expect(result.sources.every(source => source.kind === "recovery_case")).toBe(true);
    expect(result.omissions).toEqual(expect.arrayContaining(["Accepted quote and approval unavailable", "Verified proof unavailable"]));
  });
});
