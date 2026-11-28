import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteAddLineError } from "@jobguard/db";

const { cookie, session, workspace, add, failure } = vi.hoisted(() => ({
  cookie: vi.fn(), session: vi.fn(), workspace: vi.fn(), add: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../../../lib/synthetic-server", () => ({ hasSyntheticSession: session, practiceFailure: failure }));
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: jobId }) };
const allowed = "https://v2.jobguard.invalid";
const internal = `http://127.0.0.1:3400/api/v2-backend/jobs/${jobId}/quotes/lines`;
const post = (body: unknown, headers: Record<string, string> = { origin: allowed }) => new Request(internal,
  { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const command = { version: "v2-quote-add-line.v1", commandId: jobId, description: "Skip hire", promptId: "waste" };
const receipt = { version: "v2-quote-add-line-receipt.v1", scopeItemId: jobId, scopeRevisionId: jobId, description: "Skip hire", replayed: false };

beforeEach(() => {
  vi.clearAllMocks();
  cookie.mockReturnValue({ value: jobId });
  session.mockReturnValue(true);
  workspace.mockResolvedValue({ quoteLines: { add } });
  add.mockResolvedValue(receipt);
  failure.mockReturnValue(null);
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", allowed);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2-C6 add-line route", () => {
  it("is not found outside V2, and writes nothing", async () => {
    for (const value of ["", "0", "true"]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", value);
      expect((await POST(post(command), params)).status).toBe(404);
    }
    expect(workspace).not.toHaveBeenCalled();
  });

  it("needs a practice session and a configured origin", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    session.mockReturnValueOnce(false);
    expect((await POST(post(command), params)).status).toBe(401);
    expect((await POST(post(command, { origin: "https://elsewhere.invalid" }), params)).status).toBe(403);
    expect(add).not.toHaveBeenCalled();
  });

  it("passes the body unchanged, answers 201 for a new line and 200 for a replay", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const created = await POST(post(command), params);
    expect([created.status, created.headers.get("cache-control")]).toEqual([201, "no-store"]);
    expect(await created.json()).toEqual(receipt);
    expect(add).toHaveBeenCalledWith(jobId, command);
    add.mockResolvedValueOnce({ ...receipt, replayed: true });
    expect((await POST(post(command), params)).status).toBe(200);
  });

  it("maps refusals to codes only", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    expect((await POST(post("{"), params)).status).toBe(400);
    for (const [code, status, shown] of [["QUOTE_NOT_EDITABLE", 409, "QUOTE_NOT_EDITABLE"], ["QUOTE_COMMAND_CONFLICT", 409, "QUOTE_COMMAND_CONFLICT"],
      ["QUOTE_ADD_LINE_INVALID", 400, "QUOTE_ADD_LINE_INVALID"], ["QUOTE_EDITOR_REQUIRED", 403, "FORBIDDEN"]] as const) {
      add.mockRejectedValueOnce(new QuoteAddLineError(code));
      const response = await POST(post(command), params);
      expect([response.status, await response.json()]).toEqual([status, { code: shown }]);
    }
    add.mockRejectedValueOnce(new Error("boom"));
    expect((await POST(post(command), params)).status).toBe(503);
  });
});
