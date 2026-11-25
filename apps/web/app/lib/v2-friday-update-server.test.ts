import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn(), read: vi.fn(), command: vi.fn(),
  credentials: {} as Record<string, string>, allowedOrigin: "https://phone.invalid" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "practice-credential" }) }) }));
vi.mock("./identity-server", () => ({ identityCredentials: async () => state.credentials,
  identityApplication: () => ({ allowedOrigin: state.allowedOrigin, session: state.session,
    provider: { authenticate: state.authenticate, findMembership: state.findMembership } }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", async importOriginal => ({ ...await importOriginal<typeof import("@jobguard/api/workspace")>(),
  FridayUpdateApplication: class { read = state.read; command = state.command; } }));
import { fridayUpdateRequest } from "./v2-friday-update-server";
const tenant = "00000000-0000-4000-8000-000000000001";
const job = "00000000-0000-4000-8000-000000000002";
const csrf = "c".repeat(24);
const body = { schema: "friday-command.v1", commandId: job, week: "2026-11-23", expectedVersion: 0,
  action: "prepare", clientCreatedAt: "2026-11-25T00:00:00Z" };
function request(origin: string | null = "https://phone.invalid", extra = {}, url = "http://127.0.0.1:3400/api/jobs/x/friday-update") {
  return new Request(url, { method: "POST", headers: { ...(origin ? { origin } : {}), ...extra }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", "https://phone.invalid");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: csrf }; state.allowedOrigin = "https://phone.invalid";
  state.session.mockResolvedValue({ csrfToken: csrf, memberships: [{ id: tenant, tenantId: tenant, role: "owner" }] });
  state.authenticate.mockResolvedValue(Object.defineProperty({ identityUserId: tenant, sessionId: job, csrfToken: csrf }, "sessionCredential",
    { value: createHmac("sha256", "fictional-test-secret").update("session").digest("hex") }));
  state.findMembership.mockResolvedValue({ id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner" });
  state.command.mockResolvedValue({ sequence: 1 }); state.read.mockResolvedValue(null);
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("V2-K3 route origin and identity", () => {
  it("accepts the allowed phone origin with an internal HTTP request URL", async () => {
    const result = await fridayUpdateRequest(request(), job);
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(state.command).toHaveBeenCalledWith(job, body);
  });
  it.each([null, "https://foreign.invalid", "http://127.0.0.1:3400"])("refuses origin %s even with forged forwarded headers", async origin => {
    expect((await fridayUpdateRequest(request(origin, { "x-forwarded-host": "phone.invalid", "x-forwarded-proto": "https" }), job)).status).toBe(404);
    expect(state.command).not.toHaveBeenCalled();
  });
  it("refuses a missing configured origin even if Origin equals the request URL", async () => {
    vi.stubEnv("AUTH_ALLOWED_ORIGIN", "");
    expect((await fridayUpdateRequest(request("http://127.0.0.1:3400"), job)).status).toBe(404);
    expect(state.command).not.toHaveBeenCalled();
  });
  it.each(["", "wrong"])("refuses invalid CSRF %s", async csrfToken => {
    state.credentials.csrfToken = csrfToken;
    expect((await fridayUpdateRequest(request(), job)).status).toBe(404); expect(state.command).not.toHaveBeenCalled();
  });
  it.each(["pilot_no_charge", "production_billing"])("returns not-found outside synthetic mode %s", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    expect((await fridayUpdateRequest(request(), job)).status).toBe(404); expect(state.session).not.toHaveBeenCalled();
  });
  it("returns not-found outside V2 and for caller-supplied authority", async () => {
    expect((await fridayUpdateRequest(request(undefined, { "x-tenant-id": tenant }), job)).status).toBe(404);
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await fridayUpdateRequest(request(), job)).status).toBe(404); expect(state.command).not.toHaveBeenCalled();
  });
  it("requires an owner and hides unexpected errors", async () => {
    state.session.mockResolvedValueOnce({ memberships: [] });
    expect((await fridayUpdateRequest(request(), job)).status).toBe(404);
    state.command.mockRejectedValue(new Error("private diary and database secret"));
    const response = await fridayUpdateRequest(request(), job);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "FRIDAY_UNAVAILABLE" });
  });
});
