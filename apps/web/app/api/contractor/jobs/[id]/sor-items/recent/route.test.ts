import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SorSiteExtraError, sorSiteExtraErrorCodes, sorSiteExtraHttpStatus } from "@jobguard/core";
const { sorRecentItems, workspace } = vi.hoisted(() => { const sorRecentItems = vi.fn(); return { sorRecentItems, workspace: vi.fn<() => Promise<{ siteExtras: { sorRecentItems: (jobId: string) => Promise<unknown> } }>>(async () => ({ siteExtras: { sorRecentItems } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";
const jobId = "00000000-0000-4000-8000-000000000001";
const get = (query: string) => GET(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/sor-items/recent${query}`, { headers: { "x-tenant-id": crypto.randomUUID(), role: "owner" } }), { params: Promise.resolve({ id: jobId }) });
const result = () => ({ version: "site-sor-recent-items.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, sorVersionId: crypto.randomUUID(), items: [{ code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre" }] });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); sorRecentItems.mockReset(); workspace.mockClear(); sorRecentItems.mockResolvedValue(result()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3c thin Next adapter for recent items", () => {
  it("[C2] passes only the path ID; all query keys and headers are ignored", async () => {
    const response = await get(`?q=%20gutter%20&tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&jobId=forged&role=owner`);
    expect(sorRecentItems).toHaveBeenCalledExactlyOnceWith(jobId); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toMatchObject({ version: "site-sor-recent-items.v1", jobId });
  });
  it.each(["", "?q=", "?q=%20%20", "?q=ignored&tenant=forged&membership=forged&job=forged"])("recents need no search text and ignore query %s", async query => {
    const response = await get(query);
    expect(response.status).toBe(200);
    expect(sorRecentItems).toHaveBeenCalledExactlyOnceWith(jobId);
  });
  it.each(["pilot_no_charge", "production_billing", ""])("[C20] refuses %s before composition", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode); const response = await get("?q=a"); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled();
  });
  it.each(sorSiteExtraErrorCodes)("[C20] %s response has no-store, its one status and a version-and-code body", async code => {
    sorRecentItems.mockRejectedValue(new SorSiteExtraError(code)); const response = await get("?q=a"); expect(response.status).toBe(sorSiteExtraHttpStatus(code)); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("[C20] removes unexpected PostgreSQL detail", async () => {
    sorRecentItems.mockRejectedValue(new Error("PostgreSQL detail")); const response = await get("?q=a"); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" });
  });
});
