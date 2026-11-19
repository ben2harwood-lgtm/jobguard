import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaptureApplicationError } from "@jobguard/api/workspace";
import { CaptureConflictError } from "@jobguard/db";

const stub = vi.hoisted(() => ({ create: vi.fn(), authenticated: true, denied: null as Response | null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-session" }) }) }));
vi.mock("../../../lib/synthetic-server", () => ({ hasSyntheticSession: () => stub.authenticated, practiceFailure: () => stub.denied }));
vi.mock("../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ capture: { create: stub.create } }) }));
import { POST } from "./route";

const body = { contractVersion: "job_capture_v1", captureId: "capture", source: { kind: "text", text: "Fictional work" } };
const request = () => new Request("http://localhost:3000/api/jobs/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); stub.authenticated = true; stub.denied = null; });
afterEach(() => vi.unstubAllGlobals());

it("reports a reused capture ID as a conflict, retaining input without alleging a database outage", async () => {
  stub.create.mockRejectedValueOnce(new CaptureConflictError("A capture id cannot be reused for different source data"));
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "CAPTURE_ID_REUSED", originalInputRetained: true });
});
it("keeps unexpected database errors private and distinguishable from capture conflicts", async () => {
  stub.create.mockRejectedValueOnce(new Error("private connection detail"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE", originalInputRetained: true });
});
it.each([["INVALID_CAPTURE", 400], ["TENANT_FORBIDDEN", 403]] as const)("preserves %s refusals", async (code, status) => {
  stub.create.mockRejectedValueOnce(new CaptureApplicationError(code));
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code, originalInputRetained: true });
});
it("refuses missing sessions before calling capture", async () => {
  stub.authenticated = false;
  expect((await POST(request())).status).toBe(401);
  expect(stub.create).not.toHaveBeenCalled();
});
it("preserves practice access refusals ahead of generic error handling", async () => {
  stub.create.mockRejectedValueOnce(new Error("refused"));
  stub.denied = new Response(JSON.stringify({ code: "SESSION_EXPIRED" }), { status: 401 });
  expect(await POST(request())).toBe(stub.denied);
});
