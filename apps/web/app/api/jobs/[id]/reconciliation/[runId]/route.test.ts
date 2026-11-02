import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reportFixture, reportId, reportScope } from "../../../../../../e2e/helpers/reconciliation-report";
const mocks = vi.hoisted(() => ({ read: vi.fn(), context: vi.fn(), pool: vi.fn(), session: "10000000-0000-4000-8000-000000000030" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.session ? { value: mocks.session } : undefined }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: mocks.pool }));
vi.mock("@jobguard/db", () => ({ contractorSessionContext: mocks.context, FinancialReconciliationQueueRepository: class { read = mocks.read; } }));
import * as route from "./route";
const get = (id = reportScope.jobId, runId = reportId(20)) => route.GET(new Request("http://localhost/report"), { params: Promise.resolve({ id, runId }) });
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 mocks.session = reportId(30); mocks.pool.mockReturnValue({}); mocks.context.mockResolvedValue({ tenantId: reportScope.tenantId });
 mocks.read.mockResolvedValue({ ...reportFixture(), snapshot: { private: "do not send source rows" } });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("reads only the requested run with the session-derived context and never returns the snapshot", async () => {
 const result = await get(); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
 expect(await result.json()).toEqual(reportFixture());
 expect(mocks.context).toHaveBeenCalledWith({}, reportId(30));
 expect(mocks.read).toHaveBeenCalledWith({ tenantId: reportScope.tenantId }, reportId(30), reportScope.jobId, reportId(20));
 expect(Object.keys(route)).toEqual(["GET"]);
});
it("refuses missing sessions, malformed IDs and non-synthetic mode before source reads", async () => {
 mocks.session = undefined; expect((await get()).status).toBe(401);
 mocks.session = reportId(30); expect((await get("not-a-job")).status).toBe(400);
 vi.stubEnv("JOBGUARD_ENV", "production"); expect((await get()).status).toBe(403);
 expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.pool).not.toHaveBeenCalled();
});
it("returns redacted 403 for an operator without finance access", async () => {
 mocks.read.mockRejectedValue(Object.assign(new Error("private SQL details"), { code: "42501" }));
 const result = await get(); expect(result.status).toBe(403);
 expect(await result.json()).toEqual({ version: "financial-reconciliation-screen-error.v1", code: "RECONCILIATION_FORBIDDEN" });
 expect(result.headers.get("cache-control")).toBe("no-store");
});
it("another tenant's run is invisible and errors never disclose source details", async () => {
 mocks.read.mockResolvedValue(null); const foreign = await get(reportId(99), reportId(98));
 expect(foreign.status).toBe(404); expect(JSON.stringify(await foreign.json())).not.toContain(reportScope.tenantId);
 mocks.context.mockRejectedValueOnce(Object.assign(new Error("secret membership detail"), { code: "UNAUTHENTICATED" }));
 expect((await get()).status).toBe(401);
 mocks.read.mockRejectedValue(new Error("secret database detail"));
 const failed = await get(); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("secret");
});
