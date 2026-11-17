import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SorSiteExtraError, parseLogSorSiteExtra, sorSiteExtraErrorCodes, sorSiteExtraHttpStatus } from "@jobguard/core";
const { logSor, workspace } = vi.hoisted(() => { const logSor = vi.fn(); return { logSor, workspace: vi.fn<() => Promise<{ siteExtras: { logSor: (jobId: string, raw: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { logSor } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";
const jobId = "00000000-0000-4000-8000-000000000001";
const raw = (fields: Record<string, unknown> = {}) => ({ version: "log-sor-site-extra.v1", commandId: crypto.randomUUID(), sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional note", ...fields });
const post = (body: string, origin: string | undefined = "https://app.fictional.invalid", headers: Record<string, string> = {}, query = "") => POST(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/site-extras/sor${query}`, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...headers }, body }), { params: Promise.resolve({ id: jobId }) });
const logged = () => ({ version: "sor-site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, extraId: crypto.randomUUID(), state: "logged", priceSource: "server_sor", orderCheck: { outcome: "new", sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "2", instructedQuantity: null, extraQuantity: "2", orderLineScopeItemId: null } });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.fictional.invalid"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); logSor.mockReset(); workspace.mockClear(); logSor.mockResolvedValue(logged()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3c thin Next adapter for the priced log", () => {
  it("[C2] passes only the parsed body and the path ID, ignoring tenant, member and role in headers and query", async () => {
    const body = raw({ orderLineScopeItemId: crypto.randomUUID() }); const response = await post(JSON.stringify(body), "https://app.fictional.invalid", { "x-tenant-id": crypto.randomUUID(), "x-membership-id": crypto.randomUUID(), role: "owner" }, `?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
    expect(logSor).toHaveBeenCalledExactlyOnceWith(jobId, parseLogSorSiteExtra(body)); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["tenantId", "membershipId", "role", "origin", "commandType", "state", "grantId", "jobId", "netPence", "price", "unit", "ratePence", "description", "priceSource", "siteVisitId"])("[C2] refuses body authority or derived field %s before the service", async field => {
    const response = await post(JSON.stringify({ ...raw(), [field]: "tampered" })); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_COMMAND" }); expect(logSor).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["0", "-1", "1.1234567", "1e3", " 1", ""])("[C20] quantity %j is INVALID_QUANTITY before the service", async quantity => {
    const response = await post(JSON.stringify(raw({ quantity }))); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_QUANTITY" }); expect(logSor).not.toHaveBeenCalled();
  });
  it.each(["https://foreign.invalid", "null", "missing"])("[C20] refuses Origin %s before composition", async origin => {
    const request = new Request("https://app.fictional.invalid/api/contractor/jobs/ignored/site-extras/sor", { method: "POST", body: "{}", headers: origin === "missing" ? {} : { origin } }); const response = await POST(request, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(logSor).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["pilot_no_charge", "production_billing", ""])("[C20] refuses %s before composition or the database", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("[C20] malformed JSON is INVALID_COMMAND and does not call the service", async () => {
    const response = await post("{invalid"); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_COMMAND" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(sorSiteExtraErrorCodes)("[C20] %s response has no-store, its one status and a version-and-code body", async code => {
    logSor.mockRejectedValue(new SorSiteExtraError(code)); const response = await post(JSON.stringify(raw()));
    expect(response.status).toBe(sorSiteExtraHttpStatus(code)); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("[C20] removes unexpected PostgreSQL detail", async () => {
    logSor.mockRejectedValue(new Error("PostgreSQL detail and Fictional note")); const response = await post(JSON.stringify(raw()));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" }); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("[C20] success and identical replay answer 201 with the same stored result; the 409 refusals carry their codes", async () => {
    const request = JSON.stringify(raw()), stored = logged(); logSor.mockResolvedValue(stored); const first = await post(request), replay = await post(request);
    expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(await first.json()).toEqual(stored); expect(await replay.json()).toEqual(stored); expect(logSor.mock.calls[1]).toEqual(logSor.mock.calls[0]);
    for (const code of ["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"] as const) { logSor.mockRejectedValueOnce(new SorSiteExtraError(code)); const response = await post(request); expect(response.status).toBe(409); expect(await response.json()).toEqual({ version: "sor-site-extra-error.v1", code }); }
  });
});
