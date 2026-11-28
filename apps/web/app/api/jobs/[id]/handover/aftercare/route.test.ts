import { beforeEach, describe, expect, it, vi } from "vitest";
const { read, command, cookie, failure, aftercareFailure, constructed } = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), cookie: vi.fn(),
  failure: vi.fn(), aftercareFailure: vi.fn(), constructed: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ hasSyntheticSession: (value: unknown) => !!value, syntheticPool: () => "pool" }));
vi.mock("@jobguard/api/workspace", () => ({ jobSourceFailure: failure, aftercareFailure,
  AftercareApplication: class { constructor(...args: unknown[]) { constructed(...args); } read = read; command = command; } }));
import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "job" }) };
const post = (body: unknown) => new Request("https://fictional.invalid/", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  for (const mock of [read, command, failure, constructed]) mock.mockReset();
  aftercareFailure.mockReset().mockReturnValue(null); cookie.mockReturnValue({ value: "session" });
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
});

describe("V2-G9 aftercare route", () => {
  it("reads and commands with the caller's session, no-store", async () => {
    read.mockResolvedValue({ version: "v2-aftercare.v1" }); command.mockResolvedValue({ state: "sent", replayed: false });
    const answer = await GET(new Request("https://fictional.invalid/"), params);
    expect(await answer.json()).toEqual({ version: "v2-aftercare.v1" });
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(constructed).toHaveBeenCalledWith("pool", "session");
    expect(await (await POST(post({ version: "v2-aftercare-send.v1" }), params)).json()).toEqual({ state: "sent", replayed: false });
    expect(command).toHaveBeenCalledWith("job", { version: "v2-aftercare-send.v1" });
  });
  it("refuses no session and outside local V2 before constructing anything", async () => {
    cookie.mockReturnValue(undefined); failure.mockReturnValue({ status: 401, body: { code: "UNAUTHENTICATED" } });
    expect((await GET(new Request("https://fictional.invalid/"), params)).status).toBe(401);
    cookie.mockReturnValue({ value: "session" }); failure.mockReturnValue({ status: 403, body: { code: "SYNTHETIC_MODE_REQUIRED" } });
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await POST(post({}), params)).status).toBe(403);
    expect(constructed).not.toHaveBeenCalled();
  });
  it("maps release refusals first, then the job-source mapping", async () => {
    command.mockRejectedValueOnce(new Error("x"));
    aftercareFailure.mockReturnValueOnce({ status: 409, body: { code: "AFTERCARE_NOT_DUE" } });
    const refused = await POST(post({}), params);
    expect([refused.status, (await refused.json()).code]).toEqual([409, "AFTERCARE_NOT_DUE"]);
    read.mockRejectedValueOnce(new Error("forbidden")); failure.mockReturnValueOnce({ status: 404, body: { code: "NOT_FOUND" } });
    expect((await GET(new Request("https://fictional.invalid/"), params)).status).toBe(404);
  });
});
