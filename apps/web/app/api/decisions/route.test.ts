import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { PracticeAccessError } from "@jobguard/db";

const stub = vi.hoisted(() => ({ jar: new Map<string, string>(), list: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => {
  const value = stub.jar.get(name);
  return value === undefined ? undefined : { value };
} }) }));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ decisions: { list: stub.list } }) }));
vi.mock("../../lib/synthetic-server", async () => {
  const { PracticeAccessError } = await import("@jobguard/db");
  return {
    hasSyntheticSession: (value?: string) => !!value,
    practiceFailure: (error: unknown) => error instanceof PracticeAccessError
      ? NextResponse.json({ code: error.code }, { status: error.code === "UNAUTHENTICATED" ? 401 : 404 }) : null,
  };
});
import { GET } from "./route";
const ownInbox = { version: "decision-inbox.v1", decisions: [{ id: "own-finding" }], counts: { mandatory: 1, advisory: 0, pending: 1 } };
const request = (query = "") => new NextRequest(`http://localhost/api/decisions?tenantId=own-tenant${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  stub.jar.clear();
  stub.jar.set("jg_session", "new-session");
  stub.jar.set("jg_decision_job", "old-job");
  stub.list.mockResolvedValue(ownInbox);
});
afterEach(() => vi.unstubAllEnvs());

it("recovers only the implicit stale filter using the same authorized inbox service", async () => {
  stub.list.mockRejectedValueOnce(new PracticeAccessError("NOT_FOUND"));
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ownInbox);
  expect(stub.list.mock.calls).toEqual([[{ tenantId: "own-tenant", jobId: "old-job" }], [{ tenantId: "own-tenant" }]]);
  expect(response.cookies.get("jg_decision_job")).toMatchObject({ value: "", path: "/", expires: new Date(0) });
});
it("preserves valid implicit filtering", async () => {
  const response = await GET(request());
  expect(await response.json()).toEqual(ownInbox);
  expect(stub.list).toHaveBeenCalledExactlyOnceWith({ tenantId: "own-tenant", jobId: "old-job" });
  expect(response.cookies.get("jg_decision_job")).toBeUndefined();
});
it.each(["foreign-job", "nonexistent-job", ""])("never retries explicit jobId=%s", async jobId => {
  stub.list.mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
  const response = await GET(request(`&jobId=${jobId}`));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "NOT_FOUND" });
  expect(stub.list).toHaveBeenCalledExactlyOnceWith({ tenantId: "own-tenant", ...(jobId ? { jobId } : {}) });
  expect(response.cookies.get("jg_decision_job")).toBeUndefined();
});
it.each([new Error("NOT_FOUND"), new Error("DATABASE_UNAVAILABLE"), new Error("FORBIDDEN"), new PracticeAccessError("UNAUTHENTICATED")])("does not swallow non-ownership errors: %s", async error => {
  stub.list.mockRejectedValue(error);
  const response = await GET(request());
  expect(response.status).not.toBe(200);
  expect(await response.json()).toEqual({ code: error.message });
  expect(stub.list).toHaveBeenCalledTimes(1);
  expect(response.cookies.get("jg_decision_job")).toBeUndefined();
});
it("does not swallow a failed recovery or widen the requested tenant", async () => {
  stub.list.mockRejectedValueOnce(new PracticeAccessError("NOT_FOUND")).mockRejectedValueOnce(new Error("FORBIDDEN"));
  const response = await GET(request());
  expect(response.status).toBe(403);
  expect(stub.list.mock.calls[1]).toEqual([{ tenantId: "own-tenant" }]);
});
it("does not retry NOT_FOUND without a cookie filter", async () => {
  stub.jar.delete("jg_decision_job");
  stub.list.mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
  expect((await GET(request())).status).toBe(404);
  expect(stub.list).toHaveBeenCalledTimes(1);
});
it("refuses an unauthenticated caller before listing", async () => {
  stub.jar.delete("jg_session");
  expect((await GET(request())).status).toBe(401);
  expect(stub.list).not.toHaveBeenCalled();
});
