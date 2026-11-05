import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ token: "s".repeat(40), read: vi.fn(), accept: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.token }) }) }));
vi.mock("@jobguard/api/workspace", () => ({ RateSuggestionApplication: class { read = state.read; accept = state.accept; } }));
vi.mock("../../../../lib/identity-server", () => ({ identityApplication: () => ({}) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
import { GET, POST } from "./route";
const path = "http://localhost/api/jobs/00000000-0000-4000-8000-000000000001/rate-suggestions";
const params = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) };
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("passes only session cookie and URL job, no-store", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.read.mockResolvedValue({ acceptances: [] });
  const response = await GET(new Request(path), params);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(state.read).toHaveBeenCalledWith(state.token, (await params.params).id, undefined);
});
it("rejects caller identity, duplicate query keys, and untrusted POST before execution", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  expect((await GET(new Request(path, { headers: { "x-tenant-id": "forged" } }), params)).status).toBe(400);
  expect((await GET(new Request(`${path}?tenantId=forged`), params)).status).toBe(400);
  expect((await GET(new Request(`${path}?unit=each&unit=kg`), params)).status).toBe(400);
  expect((await POST(new Request(path, { method: "POST", headers: { origin: "https://foreign.invalid" }, body: "{}" }), params)).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled(); expect(state.accept).not.toHaveBeenCalled();
});
it("refuses outside practice and gives plain stale/unknown reasons without leaking SQL", async () => {
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  expect((await GET(new Request(path), params)).status).toBe(403);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.accept.mockRejectedValue(new Error("STALE_REVISION"));
  const response = await POST(new Request(path, { method: "POST", headers: { origin: "http://localhost" }, body: "{}" }), params);
  expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ reason: expect.stringContaining("already accepted") });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
