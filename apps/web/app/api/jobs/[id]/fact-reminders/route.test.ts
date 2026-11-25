import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null, syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", () => ({ FactReminderApplication: class { read = state.read; run = state.run; },
  FactReplyApplication: class {} }));
import { GET, POST } from "./route";

const origin = "http://127.0.0.1:3400";
const context = { params: Promise.resolve({ id: "job" }) };
const body = { version: "v2-fact-reminder-command.v1", commandId: "11111111-1111-4111-8111-111111111111" };
const post = (from: string | null, headers: Record<string, string> = {}) => POST(new Request(`${origin}/api/jobs/job/fact-reminders`, {
  method: "POST", headers: { "content-type": "application/json", ...(from && { origin: from }), ...headers },
  body: JSON.stringify(body) }), context);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin);
});
afterEach(() => vi.unstubAllEnvs());

it("is not found outside local V2", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  expect((await GET(new Request(origin), context)).status).toBe(404);
  expect((await post(origin)).status).toBe(404);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.run).not.toHaveBeenCalled();
});

it("runs from the configured origin only, never a missing, foreign or forwarded one", async () => {
  state.run.mockResolvedValueOnce({ id: body.commandId, replayed: false, reminded: [], unconfirmed: [] });
  const accepted = await post(origin);
  expect(accepted.status).toBe(200);
  expect(state.run).toHaveBeenCalledWith("job", body);
  for (const refused of [await post("https://elsewhere.invalid"), await post(null),
    await post("https://elsewhere.invalid", { "x-forwarded-host": "127.0.0.1:3400", "x-forwarded-proto": "http" })]) {
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ code: "ORIGIN_REFUSED" });
  }
  expect(state.run).toHaveBeenCalledTimes(1);
});

it("maps a replay conflict to 409, other reminder codes to 400, and hides database detail", async () => {
  state.run.mockRejectedValueOnce(new Error("REMINDER_COMMAND_CONFLICT"));
  const conflict = await post(origin);
  expect([conflict.status, await conflict.json()]).toEqual([409, { code: "REMINDER_COMMAND_CONFLICT" }]);
  state.run.mockRejectedValueOnce(new Error("REMINDER_INVALID_COMMAND"));
  expect((await post(origin)).status).toBe(400);
  const broken = await POST(new Request(`${origin}/api/jobs/job/fact-reminders`, { method: "POST",
    headers: { "content-type": "application/json", origin }, body: "{" }), context);
  expect([broken.status, await broken.json()]).toEqual([400, { code: "REMINDER_INVALID_COMMAND" }]);
  state.read.mockRejectedValueOnce(new Error("private database diagnostics"));
  const failed = await GET(new Request(origin), context);
  expect(failed.status).toBe(503);
  expect(failed.headers.get("cache-control")).toBe("no-store");
  expect(await failed.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
});
