import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const app = vi.hoisted(() => ({ read: vi.fn(), start: vi.fn(), record: vi.fn(), fileWalkPhoto: vi.fn(), compose: vi.fn(), failure: vi.fn() }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: app.compose }));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: app.failure }));
// Exercise B1A's real command schemas; persistence is tested by the full V2 seed suite.
vi.mock("../../../../../../../../packages/db/src/audit.js", () => ({}));
vi.mock("../../../../../../../../packages/db/src/tenant-context.js", () => ({}));
vi.mock("../../../../../../../../packages/db/src/practice-session.js", () => ({}));
vi.mock("@jobguard/api/workspace", async () => import("../../../../../../../../packages/db/src/v2-walk-repository.js"));
import { WalkError } from "../../../../../../../../packages/db/src/v2-walk-repository";
import { GET, POST } from "./route";

const origin = "https://phone.example.invalid";
const sessionId = "11111111-1111-4111-8111-111111111111";
const commandId = "22222222-2222-4222-8222-222222222222";
const start = { action: "start", version: "v2-walk-session-command.v1", sessionId, deviceStartedAt: "2026-11-25T16:00:00.000Z" };
const record = { action: "record", version: "v2-walk-entry-command.v1", sessionId, commandId,
  captureOrder: 1, expectedVersion: 0, deviceCapturedAt: "2026-11-25T16:00:00.000Z", entry: { kind: "room", room: "Kitchen" } };
const context = { params: Promise.resolve({ id: "job" }) };
function request(body: unknown, from: string | null = origin, headers = {}) {
  return new Request("http://127.0.0.1:3456/api/v2-backend/jobs/job/walk", { method: "POST",
    headers: { "content-type": "application/json", ...(from && { origin: from }), ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); vi.stubEnv("NODE_ENV", "production");
  for (const name of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "CF_PAGES_URL"]) vi.stubEnv(name, "");
  app.compose.mockResolvedValue({ walk: app }); app.read.mockResolvedValue([]); app.failure.mockReturnValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("B1B walk route", () => {
  it("reads persisted sessions with the optional session identity and no-store", async () => {
    app.read.mockResolvedValue([{ sessionId, entries: [] }]);
    const response = await GET(new Request(`${origin}/?sessionId=${sessionId}`), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ sessions: [{ sessionId, entries: [] }] });
    expect(app.read).toHaveBeenCalledWith("job", { version: "v2-walk-query.v1", sessionId });
  });
  it.each([start, record])("dispatches $action through the checked application at an internal HTTP URL", async command => {
    const method = command.action === "start" ? app.start : app.record;
    method.mockResolvedValue({ sessionId });
    const response = await POST(request(command), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const { action: _action, ...payload } = command;
    expect(method).toHaveBeenCalledWith("job", payload);
  });
  it.each([null, "https://foreign.invalid"])("refuses origin %s despite forged forwarding without invoking the application", async from => {
    const response = await POST(request(record, from, { "x-forwarded-host": "phone.example.invalid", "x-forwarded-proto": "https" }), context);
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ code: "ORIGIN_FORBIDDEN" });
    expect(app.compose).not.toHaveBeenCalled();
  });
  it("fails closed without configured origins, even when Origin matches the request address", async () => {
    vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); vi.stubEnv("AUTH_ALLOWED_ORIGIN", "");
    const response = await POST(request(record, "http://127.0.0.1:3456"), context);
    expect(response.status).toBe(403); expect(app.compose).not.toHaveBeenCalled();
  });
  it.each(["JOBGUARD_LOCAL_V2", "JOBGUARD_ENV"])("returns 404 outside V2 synthetic mode (%s)", async name => {
    vi.stubEnv(name, name === "JOBGUARD_LOCAL_V2" ? "0" : "pilot_no_charge");
    for (const response of [await GET(new Request(origin), context), await POST(request(start), context)]) {
      expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: "NOT_FOUND" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(app.compose).not.toHaveBeenCalled();
  });
  it.each([{ ...record, tenantId: "forged" }, { ...record, captureOrder: 0 }, { ...record, expectedVersion: -1 },
    { ...record, entry: { kind: "measurement", quantity: "1e2", unit: "m" } }, { ...record, action: "finish" }])("refuses malformed or authority-bearing input", async body => {
    expect((await POST(request(body), context)).status).toBe(400); expect(app.compose).not.toHaveBeenCalled();
  });
  it("refuses malformed JSON and a malformed query", async () => {
    expect((await POST(new Request(origin, { method: "POST", headers: { origin }, body: "{" }), context)).status).toBe(400);
    expect((await GET(new Request(`${origin}/?sessionId=wrong`), context)).status).toBe(400);
    expect(app.compose).not.toHaveBeenCalled();
  });
  it("returns code-only conflicts and sanitises unexpected failures", async () => {
    app.record.mockRejectedValueOnce(new WalkError("WALK_COMMAND_CONFLICT"));
    const conflict = await POST(request(record), context);
    expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ code: "WALK_COMMAND_CONFLICT" });
    app.record.mockRejectedValueOnce(new Error("private database details"));
    const failure = await POST(request(record), context);
    expect(failure.status).toBe(503); expect(await failure.json()).toEqual({ code: "WALK_UNAVAILABLE" });
  });
  it("preserves the existing practice-session refusal without exposing content", async () => {
    const error = new Error("not a member"); app.read.mockRejectedValue(error);
    app.failure.mockReturnValue(new Response('{"code":"NOT_FOUND"}', { status: 404, headers: { "Cache-Control": "no-store" } }));
    const response = await GET(new Request(origin), context);
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: "NOT_FOUND" });
    expect(app.failure).toHaveBeenCalledWith(error);
  });
});

// B1C extends the existing route, with the same origin and session boundary.
describe("B1C filing route", () => {
  const filing = { action: "file", version: "v2-walk-photo-filing-command.v1", sessionId, commandId,
    captureOrder: 1, roomCaptureOrder: 2, expectedVersion: 0, reason: "no_room" };
  it("dispatches a filing through the strict union", async () => {
    app.fileWalkPhoto.mockResolvedValue({ version: 1 });
    expect((await POST(request(filing), context)).status).toBe(200);
    const { action: _action, ...command } = filing;
    expect(app.fileWalkPhoto).toHaveBeenCalledWith("job", command);
  });
  it.each([{ actorMembershipId: commandId }, { reason: "anything" }, { roomCaptureOrder: 0 }, { entry: record.entry }])
    ("refuses malformed and mixed commands", async extra => {
      expect((await POST(request({ ...filing, ...extra }), context)).status).toBe(400);
      expect(app.compose).not.toHaveBeenCalled();
    });
  it.each([null, "https://foreign.invalid"])("refuses filing origin %s", async from => {
    expect((await POST(request(filing, from, { "x-forwarded-host": "phone.example.invalid", "x-forwarded-proto": "https" }), context)).status).toBe(403);
    expect(app.compose).not.toHaveBeenCalled();
  });
  it("keeps filings disabled outside V2", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await POST(request(filing), context)).status).toBe(404);
    expect(app.compose).not.toHaveBeenCalled();
  });
});
