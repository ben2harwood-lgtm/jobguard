import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const errors = vi.hoisted(() => ({ HandoverReleaseError: class extends Error { constructor(readonly code: string) { super(code); } } }));
const page = vi.hoisted(() => ({ acknowledge: vi.fn(), open: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", () => ({ ...errors, HandoverLinkApplication: class { acknowledge = page.acknowledge; open = page.open; } }));
import { POST } from "./route";
const origin = "https://phone.jobguard.invalid";
const press = (headers: Record<string, string> = { origin }) => new Request("http://127.0.0.1:9999/api/v2/handover", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ version: "v2-handover-acknowledge.v1", token: "t" }) });
beforeEach(() => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
  page.acknowledge.mockResolvedValue({ version: 1, acknowledgedAt: "2026-11-26T18:00:00Z", replayed: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("V2-G3 acknowledge receipt route", () => {
  it("acknowledges with the token in the body, no-store, noindex and no referrer", async () => {
    const response = await POST(press());
    expect(response.status).toBe(200);
    expect(page.acknowledge).toHaveBeenCalledWith({ version: "v2-handover-acknowledge.v1", token: "t" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it.each([{}, { origin: "https://foreign.invalid" }])("refuses origin %j", async headers => {
    expect((await POST(press(headers))).status).toBe(403); expect(page.acknowledge).not.toHaveBeenCalled();
  });
  it("is unavailable outside V2 synthetic mode", async () => {
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    expect((await POST(press())).status).toBe(404); expect(page.acknowledge).not.toHaveBeenCalled();
  });
  it("gives every link refusal one body, and sanitises the rest", async () => {
    page.acknowledge.mockRejectedValueOnce(new errors.HandoverReleaseError("HANDOVER_LINK_REFUSED"));
    const refused = await POST(press());
    expect([refused.status, await refused.json()]).toEqual([404, { code: "HANDOVER_LINK_REFUSED" }]);
    page.acknowledge.mockRejectedValueOnce(new errors.HandoverReleaseError("HANDOVER_RELEASE_INVALID_COMMAND"));
    expect((await POST(press())).status).toBe(400);
    page.acknowledge.mockRejectedValueOnce(new Error("private"));
    const failed = await POST(press());
    expect([failed.status, await failed.json()]).toEqual([503, { code: "HANDOVER_LINK_UNAVAILABLE" }]);
  });
});
