import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JobImportV3Repository, JobImportV3Error } from "@jobguard/db";

const state = vi.hoisted(() => ({ authenticate: vi.fn(), findMembership: vi.fn() }));
const tenant = "00000000-0000-4000-8000-000000000001", origin = "https://company.invalid";
vi.mock("@jobguard/api/workspace", async () => ({
 ...await import("../../../../../../../../api/src/job-import-v3.application.js"),
 ...await import("../../../../../../../../api/src/meter-today.application.js"),
 JobImportV3Error: (await import("@jobguard/db")).JobImportV3Error,
}));
vi.mock("../../../../../../lib/identity-server", () => ({
 identityCredentials: async (request: Request) => ({ sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: request.headers.get("origin") ?? undefined }),
 identityApplication: () => ({ allowedOrigin: origin, provider: { authenticate: state.authenticate, findMembership: state.findMembership, digest: () => "a".repeat(64) } }),
}));
vi.mock("../../../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}), practiceFailure: () => null }));
import { GET, POST } from "./route";
const params = (action: string) => ({ params: Promise.resolve({ id: tenant, action }) });
const request = (value: string | undefined = origin, body = "{}") => new Request(`${origin}/api/meter/jobs/${tenant}/import-v3/adopt`, { method: "POST", headers: value === undefined ? {} : { origin: value }, body });
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 state.authenticate.mockResolvedValue({ identityUserId: tenant, sessionId: tenant, csrfToken: "c".repeat(24) });
 state.findMembership.mockResolvedValue({ id: tenant, identityUserId: tenant, tenantId: tenant, role: "owner" });
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
it.each(["preview", "adopt", "catch"])("%s requires an explicit matching Origin before repository access", async action => {
 const method = action === "catch" ? "assessCatch" : action as "preview" | "adopt";
 const write = vi.spyOn(JobImportV3Repository.prototype, method);
 for (const value of [null, "https://foreign.invalid", "null"]) {
  const req = value === null ? new Request(origin, { method: "POST", body: "{}" }) : request(value);
  const response = await POST(req, params(action));
  expect(response.status).toBe(value === "null" ? 400 : 403); expect(response.headers.get("cache-control")).toBe("no-store");
 }
 expect(state.authenticate).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});
it.each(["source", "read"] as const)("%s uses current membership and is never cached", async action => {
 const read = vi.spyOn(JobImportV3Repository.prototype, action).mockResolvedValue({ saved: true } as never);
 const response = await GET(new Request(origin), params(action));
 expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), tenant);
 state.findMembership.mockResolvedValueOnce(undefined);
 expect((await GET(new Request(origin), params(action))).status).toBe(403);
 expect(read).toHaveBeenCalledTimes(1);
});
it.each(["PLAN_LIMIT_REACHED", "COMMAND_CONFLICT", "REVISION_CONFLICT", "FORBIDDEN"] as const)("preserves typed adoption failure %s", async code => {
 vi.spyOn(JobImportV3Repository.prototype, "adopt").mockRejectedValue(new JobImportV3Error(code));
 const response = await POST(request(), params("adopt"));
 expect(response.status).toBe(code === "FORBIDDEN" ? 403 : 409); expect(await response.json()).toEqual({ code });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it("malformed JSON reaches the authorized schema boundary as null", async () => {
 const preview = vi.spyOn(JobImportV3Repository.prototype, "preview").mockRejectedValue(new JobImportV3Error("INVALID_IMPORT"));
 const response = await POST(request(origin, "{"), params("preview"));
 expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: "INVALID_IMPORT" });
 expect(preview).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), tenant, null);
});
it.each([[GET, "adopt"], [POST, "read"], [POST, "unknown"]] as const)("rejects an unsupported method/action pair", async (handler, action) => {
 expect((await handler(request(), params(action))).status).toBe(404);
 expect(state.authenticate).not.toHaveBeenCalled();
});
