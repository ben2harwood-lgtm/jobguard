import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ routeChange: vi.fn(), credentials: vi.fn() }));
vi.mock("../../../../lib/accounting-export-server", () => ({ accountingExportApplication: () => ({ routeChange: state.routeChange }) }));
vi.mock("../../../../lib/identity-server", () => ({ identityCredentials: state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ sourceId: "demo-next" }) };
const url = "https://company.invalid/api/accounting-exports/demo-next/route-change";
const approval = { version: 1, commandId: "00000000-0000-4000-8000-000000000004", decisionId: "00000000-0000-4000-8000-000000000005",
  previewHash: "a".repeat(64), expiresAt: "2026-11-05T00:00:00.000Z", humanConfirmed: true };
const post = (body: unknown = approval, origin: string = "https://company.invalid") => POST(new Request(url, {
 method: "POST", headers: { origin }, body: JSON.stringify(body),
}), context);
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 state.credentials.mockResolvedValue({ sessionToken: "session", csrfToken: "csrf", tenantHeader: "tenant" });
 state.routeChange.mockResolvedValue({ version: 1 });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("reads through session credentials only with no-store and no query authority", async () => {
 const response = await GET(new Request(url), context);
 expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
 expect(state.routeChange).toHaveBeenCalledWith({ sessionToken: "session", csrfToken: "csrf", tenantHeader: "tenant", origin: "https://company.invalid" }, "demo-next", "read");
 expect((await GET(new Request(`${url}?tenantId=other`), context)).status).toBe(400);
});
it("requires the trusted origin before resolving credentials or calling state", async () => {
 for (const origin of ["", "https://evil.invalid"]) expect((await post(approval, origin)).status).toBe(403);
 expect(state.credentials).not.toHaveBeenCalled(); expect(state.routeChange).not.toHaveBeenCalled();
});
it("accepts only exact approval bytes; refuses injected authority and malformed JSON", async () => {
 for (const extra of [{ tenantId: "other" }, { actorId: "actor" }, { sessionToken: "forged" }, { scope: {} }, { humanConfirmed: false }])
  expect((await post({ ...approval, ...extra })).status).toBe(400);
 expect(state.routeChange).not.toHaveBeenCalled();
 expect((await POST(new Request(url, { method: "POST", headers: { origin: "https://company.invalid" }, body: "{" }), context)).status).toBe(400);
 expect((await post()).status).toBe(200);
 expect(state.routeChange).toHaveBeenCalledWith(expect.any(Object), "demo-next", "confirm", approval);
});
it("refuses production before session/state and redacts errors with no-store", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production");
 for (const response of [await GET(new Request(url), context), await post()]) {
  expect(response.status).toBe(403); expect(response.headers.get("Cache-Control")).toBe("no-store");
 }
 expect(state.credentials).not.toHaveBeenCalled(); expect(state.routeChange).not.toHaveBeenCalled();
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.routeChange.mockRejectedValue(new Error("private database contents"));
 const response = await GET(new Request(url), context);
 expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: 1, code: "EXPORT_UNAVAILABLE" });
});
