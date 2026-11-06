import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ credentials: {} as Record<string, string>, read: vi.fn(), command: vi.fn() }));
vi.mock("@jobguard/api/workspace", async () => import("../../../../../../api/src/cis-fixture.application.js"));
vi.mock("../../../../lib/identity-server", () => ({ identityApplication: () => ({ allowedOrigin: "https://company.invalid" }), identityCredentials: async () => state.credentials }));
vi.mock("../../../../lib/cis-fixture-server", () => ({ cisFixtureApplication: () => ({ read: state.read, command: state.command }) }));
import { GET, POST } from "./route";
const job = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: job }) };
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.credentials = { sessionToken: "session", origin: "forged" }; state.read.mockResolvedValue({ code: null }); state.command.mockResolvedValue({ records: [] }); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("uses no-store and actual browser origin, with no fallback for POST", async () => {
  const get = await GET(new Request("https://company.invalid"), params);
  expect(get.status).toBe(200); expect(get.headers.get("Cache-Control")).toBe("no-store");
  expect(state.read).toHaveBeenCalledWith(expect.objectContaining({ origin: "https://company.invalid" }), job);
  for (const origin of [undefined, "https://foreign.invalid", "https://company.invalid"]) {
    const request = new Request("https://company.invalid", { method: "POST", body: JSON.stringify({ tenantId: "forged" }), headers: origin ? { origin } : {} });
    expect((await POST(request, params)).headers.get("Cache-Control")).toBe("no-store");
    expect(state.command).toHaveBeenLastCalledWith(expect.objectContaining({ origin }), job, { tenantId: "forged" });
  }
});
it("preserves not-found for an empty or foreign job and hides every other environment", async () => {
  state.read.mockResolvedValue({ code: "CIS_FIXTURE_NOT_FOUND", stored: null });
  expect((await GET(new Request("https://company.invalid"), params)).status).toBe(404);
  vi.stubEnv("JOBGUARD_ENV", "production"); state.read.mockClear();
  expect((await GET(new Request("https://company.invalid"), params)).status).toBe(404);
  expect((await POST(new Request("https://company.invalid", { method: "POST" }), params)).status).toBe(404);
  expect(state.read).not.toHaveBeenCalled(); expect(state.command).not.toHaveBeenCalled();
});
