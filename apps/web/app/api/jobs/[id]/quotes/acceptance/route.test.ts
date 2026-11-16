import { beforeEach, expect, it, vi } from "vitest";

const stub = vi.hoisted(() => ({ session: true, command: vi.fn(), workspace: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fictional-session" }) }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ hasSyntheticSession: () => stub.session, practiceFailure: () => null }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: stub.workspace }));
import { POST } from "./route";

const jobId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: jobId }) };
const body = {
  "version": "quote-acceptance-command.v1",
  "commandId": "00000000-0000-4000-8000-000000000001",
  "documentId": "00000000-0000-4000-8000-000000000002",
  "documentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "documentVersion": 1,
  "statedCustomerName": "Fictional Customer",
  "statedMethod": "verbal",
  "acceptedAt": "2026-11-15T12:00:00.000Z"
};
const request = (raw: string) => new Request("https://practice.invalid/api/quotes", { method: "POST", body: raw });

beforeEach(() => {
  vi.resetAllMocks();
  stub.session = true;
  stub.command.mockResolvedValue({ saved: true });
  stub.workspace.mockResolvedValue({ quote: { accept: stub.command } });
});

it.each(["", '{', "invalid"])("refuses an unauthenticated body %j without parsing or invoking a command", async raw => {
  stub.session = false;
  const input = request(raw);
  const parse = vi.spyOn(input, "json");
  const response = await POST(input, params);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  expect(parse).not.toHaveBeenCalled();
  expect(stub.workspace).not.toHaveBeenCalled();
  expect(stub.command).not.toHaveBeenCalled();
});

it.each(["", '{', "invalid"])("returns a typed 400 for malformed JSON %j without invoking a command", async raw => {
  const response = await POST(request(raw), params);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_QUOTE" });
  expect(stub.workspace).not.toHaveBeenCalled();
  expect(stub.command).not.toHaveBeenCalled();
});

it.each([{}, null, { ...body, version: "invalid" }])("forwards parsed input %j and preserves the service validation error", async value => {
  stub.command.mockRejectedValue(new Error("INVALID_QUOTE"));
  const response = await POST(request(JSON.stringify(value)), params);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_QUOTE" });
  expect(stub.workspace).toHaveBeenCalledOnce();
  expect(stub.command).toHaveBeenCalledWith(jobId, value);
});

it("forwards valid and repeated commands unchanged", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await POST(request(JSON.stringify(body)), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
  }
  expect(stub.command).toHaveBeenCalledTimes(2);
  expect(stub.command).toHaveBeenLastCalledWith(jobId, body);
});

it.each([["QUOTE_REVISION_CONFLICT", 409], ["STALE_REVISION", 409], ["NOT_FOUND", 400], ["DATABASE_UNAVAILABLE", 400]] as const)("preserves %s status mapping", async (code, status) => {
  stub.command.mockRejectedValue(new Error(code));
  const response = await POST(request(JSON.stringify(body)), params);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
});
