import { afterEach, beforeEach, expect, it, vi } from "vitest";
const stub = vi.hoisted(() => ({ auth: vi.fn(), contractor: vi.fn(), read: vi.fn(), save: vi.fn(), pool: {}, identityToken: undefined as string | undefined, identitySession: vi.fn(), identityContext: vi.fn() }));
vi.mock("../../lib/identity-server", () => ({ identityApplication: () => ({ session: stub.identitySession, context: stub.identityContext, allowedOrigin: "http://localhost:3000" }) }));
vi.mock("@jobguard/api/identity", () => ({ AuthError: class extends Error {}, identityStatus: () => ({ code: "UNAUTHENTICATED", status: 401 }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "jobguard_session" ? (stub.identityToken ? { value: stub.identityToken } : undefined) : ({ value: "fictional-session" }) }) }));
vi.mock("@jobguard/db", () => ({ authenticatePracticeSession: stub.auth, contractorSessionContext: stub.contractor, RequestBindingRefusedError: class extends Error {}, FirmProfileError: class extends Error { constructor(readonly code: string) { super(code); } }, FirmProfileRepository: class { read = stub.read; save = stub.save; } }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => stub.pool, practiceFailure: () => null }));
import { FirmProfileError } from "@jobguard/db";
import { GET, POST } from "./route";
const context = { tenantId: "fictional" };
const request = (origin = "http://localhost:3000", body: unknown = {}) => new Request("http://localhost:3000/api/firm-profile", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
 vi.clearAllMocks(); stub.identityToken = undefined;
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

it("uses the real company identity and refuses ambiguous memberships without falling back to practice", async () => {
 stub.identityToken = "real-company-session";
 stub.identitySession.mockResolvedValue({ memberships: [{ tenantId: "company" }], csrfToken: "csrf" });
 stub.identityContext.mockResolvedValue(context);
 expect((await GET()).status).toBe(200);
 expect(stub.identityContext).toHaveBeenCalledWith({ sessionToken: "real-company-session", requestedTenantId: "company", csrfToken: "csrf", origin: "http://localhost:3000" });
 expect(stub.auth).not.toHaveBeenCalled();
 stub.identitySession.mockResolvedValue({ memberships: [{ tenantId: "one" }, { tenantId: "two" }] });
 expect((await GET()).status).toBe(403);
 expect(stub.auth).not.toHaveBeenCalled();
});

it.each([['FORBIDDEN', 403], ['42501', 403], ['INVALID_TENANT_CONTEXT', 403], ['UNAUTHENTICATED', 401]])("maps %s refusals without reporting database unavailability", async (code, status) => {
 stub.read.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
 expect((await GET()).status).toBe(status);
});
