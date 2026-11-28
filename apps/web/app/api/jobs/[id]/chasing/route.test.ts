import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { cookie, pair, linked, verify, read, command, pool, failure } = vi.hoisted(() => ({
  cookie: vi.fn(), pair: vi.fn(), linked: vi.fn(), verify: vi.fn(), read: vi.fn(), command: vi.fn(), pool: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../lib/linked-practice-entry", () => ({ enforcePracticePair: pair, authenticateLinkedPractice: linked }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: pool, practiceFailure: failure }));
vi.mock("@jobguard/api/identity", () => ({
  AuthError: class extends Error { constructor(readonly code: string) { super(code); } },
  resolveVerifiedTenantContext: verify,
}));
vi.mock("@jobguard/db", () => ({
  V2ChaseRepository: class { read = read; command = command; },
  V2ChaseError: class extends Error { constructor(readonly code: string) { super(code); } },
  requireV2Chasing: () => {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("dark");
  },
}));
import { AuthError } from "@jobguard/api/identity";
import { GET, POST } from "./route";
const jobId = "e2020000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: jobId }) };
const phoneOrigin = "https://fictional.invalid";
const tenantId = "e2020000-0000-4000-8000-000000000002";
const csrfToken = "fictional-csrf-token-for-practice";
const request = (origin: string | null = phoneOrigin, body = "{}", csrf: string | null = csrfToken) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  if (csrf) headers.set("x-csrf-token", csrf);
  return new Request(`http://127.0.0.1:3400/api/jobs/${jobId}/chasing`, { method: "POST", headers, body });
};
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", phoneOrigin);
  cookie.mockImplementation((name: string) => ({ value: name === "jg_session" ? "practice-token" : "identity-token" }));
  failure.mockReturnValue(null);
  linked.mockResolvedValue({ application: { provider: "identity-provider", allowedOrigin: phoneOrigin },
    session: { memberships: [{ tenantId }] } });
  verify.mockResolvedValue({ tenantId });
  read.mockResolvedValue({ version: "v2-chase-view.v1", enabled: false, items: [] });
  command.mockResolvedValue({ captured: 0, revision: 1 });
});
afterEach(() => vi.unstubAllEnvs());
describe("V2-K4 authenticated route", () => {
  it("reads through the paired session and makes responses uncacheable", async () => {
    const response = await GET(new Request("https://fictional.invalid"), params);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(pair).toHaveBeenCalled(); expect(read).toHaveBeenCalledWith("practice-token", jobId);
  });
  it.each([null, "https://foreign.invalid"])("rejects absent/foreign write origin %s", async origin => {
    verify.mockRejectedValue(new AuthError("ORIGIN_FORBIDDEN"));
    expect((await POST(request(origin), params)).status).toBe(403);
    expect(verify).toHaveBeenCalledWith("identity-provider", expect.objectContaining({ origin: origin ?? undefined }), phoneOrigin);
    expect(command).not.toHaveBeenCalled();
  });
  it("does not reach the repository when a linked session pair fails", async () => {
    linked.mockRejectedValue(new Error("unpaired"));
    expect((await POST(request(), params)).status).toBe(503); expect(command).not.toHaveBeenCalled();
  });
  it("verifies the phone origin, paired identity and CSRF before forwarding the typed command over internal HTTP", async () => {
    const input = { version: "v2-chase-command.v1", action: "setting", commandId: jobId, expectedVersion: 0, enabled: true };
    expect((await POST(request(undefined, JSON.stringify(input)), params)).status).toBe(200);
    expect(linked).toHaveBeenCalledWith(pool.mock.results[0]!.value, "practice-token");
    expect(verify).toHaveBeenCalledWith("identity-provider", { sessionToken: "identity-token", requestedTenantId: tenantId,
      csrfToken, origin: phoneOrigin }, phoneOrigin);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(command.mock.invocationCallOrder[0]!);
    expect(command).toHaveBeenCalledWith("practice-token", jobId, input);
  });
  it("refuses a write when the verified context names a different firm", async () => {
    verify.mockResolvedValue({ tenantId: "e2020000-0000-4000-8000-000000000099" });
    expect((await POST(request(), params)).status).toBe(403); expect(command).not.toHaveBeenCalled();
  });
  it("rejects a write with no configured browser origin", async () => {
    vi.stubEnv("AUTH_ALLOWED_ORIGIN", "");
    expect((await POST(request(), params)).status).toBe(403);
    expect(verify).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
  });
  it("reports the identity bridge refusal when a mutation lacks a CSRF token", async () => {
    verify.mockRejectedValue(new AuthError("ORIGIN_FORBIDDEN"));
    expect((await POST(request(phoneOrigin, "{}", null), params)).status).toBe(403);
    expect(verify).toHaveBeenCalledWith("identity-provider", expect.objectContaining({ csrfToken: undefined }), phoneOrigin);
    expect(command).not.toHaveBeenCalled();
  });
  it("leaves existing non-V2 workflows alone and never invokes chase storage", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    await GET(new Request("https://fictional.invalid"), params);
    await POST(request(), params);
    expect(pool).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
  });
});
