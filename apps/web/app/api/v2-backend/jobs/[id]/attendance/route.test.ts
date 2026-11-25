import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteAttendanceError } from "@jobguard/db";

const { cookie, session, workspace, list, record, failure } = vi.hoisted(() => ({
  cookie: vi.fn(), session: vi.fn(), workspace: vi.fn(), list: vi.fn(), record: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ hasSyntheticSession: session, practiceFailure: failure }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET, POST } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: jobId }) };
const url = `https://fictional.invalid/api/v2-backend/jobs/${jobId}/attendance`;
const post = (body: unknown) => new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const command = { version: "v2-site-attendance-command.v1", commandId: jobId, day: "2026-11-25", person: { kind: "builder" },
  expectedVersion: 0, onSite: true, note: null };

beforeEach(() => {
  vi.clearAllMocks();
  cookie.mockReturnValue({ value: jobId });
  session.mockReturnValue(true);
  workspace.mockResolvedValue({ siteAttendance: { list, record } });
  list.mockResolvedValue({ version: "v2-site-attendance.v1" });
  record.mockResolvedValue({ revision: 1 });
  failure.mockReturnValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2-F8 attendance route", () => {
  it("is not found outside V2, and reads or writes nothing", async () => {
    for (const value of ["", "0", "true"]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", value);
      expect((await GET(new Request(url), params)).status).toBe(404);
      expect((await POST(post(command), params)).status).toBe(404);
    }
    expect(workspace).not.toHaveBeenCalled();
  });

  it("reads this job's taps through the application with the V2 query", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: "v2-site-attendance.v1" });
    expect(list).toHaveBeenCalledWith(jobId, { version: "v2-site-attendance-query.v1" });
  });

  it("passes the posted body unchanged to the strict command, and answers 201", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const response = await POST(post(command), params);
    expect(response.status).toBe(201);
    expect(record).toHaveBeenCalledWith(jobId, command);
    expect((await POST(post("{not json"), params)).status).toBe(400);
  });

  it("refuses without a session with a typed code, and passes on access refusals", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    session.mockReturnValue(false);
    for (const response of [await GET(new Request(url), params), await POST(post(command), params)]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
    }
    expect(workspace).not.toHaveBeenCalled();
    session.mockReturnValue(true);
    const refused = new Response(null, { status: 404 });
    list.mockRejectedValue(new Error("hidden"));
    failure.mockReturnValue(refused);
    expect(await GET(new Request(url), params)).toBe(refused);
    failure.mockReturnValue(null);
    expect((await GET(new Request(url), params)).status).toBe(503);
  });

  it("maps attendance refusals to typed codes", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const cases: [SiteAttendanceError["code"], number, string][] = [
      ["SITE_ATTENDANCE_INVALID", 400, "SITE_ATTENDANCE_INVALID"],
      ["SITE_ATTENDANCE_VERSION_CONFLICT", 409, "SITE_ATTENDANCE_VERSION_CONFLICT"],
      ["CREW_CONTACT_UNAVAILABLE", 422, "CREW_CONTACT_UNAVAILABLE"],
      ["SITE_ATTENDANCE_EDITOR_REQUIRED", 403, "FORBIDDEN"],
    ];
    for (const [code, status, typed] of cases) {
      record.mockRejectedValueOnce(new SiteAttendanceError(code));
      const response = await POST(post(command), params);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code: typed });
    }
  });
});
