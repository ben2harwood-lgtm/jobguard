import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedMembership } from "@jobguard/db";
import { logSiteExtraV1, SiteExtraError, siteExtraHttpStatus } from "@jobguard/core";
const { log, workspace } = vi.hoisted(() => { const log = vi.fn(); return { log, workspace: vi.fn<() => Promise<{ siteExtras: { log: (jobId: string, raw: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { log } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";
const raw = () => ({ version: "log-site-extra.v1", commandId: crypto.randomUUID(), note: "Fictional note", description: "Fictional extra" });
const post = (body: string, origin: string | undefined = "https://app.fictional.invalid", headers: Record<string, string> = {}, query = "") => POST(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/site-extras${query}`, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...headers }, body }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.fictional.invalid"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); log.mockReset(); workspace.mockClear(); log.mockResolvedValue({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: crypto.randomUUID(), extraId: crypto.randomUUID(), state: "logged" }); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3a thin Next adapter", () => {
 it("[A8] passes only the parsed body and path ID, ignoring tenant/member/role in headers and query", async () => {
  const body = raw(); const response = await post(JSON.stringify(body), "https://app.fictional.invalid", { "x-tenant-id": crypto.randomUUID(), "x-membership-id": crypto.randomUUID(), role: "owner" }, `?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
  expect(log).toHaveBeenCalledExactlyOnceWith("00000000-0000-4000-8000-000000000001", logSiteExtraV1.parse(body)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["tenantId", "membershipId", "role", "origin", "commandType", "state", "grantId"])("[A8] refuses body authority field %s before service", async field => {
  const response = await post(JSON.stringify({ ...raw(), [field]: "tampered" })); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "INVALID_COMMAND" }); expect(log).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["https://foreign.invalid", "null", "missing"])("[A15] refuses Origin %s before composition", async origin => {
  const request = new Request("https://app.fictional.invalid/api/contractor/jobs/ignored/site-extras", { method: "POST", body: "{}", headers: origin === "missing" ? {} : { origin } }); const response = await POST(request, { params: Promise.resolve({ id: crypto.randomUUID() }) });
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["pilot_no_charge", "production_billing", ""])("[A15] refuses %s before composition/database", async mode => { vi.stubEnv("JOBGUARD_ENV", mode); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[A15] malformed JSON is INVALID_COMMAND and does not call service", async () => { const response = await post("{invalid"); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "INVALID_COMMAND" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it.each(["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "TRACK_FORBIDDEN", "EXTRA_FORBIDDEN", "INVALID_COMMAND", "NOT_FOUND", "COMMAND_CONFLICT", "STALE_REVISION", "SITE_EXTRA_UNAVAILABLE"] as const)("[A15] %s response has no-store and code-only body", async code => { log.mockRejectedValue(new SiteExtraError(code)); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(siteExtraHttpStatus(code)); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[A15] removes unexpected PostgreSQL detail", async () => { log.mockRejectedValue(new Error("PostgreSQL detail and Fictional note")); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "SITE_EXTRA_UNAVAILABLE" }); expect(response.headers.get("cache-control")).toBe("no-store"); });
});

it("[A17] tampered tenant/member/role in every transport place cannot select context", async () => {
 const { Pool } = await import("pg"), { ContractorRepository, SiteExtraRepository, withTenant } = await import("@jobguard/db"), { createWorkspaceApplication } = await import("@jobguard/api/workspace");
 const pool = new Pool(), sessionId = crypto.randomUUID();
 const persisted = { tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() } as AuthenticatedMembership;
 const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(persisted);
 const marker = new Error("stamp accepted before connection"); vi.spyOn(pool, "connect").mockRejectedValue(marker);
 const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockImplementation(async (context, actor) => {
  expect(actor).toBe(persisted); expect(context.tenantId).toBe(persisted.tenantId);
  await expect(withTenant(pool, context, async () => undefined)).rejects.toBe(marker); return { variationId: crypto.randomUUID() };
 });
 workspace.mockResolvedValueOnce(createWorkspaceApplication({ pool, sessionId }));
 try {
  const response = await post(JSON.stringify(raw()), "https://app.fictional.invalid", { "x-tenant-id": crypto.randomUUID(), "x-membership-id": crypto.randomUUID(), role: "owner", cookie: `jg_session=${sessionId}; tenantId=${crypto.randomUUID()}; membershipId=${crypto.randomUUID()}; role=owner` }, `?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
  expect(response.status).toBe(200); expect(lookup).toHaveBeenCalledExactlyOnceWith(sessionId); expect(repo).toHaveBeenCalledOnce();
  for (const field of ["tenantId", "membershipId", "role"]) {
   const response = await post(JSON.stringify({ ...raw(), [field]: field === "role" ? "owner" : crypto.randomUUID() })); expect(response.status).toBe(400);
  }
  expect(repo).toHaveBeenCalledOnce();
  const request = new Request(`https://app.fictional.invalid/api/contractor/jobs/tampered/site-extras?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`, { method: "POST", headers: { origin: "https://app.fictional.invalid" }, body: JSON.stringify(raw()) });
  workspace.mockResolvedValueOnce(createWorkspaceApplication({ pool, sessionId }));
  const invalidPathResponse = await POST(request, { params: Promise.resolve({ id: `tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner` }) }); expect(invalidPathResponse.status).toBe(404); expect(repo).toHaveBeenCalledOnce();
 } finally { vi.restoreAllMocks(); await pool.end(); }
});
