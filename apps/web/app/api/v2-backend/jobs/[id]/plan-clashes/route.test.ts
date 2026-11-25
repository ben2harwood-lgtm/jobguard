import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookie, session, workspace, read, failure } = vi.hoisted(() => ({
  cookie: vi.fn(), session: vi.fn(), workspace: vi.fn(), read: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ hasSyntheticSession: session, practiceFailure: failure }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: jobId }) };
const request = () => new Request(`https://fictional.invalid/api/v2-backend/jobs/${jobId}/plan-clashes`);
const body = { version: "v2-plan-clashes.v1", jobId, tasks: [{ scopeItemId: jobId, taskKey: "tile", scheduledDate: "2026-12-01",
  clashes: [{ jobTitle: "Other fictional job", scheduledDate: "2026-12-01" }] }] };

beforeEach(() => {
  vi.clearAllMocks();
  cookie.mockReturnValue({ value: jobId });
  session.mockReturnValue(true);
  workspace.mockResolvedValue({ planClashes: { read } });
  read.mockResolvedValue(body);
  failure.mockReturnValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2 plan clashes route", () => {
  it("is not found outside V2 and reads nothing", async () => {
    for (const value of ["", "0", "true"]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", value);
      expect((await GET(request(), params)).status).toBe(404);
    }
    expect(workspace).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("returns the firm's clashes for the job, uncached", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(body);
    expect(read).toHaveBeenCalledWith(jobId);
  });

  it("refuses without a session and passes on access refusals as typed codes", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    session.mockReturnValue(false);
    const signedOut = await GET(request(), params);
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toEqual({ code: "UNAUTHENTICATED" });
    expect(workspace).not.toHaveBeenCalled();
    session.mockReturnValue(true);
    const refused = new Response(null, { status: 404 });
    read.mockRejectedValue(new Error("denied"));
    failure.mockReturnValue(refused);
    expect(await GET(request(), params)).toBe(refused);
    failure.mockReturnValue(null);
    const unavailable = await GET(request(), params);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ code: "PLAN_CLASHES_UNAVAILABLE" });
  });
});
