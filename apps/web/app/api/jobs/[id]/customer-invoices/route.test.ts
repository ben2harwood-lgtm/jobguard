import { randomUUID } from "node:crypto";
import { FinalAccountLockError } from "@jobguard/core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), issue: vi.fn(), authenticated: true }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fixture-session" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ hasSyntheticSession: () => mocks.authenticated, practiceFailure: () => null }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ customerInvoice: mocks }) }));
import { GET, POST } from "./route";

beforeEach(() => { vi.resetAllMocks(); mocks.authenticated = true; });
const params = () => ({ params: Promise.resolve({ id: randomUUID() }) });
const request = () => new Request("http://fixture.invalid/invoices", { method: "POST", body: "{}" });
it.each(["FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED"] as const)("PRE-Q4 Next refusal %s matches Nest", async code => {
 mocks.issue.mockRejectedValue(new FinalAccountLockError(code));
 const response = await POST(request(), params());
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({ version: "final-check-invoice-error.v1", code });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each([GET, POST])("PRE-Q4 Next sanitizes unexpected failures in %s", async handler => {
 mocks.get.mockRejectedValue(new Error("private SQL diagnostic"));
 mocks.issue.mockRejectedValue(new Error("private SQL diagnostic"));
 const response = await handler(request(), params());
 expect(response.status).toBe(500);
 expect(await response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR" });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it("PRE-Q4 an untyped database message cannot impersonate the typed refusal", async () => {
 mocks.issue.mockRejectedValue(new Error("FINAL_CHECK_NOT_COMPLETE"));
 const response = await POST(request(), params());
 expect(response.status).toBe(500);
 expect(await response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR" });
});
it.each([GET, POST])("PRE-Q4 Next authentication precedes invoice access in %s", async handler => {
 mocks.authenticated = false;
 const response = await handler(request(), params());
 expect(response.status).toBe(401);
 expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
 expect(response.headers.get("cache-control")).toBe("no-store");
 expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled();
});
