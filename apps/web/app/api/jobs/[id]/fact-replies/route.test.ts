import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null, syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", () => ({ FactReplyApplication: class { read = state.read; command = state.command; } }));
import { GET, POST } from "./route";

const origin = "http://127.0.0.1:3400";
const context = { params: Promise.resolve({ id: "job" }) };
const post = (from: string) => POST(new Request(`${origin}/api/jobs/job/fact-replies`, { method: "POST",
  headers: { "content-type": "application/json", origin: from }, body: JSON.stringify({ action: "cancel" }) }), context);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin);
});
afterEach(() => vi.unstubAllEnvs());

it("is not found outside local V2", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
  expect((await GET(new Request(origin), context)).status).toBe(404);
  expect((await post(origin)).status).toBe(404);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.command).not.toHaveBeenCalled();
});

it("refuses a builder command from another origin", async () => {
  const response = await post("https://elsewhere.invalid");
  expect(response.status).toBe(403);
  expect(state.command).not.toHaveBeenCalled();
});

it("returns typed conflicts and hides database detail", async () => {
  state.command.mockRejectedValueOnce(new Error("REPLY_OUT_OF_DATE"));
  const stale = await post(origin);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({ code: "REPLY_OUT_OF_DATE" });
  state.read.mockRejectedValueOnce(new Error("private database diagnostics"));
  const failed = await GET(new Request(origin), context);
  expect(failed.status).toBe(503);
  expect(failed.headers.get("cache-control")).toBe("no-store");
  expect(await failed.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
});
