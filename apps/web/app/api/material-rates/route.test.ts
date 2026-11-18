import { beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
import { materialRateCommandV1 } from "../../../../api/src/material.contracts";

const stub = vi.hoisted(() => ({ cookie: vi.fn(), workspace: vi.fn(), addRate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: stub.cookie }) }));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: stub.workspace }));
import { POST } from "./route";

const command = {
  version: "material-rate-command.v1", merchantName: "Fictional merchant", sku: "PAINT-TEST",
  description: "Fictional paint", pricePence: 2000, priceUnit: "each", taxBasis: "net",
  effectiveFrom: "2026-11-16", sourceLabel: "Fictional agreement", expectedVersion: 0,
};
const result = { id: "rate-id", version: 1, merchantId: "merchant-id", skuId: "sku-id" };
function request(body = JSON.stringify(command)) {
  return new Request("https://fictional.invalid/api/material-rates", { method: "POST", body });
}
async function expectResponse(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.text()).toBe(JSON.stringify({ code }));
}

beforeEach(() => {
  vi.resetAllMocks();
  stub.cookie.mockReturnValue({ value: "b690f3c7-0d23-4c83-bca2-5f60ce9a0f19" });
  stub.workspace.mockResolvedValue({ materials: { addRate: stub.addRate } });
  stub.addRate.mockResolvedValue(result);
});

describe.each(["composition", "addRate"] as const)("material rate %s failures", stage => {
  function fail(error: unknown) {
    (stage === "composition" ? stub.workspace : stub.addRate).mockRejectedValue(error);
  }

  const pgError = Object.assign(new Error('constraint fictional_rate_key: SELECT secret FROM app.fictional; connection postgresql://fictional:password@db.invalid/private'), {
    code: "23505", detail: "fictional tenant detail", constraint: "fictional_rate_key",
    cause: new Error("fictional connection cause"),
  });
  it.each([
    pgError, new Error("Unknown private failure"), new Error("PRIVATE_STALE_CONNECTION"),
    new Error("STALE_MATERIAL_RATE_REVISION extra detail"), new Error("toString"),
    new Error("REQUEST_BINDING_REFUSED with private detail"),
    new SyntaxError("private service parser failure"), { code: "23505", message: "private SQL" },
    { code: "UNAUTHENTICATED" }, { code: "STALE_MATERIAL_RATE_REVISION" },
    "private non-Error throw", null, undefined,
  ])("returns only a generic 503 for unknown failure %#", async error => {
    fail(error);
    await expectResponse(await POST(request()), 503, "DATABASE_UNAVAILABLE");
    expect(stub.workspace).toHaveBeenCalledTimes(1);
    expect(stub.addRate).toHaveBeenCalledTimes(stage === "composition" ? 0 : 1);
  });

  it.each([
    ["STALE_REVISION", 409], ["IDEMPOTENCY_CONFLICT", 400],
    ["VARIATION_REVISION_CONFLICT", 400], ["CURRENT_REVISION_REQUIRED", 400],
    ["BASELINE_REQUIRED", 400], ["CREDIT_EXCEEDS_INVOICE", 400],
    ["JOB_NOT_FOUND", 400], ["JOB_NOT_LIVE", 400], ["DECISION_NOT_FOUND", 400],
    ["FORBIDDEN", 400], ["INVALID_COMMAND", 400], ["DATABASE_UNAVAILABLE", 400],
    ["NOT_FOUND", 400], ["CONFLICT", 400], ["QUOTE_CHANGED", 400],
    ["ALREADY_LOCKED", 400], ["SOURCE_CHANGED", 400],
    ["STALE_MATERIAL_RATE_REVISION", 409], ["PRACTICE_MATERIAL_NOT_FOUND", 400],
    ["REQUEST_BINDING_REFUSED", 400], ["UNAUTHENTICATED", 400], ["SYNTHETIC_MODE_REQUIRED", 400],
  ] as const)("preserves public outcome %s/%s byte-for-byte", async (code, status) => {
    fail(new Error(code));
    await expectResponse(await POST(request()), status, code);
    expect(stub.workspace).toHaveBeenCalledTimes(1);
    expect(stub.addRate).toHaveBeenCalledTimes(stage === "composition" ? 0 : 1);
  });

  it.each([
    [new PracticeAccessError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
    [new PracticeAccessError("NOT_FOUND"), 404, "NOT_FOUND"],
    [new PracticeAccessError("SYNTHETIC_MODE_REQUIRED"), 403, "SYNTHETIC_MODE_REQUIRED"],
    [new RequestBindingRefusedError("practice"), 401, "UNAUTHENTICATED"],
    [new RequestBindingRefusedError("real"), 403, "FORBIDDEN"],
    [new RequestBindingRefusedError("contractor_practice"), 403, "FORBIDDEN"],
  ] as const)("preserves typed access refusal %#", async (error, status, code) => {
    fail(error);
    const response = await POST(request());
    await expectResponse(response, status, code);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    [Object.assign(new Error("Synthetic workflow is unavailable"), { code: "UNAUTHENTICATED" }), 401, "UNAUTHENTICATED"],
    [Object.assign(new Error("Database configuration is unavailable"), { code: "DATABASE_UNAVAILABLE" }), 503, "DATABASE_UNAVAILABLE"],
  ] as const)("keeps named mode/configuration refusal closed %#", async (error, status, code) => {
    fail(error);
    await expectResponse(await POST(request()), status, code);
    expect(stub.addRate).toHaveBeenCalledTimes(stage === "composition" ? 0 : 1);
  });
});

it.each([undefined, "", "malformed", "b690f3c7-0d23-1c83-bca2-5f60ce9a0f19"])("rejects missing/malformed session before reading input: %s", async value => {
  stub.cookie.mockReturnValue(value === undefined ? undefined : { value });
  const input = request("{");
  const json = vi.spyOn(input, "json");
  await expectResponse(await POST(input), 401, "UNAUTHENTICATED");
  expect(json).not.toHaveBeenCalled();
  expect(input.bodyUsed).toBe(false);
  expect(stub.cookie).toHaveBeenCalledWith("jg_session");
  expect(stub.workspace).not.toHaveBeenCalled();
  expect(stub.addRate).not.toHaveBeenCalled();
});

it("rejects malformed JSON without parser text or constructing services", async () => {
  await expectResponse(await POST(request('{"private-parser-text":')), 400, "INVALID_COMMAND");
  expect(stub.workspace).not.toHaveBeenCalled();
  expect(stub.addRate).not.toHaveBeenCalled();
});

it("maps a real material schema failure without reflecting invalid input", async () => {
  stub.addRate.mockImplementation(raw => materialRateCommandV1.parse(raw));
  await expectResponse(await POST(request(JSON.stringify({ ...command, expectedVersion: "PRIVATE_STALE" }))), 400, "INVALID_COMMAND");
  expect(stub.addRate).toHaveBeenCalledTimes(1);
});

it("forwards valid input exactly once and keeps the successful receipt unchanged", async () => {
  expect(materialRateCommandV1.safeParse(command).success).toBe(true);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(stub.workspace).toHaveBeenCalledTimes(1);
  expect(stub.addRate.mock.calls).toEqual([[command]]);
});
