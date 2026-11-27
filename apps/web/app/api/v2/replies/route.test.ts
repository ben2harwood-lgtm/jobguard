import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ receive: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../../../lib/synthetic-server", () => ({ practiceFailure: () => null, syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", () => ({ FactReplyApplication: class { receive = state.receive; } }));
import { POST } from "./route";

const origin = "https://192.168.1.24:3400";
const token = "A".repeat(43);
const post = (body: unknown, from: string | null = origin) => POST(new Request(`${origin}/api/v2/replies`, {
  method: "POST", headers: { "content-type": "application/json", ...(from ? { origin: from } : {}) }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
});
afterEach(() => vi.unstubAllEnvs());

it("takes the token from the body and passes only the answer on", async () => {
  state.receive.mockResolvedValue({ action: "receive", id: "reply", replayed: false });
  const response = await post({ token, version: "v2-fact-reply-link.v1", commandId: "c", answer: { choice: "White" } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(state.receive).toHaveBeenCalledWith(token, { version: "v2-fact-reply-link.v1", commandId: "c", answer: { choice: "White" } });
});

it.each([["another origin", "https://elsewhere.invalid"], ["no origin", null]])("refuses %s before reading the token", async (_name, from) => {
  const response = await post({ token }, from);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "REPLY_LINK_REFUSED" });
  expect(state.receive).not.toHaveBeenCalled();
});

it("is not found outside local V2", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
  expect((await post({ token })).status).toBe(404);
  expect(state.receive).not.toHaveBeenCalled();
});

it("keeps the token out of every error and hides database detail", async () => {
  for (const [message, status, code] of [["REPLY_LINK_REFUSED", 404, "REPLY_LINK_REFUSED"], ["REPLY_ANSWER_INVALID", 400, "REPLY_ANSWER_INVALID"],
    ["REPLY_ALREADY_ANSWERED", 409, "REPLY_ALREADY_ANSWERED"], [`private database diagnostics ${token}`, 503, "REPLY_UNAVAILABLE"]] as const) {
    state.receive.mockRejectedValueOnce(new Error(message));
    const response = await post({ token, answer: {} });
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ code });
    expect(text).not.toContain(token);
  }
});
