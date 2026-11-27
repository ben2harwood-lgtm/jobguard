import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const errors = vi.hoisted(() => ({ CrewLinkError: class extends Error { constructor(readonly code: string) { super(code); } } }));
const page = vi.hoisted(() => ({ receive: vi.fn(), open: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", () => ({ ...errors, CrewLinkPageApplication: class { receive = page.receive; open = page.open; } }));
import { POST } from "./route";
const origin = "https://phone.jobguard.invalid";
const press = (headers: Record<string, string> = { origin }) => new Request("http://127.0.0.1:9999/api/v2/brief", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ token: "t", kind: "done" }) });
beforeEach(() => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
  page.receive.mockResolvedValue({ commandId: "c", kind: "done", replayed: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("V2-F7M crew press route", () => {
  it("records with the token in the body, no-store, noindex and no referrer", async () => {
    const response = await POST(press());
    expect(response.status).toBe(200);
    expect(page.receive).toHaveBeenCalledWith({ token: "t", kind: "done" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it.each([{}, { origin: "https://foreign.invalid" }, { origin: "http://127.0.0.1:9999" }])("refuses origin %j", async headers => {
    expect((await POST(press(headers))).status).toBe(403); expect(page.receive).not.toHaveBeenCalled();
  });
  it("is unavailable outside V2 synthetic mode", async () => {
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    expect((await POST(press())).status).toBe(404); expect(page.receive).not.toHaveBeenCalled();
  });
  it.each(["CREW_LINK_REFUSED", "CREW_LINK_COMMAND_CONFLICT", "CREW_LINK_NOT_FOUND"])("gives %s the one refusal body", async code => {
    page.receive.mockRejectedValueOnce(new errors.CrewLinkError(code));
    const response = await POST(press());
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: "CREW_LINK_REFUSED" });
  });
  it("tells a changed brief and an invalid press apart, and sanitises the rest", async () => {
    page.receive.mockRejectedValueOnce(new errors.CrewLinkError("CREW_LINK_STALE"));
    expect((await POST(press())).status).toBe(409);
    page.receive.mockRejectedValueOnce(new errors.CrewLinkError("CREW_LINK_INVALID_COMMAND"));
    expect((await POST(press())).status).toBe(400);
    page.receive.mockRejectedValueOnce(new Error("private"));
    const failed = await POST(press());
    expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ code: "CREW_LINK_UNAVAILABLE" });
  });
});
