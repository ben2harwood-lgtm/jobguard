import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateBillDiscrepancy, type SupplierMatchCorrection } from "@jobguard/core";
import { SupplierMatchRepository } from "./supplier-match-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
import { appendAuditBatch } from "./audit.js";

vi.mock("./tenant-context.js", async (original) => ({
  ...await original<typeof import("./tenant-context.js")>(),
  withTenant: async (pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: pool }),
}));
vi.mock("./watchdog.js", async (original) => ({
  ...await original<typeof import("./watchdog.js")>(),
  requireLiveJob: vi.fn(),
  beginStoredCommand: async () => ({ replay: false }),
  storeCommandResult: vi.fn(),
}));
vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn(async (_db, events) => events) }));

// Driver doubles exercise the repository's selection/validation, not PostgreSQL guarantees.
// The matching integration regressions exercise the same scenarios with real repositories.
const tenant = randomUUID(), job = randomUUID(), draft = randomUUID(), document = randomUUID();
const receipt = (quantity: string, revision: number, documentId = document) => ({
  id: randomUUID(), order_draft_id: draft, document_id: documentId,
  revision, quantity_decimal: quantity, unit: "each",
});
const order = { id: draft, version_id: randomUUID(), revision: 1, quantity_decimal: "10" };
const bill = { id: randomUUID(), version_id: randomUUID(), revision: 1, quantity_decimal: "10" };
function sourceDriver(receipts: ReturnType<typeof receipt>[], unrelated?: typeof order) {
  return { query: vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM app.goods_receipt")) return { rows: receipts };
    if (sql.includes("FROM app.purchase_order_revision")) {
      // A draft-qualified selection returns B; an unqualified highest revision returns A.
      return { rows: [params.includes(draft) ? order : unrelated ?? order] };
    }
    if (sql.includes("FROM app.supplier_fact_revision")) return { rows: [bill] };
    throw new Error(`Unexpected query: ${sql}`);
  }) };
}
async function sources(driver: ReturnType<typeof sourceDriver>) {
  const repo = new SupplierMatchRepository(driver as unknown as Pool);
  return (repo as any).sources(driver, tenant, job);
}
function discrepancy(selected: Awaited<ReturnType<typeof sources>>) {
  return evaluateBillDiscrepancy({ version: "discrepancy-input.v1", ruleRevision: "supplier-overcharge.v1",
    sourceDocumentId: bill.id, sourceVersionId: bill.version_id, matchRevisionId: randomUUID(),
    confirmed: true, matched: true, orderedQuantity: Number(selected.order.quantity),
    acceptedQuantity: selected.receipts.reduce((n: number, r: any) => n + Number(r.quantity), 0),
    billedQuantity: 10, orderedUnitPricePence: selected.order.versionId === order.version_id ? 2000 : 10000,
    billedUnitPricePence: 2500 });
}
function correctionDriver(currentRevision: number, declared: string[], available: string[]) {
  const revisions: number[] = [currentRevision], allocations: unknown[][] = [];
  const driver = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("SELECT payload_hash,job_id")) return { rows: [] };
    if (sql.includes("SELECT * FROM app.supplier_match_proposal")) return { rows: [{
      order_revision_id: order.version_id, bill_revision_id: bill.version_id, receipt_version_ids: declared,
    }] };
    if (sql.includes("FROM app.supplier_match_revision")) return { rows: [{
      n: sql.includes("count(*)") ? revisions.length : Math.max(...revisions),
    }] };
    if (sql.includes("FROM app.goods_receipt")) return { rows: available.includes(params[2] as string)
      ? [{ accepted_quantity: "10", unit: "each" }] : [] };
    if (sql.includes("::numeric <=")) return { rows: [{ ok: true }] };
    if (sql.includes("INSERT INTO app.supplier_match_revision")) { revisions.push(params[5] as number); return { rows: [] }; }
    if (sql.includes("INSERT INTO app.supplier_match_allocation")) { allocations.push(params); return { rows: [] }; }
    throw new Error(`Unexpected query: ${sql}`);
  }) };
  const repo = new SupplierMatchRepository(driver as unknown as Pool);
  vi.spyOn(repo as any, "viewIn").mockImplementation(async () => ({ revision: revisions.at(-1), history: [...revisions] }));
  const input: SupplierMatchCorrection = { version: "supplier-match-correction.v1", commandId: randomUUID(),
    proposalId: randomUUID(), expectedRevision: currentRevision, orderVersionId: order.version_id,
    billVersionId: bill.version_id, receiptVersionIds: declared,
    allocations: [{ receiptVersionId: available.at(-1)!, quantity: "10" }] };
  return { repo, input, revisions, allocations };
}

describe("night-audit supplier match regressions (driver doubles)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("matches only the current revision of each delivery", async () => {
    const current = receipt("6", 2), selected = await sources(sourceDriver([receipt("8", 1), current]));
    expect(selected.receipts.map((r: any) => r.versionId)).toEqual([current.id]);
    expect(selected.receipts.map((r: any) => r.quantity)).toEqual(["6"]);
    expect(discrepancy(selected)).toMatchObject({ pricePence: 5000, quantityPence: 8000, totalPence: 13000 });
  });
  it("an unrelated order revision cannot replace a delivery's order", async () => {
    const selected = await sources(sourceDriver([receipt("8", 1)], {
      ...order, id: randomUUID(), version_id: randomUUID(), revision: 3,
    }));
    expect(selected.order.versionId).toBe(order.version_id);
    expect(discrepancy(selected)).toMatchObject({ pricePence: 5000, quantityPence: 4000, totalPence: 9000 });
  });
  it("rejects allocations outside the declared receipt versions", async () => {
    const r1 = randomUUID(), r2 = randomUUID(), fixture = correctionDriver(1, [r1], [r1, r2]);
    await expect(fixture.repo.correct(verifiedTenantContextForQueuedJob(tenant), job, fixture.input))
      .rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    expect(fixture.revisions).toEqual([1]);
    expect(fixture.allocations).toEqual([]);
    expect(appendAuditBatch).not.toHaveBeenCalled();
  });
  it("a replacement proposal accepts correction at its returned revision", async () => {
    const r1 = randomUUID(), fixture = correctionDriver(3, [r1], [r1]);
    const result = await fixture.repo.correct(verifiedTenantContextForQueuedJob(tenant), job, fixture.input);
    expect(result).toMatchObject({ revision: 4, history: [3, 4] });
    expect(fixture.allocations).toHaveLength(1);
  });
  it("keeps distinct deliveries additive while replacing only the corrected delivery", async () => {
    const old = receipt("8", 1), current = receipt("6", 3), separate = receipt("2", 2, randomUUID());
    const selected = await sources(sourceDriver([old, separate, current]));
    expect(selected.receipts.map((r: any) => r.versionId)).toEqual([current.id, separate.id]);
    expect(discrepancy(selected)).toMatchObject({ pricePence: 5000, quantityPence: 4000, totalPence: 9000 });
  });
  it("refuses to guess an invoice's order when deliveries cite different drafts", async () => {
    const b = receipt("8", 1), a = { ...receipt("10", 1, randomUUID()), order_draft_id: randomUUID() };
    await expect(sources(sourceDriver([b, a]))).rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
  });
});
