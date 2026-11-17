import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ execute: vi.fn(), credentials: vi.fn() }));
vi.mock("../../../lib/accounting-export-server", () => ({ accountingExportApplication: () => ({ execute: state.execute }) }));
vi.mock("../../../lib/identity-server", () => ({ identityCredentials: state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ sourceId: "demo-invoice" }) };
beforeEach(() => {
  state.credentials.mockResolvedValue({ sessionToken: "session", csrfToken: "csrf", tenantHeader: "tenant" });
  state.execute.mockResolvedValue({ version: 1, status: "pending" });
});
afterEach(() => vi.resetAllMocks());
it("uses no-store for preview and status and forwards verified-session credentials", async () => {
  for (const view of ["preview", "read"]) {
    const response = await GET(new Request(`https://company.invalid/api/accounting-exports/demo-invoice?view=${view}`), context);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.execute).toHaveBeenLastCalledWith({ sessionToken: "session", csrfToken: "csrf", tenantHeader: "tenant", origin: "https://company.invalid" }, "demo-invoice", view);
  }
});
it("accepts only preview and read GET operations, never claim or reconcile", async () => {
  for (const view of ["claim", "reconcile", "push", ""]) {
    expect((await GET(new Request(`https://company.invalid/?view=${view}`), context)).status).toBe(400);
  }
  expect(state.execute).not.toHaveBeenCalled();
});
it("requires an exact same origin on approvals before accessing credentials or state", async () => {
  for (const origin of [undefined, "https://evil.invalid"]) {
    const response = await POST(new Request("https://company.invalid/", { method: "POST", headers: origin ? { origin } : {}, body: "{}" }), context);
    expect(response.status).toBe(403); expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect(state.execute).not.toHaveBeenCalled(); expect(state.credentials).not.toHaveBeenCalled();
});
it("passes the exact approval body; malformed JSON fails explicitly", async () => {
  const body = { version: 1, previewHash: "a".repeat(64), humanConfirmed: true };
  const request = (data: string) => new Request("https://company.invalid/", { method: "POST", headers: { origin: "https://company.invalid" }, body: data });
  expect((await POST(request(JSON.stringify(body)), context)).status).toBe(200);
  expect(state.execute).toHaveBeenCalledWith(expect.any(Object), "demo-invoice", "approve", body);
  expect((await POST(request("{"), context)).status).toBe(400);
});
it("redacts unavailable errors and never returns private data", async () => {
  state.execute.mockRejectedValue(new Error("private source contents"));
  const response = await GET(new Request("https://company.invalid/?view=read"), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ version: 1, code: "EXPORT_UNAVAILABLE" });
});
