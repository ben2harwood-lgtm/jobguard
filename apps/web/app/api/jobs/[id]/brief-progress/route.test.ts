import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const workspace = vi.hoisted(() => ({ briefProgress: { read: vi.fn(), record: vi.fn(), uploadPhoto: vi.fn() } }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: vi.fn(async () => workspace) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
vi.mock("@jobguard/api/workspace", () => ({ BriefProgressError: class extends Error {} }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "job-id" }) };
const origin = "https://phone.jobguard.invalid";
const request = (headers: Record<string, string> = {}) => new Request("http://127.0.0.1:9999/api/jobs/job-id/brief-progress", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ kind: "done" }),
});
beforeEach(() => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "CF_PAGES_URL"]) vi.stubEnv(key, "");
  workspace.briefProgress.record.mockResolvedValue({ recorded: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("V2-F1 trusted browser adapter", () => {
  it("accepts configured HTTPS origin through an internal HTTP request URL", async () => {
    const response = await POST(request({ origin }), context);
    expect(response.status).toBe(200);
    expect(workspace.briefProgress.record).toHaveBeenCalledWith("job-id", { kind: "done" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([{}, { origin: "https://foreign.invalid" }, { origin: "http://127.0.0.1:9999" },
    { "x-forwarded-host": "phone.jobguard.invalid", "x-forwarded-proto": "https" }])("refuses missing/foreign/forged origins %j", async headers => {
    expect((await POST(request(headers), context)).status).toBe(403);
    expect(workspace.briefProgress.record).not.toHaveBeenCalled();
  });
  it("fails closed when no trusted origin is configured, even when Origin matches the request URL", async () => {
    vi.stubEnv("AUTH_ALLOWED_ORIGIN", ""); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "");
    expect((await POST(request({ origin: "http://127.0.0.1:9999" }), context)).status).toBe(403);
    expect(workspace.briefProgress.record).not.toHaveBeenCalled();
  });
  it("leaves non-V2 reads and writes unavailable", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await GET(new Request(origin), context)).status).toBe(404);
    expect((await POST(request({ origin }), context)).status).toBe(404);
    expect(workspace.briefProgress.read).not.toHaveBeenCalled();
    expect(workspace.briefProgress.record).not.toHaveBeenCalled();
  });
  it.each(["JOB_WORK_CLOSED", "POST_LOCK_WORK_REQUIRES_LINKED_JOB"])("preserves stage refusal %s", async code => {
    workspace.briefProgress.record.mockRejectedValueOnce(new Error(code));
    const response = await POST(request({ origin }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code });
  });
  it("passes through the registered live-job refusal", async () => {
    workspace.briefProgress.record.mockRejectedValueOnce(Object.assign(new Error("JOB_NOT_LIVE"), { code: "JOB_NOT_LIVE" }));
    expect((await POST(request({ origin }), context)).status).toBe(409);
  });
});

it("dispatches photo bodies through the same origin-gated route", async () => {
  const body = { version: "v2-brief-progress-photo-command.v1", commandId: "photo", scopeItemId: "scope", fixture: "completion-photo" };
  const make = (allowed: boolean) => new Request("http://127.0.0.1:9999/api/jobs/job-id/brief-progress", {
    method: "POST", headers: { "content-type": "application/json", ...(allowed && { origin }) }, body: JSON.stringify(body),
  });
  workspace.briefProgress.uploadPhoto.mockResolvedValue({ uploadId: "photo", evidenceId: "photo", state: "verified" });
  expect((await POST(make(true), context)).status).toBe(200);
  expect(workspace.briefProgress.uploadPhoto).toHaveBeenCalledWith("job-id", body);
  expect((await POST(make(false), context)).status).toBe(403);
  expect(workspace.briefProgress.uploadPhoto).toHaveBeenCalledTimes(1);
  vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
  expect((await POST(make(true), context)).status).toBe(404);
});
