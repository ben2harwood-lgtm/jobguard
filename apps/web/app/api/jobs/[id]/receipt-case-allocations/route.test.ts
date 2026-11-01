import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ view: vi.fn(), command: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", async () => {
 const { receiptCaseAllocationFailure } = await import("../../../../../../api/src/receipt-case-allocation.application.js");
 return { receiptCaseAllocationFailure, ReceiptCaseAllocationApplication: class { view = state.view; command = state.command; } };
});
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "job" }) };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); });
afterEach(() => vi.unstubAllEnvs());
it("refuses production and client tenant overrides before executing", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production"); expect((await GET(new Request("https://fictional.invalid"), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); expect((await POST(new Request("https://fictional.invalid", { headers: { "x-tenant-id": "foreign" } }), context)).status).toBe(404);
 expect(state.command).not.toHaveBeenCalled(); expect(state.view).not.toHaveBeenCalled();
});
it("forwards lazy JSON and returns uncached stored results", async () => {
 state.command.mockImplementation(async (_job, read) => ({ received: await read(), replayed: true }));
 const response = await POST(new Request("https://fictional.invalid", { method: "POST", body: JSON.stringify({ commandId: "saved" }) }), context);
 expect(await response.json()).toEqual({ received: { commandId: "saved" }, replayed: true });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each([["NOT_FOUND", 404], ["UNAUTHENTICATED", 401], ["STORED_RECEIPT_APPROVAL_CHANGED", 409], ["connection details", 503]] as const)("maps %s without private diagnostics", async (code, status) => {
 state.view.mockRejectedValue(Object.assign(new Error(code), { code: "23514" })); const response = await GET(new Request("https://fictional.invalid"), context);
 expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(await response.json()).toEqual({ code: status === 503 ? "RECEIPT_CASE_ALLOCATION_UNAVAILABLE" : code });
});
it("authenticates through the application before rejecting query parameters", async () => {
 state.view.mockRejectedValue(new Error("UNAUTHENTICATED"));
 expect((await GET(new Request("https://fictional.invalid?tenantId=foreign"), context)).status).toBe(401);
 expect(state.view).toHaveBeenCalledWith("job", { tenantId: "foreign" });
});
