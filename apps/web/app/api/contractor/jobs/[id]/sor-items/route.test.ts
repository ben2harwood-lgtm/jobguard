import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SorSiteExtraError, sorSiteExtraErrorCodes, sorSiteExtraHttpStatus } from "@jobguard/core";
const { sorItems, workspace } = vi.hoisted(() => { const sorItems = vi.fn(); return { sorItems, workspace: vi.fn<() => Promise<{ siteExtras: { sorItems: (jobId: string, query: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { sorItems } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";
const jobId = "00000000-0000-4000-8000-000000000001";
const get = (query: string) => GET(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/sor-items${query}`, { headers: { "x-tenant-id": crypto.randomUUID(), role: "owner" } }), { params: Promise.resolve({ id: jobId }) });
const result = () => ({ version: "site-sor-items.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, sorVersionId: crypto.randomUUID(), items: [{ code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre" }], truncated: false });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); sorItems.mockReset(); workspace.mockClear(); sorItems.mockResolvedValue(result()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3c thin Next adapter for the price-list search", () => {
  it("[C2] passes only the parsed text and the path ID; every other query key and header is ignored", async () => {
    const response = await get(`?q=%20gutter%20&tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
    expect(sorItems).toHaveBeenCalledExactlyOnceWith(jobId, { q: "gutter" }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toMatchObject({ version: "site-sor-items.v1", jobId });
  });
  it.each(["", "?q=", "?q=%20%20", `?q=${"x".repeat(81)}`])("[C20] a missing or empty search text %j is INVALID_COMMAND and nothing is composed (Q10: no recent list)", async query => {
    const response = await get(query); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_COMMAND" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["pilot_no_charge", "production_billing", ""])("[C20] refuses %s before composition", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode); const response = await get("?q=a"); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled();
  });
  it.each(sorSiteExtraErrorCodes)("[C20] %s response has no-store, its one status and a version-and-code body", async code => {
    sorItems.mockRejectedValue(new SorSiteExtraError(code)); const response = await get("?q=a"); expect(response.status).toBe(sorSiteExtraHttpStatus(code)); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("[C20] removes unexpected PostgreSQL detail", async () => {
    sorItems.mockRejectedValue(new Error("PostgreSQL detail")); const response = await get("?q=a"); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" });
  });
});
