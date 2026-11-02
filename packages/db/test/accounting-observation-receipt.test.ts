import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
import { parseObservation } from "@jobguard/core";
import { AccountingObservationReceiptRepository } from "../src/accounting-observation-receipt-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const tx = vi.hoisted(() => ({ query: vi.fn(), run: vi.fn() }));
vi.mock("../src/tenant-context.js", async importOriginal => ({
 ...await importOriginal<typeof import("../src/tenant-context.js")>(),
 withTenant: tx.run,
}));
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "10000000-0000-4000-8000-000000000002";
const context = testTenantContext(tenantId), pool = {} as Pool;
const observation = parseObservation({ version: "observation.v1", tenantId, jobId, kind: "supplier_line",
 evidence: { id: "10000000-0000-4000-8000-000000000003", objectVersionId: "fictional-v1", sha256: "a".repeat(64), serverReceivedAt: "2026-10-30T12:00:00Z" },
 text: "Fictional tap", citations: [{ start: 0, end: 13, quote: "Fictional tap" }],
 facts: { workReference: "tap", scopeArea: "job", description: "tap", status: "unknown", estimatedValuePence: null,
 safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: null,
 activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false } });
beforeEach(() => {
 vi.resetAllMocks();
 tx.run.mockImplementation(async (_pool, _context, work) => work({ $client: { query: tx.query } }));
});
it("uses one tenant transaction and binds the durable tenant/evidence/version identity", async () => {
 tx.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1 });
 const result = await new AccountingObservationReceiptRepository(pool).claim(context, [observation]);
 expect(result).toEqual([observation]); expect(Object.isFrozen(result)).toBe(true);
 expect(tx.run).toHaveBeenCalledExactlyOnceWith(pool, context, expect.any(Function));
 expect(tx.query.mock.calls[0]![1]).toEqual([`accounting-receipt:${tenantId}`]);
 expect(tx.query.mock.calls[1]![1]).toEqual([tenantId, observation.evidence.id, "fictional-v1", jobId,
  createHash("sha256").update(JSON.stringify(observation)).digest("hex")]);
});
it("a persisted matching receipt returns no new emission on a fresh repository", async () => {
 tx.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [{
  observation_hash: createHash("sha256").update(JSON.stringify(observation)).digest("hex"),
 }] });
 expect(await new AccountingObservationReceiptRepository(pool).claim(context, [observation])).toEqual([]);
});
it("conflicting or unexpectedly invisible receipts fail the transaction", async () => {
 for (const rows of [[{ observation_hash: "b".repeat(64) }], []]) {
  tx.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows });
  await expect(new AccountingObservationReceiptRepository(pool).claim(context, [observation])).rejects.toThrow("ACCOUNTING_VERSION_CONFLICT");
 }
});
it("rejects cross-tenant observations before a database call", async () => {
 await expect(new AccountingObservationReceiptRepository(pool).claim(context, [{ ...observation, tenantId: jobId }])).rejects.toThrow("ACCOUNTING_BINDING_MISMATCH");
 expect(tx.run).not.toHaveBeenCalled();
});
