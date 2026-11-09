import { afterEach, beforeEach, expect, it, vi } from "vitest";
const stub = vi.hoisted(() => ({ auth: vi.fn(), contractor: vi.fn(), read: vi.fn(), save: vi.fn(), pool: {} }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fictional-session" }) }) }));
vi.mock("@jobguard/db", () => ({ authenticatePracticeSession: stub.auth, contractorSessionContext: stub.contractor, RequestBindingRefusedError: class extends Error {} }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => stub.pool, practiceFailure: () => null }));
vi.mock("../../../../../packages/db/src/firm-profile-repository", async original => ({ ...await original<typeof import("../../../../../packages/db/src/firm-profile-repository")>(),
 FirmProfileRepository: class { read = stub.read; save = stub.save; },
}));
import { FirmProfileError } from "../../../../../packages/db/src/firm-profile-repository";
import { GET, POST } from "./route";
const context = { tenantId: "fictional" };
const request = (origin = "http://localhost:3000", body: unknown = {}) => new Request("http://localhost:3000/api/firm-profile", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
 vi.clearAllMocks();
 for (const key of ["VERCEL", "CF_PAGES", "CF_PAGES_URL", "JOBGUARD_HOSTING", "JOBGUARD_ALLOWED_ORIGINS", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(key, "");
 stub.auth.mockResolvedValue({ context }); stub.read.mockResolvedValue({ profile: null, canSave: true }); stub.save.mockResolvedValue({ profile: {}, canSave: true });
});
afterEach(() => vi.unstubAllEnvs());
it("reads only the server-resolved company and prevents caching", async () => {
 const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(stub.read).toHaveBeenCalledWith(context); expect(stub.auth).toHaveBeenCalledWith(stub.pool, "fictional-session");
});
it("refuses a cross-origin save before authenticating or writing", async () => {
 expect((await POST(request("https://attacker.invalid"))).status).toBe(403);
 expect(stub.auth).not.toHaveBeenCalled(); expect(stub.save).not.toHaveBeenCalled();
});
it("passes owner-only and schema refusals back without a successful save claim", async () => {
 for (const [code, status] of [["FORBIDDEN",403],["INVALID_PROFILE",400]] as const) {
  stub.save.mockRejectedValueOnce(new FirmProfileError(code)); expect((await POST(request())).status).toBe(status);
 }
});
it("falls back to a persisted company session only on authentication refusal", async () => {
 stub.auth.mockRejectedValueOnce(new Error("UNAUTHENTICATED")); stub.contractor.mockResolvedValueOnce(context);
 expect((await GET()).status).toBe(200); expect(stub.contractor).toHaveBeenCalledWith(stub.pool, "fictional-session");
 stub.contractor.mockClear(); stub.auth.mockRejectedValueOnce(new Error("database unavailable"));
 expect((await GET()).status).toBe(503); expect(stub.contractor).not.toHaveBeenCalled();
});
it("does not turn a missing session into a company profile", async () => {
 stub.auth.mockRejectedValueOnce(new Error("UNAUTHENTICATED")); stub.contractor.mockRejectedValueOnce(Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" }));
 expect((await GET()).status).toBe(401); expect(stub.read).not.toHaveBeenCalled();
});
