import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ hold: vi.fn(), read: vi.fn(), inputs: vi.fn(), link: vi.fn(), pool: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("@jobguard/api/workspace", () => ({
 ShadowDemoGuideApplication: class { requestSourceHold = state.hold; sourceHoldState = state.read; reviewInputs = state.inputs; issueCustomerLink = state.link; },
 shadowDemoGuideFailure: () => ({ status: 503, code: "SHADOW_GUIDE_UNAVAILABLE" }),
}));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: state.pool }));
vi.mock("../../../../../lib/identity-server", () => ({ identityApplication: () => ({ allowedOrigin: "https://fictional.invalid", provider: { digest: (v: string) => v } }) }));
import * as hold from "./route";
import * as inputs from "../review-inputs/route";
import * as link from "../customer-link/route";
const params = { params: Promise.resolve({ id: "saved-job" }) };
const post = (origin = "https://fictional.invalid") => new Request("https://fictional.invalid", { method: "POST", headers: { origin }, body: "{}" });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); });
afterEach(() => vi.unstubAllEnvs());
it("every demo helper is refused outside synthetic_demo before any read or write", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production");
 for (const response of [await hold.GET(new Request("https://fictional.invalid"), params), await hold.POST(post(), params), await inputs.GET(new Request("https://fictional.invalid"), params), await link.POST(post(), params)]) {
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ code: "SYNTHETIC_MODE_REQUIRED" });
 }
 expect(state.pool).not.toHaveBeenCalled();
 for (const port of [state.hold, state.read, state.inputs, state.link]) expect(port).not.toHaveBeenCalled();
});
it("the customer link refuses another origin and never caches", async () => {
 const refused = await link.POST(post("https://elsewhere.invalid"), params);
 expect(refused.status).toBe(409); expect(state.link).not.toHaveBeenCalled(); expect(refused.headers.get("Cache-Control")).toBe("no-store");
 state.link.mockResolvedValue({ path: "/customer/sign-in#x" });
 expect((await link.POST(post(), params)).status).toBe(200); expect(state.link).toHaveBeenCalledWith("saved-job", {}, expect.any(Function));
});
it("sanitises failures", async () => {
 state.read.mockRejectedValue(new Error("private detail"));
 const failed = await hold.GET(new Request("https://fictional.invalid"), params);
 expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ code: "SHADOW_GUIDE_UNAVAILABLE" });
});

it("SV-5 Test I: must-surface requests stay off in every non-practice environment", async () => {
 for (const environment of ["production_billing", "pilot_no_charge", "provider_sandbox", "disabled", ""]) {
  vi.stubEnv("JOBGUARD_ENV", environment);
  for (const response of [await hold.GET(new Request("https://fictional.invalid"), params), await hold.POST(post(), params)]) {
   expect(response.status).toBe(403);
   expect(await response.json()).toEqual({ code: "SYNTHETIC_MODE_REQUIRED" });
   expect(response.headers.get("cache-control")).toBe("no-store");
  }
 }
 expect(state.pool).not.toHaveBeenCalled();
 expect(state.hold).not.toHaveBeenCalled();
 expect(state.read).not.toHaveBeenCalled();
});
it("SV-5 Test I: practice mode uses the existing authorized worker request", async () => {
 state.hold.mockResolvedValue({ state: "requested", realExternalActions: 0 });
 const response = await hold.POST(post(), params);
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({ state: "requested", realExternalActions: 0 });
 expect(state.hold).toHaveBeenCalledExactlyOnceWith("saved-job");
});
