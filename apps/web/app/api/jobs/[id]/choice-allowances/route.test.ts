import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn() }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ choiceAllowances: state }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "job" }) };
const env = { ...process.env };
const post = (origin: string | null, url = "http://127.0.0.1:3400/api/jobs/job/choice-allowances", extra: Record<string, string> = {}) =>
  POST(new Request(url, { method: "POST", body: "{}", headers: { ...(origin ? { origin } : {}), ...extra } }), context);
beforeEach(() => {
  vi.resetAllMocks();
  process.env = { ...env, JOBGUARD_ALLOWED_ORIGINS: "https://10.77.0.2:3443", NODE_ENV: "production" };
  state.command.mockResolvedValue({ ok: true });
});

it("accepts a configured origin through an internal http request URL", async () => {
  const response = await post("https://10.77.0.2:3443");
  expect(response.status).toBe(200);
  expect(state.command).toHaveBeenCalledWith("job", {});
});
it.each([null, "https://evil.invalid"])("refuses a missing or foreign origin (%s)", async origin => {
  const response = await post(origin);
  expect(response.status).toBe(403);
  expect(state.command).not.toHaveBeenCalled();
});
it("refuses forged forwarded headers and an origin that only matches the request URL", async () => {
  expect((await post("https://evil.invalid", "http://127.0.0.1:3400/x", { "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "https" })).status).toBe(403);
  expect((await post("http://127.0.0.1:3400")).status).toBe(403);
  delete process.env.JOBGUARD_ALLOWED_ORIGINS;
  expect((await post("https://10.77.0.2:3443")).status).toBe(403);
});
it("keeps typed codes, maps variation refusals and hides unexpected failures", async () => {
  state.command.mockRejectedValueOnce(Object.assign(new Error("CHOICE_ALLOWANCE_VERSION_CONFLICT"), { code: "CHOICE_ALLOWANCE_VERSION_CONFLICT" }));
  const conflict = await post("https://10.77.0.2:3443");
  expect([conflict.status, await conflict.json()]).toEqual([409, { code: "CHOICE_ALLOWANCE_VERSION_CONFLICT" }]);
  state.command.mockRejectedValueOnce(Object.assign(new Error("JOB_WORK_CLOSED"), { code: "JOB_WORK_CLOSED" }));
  const closed = await post("https://10.77.0.2:3443");
  expect([closed.status, await closed.json()]).toEqual([409, { code: "CHOICE_ALLOWANCE_DRAFT_REFUSED" }]);
  state.read.mockRejectedValueOnce(new Error("private database diagnostics"));
  const failed = await GET(new Request("http://127.0.0.1:3400"), context);
  expect([failed.status, failed.headers.get("cache-control"), await failed.json()]).toEqual([503, "no-store", { code: "DATABASE_UNAVAILABLE" }]);
});
