import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ cookies: vi.fn(), identity: vi.fn(), pool: vi.fn(), read: vi.fn(), resolve: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("../../../../lib/identity-server", () => ({ identityApplication: mocks.identity }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: mocks.pool }));
vi.mock("@jobguard/api/identity", () => ({ resolveVerifiedTenantContext: mocks.resolve }));
vi.mock("@jobguard/db", () => ({ RecurringExtrasRepository: class { read = mocks.read; } }));
import * as route from "./route";
const id = "10000000-0000-4000-8000-000000000001";
const get = (suffix = "", headers = {}) => route.GET(new Request(`https://practice.invalid/api/jobs/${id}/recurring-extras${suffix}`, { headers }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "session-token" }) });
  mocks.identity.mockReturnValue({ session: vi.fn().mockResolvedValue({ memberships: [{ id: "member", tenantId: "tenant", role: "owner" }], csrfToken: "csrf" }), provider: {}, allowedOrigin: "https://practice.invalid" });
  mocks.resolve.mockResolvedValue({ tenantId: "tenant" });
  mocks.read.mockResolvedValue({ version: "recurring-extras.v1", status: "not_enough_to_say", suggestions: [] });
});
it("is session-only, no-store and GET only", async () => {
  const response = await get();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.read).toHaveBeenCalledWith({ tenantId: "tenant" }, "member", id);
  expect(Object.keys(route)).toEqual(["GET"]);
});
it("rejects every query and supplied authority header before reading", async () => {
  for (const query of ["?tenant=x", "?actor=x", "?cutoff=2026-01-01", "?asOf=x", "?version=x"]) expect((await get(query)).status).toBe(400);
  for (const header of ["x-tenant-id", "x-actor-id", "x-session-id", "x-cutoff"]) expect((await get("", { [header]: "x" })).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("refuses non-synthetic environments before using a session or pool", async () => {
  for (const environment of ["production", "pilot_no_charge", "test"]) {
    vi.stubEnv("JOBGUARD_ENV", environment); expect((await get()).status).toBe(403);
  }
  expect(mocks.identity).not.toHaveBeenCalled(); expect(mocks.pool).not.toHaveBeenCalled();
});
it("refuses missing sessions, non-owner and ambiguous memberships", async () => {
  mocks.identity.mockReturnValueOnce({ session: vi.fn().mockRejectedValue(Object.assign(new Error(), { code: "UNAUTHENTICATED" })) });
  expect((await get()).status).toBe(401);
  for (const memberships of [[], [{ role: "finance" }], [{ role: "owner" }, { role: "owner" }]]) {
    mocks.identity.mockReturnValueOnce({ session: vi.fn().mockResolvedValue({ memberships }) });
    expect((await get()).status).toBe(403);
  }
  expect(mocks.read).not.toHaveBeenCalled();
});
it("fails closed on database grants and missing jobs", async () => {
  mocks.read.mockRejectedValueOnce({ code: "42501" }); expect((await get()).status).toBe(403);
  mocks.read.mockRejectedValueOnce(new Error("NOT_FOUND")); expect((await get()).status).toBe(404);
});
