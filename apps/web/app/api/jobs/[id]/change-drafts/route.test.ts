import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => cookie.value === undefined ? undefined : { value: cookie.value } })) }));
const app = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), command: vi.fn(), sessions: [] as (string | undefined)[] }));
vi.mock("@jobguard/api/workspace", () => ({ ChangeDraftApplication: vi.fn(function (_pool: unknown, sessionId?: string) {
  app.sessions.push(sessionId); return app; }) }));
vi.mock("@jobguard/db", () => ({ assertExtraLinkMode: vi.fn(() => {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new Error("LINK_UNAVAILABLE"); }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: vi.fn() }));
import { GET, POST } from "./route";

const origin = "https://127.0.0.1:3400";
const params = { params: Promise.resolve({ id: "job-1" }) };
const post = (body: unknown, from = origin) => POST(new Request(`${origin}/api/jobs/job-1/change-drafts`,
  { method: "POST", headers: { origin: from, "content-type": "application/json" }, body: JSON.stringify(body) }), params);
const refusal = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => { vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin); cookie.value = "session-1"; app.sessions = []; });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("GET lists with the signed-in session and no-store headers", async () => {
  app.list.mockResolvedValue({ version: "v2-change-drafts.v1", lines: [], drafts: [] });
  const response = await GET(new Request(origin), params);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(app.list).toHaveBeenCalledWith("job-1");
  expect(app.sessions).toEqual(["session-1"]);
});

it("GET refuses no session, an invalid session and the second firm as one 404", async () => {
  for (const code of ["UNAUTHENTICATED", "NOT_FOUND"]) {
    app.list.mockRejectedValueOnce(refusal(code));
    const response = await GET(new Request(origin), params);
    expect([response.status, await response.json()]).toEqual([404, { code: "NOT_FOUND" }]);
  }
  vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
  expect((await GET(new Request(origin), params)).status).toBe(404);
});

it("POST sends a preview to preview and anything else to command", async () => {
  app.preview.mockResolvedValue({ delta: "1.5" });
  app.command.mockResolvedValue({ revisionId: "r" });
  const preview = { version: "v2-change-draft-preview.v1", quoteLineId: "l", newQuantity: "7.5" };
  expect(await (await post(preview)).json()).toEqual({ delta: "1.5" });
  expect(app.preview).toHaveBeenCalledWith("job-1", preview);
  expect(await (await post({ version: "v2-change-draft-command.v1", action: "confirm" })).json()).toEqual({ revisionId: "r" });
  expect(app.command).toHaveBeenCalledTimes(1);
});

it("POST refuses another origin before any work", async () => {
  const response = await post({ version: "v2-change-draft-preview.v1" }, "https://other.invalid");
  expect(response.status).toBe(404);
  expect(app.preview).not.toHaveBeenCalled();
});

it.each([
  ["CHANGE_DRAFT_INVALID_COMMAND", 400], ["CHANGE_DRAFT_NO_CHANGE", 422], ["CHANGE_DRAFT_LINE_UNPRICED", 422],
  ["CHANGE_DRAFT_FORBIDDEN", 403], ["CHANGE_DRAFT_LINE_NOT_FOUND", 404], ["CHANGE_DRAFT_COMMAND_CONFLICT", 409],
  ["CHANGE_DRAFT_VERSION_CONFLICT", 409], ["CHANGE_DRAFT_NOT_APPROVED", 409],
])("maps %s to %i", async (code, status) => {
  app.command.mockRejectedValueOnce(refusal(code));
  const response = await post({ version: "v2-change-draft-command.v1" });
  expect([response.status, await response.json()]).toEqual([status, { code }]);
});

it("an unexpected failure is 503 and says nothing more", async () => {
  app.command.mockRejectedValueOnce(new Error("connection reset"));
  const response = await post({ version: "v2-change-draft-command.v1" });
  expect([response.status, await response.json()]).toEqual([503, { code: "CHANGE_DRAFT_UNAVAILABLE" }]);
});
