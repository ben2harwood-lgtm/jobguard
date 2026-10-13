import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteVisitError, siteVisitErrorCodes, siteVisitHttpStatus } from "@jobguard/core";
const { assignedJobs, workspace } = vi.hoisted(() => { const assignedJobs = vi.fn(); return { assignedJobs, workspace: vi.fn<() => Promise<{ siteExtras: { assignedJobs: () => Promise<unknown> } }>>(async () => ({ siteExtras: { assignedJobs } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";
const result = () => ({ version: "site-assigned-jobs.v1", environment: "synthetic_demo", realExternalActions: 0, jobs: [], truncated: false });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); assignedJobs.mockReset(); workspace.mockClear(); assignedJobs.mockResolvedValue(result()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3b thin Next adapter: assigned jobs", () => {
 it("[B17] takes no input at all (a tenant, member or role in headers or query changes nothing) and answers 200 with no-store", async () => {
  const response = await GET(); expect(assignedJobs).toHaveBeenCalledExactlyOnceWith(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual(result());
 });
 it.each(["pilot_no_charge", "production_billing", ""])("[B18] refuses mode %j before composition or the database", async mode => { vi.stubEnv("JOBGUARD_ENV", mode); const response = await GET(); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it.each(siteVisitErrorCodes)("[B18] %s answers its one status with a code-only body and no-store", async code => { assignedJobs.mockRejectedValue(new SiteVisitError(code)); const response = await GET(); expect(response.status).toBe(siteVisitHttpStatus(code)); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[B18] removes unexpected PostgreSQL detail", async () => { assignedJobs.mockRejectedValue(new Error("PostgreSQL detail and a Fictional resident")); const response = await GET(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "SITE_VISIT_UNAVAILABLE" }); });
});
