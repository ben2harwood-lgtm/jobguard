import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}), practiceFailure: () => null }));
vi.mock("../../../../lib/supplier-lines-service", () => ({ SupplierLinesService: class { read = state.read; command = state.command; } }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "fictional-job" }) };
beforeEach(() => vi.clearAllMocks());
it.each([["MATCH_NOT_FOUND",404],["MATCH_REVISION_CONFLICT",409],["MATCH_IDEMPOTENCY_CONFLICT",409],["MATCH_FORBIDDEN",403],["UNAUTHENTICATED",401]])("maps %s without cached enumeration or last-write-wins", async (code, status) => {
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
