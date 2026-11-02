import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));
vi.mock("./practice-session.js", () => ({ authorizePracticeJob: ports.auth }));
vi.mock("./tenant-context.js", () => ({ withTenant: async (_pool: unknown, _context: unknown, read: (db: unknown) => unknown) => read({ $client: { query: ports.query } }) }));
import { ShadowDemoApprovalReader } from "./shadow-demo-approval-reader.js";
const tenantId = randomUUID(), jobId = randomUUID(), variationId = randomUUID();
beforeEach(() => {
 vi.clearAllMocks();
 ports.auth.mockResolvedValue({ context: { tenantId } });
 ports.query.mockImplementation(async (sql: string) => {
  // Match the runtime role's actual denied tables; the former JOIN throws here.
  if (/app\.(customer_variation_approval|customer_portal_session)\b/u.test(sql)) throw new Error("permission denied");
  return { rows: sql.includes("final_account_lock") ? [{ id: randomUUID() }] : [{ variationId, approvedAt: null }] };
 });
});
it("runtime no-approval reads do not require private provenance table privileges", async () => {
 expect(await new ShadowDemoApprovalReader({} as Pool, randomUUID()).read(jobId)).toEqual({ complete: false, approvals: [] });
 expect(ports.query).toHaveBeenLastCalledWith(expect.stringContaining("a.method='customer_authenticated'"), [tenantId, jobId]);
});
it("returns exact portal-approved entries through the runtime-readable approval row", async () => {
 const approvedAt = new Date("2026-10-31T08:00:00.000Z");
 ports.query.mockResolvedValueOnce({ rows: [{ id: randomUUID() }] }).mockResolvedValueOnce({ rows: [{ variationId, approvedAt }] });
 expect(await new ShadowDemoApprovalReader({} as Pool, randomUUID()).read(jobId)).toEqual({ complete: true, approvals: [{ variationId, approvedAt: approvedAt.toISOString(), method: "customer_portal" }] });
});
