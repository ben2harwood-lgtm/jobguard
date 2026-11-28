import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { read, command, cookie, pool, denied, identitySession, authenticate, findMembership, pair } = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), cookie: vi.fn(), pool: vi.fn(), denied: vi.fn(), identitySession: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn(), pair: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: pool, practiceFailure: denied }));
vi.mock("../../../../lib/linked-practice-entry", () => ({ enforcePracticePair: pair }));
vi.mock("@jobguard/api/workspace", () => ({
  RamsApplication: class { read = read; command = command; },
  RamsError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
vi.mock("../../../../lib/identity-server", () => ({ identityApplication: () => ({
  allowedOrigin: process.env.AUTH_ALLOWED_ORIGIN, session: identitySession, provider: { authenticate, findMembership },
}) }));
vi.mock("@jobguard/db", () => ({ WorkPlanError: class extends Error { constructor(readonly code: string) { super(code); } }, verifiedTenantContextFromMembership: (m: {tenantId: string}) => ({tenantId: m.tenantId}) }));
vi.mock("@jobguard/api/identity", async () => ({ ...await import("../../../../../../api/src/auth/principal-bridge.js"), ...await import("../../../../../../api/src/auth/auth-provider.js") }));
import { RamsError } from "@jobguard/api/workspace";
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "fictional-job" }) };
const url = "http://127.0.0.1:3400/api/jobs/fictional-job/rams";
const allowedOrigin = "https://fictional.invalid";
const csrfToken = "c".repeat(32);
const membership = { id: "11111111-1111-4111-8111-111111111112", tenantId: "11111111-1111-4111-8111-111111111111", identityUserId: "11111111-1111-4111-8111-111111111113", role: "owner" };
function write(headers: Record<string, string> = {}) {
  return POST(new Request(url, { method: "POST", headers: { origin: allowedOrigin, "x-csrf-token": csrfToken, ...headers }, body: "{}" }), context);
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", allowedOrigin);
  cookie.mockReturnValue({ value: "s".repeat(32) }); denied.mockReturnValue(null);
  identitySession.mockResolvedValue({ memberships: [membership] });
  authenticate.mockResolvedValue({ csrfToken, sessionCredential: "a".repeat(64) });
  findMembership.mockResolvedValue(membership);
  pair.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());
describe("Q06 RAMS thin Next adapter", () => {
  it("returns 404 without composing any application when V2 is off or outside synthetic demo", async () => {
    for (const [key, value] of [["JOBGUARD_LOCAL_V2", "0"], ["JOBGUARD_ENV", "pilot_no_charge"], ["JOBGUARD_ENV", "production_billing"]]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv(key!, value!);
      expect((await GET(new Request(url), context)).status).toBe(404);
      expect((await POST(new Request(url, { method: "POST" }), context)).status).toBe(404);
    }
    expect(pool).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
  });
  it("refuses absent and foreign origins before any write", async () => {
    for (const origin of [undefined, "https://other.invalid"]) {
      const response = await POST(new Request(url, { method: "POST", headers: origin ? { origin } : {} }), context);
      expect(response.status).toBe(403);
    }
    expect(command).not.toHaveBeenCalled(); expect(pool).not.toHaveBeenCalled();
  });
  it("accepts the configured HTTPS origin through an internal HTTP request URL", async () => {
    command.mockResolvedValue({ revision: 1 });
    expect((await write()).status).toBe(200);
    expect(authenticate).toHaveBeenCalledWith("s".repeat(32));
    expect(findMembership).toHaveBeenCalled();
    expect(command).toHaveBeenCalledOnce();
  });
  it("does not trust forged forwarded headers", async () => {
    expect((await write({ origin: "https://foreign.invalid", "x-forwarded-host": "fictional.invalid", "x-forwarded-proto": "https" })).status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });
  it("refuses an unset allowed origin even when Origin matches the request URL", async () => {
    vi.stubEnv("AUTH_ALLOWED_ORIGIN", undefined);
    expect((await write({ origin: new URL(url).origin })).status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });
  it("refuses missing or incorrect CSRF tokens before any command", async () => {
    for (const token of ["", "wrong".repeat(8)]) expect((await write({ "x-csrf-token": token })).status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });
  it("reads persisted application results without caching", async () => {
    const result = { version: "rams-screen.v1", drafts: [] }; read.mockResolvedValue(result);
    const response = await GET(new Request(url), context);
    expect(await response.json()).toEqual(result); expect(read).toHaveBeenCalledWith("fictional-job");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("passes the exact write and returns stale and invalid commands as typed errors", async () => {
    const body = { version: "rams-command.v1", action: "generate" };
    for (const [code, status] of [["RAMS_VERSION_CONFLICT", 409], ["RAMS_INVALID_COMMAND", 400]] as const) {
      command.mockRejectedValue(new RamsError(code));
      const response = await POST(new Request(url, { method: "POST", headers: { origin: allowedOrigin, "x-csrf-token": csrfToken }, body: JSON.stringify(body) }), context);
      expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
      expect(command).toHaveBeenCalledWith("fictional-job", body);
    }
  });
  it("preserves authentication and not-found failures without leaking details", async () => {
    const failure = new Error("untrusted database text"); read.mockRejectedValue(failure);
    denied.mockReturnValue(new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 }));
    const response = await GET(new Request(url), context);
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  });
  it("checks the linked practice pairing before any read or write reaches the application", async () => {
    command.mockResolvedValue({ revision: 1 }); read.mockResolvedValue({ version: "rams-screen.v1", drafts: [] });
    expect((await GET(new Request(url), context)).status).toBe(200);
    expect((await write()).status).toBe(200);
    expect(pair).toHaveBeenCalledTimes(2); expect(pair).toHaveBeenCalledWith(undefined, "s".repeat(32));
    pair.mockClear(); read.mockClear(); command.mockClear();
    const unpaired = Object.assign(new Error("unpaired"), { code: "UNAUTHENTICATED" });
    pair.mockRejectedValue(unpaired);
    denied.mockImplementation((error: unknown) => error === unpaired ? new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 }) : null);
    expect((await GET(new Request(url), context)).status).toBe(401);
    expect((await write()).status).toBe(401);
    expect(read).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
  });
});
