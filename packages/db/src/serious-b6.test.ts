import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierMatchRepository } from "./supplier-match-repository.js";
import { DiscrepancyRepository } from "./discrepancy-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
import { appendAuditBatch } from "./audit.js";
import { storeCommandResult } from "./watchdog.js";

vi.mock("./tenant-context.js", async original => ({
  ...await original<typeof import("./tenant-context.js")>(),
  withTenant: async (pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: pool }),
}));
vi.mock("./watchdog.js", async original => ({
  ...await original<typeof import("./watchdog.js")>(),
  requireLiveJob: vi.fn(),
  beginStoredCommand: async () => ({ replay: false }),
  storeCommandResult: vi.fn(),
  runStoredCommand: async (_db: unknown, _spec: unknown, hooks: { work: () => unknown }) => hooks.work(),
}));
vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn(async (_db, events) => events) }));
const tenant = randomUUID(), job = randomUUID(), draft = randomUUID(), document = randomUUID();
const context = verifiedTenantContextForQueuedJob(tenant);
beforeEach(() => vi.clearAllMocks());

// Scripted SQL exercises the actual repositories. Database constraints, transactions,
// RLS and durable replay are covered separately in serious-b6.integration.test.ts.
describe("SERIOUS-B6", () => {
  it.each([false, true])("S19: zero accepted receipts stay cited without a zero allocation (mixed=%s)", async mixed => {
    const rejected = randomUUID(), accepted = randomUUID(), order = randomUUID(), bill = randomUUID();
    const allocations: unknown[][] = [], revisions: unknown[][] = [];
    const driver = { query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO app.supplier_match_allocation")) {
        if (values[5] === "0") throw new Error("supplier_match_allocation_quantity_decimal_check");
        allocations.push(values);
      }
      if (sql.includes("INSERT INTO app.supplier_match_revision")) revisions.push(values);
      if (sql.includes("FROM app.goods_receipt")) return { rows: [
        { id: rejected, document_id: randomUUID(), order_draft_id: draft, revision: 1, quantity_decimal: "0.000000", unit: "each" },
        ...(mixed ? [{ id: accepted, document_id: document, order_draft_id: draft, revision: 2, quantity_decimal: "8.000000", unit: "each" }] : []),
      ] };
      if (sql.includes("FROM app.purchase_order_revision")) return { rows: [{ id: draft, version_id: order, revision: 1, quantity_decimal: "10" }] };
      if (sql.includes("FROM app.supplier_fact_revision")) return { rows: [{ id: document, version_id: bill, revision: 1, quantity_decimal: "10" }] };
      return { rows: [] };
    } };
    const repo = new SupplierMatchRepository(driver as unknown as Pool);
    await expect(repo.create(context, job, { commandId: randomUUID(), expectedRevision: 0 })).resolves.toBeDefined();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]![7]).toContain(rejected);
    expect(allocations.map(row => row[5])).toEqual(mixed ? ["8"] : []);
  });

  it("S20: unchanged evaluation never audits a discarded finding ID and stores both results", async () => {
    const source = { document_id: document, document_version_id: randomUUID(), match_revision_id: randomUUID(),
      ordered_quantity: "10", accepted_quantity: "8", billed_quantity: "10", ordered_price: "2000", billed_price: "2500" };
    const findings: string[] = [];
    const driver = { query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO app.discrepancy_finding_revision")) {
        if (!findings.length) findings.push(values[0] as string);
        else if (!sql.includes("DO NOTHING")) throw new Error("duplicate finding identity");
      }
      if (sql.includes("FROM app.supplier_match_revision mr")) return { rows: [source] };
      if (sql.includes("SELECT count(*) n FROM app.discrepancy_finding_revision")) return { rows: [{ n: findings.length }] };
      if (sql.includes("SELECT id FROM app.discrepancy_finding_revision")) return { rows: findings.map(id => ({ id })) };
      return { rows: [] };
    } };
    const repo = new DiscrepancyRepository(driver as unknown as Pool);
    for (let n = 0; n < 2; n++) await repo.evaluate(context, job, { commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" });
    expect(findings).toHaveLength(1);
    const events = vi.mocked(appendAuditBatch).mock.calls.flatMap(([, events]) => events);
    expect(events).toHaveLength(2);
    expect(events.filter(e => !findings.includes(e.payload.references?.findingId!))).toEqual([]);
    expect(storeCommandResult).toHaveBeenCalledTimes(2);
  });
});
