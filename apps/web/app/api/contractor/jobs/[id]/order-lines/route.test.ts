import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteVisitError, siteVisitErrorCodes, siteVisitHttpStatus } from "@jobguard/core";
const { orderLines, workspace } = vi.hoisted(() => { const orderLines = vi.fn(); return { orderLines, workspace: vi.fn<() => Promise<{ siteExtras: { orderLines: (jobId: string) => Promise<unknown> } }>>(async () => ({ siteExtras: { orderLines } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";
const job = "00000000-0000-4000-8000-000000000001";
const result = () => ({ version: "site-order-lines.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job, workOrderId: crypto.randomUUID(), revision: 2, lines: [] });
const get = (headers: Record<string, string> = {}, query = "") => GET(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/order-lines${query}`, { headers }), { params: Promise.resolve({ id: job }) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); orderLines.mockReset(); workspace.mockClear(); orderLines.mockResolvedValue(result()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3b thin Next adapter: order lines", () => {
 it("[B17] passes only the path ID, ignoring tenant, member and role in headers and query, and answers 200 with no-store", async () => {
  const response = await get({ "x-tenant-id": crypto.randomUUID(), role: "owner" }, `?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
  expect(orderLines).toHaveBeenCalledExactlyOnceWith(job); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual(await orderLines.mock.results[0]!.value);
 });
 it.each(["pilot_no_charge", "production_billing", ""])("[B18] refuses mode %j before composition or the database", async mode => { vi.stubEnv("JOBGUARD_ENV", mode); const response = await get(); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it.each(siteVisitErrorCodes)("[B18] %s answers its one status with a code-only body and no-store", async code => { orderLines.mockRejectedValue(new SiteVisitError(code)); const response = await get(); expect(response.status).toBe(siteVisitHttpStatus(code)); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[B18] removes unexpected PostgreSQL detail", async () => { orderLines.mockRejectedValue(new Error("PostgreSQL detail and a Fictional resident")); const response = await get(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "SITE_VISIT_UNAVAILABLE" }); });
});
