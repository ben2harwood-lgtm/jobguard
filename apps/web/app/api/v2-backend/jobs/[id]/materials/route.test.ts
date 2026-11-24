import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), saveLine: vi.fn(), generate: vi.fn(), quote: vi.fn(), workspace: vi.fn() }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: mocks.workspace }));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
import { MaterialsError, QuoteApplicationError } from "@jobguard/api/workspace";
import { GET, POST } from "./route";
const jobId = "10000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: jobId }) };
const get = () => GET(new Request("https://fictional.invalid/materials"), params);
const post = (body: unknown) => POST(new Request("https://fictional.invalid/materials", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}), params);
const line = () => ({ version: "v2-material-line-command.v1", commandId: crypto.randomUUID(), scopeItemId: jobId,
  lineKey: "tiles", expectedVersion: 0, changes: { product: "Fictional tile", packSize: { quantity: "1.2", unit: "m2" }, wastageMultiplier: "1.10" } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  mocks.workspace.mockResolvedValue({ materialsEnquiry: mocks, quote: { get: mocks.quote } });
  mocks.read.mockResolvedValue({ jobId, lines: [], enquiry: null });
  mocks.quote.mockResolvedValue({ scope: [{ scopeItemId: jobId, description: "Tile splashback", hidden: "omitted" }] });
  mocks.saveLine.mockResolvedValue({ version: 1 }); mocks.generate.mockResolvedValue({ enquiry: { version: 1 } });
});
afterEach(() => vi.unstubAllEnvs());
describe("D5B-M materials boundary", () => {
  it.each([["0", "synthetic_demo"], ["1", "production"]])("leaves non-V2 behaviour unchanged (%s / %s)", async (flag, env) => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", flag); vi.stubEnv("JOBGUARD_ENV", env);
    expect((await get()).status).toBe(404); expect((await post(line())).status).toBe(404);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("reads authorized materials before scoped quote descriptions and disables caching", async () => {
    const response = await get();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ jobId, lines: [], enquiry: null, scope: [{ scopeItemId: jobId, description: "Tile splashback" }] });
    expect(mocks.read).toHaveBeenCalledWith(jobId, { version: "v2-materials-query.v1" });
    mocks.read.mockRejectedValue(new Error("unavailable"));
    mocks.quote.mockClear(); expect((await get()).status).toBe(503); expect(mocks.quote).not.toHaveBeenCalled();
  });
  it("returns an empty scope for a job without quote scope", async () => {
    mocks.quote.mockRejectedValue(new QuoteApplicationError("NOT_FOUND"));
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ jobId, lines: [], enquiry: null, scope: [] });
  });
  it("does not hide other quote errors or materials read failures", async () => {
    for (const error of [new QuoteApplicationError("INVALID_QUOTE"), new Error("unavailable"), { code: "NOT_FOUND" }]) {
      mocks.quote.mockRejectedValue(error);
      expect((await get()).status).toBe(503);
    }
    mocks.read.mockRejectedValue(new QuoteApplicationError("NOT_FOUND"));
    mocks.quote.mockClear();
    expect((await get()).status).toBe(503);
    expect(mocks.quote).not.toHaveBeenCalled();
  });
  it("passes exact decimal strings and replay identity to D3 and never sends", async () => {
    const input = line(); expect((await post(input)).status).toBe(200);
    expect(mocks.saveLine).toHaveBeenCalledWith(jobId, input); expect(mocks.generate).not.toHaveBeenCalled();
    const enquiry = { version: "v2-material-enquiry-generate.v1", commandId: crypto.randomUUID(), expectedVersion: 0 };
    expect((await post(enquiry)).status).toBe(200); expect(mocks.generate).toHaveBeenCalledWith(jobId, enquiry);
  });
  it("refuses malformed decimals, unversioned payloads and client tenant overrides", async () => {
    for (const input of [{}, { ...line(), tenantId: jobId }, { ...line(), changes: { packSize: { quantity: "invalid", unit: "m2" } } }]) {
      expect((await post(input)).status).toBe(400);
    }
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each([["MATERIALS_VERSION_CONFLICT", 409], ["MATERIALS_COMMAND_CONFLICT", 409], ["MATERIALS_EDITOR_REQUIRED", 403]] as const)("surfaces %s", async (code, status) => {
    mocks.saveLine.mockRejectedValue(new MaterialsError(code));
    const response = await post(line()); expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
  });
});
