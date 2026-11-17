import { randomUUID } from "node:crypto";
import { FinalAccountLockError } from "@jobguard/core";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ get: vi.fn(), issue: vi.fn(), practiceFailure: vi.fn(), authenticated: true }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fixture-session" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ hasSyntheticSession: () => mocks.authenticated, practiceFailure: mocks.practiceFailure }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ customerInvoice: mocks }) }));
import { GET, POST } from "./route";

beforeEach(() => { vi.resetAllMocks(); mocks.authenticated = true; });
const params = () => ({ params: Promise.resolve({ id: randomUUID() }) });
const request = () => new Request("http://fixture.invalid/invoices", { method: "POST", body: "{}" });
it.each(["FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED", "FINAL_INVOICE_REVISION_MISMATCH", "FINAL_INVOICE_ALREADY_ISSUED", "INVOICE_SOURCE_CORRECTION_REQUIRED"] as const)("PRE-Q4 Next refusal %s matches Nest", async code => {
 mocks.issue.mockRejectedValue(new FinalAccountLockError(code));
 const response = await POST(request(), params());
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({ version: "final-check-invoice-error.v1", code });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each(["STALE_FINAL_ACCOUNT_AUTHORIZATION", "STALE_OR_BLOCKED_FINAL_ACCOUNT"])("r6 preserves merged stale issue conflict %s", async code => {
 mocks.issue.mockRejectedValue(new Error(code));
 const response = await POST(request(), params());
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({ code });
 expect(response.headers.get("cache-control")).toBe("no-store");
 // The merged read path used 400 even for stale codes.
 mocks.get.mockRejectedValue(new Error(code));
 const read = await GET(request(), params());
 expect(read.status).toBe(400);
 expect(await read.json()).toEqual({ code });
 expect(read.headers.get("cache-control")).toBe("no-store");
});
it.each(["IDEMPOTENCY_PAYLOAD_CONFLICT", "SYNTHETIC_RECIPIENT_REQUIRED", "FORBIDDEN", "NOT_FOUND", "JOB_PARTIES_REQUIRED", "INVOICE_AMOUNT_INVALID", "FINAL_ACCOUNT_TOTAL_MISMATCH", "DATABASE_UNAVAILABLE"])("r6 preserves known merged failure %s", async code => {
 mocks.get.mockRejectedValue(new Error(code)); mocks.issue.mockRejectedValue(new Error(code));
 for (const handler of [GET, POST]) {
  const response = await handler(request(), params());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code });
  expect(response.headers.get("cache-control")).toBe("no-store");
 }
});
it("r6 preserves 400 for invalid command input without returning validation details", async () => {
 const parsed = z.object({ commandId: z.string().uuid() }).safeParse({ commandId: "private invalid input" });
 if (parsed.success) throw new Error("Expected invalid fixture");
 mocks.issue.mockRejectedValue(parsed.error);
 const response = await POST(request(), params());
 expect(response.status).toBe(400);
 expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it("r6 preserves 400 for malformed JSON before invoice issue", async () => {
 const response = await POST(new Request("http://fixture.invalid/invoices", { method: "POST", body: "{" }), params());
 expect(response.status).toBe(400);
 expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
 expect(response.headers.get("cache-control")).toBe("no-store");
 expect(mocks.issue).not.toHaveBeenCalled();
});
it.each([GET, POST])("r6 preserves the merged non-Error fallback in %s", async handler => {
 mocks.get.mockRejectedValue(null); mocks.issue.mockRejectedValue(null);
 const response = await handler(request(), params());
 expect(response.status).toBe(400);
 expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each([GET, POST])("r6 keeps practice-access refusals ahead of invoice error mappings in %s", async handler => {
 const error = new Error("FORBIDDEN");
 mocks.get.mockRejectedValue(error); mocks.issue.mockRejectedValue(error);
 const denied = new Response(JSON.stringify({ code: "FORBIDDEN" }), { status: 403, headers: { "Cache-Control": "no-store" } });
 mocks.practiceFailure.mockReturnValue(denied);
 expect(await handler(request(), params())).toBe(denied);
 expect(mocks.practiceFailure).toHaveBeenCalledWith(error);
});
it.each([GET, POST])("r6 preserves successful invoice projections in %s", async handler => {
 const view = { version: 1, invoices: [] };
 mocks.get.mockResolvedValue(view); mocks.issue.mockResolvedValue(view);
 const response = await handler(request(), params());
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual(view);
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it("r6 does not classify an arbitrary diagnostic containing STALE as a conflict", async () => {
 mocks.issue.mockRejectedValue(new Error("private STALE SQL diagnostic"));
 const response = await POST(request(), params());
 expect(response.status).toBe(500);
 expect(await response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR" });
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
