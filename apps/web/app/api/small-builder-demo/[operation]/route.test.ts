import { afterEach, describe, expect, it, vi } from "vitest";
import { SmallBuilderDemoError } from "@jobguard/db";
const state = vi.hoisted(() => ({ execute: vi.fn(), credentials: { sessionToken: "real-session", csrfToken: "csrf", tenantHeader: "company", origin: undefined as string | undefined } }));
vi.mock("../../../lib/identity-server", () => ({ identityCredentials: async () => state.credentials, identityApplication: () => ({ allowedOrigin: "https://practice.invalid" }) }));
vi.mock("../../../lib/small-builder-demo-server", () => ({ smallBuilderDemoApplication: () => ({ execute: state.execute }) }));
import { GET, POST } from "./route";
const id = "d1500000-0000-4000-8000-000000000001";
const context = (operation: string) => ({ params: Promise.resolve({ operation }) });
const create = { operation: "create", runId: null, input: { contractVersion: "small-builder-demo.create.v1", commandId: id, scenario: "shadow-30000" } };
const post = (body: unknown, operation = "create") => POST(new Request(`https://practice.invalid/api/small-builder-demo/${operation}`, { method: "POST", body: JSON.stringify(body) }), context(operation));
afterEach(() => { vi.clearAllMocks(); state.credentials.origin = undefined; });
describe("DEMO-S lifecycle transport (application mocked, no database proof)", () => {
  it("passes current session, CSRF and company authority unchanged on each exact replay", async () => {
    state.execute.mockResolvedValue({ status: "blocked" });
    for (let i = 0; i < 2; i++) {
      const response = await post(create);
      expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(state.execute).toHaveBeenCalledTimes(2);
    expect(state.execute).toHaveBeenNthCalledWith(2, state.credentials, "create", null, create.input);
  });
  it("read/report are read-only and preserve exact report identity with current authority", async () => {
    state.execute.mockResolvedValue({});
    await GET(new Request(`https://practice.invalid/?runId=${id}`), context("read"));
    expect(state.execute).toHaveBeenLastCalledWith({ ...state.credentials, origin: "https://practice.invalid" }, "read", id, {});
    await GET(new Request(`https://practice.invalid/?runId=${id}&snapshotId=${id}`, { headers: { origin: "https://foreign.invalid" } }), context("report"));
    expect(state.execute).toHaveBeenLastCalledWith({ ...state.credentials, origin: "https://foreign.invalid" }, "report", id, { snapshotId: id });
  });
  it.each(["tenantId", "completed", "amountPence", "settlementStatus", "allocation", "lockedBillId", "hiddenSignals", "reversal", "releaseTrialKey"])("rejects injected %s without executing domain or lifecycle work", async key => {
    expect((await post({ ...create, input: { ...create.input, [key]: id } })).status).toBe(400);
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("refuses malformed JSON, version/path mismatch, extra envelope authority and arbitrary operations", async () => {
    expect((await POST(new Request("https://practice.invalid", { method: "POST", body: "{" }), context("create"))).status).toBe(400);
    for (const body of [{ ...create, tenantId: id }, { ...create, input: { ...create.input, contractVersion: "wrong" } }]) expect((await post(body)).status).toBe(400);
    expect((await post(create, "reset")).status).toBe(400);
    expect((await post(create, "execute")).status).toBe(400);
    expect(state.execute).not.toHaveBeenCalled();
  });
  it.each([`runId=${id}&runId=${id}`, `runId=${id}&tenantId=${id}`, `runId=${id}&snapshotId=${id}`, "runId=invalid", `runId=${id}&createSnapshot=true`])("rejects ambiguous or writable read query %s", async query => {
    expect((await GET(new Request(`https://practice.invalid/?${query}`), context("read"))).status).toBe(400);
    expect(state.execute).not.toHaveBeenCalled();
  });
  it.each([["DEMO_FORBIDDEN",403], ["DEMO_SYNTHETIC_ONLY",403], ["DEMO_NOT_FOUND",404], ["DEMO_STALE_REVISION",409], ["DEMO_COMMAND_CONFLICT",409], ["DEMO_ARCHIVED",409]] as const)("redacts %s and never caches failures", async (code, status) => {
    state.execute.mockRejectedValue(new SmallBuilderDemoError(code));
    const response = await post(create);
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: "small-builder-demo-error.v1", code });
  });
  it("redacts unknown errors, including foreign customer and hidden source details", async () => {
    state.execute.mockRejectedValue(new Error("foreign customer secret hidden signal"));
    const response = await post(create); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ version: "small-builder-demo-error.v1", code: "DEMO_UNAVAILABLE" });
  });
});
