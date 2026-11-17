import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteVisitError, siteVisitErrorCodes, siteVisitHttpStatus, startSiteVisitV1 } from "@jobguard/core";
const { startVisit, workspace } = vi.hoisted(() => { const startVisit = vi.fn(); return { startVisit, workspace: vi.fn<() => Promise<{ siteExtras: { startVisit: (jobId: string, raw: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { startVisit } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";
const job = "00000000-0000-4000-8000-000000000001";
const raw = () => ({ version: "start-site-visit.v1", commandId: crypto.randomUUID() });
const post = (body: string, origin: string | undefined = "https://app.fictional.invalid", headers: Record<string, string> = {}, query = "") => POST(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/site-visits/start${query}`, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...headers }, body }), { params: Promise.resolve({ id: job }) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.fictional.invalid"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); startVisit.mockReset(); workspace.mockClear(); startVisit.mockResolvedValue({ version: "site-visit-started.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job, visitId: crypto.randomUUID(), startedAt: "2026-10-13T09:00:00.000000Z" }); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3b thin Next adapter: start a visit", () => {
 it("[B17] passes only the parsed body and the path ID, ignoring tenant, member and role in headers and query", async () => {
  const body = raw(); const response = await post(JSON.stringify(body), "https://app.fictional.invalid", { "x-tenant-id": crypto.randomUUID(), "x-membership-id": crypto.randomUUID(), role: "owner" }, `?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
  expect(startVisit).toHaveBeenCalledExactlyOnceWith(job, startSiteVisitV1.parse(body)); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["tenantId", "membershipId", "role", "jobId", "visitId", "startedAt", "commandType", "state"])("[B17] refuses body authority field %s before the service", async field => {
  const response = await post(JSON.stringify({ ...raw(), [field]: "tampered" })); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "INVALID_COMMAND" }); expect(startVisit).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["https://foreign.invalid", "null", "missing"])("[B18] refuses Origin %s before composition", async origin => {
  const request = new Request("https://app.fictional.invalid/api/contractor/jobs/ignored/site-visits/start", { method: "POST", body: "{}", headers: origin === "missing" ? {} : { origin } }); const response = await POST(request, { params: Promise.resolve({ id: crypto.randomUUID() }) });
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(startVisit).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["pilot_no_charge", "production_billing", ""])("[B18] refuses mode %j before composition or the database", async mode => { vi.stubEnv("JOBGUARD_ENV", mode); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[B18] malformed JSON is INVALID_COMMAND and does not call the service", async () => { const response = await post("{invalid"); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "INVALID_COMMAND" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it.each(siteVisitErrorCodes)("[B18] %s answers its one status with a code-only body and no-store", async code => { startVisit.mockRejectedValue(new SiteVisitError(code)); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(siteVisitHttpStatus(code)); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[B18] removes unexpected PostgreSQL detail", async () => { startVisit.mockRejectedValue(new Error("PostgreSQL detail and a Fictional resident")); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "SITE_VISIT_UNAVAILABLE" }); });
 it("[B9] success and an identical replay answer 201 with the same stored result", async () => {
  const request = JSON.stringify(raw()), stored = { version: "site-visit-started.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job, visitId: crypto.randomUUID(), startedAt: "2026-10-13T09:00:00.000000Z" };
  startVisit.mockResolvedValue(stored); const first = await post(request), replay = await post(request);
  expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(await first.json()).toEqual(stored); expect(await replay.json()).toEqual(stored); expect(startVisit.mock.calls[1]).toEqual(startVisit.mock.calls[0]);
 });
});
