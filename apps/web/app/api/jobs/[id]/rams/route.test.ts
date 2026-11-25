import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { read, command, cookie, pool, denied } = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), cookie: vi.fn(), pool: vi.fn(), denied: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: pool, practiceFailure: denied }));
vi.mock("@jobguard/api/workspace", () => ({
  RamsApplication: class { read = read; command = command; },
  RamsError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
vi.mock("@jobguard/db", () => ({ WorkPlanError: class extends Error { constructor(readonly code: string) { super(code); } } }));
import { RamsError } from "@jobguard/api/workspace";
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "fictional-job" }) };
const url = "https://fictional.invalid/api/jobs/fictional-job/rams";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  cookie.mockReturnValue({ value: "fictional-session" }); denied.mockReturnValue(null);
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
      const response = await POST(new Request(url, { method: "POST", headers: { origin: "https://fictional.invalid" }, body: JSON.stringify(body) }), context);
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
});
