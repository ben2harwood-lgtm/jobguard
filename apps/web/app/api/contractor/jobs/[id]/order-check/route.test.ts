import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SorSiteExtraError, sorSiteExtraErrorCodes, sorSiteExtraHttpStatus } from "@jobguard/core";
const { orderCheck, workspace } = vi.hoisted(() => { const orderCheck = vi.fn(); return { orderCheck, workspace: vi.fn<() => Promise<{ siteExtras: { orderCheck: (jobId: string, query: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { orderCheck } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";
const jobId = "00000000-0000-4000-8000-000000000001";
const get = (query: string) => GET(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/order-check${query}`, { headers: { "x-tenant-id": crypto.randomUUID(), role: "owner" } }), { params: Promise.resolve({ id: jobId }) });
const result = () => ({ version: "site-order-check.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, orderCheck: { outcome: "already_on_order", sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "3", instructedQuantity: "4", orderLineScopeItemId: crypto.randomUUID() } });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); orderCheck.mockReset(); workspace.mockClear(); orderCheck.mockResolvedValue(result()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3c thin Next adapter for the order check", () => {
  it("[C2] passes only the parsed query and the path ID; every other query key and header is ignored", async () => {
    const line = crypto.randomUUID(); const response = await get(`?sorCode=CLEAR-GUTTER&quantity=3&orderLine=${line}&tenantId=${crypto.randomUUID()}&role=owner`);
    expect(orderCheck).toHaveBeenCalledExactlyOnceWith(jobId, { sorCode: "CLEAR-GUTTER", quantity: "3", orderLine: line }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    await get("?sorCode=A&quantity=1"); expect(orderCheck.mock.calls[1]).toEqual([jobId, { sorCode: "A", quantity: "1" }]);
  });
  it.each([["?quantity=2", "INVALID_COMMAND"], ["?sorCode=A", "INVALID_QUANTITY"], ["?sorCode=A&quantity=0", "INVALID_QUANTITY"], ["?sorCode=A&quantity=1.1234567", "INVALID_QUANTITY"], ["?sorCode=A&quantity=1&orderLine=nope", "INVALID_COMMAND"], ["", "INVALID_COMMAND"]])("[C20] query %j is %s with status 400 and nothing is composed", async (query, code) => {
    const response = await get(query); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["pilot_no_charge", "production_billing", ""])("[C20] refuses %s before composition", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode); const response = await get("?sorCode=A&quantity=1"); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled();
  });
  it.each(sorSiteExtraErrorCodes)("[C20] %s response has no-store, its one status and a version-and-code body", async code => {
    orderCheck.mockRejectedValue(new SorSiteExtraError(code)); const response = await get("?sorCode=A&quantity=1"); expect(response.status).toBe(sorSiteExtraHttpStatus(code)); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("[C20] removes unexpected PostgreSQL detail", async () => {
    orderCheck.mockRejectedValue(new Error("PostgreSQL detail")); const response = await get("?sorCode=A&quantity=1"); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" });
  });
});
