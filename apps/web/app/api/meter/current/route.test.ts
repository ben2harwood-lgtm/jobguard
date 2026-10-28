import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeterTodayApplication } from "../../../../../api/src/meter-today.application.js";
const state = vi.hoisted(() => ({ credentials: {} as Record<string, string>, read: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn() }));
const tenant = "00000000-0000-4000-8000-000000000001";
const foreign = "00000000-0000-4000-8000-000000000002";
vi.mock("@jobguard/api/workspace", async () => import("../../../../../api/src/meter-today.application.js"));
vi.mock("../../../lib/identity-server", () => ({ identityCredentials: async () => state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
vi.mock("../../../lib/meter-server", () => ({ meterApplication: () => new MeterTodayApplication({
  allowedOrigin: "https://company.invalid", provider: { authenticate: state.authenticate, findMembership: state.findMembership, digest: () => "a".repeat(64) },
} as never, { read: state.read }) }));
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant };
  state.authenticate.mockImplementation(async (token: string) => token === "s".repeat(32) ? { identityUserId: tenant, sessionId: tenant, csrfToken: "c".repeat(24) } : undefined);
  state.findMembership.mockImplementation(async (_: unknown, id: string) => id === tenant ? { id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner", email: "owner@fictional.invalid" } : undefined);
  state.read.mockResolvedValue({ version: "meter-today-read.v1", hypothetical: true, date: "2026-10-28", plan: "Builder", countedPlaces: 5, freeSmallPlaces: 0 });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const request = () => new Request("https://company.invalid/api/meter/current");
it.each([undefined, "expired-session".padEnd(32, "x"), "practice-session".padEnd(32, "x")])("refuses missing, expired and practice session %s", async token => {
  if (token) state.credentials.sessionToken = token; else delete state.credentials.sessionToken;
  const response = await GET(request()); expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(state.read).not.toHaveBeenCalled();
});
it.each([undefined, "wrong-csrf".padEnd(24, "x")])("refuses CSRF %s before the ledger", async csrf => {
  if (csrf) state.credentials.csrfToken = csrf; else delete state.credentials.csrfToken;
  expect((await GET(request())).status).toBe(403); expect(state.read).not.toHaveBeenCalled();
});
it("refuses another tenant and a hostile origin without disclosing figures", async () => {
  state.credentials.tenantHeader = foreign;
  const response = await GET(request()); expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ version: "meter-today-error.v1", code: "TENANT_FORBIDDEN" });
  state.credentials.tenantHeader = tenant;
  expect((await GET(new Request(request(), { headers: { origin: "https://foreign.invalid" } }))).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled();
});
it("passes only verified company context and the session digest to the read, without caching", async () => {
  const response = await GET(request()); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ countedPlaces: 5, plan: "Builder" });
  expect(state.read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64));
});
it("rechecks membership and rejects revoked membership on the next request", async () => {
  expect((await GET(request())).status).toBe(200); state.findMembership.mockResolvedValue(undefined);
  expect((await GET(request())).status).toBe(403); expect(state.read).toHaveBeenCalledTimes(1);
});
it("production and unknown failures disclose no counts or details", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await GET(request())).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.read.mockRejectedValue(new Error("private ledger detail"));
  const response = await GET(request()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ version: "meter-today-error.v1", code: "METER_UNAVAILABLE" });
});
