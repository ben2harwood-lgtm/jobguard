import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), authorize: vi.fn(), live: vi.fn(), locked: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}), practiceFailure: () => null }));
vi.mock("../../../../lib/supplier-lines-service", () => ({ SupplierLinesService: class { read = state.read; command = state.command; } }));
vi.mock("@jobguard/db", () => ({
  authorizePracticeJob: state.authorize,
  requireLiveJob: state.live,
  withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => {
    state.locked = true;
    try { return await fn({}); } finally { state.locked = false; }
  },
}));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "fictional-job" }) };
beforeEach(() => {
  vi.resetAllMocks();
  state.authorize.mockResolvedValue({ context: { tenantId: "fictional-tenant" } });
});
it.each([["JOB_NOT_LIVE",409],["JOB_NOT_FOUND",404],["MATCH_NOT_FOUND",404],["MATCH_REVISION_CONFLICT",409],["MATCH_IDEMPOTENCY_CONFLICT",409],["MATCH_FORBIDDEN",403],["UNAUTHENTICATED",401]])("maps %s without cached enumeration or last-write-wins", async (code, status) => {
  state.command.mockRejectedValue(Object.assign(new Error(code), { code }));
  const response = await POST(new Request("https://fictional.invalid", { method: "POST", body: "{}" }), context);
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ code }); expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("passes read query and does not cache private facts", async () => {
  state.read.mockResolvedValue({ revision: 2 });
  const response = await GET(new Request("https://fictional.invalid?version=supplier-lines-read.v1&revision=2"), context);
  expect(state.read).toHaveBeenCalledWith("fictional-job", { version: "supplier-lines-read.v1", revision: "2" });
  expect(await response.json()).toEqual({ revision: 2 }); expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("refuses writes to a non-live job before invoking the command", async () => {
  state.live.mockRejectedValue(Object.assign(new Error("JOB_NOT_LIVE"), { code: "JOB_NOT_LIVE" }));
  const response = await POST(new Request("https://fictional.invalid", { method: "POST", body: "{}" }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "JOB_NOT_LIVE" });
  expect(state.live).toHaveBeenCalledWith(expect.anything(), "fictional-job");
  expect(state.command).not.toHaveBeenCalled();
});
it("keeps the live-job lock while the command completes", async () => {
  state.command.mockImplementation(async () => {
    expect(state.locked).toBe(true);
    expect(state.live).toHaveBeenCalledTimes(1);
    return { confirmed: true };
  });
  const response = await POST(new Request("https://fictional.invalid", { method: "POST", body: "{}" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ confirmed: true });
  expect(state.locked).toBe(false);
});
it("checks access before learning the job state", async () => {
  state.authorize.mockRejectedValue(new Error("UNAUTHENTICATED"));
  const response = await POST(new Request("https://fictional.invalid", { method: "POST", body: "{}" }), context);
  expect(response.status).toBe(401);
  expect(state.live).not.toHaveBeenCalled();
  expect(state.command).not.toHaveBeenCalled();
});
it("keeps reads available without checking the job's live state", async () => {
  state.live.mockRejectedValue(new Error("JOB_NOT_LIVE"));
  state.read.mockResolvedValue({ revision: 2 });
  const response = await GET(new Request("https://fictional.invalid?version=supplier-lines-read.v1"), context);
  expect(response.status).toBe(200);
  expect(state.live).not.toHaveBeenCalled();
});
