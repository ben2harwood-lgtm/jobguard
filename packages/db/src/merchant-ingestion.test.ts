import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import type { VerifiedTenantContext } from "./tenant-context.js";
import { supplierFixtures, type SupplierDocumentIntake } from "@jobguard/core";
vi.mock("./tenant-context.js", () => ({ withTenant: async (db: unknown, _ctx: unknown, work: (db: unknown) => unknown) => work(db) }));
vi.mock("./watchdog.js", () => ({ requireLiveJob: vi.fn(), runStoredCommand: async (_db: unknown, _spec: unknown, hooks: { work: () => unknown }) => hooks.work(), WatchdogError: class extends Error {} }));
vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn() }));
import { appendAuditBatch } from "./audit.js";
import { SupplierDocumentRepository } from "./supplier-document-repository.js";
const tenant = randomUUID(), job = randomUUID(), canonicalId = randomUUID();
const ctx = { tenantId: tenant } as VerifiedTenantContext;
const previousEnvironment = process.env.JOBGUARD_ENV;
afterEach(() => { vi.clearAllMocks(); if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment; });
function driver(locked = false) {
  const writes: { sql: string; values: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/INSERT INTO/.test(sql)) { writes.push({ sql, values }); return { rows: [] }; }
    if (sql.includes("count(*) n")) return { rows: [{ n: "0", ch4_locked_offer: locked ? { version: "job-linked-offer.v1", code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB", message: "Start a linked job for this customer and site", jobId: job, customerId: randomUUID(), siteId: randomUUID() } : null }] };
    if (sql.includes("document_number=$4")) return { rows: [{ id: canonicalId, content_hash: createHash("sha256").update(supplierFixtures["materials-B-invoice"].bytes).digest("hex") }] };
    if (sql.includes("content_hash=$4")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { pool: { $client: { query } } as unknown as Pool, writes, query };
}
const intake = (fixtureId: SupplierDocumentIntake["fixtureId"]): SupplierDocumentIntake => ({ version: "supplier-document-intake.v1", fixtureId, channel: "fixture_portal", expectedRevision: 0 });
it("driver double: changed prices quarantine against the original identity and produce review audit, without commercial writes", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const db = driver(); const result = await new SupplierDocumentRepository(db.pool).intake(ctx, job, intake("merchant-changed-invoice"));
  expect(result.result).toBe("held");
  const document = db.writes.find(w => w.sql.includes("INSERT INTO app.supplier_document("))!;
  expect(document.values.slice(-3)).toEqual(["held", "Merchant review: changed_document", canonicalId]);
  expect(db.writes.every(w => /INSERT INTO app.supplier_document(?:\(|_version\(|_intake\()/.test(w.sql))).toBe(true);
  expect(db.writes.at(-1)?.values).toContain("fixture_portal");
  expect(appendAuditBatch).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ eventType: "merchant_document.review_required" })]);
  for (const [sql, values] of db.query.mock.calls) expect(values?.slice(sql.startsWith("INSERT") ? 1 : 0, sql.startsWith("INSERT") ? 3 : 2)).toEqual([tenant, job]);
});
it("driver double: malformed feed amounts and identity/schema drift cannot become fact proposals", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  for (const fixture of ["merchant-invalid-amount", "merchant-schema-drift", "merchant-identity-drift"] as const) {
    const db = driver(); expect((await new SupplierDocumentRepository(db.pool).intake(ctx, job, intake(fixture))).result).toBe("held");
    expect(db.writes.some(w => w.sql.includes("supplier_fact_proposal"))).toBe(false);
  }
});
it("driver double: server environment and alias failures happen before any database work", async () => {
  for (const environment of [undefined, "production"]) {
    if (environment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = environment;
    const db = driver(); await expect(new SupplierDocumentRepository(db.pool).intake(ctx, job, intake("materials-B-invoice"))).rejects.toThrow("MERCHANT_LIVE_DISABLED"); expect(db.query).not.toHaveBeenCalled();
  }
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const db = driver(); await expect(new SupplierDocumentRepository(db.pool).intake(ctx, job, { ...intake("materials-B-invoice"), channel: "fixture_mail", alias: "other@fictional-builder.invalid" })).rejects.toThrow("UNKNOWN_FIXTURE_ALIAS"); expect(db.query).not.toHaveBeenCalled();
});
it("driver double: a locked final bill still refuses changed invoice input without writing a quarantine or facts", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const db = driver(true); await expect(new SupplierDocumentRepository(db.pool).intake(ctx, job, intake("merchant-changed-invoice"))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB"); expect(db.writes).toEqual([]);
});

it("driver double: changed delivery is quarantined without adding a receipt or reading shadow data", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const db = driver(); expect((await new SupplierDocumentRepository(db.pool).intake(ctx, job, intake("merchant-changed-delivery"))).result).toBe("held");
  expect(db.writes.some(w => w.sql.includes("goods_receipt"))).toBe(false);
  expect(db.query.mock.calls.some(([sql]) => /shadow/i.test(sql))).toBe(false);
});
it("driver double: legacy picker/mail fixtures still seed predecessor-schema upgrade proofs", async () => {
  delete process.env.JOBGUARD_ENV;
  const db = driver(); expect((await new SupplierDocumentRepository(db.pool).intake(ctx, job, { ...intake("materials-B-invoice"), channel: "picker" })).result).toBe("ready");
  expect(db.writes.some(w => /canonical_document_id|source_schema_version/.test(w.sql))).toBe(false);
  expect(db.writes.some(w => w.sql.includes("supplier_fact_proposal"))).toBe(true);
});
