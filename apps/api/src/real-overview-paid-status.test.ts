import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), batch: vi.fn(), materialPool: vi.fn() }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { session = mocks.session; } }));
vi.mock("@jobguard/db", async importOriginal => {
 const actual = await importOriginal<typeof import("@jobguard/db")>();
 return { ...actual, GuardedPracticeInvoiceRepository: class {
  constructor(pool: Pool, sessionId?: string) { mocks.materialPool(pool, sessionId); }
  listForJobs = mocks.batch;
 } };
});
import { CustomerInvoiceApplication } from "./customer-invoice.application.js";
const pool = {} as Pool, sessionId = randomUUID(), digest = createHash("sha256").update(sessionId).digest("hex");
const context = { tenantId: randomUUID() }, jobId = randomUUID();
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ context, digest }); });
it("authenticates once and propagates verified context and digest to one batch", async () => {
 mocks.batch.mockResolvedValue([{ jobId, invoices: [] }]);
 expect(await new CustomerInvoiceApplication(pool, sessionId).listForJobs([jobId])).toEqual([{ version: 1, environment: "synthetic_demo", jobId, invoices: [] }]);
 expect(mocks.materialPool).toHaveBeenCalledWith(pool, sessionId);
 expect(mocks.session).toHaveBeenCalledOnce();
 expect(mocks.batch).toHaveBeenCalledExactlyOnceWith(context, [jobId], digest);
});
it("refuses invalid sessions before reading any batch", async () => {
 mocks.session.mockRejectedValue(new Error("UNAUTHENTICATED"));
 await expect(new CustomerInvoiceApplication(pool, sessionId).listForJobs([jobId])).rejects.toThrow("UNAUTHENTICATED");
 expect(mocks.batch).not.toHaveBeenCalled();
});
it("does not turn missing-group refusals into empty successes", async () => {
 mocks.batch.mockRejectedValue(new Error("NOT_FOUND"));
 await expect(new CustomerInvoiceApplication(pool, sessionId).listForJobs([jobId])).rejects.toThrow("NOT_FOUND");
});
