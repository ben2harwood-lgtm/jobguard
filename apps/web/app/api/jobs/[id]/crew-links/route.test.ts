import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const errors = vi.hoisted(() => ({ CrewLinkError: class extends Error { constructor(readonly code: string) { super(code); } } }));
const workspace = vi.hoisted(() => ({ crewLinks: { read: vi.fn(), command: vi.fn() } }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: vi.fn(async () => workspace) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
vi.mock("@jobguard/api/workspace", () => errors);
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "job-id" }) };
const origin = "https://phone.jobguard.invalid";
const request = (headers: Record<string, string> = {}) => new Request("http://127.0.0.1:9999/api/jobs/job-id/crew-links", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ action: "issue" }),
});
beforeEach(() => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "CF_PAGES_URL"]) vi.stubEnv(key, "");
  workspace.crewLinks.command.mockResolvedValue({ action: "issue", linkId: "l", token: "t" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("V2-F7M builder crew-link route", () => {
  it("issues through the application at the configured origin, no-store", async () => {
    const response = await POST(request({ origin }), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(workspace.crewLinks.command).toHaveBeenCalledWith("job-id", { action: "issue" });
  });
  it.each([{}, { origin: "https://foreign.invalid" }, { "x-forwarded-host": "phone.jobguard.invalid", "x-forwarded-proto": "https" }])
    ("refuses missing, foreign or forged origins %j", async headers => {
      expect((await POST(request(headers), context)).status).toBe(403);
      expect(workspace.crewLinks.command).not.toHaveBeenCalled();
    });
  it("is unavailable outside V2", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await GET(new Request(origin), context)).status).toBe(404);
    expect((await POST(request({ origin }), context)).status).toBe(404);
    expect(workspace.crewLinks.read).not.toHaveBeenCalled();
  });
  it.each([["CREW_LINK_INVALID_COMMAND", 400], ["CREW_LINK_EDITOR_REQUIRED", 403], ["CREW_LINK_NOT_FOUND", 404],
    ["CREW_LINK_COMMAND_CONFLICT", 409], ["CREW_LINK_CREW_UNAVAILABLE", 409]] as const)("maps %s to %i", async (code, status) => {
    workspace.crewLinks.command.mockRejectedValueOnce(new errors.CrewLinkError(code));
    const response = await POST(request({ origin }), context);
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
  });
  it("sanitises unexpected failures", async () => {
    workspace.crewLinks.read.mockRejectedValueOnce(new Error("private database details"));
    const response = await GET(new Request(origin), context);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "CREW_LINK_UNAVAILABLE" });
  });
});
