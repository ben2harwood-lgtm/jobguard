import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
import { z } from "zod";

const stub = vi.hoisted(() => ({ jar: new Map<string, string>(), list: vi.fn(), evaluate: vi.fn(), dismiss: vi.fn(), workspace: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => {
  const value = stub.jar.get(name);
  return value === undefined ? undefined : { value };
} }) }));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: stub.workspace }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/synthetic-server", async original => ({
  ...await original<typeof import("../../lib/synthetic-server")>(),
  hasSyntheticSession: (value?: string) => !!value,
}));
import { GET, POST } from "./route";
const ownInbox = { version: "decision-inbox.v1", decisions: [{ id: "own-finding" }], counts: { mandatory: 1, advisory: 0, pending: 1 } };
const request = (query = "") => new NextRequest(`http://localhost/api/decisions?tenantId=own-tenant${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  stub.jar.clear();
  stub.jar.set("jg_session", "new-session");
  stub.jar.set("jg_decision_job", "old-job");
  stub.workspace.mockResolvedValue({ decisions: { list: stub.list, evaluate: stub.evaluate, dismiss: stub.dismiss } });
  stub.list.mockResolvedValue(ownInbox);
  stub.evaluate.mockResolvedValue(ownInbox);
  stub.dismiss.mockResolvedValue({ version: "decision-resolution-result.v1", label: "Dismissed — no action authorized" });
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

const evaluation = { version: "finding-evaluation-command.v1", commandId: "fictional-command", tenantId: "own-tenant", jobId: "own-job" };
const dismissal = { version: "decision-resolution-command.v1", commandId: "fictional-command", tenantId: "own-tenant", decisionId: "own-decision", resolution: "dismissed" };
const postRequest = (body: unknown) => new Request("https://app.invalid/api/decisions", { method: "POST", body: JSON.stringify(body) });
const operations = [
  { name: "list", invoke: () => GET(request()), service: stub.list },
  { name: "evaluate", invoke: () => POST(postRequest(evaluation)), service: stub.evaluate },
  { name: "dismiss", invoke: () => POST(postRequest(dismissal)), service: stub.dismiss },
];
const internalErrors = [
  Object.assign(new Error('relation "fictional_private_relation" missing at fictional-db.invalid:5432'), {
    code: "42P01", detail: "fictional connection detail", constraint: "fictional_constraint", cause: new Error("fictional cause"),
  }),
  new Error("FORBIDDEN: fictional internal detail"),
  new Error("NOT_FOUND_fictional_relation"),
  new Error("CONFLICT fictional constraint"),
  new Error("STALE_REVISION fictional detail"),
  new Error("IDEMPOTENCY_CONFLICT_fictional_constraint"),
  new Error("DATABASE_UNAVAILABLE fictional connection"),
  Object.assign(new Error("fictional unknown message"), { code: "FORBIDDEN" }),
  { code: "fictional_unknown", message: "fictional database detail" },
  { code: "NOT_FOUND", message: "NOT_FOUND" },
  "FORBIDDEN", null, undefined, 42,
];
for (const { name, invoke, service } of operations) {
  it.each(internalErrors)(`${name} hides unexpected errors without recovery or mutation retry: %s`, async error => {
    service.mockRejectedValue(error);
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(JSON.stringify({ code: "DATABASE_UNAVAILABLE" }));
    expect(service).toHaveBeenCalledOnce();
    expect(response.cookies.get("jg_decision_job")).toBeUndefined();
  });
  it.each([
    [new Error("FORBIDDEN"), 403, "FORBIDDEN"],
    [new Error("NOT_FOUND"), 404, "NOT_FOUND"],
    [new Error("CONFLICT"), 409, "CONFLICT"],
    ...["INVALID_COMMAND", "STALE_REVISION", "IDEMPOTENCY_CONFLICT", "VARIATION_REVISION_CONFLICT",
      "CURRENT_REVISION_REQUIRED", "BASELINE_REQUIRED", "CREDIT_EXCEEDS_INVOICE", "JOB_NOT_FOUND",
      "JOB_NOT_LIVE", "DECISION_NOT_FOUND", "DATABASE_UNAVAILABLE", "QUOTE_CHANGED", "ALREADY_LOCKED",
      "SOURCE_CHANGED"].map(code => [new Error(code), 400, code] as const),
    [new PracticeAccessError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
    [new PracticeAccessError("NOT_FOUND"), 404, "NOT_FOUND"],
    [new PracticeAccessError("SYNTHETIC_MODE_REQUIRED"), 403, "SYNTHETIC_MODE_REQUIRED"],
    [new RequestBindingRefusedError("practice"), 401, "UNAUTHENTICATED"],
    [new RequestBindingRefusedError("real"), 403, "FORBIDDEN"],
    [new RequestBindingRefusedError("contractor_practice"), 403, "FORBIDDEN"],
  ] as const)(`${name} preserves public refusal %s`, async (error, status, code) => {
    service.mockRejectedValue(error);
    // Explicit filtering prevents the intentionally recoverable implicit ownership case.
    const response = name === "list" ? await GET(request("&jobId=own-job")) : await invoke();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(service).toHaveBeenCalledOnce();
    expect(response.cookies.get("jg_decision_job")).toBeUndefined();
  });
  it(`${name} preserves the established schema-error response`, async () => {
    const parsed = z.object({ field: z.literal("valid") }).safeParse({ field: "fictional private detail" });
    if (parsed.success) throw new Error("expected invalid fixture");
    service.mockRejectedValue(parsed.error);
    const response = await invoke();
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"code":"DATABASE_UNAVAILABLE"}');
  });
}
it("keeps a valid cookie when the ownership-recovery list fails internally", async () => {
  stub.list.mockRejectedValueOnce(new PracticeAccessError("NOT_FOUND")).mockRejectedValueOnce(internalErrors[0]);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
  expect(stub.list.mock.calls).toEqual([[{ tenantId: "own-tenant", jobId: "old-job" }], [{ tenantId: "own-tenant" }]]);
  expect(stub.workspace).toHaveBeenCalledOnce();
  expect(response.cookies.get("jg_decision_job")).toBeUndefined();
});
it("authenticates malformed POST before consuming its body or creating services", async () => {
  stub.jar.delete("jg_session");
  const req = new Request("https://app.invalid/api/decisions", { method: "POST", body: "{" });
  const parse = vi.spyOn(req, "json");
  const response = await POST(req);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  expect(parse).not.toHaveBeenCalled();
  expect(req.bodyUsed).toBe(false);
  expect(stub.workspace).not.toHaveBeenCalled();
  expect(stub.evaluate).not.toHaveBeenCalled();
  expect(stub.dismiss).not.toHaveBeenCalled();
});
it("catches malformed JSON as INVALID_COMMAND without dispatch", async () => {
  const response = await POST(new Request("https://app.invalid/api/decisions", { method: "POST", body: "{" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_COMMAND" });
  expect(stub.workspace).not.toHaveBeenCalled();
  expect(stub.evaluate).not.toHaveBeenCalled();
  expect(stub.dismiss).not.toHaveBeenCalled();
});
it("hides unknown body-reading failures", async () => {
  const req = postRequest(evaluation);
  vi.spyOn(req, "json").mockRejectedValue(internalErrors[0]);
  const response = await POST(req);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
  expect(stub.workspace).not.toHaveBeenCalled();
});
it("preserves successful evaluation, body and secure job cookie", async () => {
  const response = await POST(postRequest(evaluation));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ownInbox);
  expect(stub.evaluate).toHaveBeenCalledExactlyOnceWith(evaluation);
  expect(stub.dismiss).not.toHaveBeenCalled();
  expect(response.cookies.get("jg_decision_job")).toMatchObject({ value: "own-job", httpOnly: true, sameSite: "lax", secure: true, path: "/" });
});
it("preserves successful dismissal and command body", async () => {
  const response = await POST(postRequest(dismissal));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ version: "decision-resolution-result.v1", label: "Dismissed — no action authorized" });
  expect(stub.dismiss).toHaveBeenCalledExactlyOnceWith(dismissal);
  expect(stub.evaluate).not.toHaveBeenCalled();
  expect(response.cookies.get("jg_decision_job")).toBeUndefined();
});

it("preserves the evaluate REQUEST_BINDING_REFUSED public response", async () => {
  stub.evaluate.mockRejectedValue(Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" }));
  const response = await POST(postRequest(evaluation));
  expect(response.status).toBe(400);
  expect(await response.text()).toBe('{"code":"REQUEST_BINDING_REFUSED"}');
  expect(stub.evaluate).toHaveBeenCalledExactlyOnceWith(evaluation);
  expect(stub.dismiss).not.toHaveBeenCalled();
  expect(response.cookies.get("jg_decision_job")).toBeUndefined();
});
