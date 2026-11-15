import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stub = vi.hoisted(() => ({ jar: new Map<string, string>(), issue: vi.fn(), list: vi.fn(), pool: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => {
  const value = stub.jar.get(name);
  return value === undefined ? undefined : { value };
} }) }));
vi.mock("@jobguard/db", async importOriginal => ({
  ...await importOriginal<typeof import("@jobguard/db")>(), issuePracticeSession: stub.issue,
}));
// Keep real cookie-shape validation and error translation; no database is started.
vi.mock("server-only", () => ({}));
vi.mock("../../lib/synthetic-server", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/synthetic-server")>(), syntheticPool: () => stub.pool,
}));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ decisions: { list: stub.list } }) }));
import { POST } from "./route";
import { GET as listDecisions } from "../decisions/route";
const oldSession = "00000000-0000-4000-8000-000000000001";
const newSession = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  stub.jar.clear();
  stub.jar.set("jg_session", oldSession);
  stub.jar.set("jg_decision_job", "previous-session-job");
  stub.issue.mockResolvedValue(newSession);
  stub.list.mockImplementation(async (query: { jobId?: string }) => {
    expect(stub.jar.get("jg_session")).toBe(newSession);
    // The issuance response must remove the old filter, before inbox recovery is needed.
    expect(stub.jar.has("jg_decision_job")).toBe(false);
    expect(query).toEqual({ tenantId: "own-tenant" });
    return { version: "decision-inbox.v1", decisions: [], counts: { mandatory: 0, advisory: 0, pending: 0 } };
  });
});
afterEach(() => vi.unstubAllEnvs());
it.each(["http", "https"])("issues a new session, expires the old job cookie and lists only its own inbox over %s", async protocol => {
  const response = await POST(new Request(`${protocol}://practice.invalid/api/session`, { method: "POST" }));
  expect(response.status).toBe(200);
  expect(stub.issue).toHaveBeenCalledExactlyOnceWith(stub.pool);
  expect(response.cookies.get("jg_session")).toMatchObject({ value: newSession, httpOnly: true, sameSite: "lax", path: "/", secure: protocol === "https" });
  expect(response.cookies.get("jg_decision_job")).toMatchObject({ value: "", path: "/", expires: new Date(0) });
  for (const cookie of response.cookies.getAll()) {
    if (cookie.expires instanceof Date && cookie.expires.getTime() === 0) stub.jar.delete(cookie.name);
    else stub.jar.set(cookie.name, cookie.value);
  }
  const inbox = await listDecisions(new NextRequest(`${protocol}://practice.invalid/api/decisions?tenantId=own-tenant`));
  expect(inbox.status).toBe(200);
  expect(await inbox.json()).toEqual({ version: "decision-inbox.v1", decisions: [], counts: { mandatory: 0, advisory: 0, pending: 0 } });
  expect(stub.list).toHaveBeenCalledTimes(1);
});
it("does not replace or clear cookies when issuing the session fails", async () => {
  stub.issue.mockRejectedValue(new Error("database failure"));
  const response = await POST(new Request("http://practice.invalid/api/session", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(response.cookies.getAll()).toEqual([]);
});
it("refuses non-practice mode without issuing a session", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  const response = await POST(new Request("http://practice.invalid/api/session", { method: "POST" }));
  expect(response.status).toBe(401);
  expect(stub.issue).not.toHaveBeenCalled();
  expect(response.cookies.getAll()).toEqual([]);
});
