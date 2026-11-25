import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookie, session, workspace, get, failure } = vi.hoisted(() => ({
  cookie: vi.fn(), session: vi.fn(), workspace: vi.fn(), get: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ hasSyntheticSession: session, practiceFailure: failure }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: jobId }) };
const request = () => new Request(`https://fictional.invalid/api/v2-backend/jobs/${jobId}/quote-prompts`);

beforeEach(() => {
  vi.clearAllMocks();
  cookie.mockReturnValue({ value: jobId });
  session.mockReturnValue(true);
  workspace.mockResolvedValue({ capture: { get } });
  get.mockResolvedValue({});
  failure.mockReturnValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2 quote prompts route", () => {
  it("is not found outside V2, so non-V2 quoting shows no prompts and reads nothing", async () => {
    for (const value of [undefined, "0", "true"]) {
      if (value === undefined) vi.stubEnv("JOBGUARD_LOCAL_V2", ""); else vi.stubEnv("JOBGUARD_LOCAL_V2", value);
      const response = await GET(request(), params);
      expect(response.status).toBe(404);
    }
    expect(workspace).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("names the V2 template after confirming the firm can read the captured job", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: "v2-quote-prompts.v1", templateKey: "splashback-decorating.v1" });
    expect(get).toHaveBeenCalledWith(jobId);
  });

  it("refuses without a session and passes on access refusals", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    session.mockReturnValue(false);
    expect((await GET(request(), params)).status).toBe(401);
    expect(workspace).not.toHaveBeenCalled();
    session.mockReturnValue(true);
    const refused = new Response(null, { status: 403 });
    get.mockRejectedValue(new Error("denied"));
    failure.mockReturnValue(refused);
    expect(await GET(request(), params)).toBe(refused);
    failure.mockReturnValue(null);
    expect((await GET(request(), params)).status).toBe(503);
  });
});
