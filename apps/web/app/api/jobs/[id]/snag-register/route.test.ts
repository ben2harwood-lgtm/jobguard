import { beforeEach, describe, expect, it, vi } from "vitest";
const { read, command, cookie, failure, registerFailure, constructed } = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), cookie: vi.fn(),
  failure: vi.fn(), registerFailure: vi.fn(), constructed: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ hasSyntheticSession: (value: unknown) => !!value, syntheticPool: () => "pool" }));
vi.mock("@jobguard/api/workspace", () => ({ jobSourceFailure: failure, snagRegisterFailure: registerFailure,
  SnagRegisterApplication: class { constructor(...args: unknown[]) { constructed(...args); } read = read; command = command; } }));
import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "job" }) };
const post = (body: unknown) => new Request("https://fictional.invalid/", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  for (const mock of [read, command, failure, constructed]) mock.mockReset();
  registerFailure.mockReset().mockReturnValue(null); cookie.mockReturnValue({ value: "session" });
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
});

describe("V2-G1 snag register route", () => {
  it("reads and commands with the caller's session, no-store", async () => {
    read.mockResolvedValue({ version: "v2-snag-register.v1" }); command.mockResolvedValue({ version: "v2-snag-register.v1", saved: true });
    const answer = await GET(new Request("https://fictional.invalid/"), params);
    expect(await answer.json()).toEqual({ version: "v2-snag-register.v1" });
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(constructed).toHaveBeenCalledWith("pool", "session");
    expect(await (await POST(post({ version: "v2-snag-owner-command.v1" }), params)).json()).toEqual({ version: "v2-snag-register.v1", saved: true });
    expect(command).toHaveBeenCalledWith("job", { version: "v2-snag-owner-command.v1" });
  });
  it("refuses no session, outside local V2 and in pilot mode before constructing anything", async () => {
    cookie.mockReturnValue(undefined); failure.mockReturnValue({ status: 401, body: { code: "UNAUTHENTICATED" } });
    expect((await GET(new Request("https://fictional.invalid/"), params)).status).toBe(401);
    expect((await POST(post({}), params)).status).toBe(401);
    cookie.mockReturnValue({ value: "session" }); failure.mockReturnValue({ status: 403, body: { code: "SYNTHETIC_MODE_REQUIRED" } });
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await GET(new Request("https://fictional.invalid/"), params)).status).toBe(403);
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    expect((await POST(post({}), params)).status).toBe(403);
    expect(constructed).not.toHaveBeenCalled();
  });
  it("maps register refusals first; an invalid session or the second firm is the job-source 404", async () => {
    const fixer = new Error("V2_SNAG_CHECKER_IS_FIXER"); command.mockRejectedValueOnce(fixer);
    registerFailure.mockReturnValueOnce({ status: 409, body: { code: "V2_SNAG_CHECKER_IS_FIXER" } });
    const answer = await POST(post({}), params);
    expect([answer.status, await answer.json()]).toEqual([409, { code: "V2_SNAG_CHECKER_IS_FIXER" }]);
    expect(registerFailure).toHaveBeenCalledWith(fixer);
    read.mockRejectedValueOnce(new Error("NOT_FOUND")); failure.mockReturnValueOnce({ status: 404, body: { code: "NOT_FOUND" } });
    expect((await GET(new Request("https://fictional.invalid/"), params)).status).toBe(404);
  });
});
