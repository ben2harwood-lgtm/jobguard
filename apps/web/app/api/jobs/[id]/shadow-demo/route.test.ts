import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), session: "current-session", pool: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.session }) }) }));
vi.mock("@jobguard/api/workspace", () => ({ ShadowDemoApplication: class { read = state.read; } }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => state.pool, practiceFailure: (e: unknown) => e instanceof Error && e.message === "NOT_FOUND" ? Response.json({ code: "NOT_FOUND" }, { status: 404 }) : null }));
import { GET } from "./route";
const params = { params: Promise.resolve({ id: "saved-job" }) };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); });
afterEach(() => vi.unstubAllEnvs());
it("refuses non-synthetic requests without reading", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production"); expect((await GET(new Request("https://fictional.invalid"), params)).status).toBe(403); expect(state.read).not.toHaveBeenCalled();
});
it("forwards the exact subject and query for application validation; never caches", async () => {
 state.read.mockResolvedValue({ status: "incomplete" }); const result = await GET(new Request("https://fictional.invalid?approved=true"), params);
 expect(state.read).toHaveBeenCalledWith("saved-job", { approved: "true" }); expect(result.headers.get("Cache-Control")).toBe("no-store");
});
it("foreign jobs stay unavailable and error paths never cache", async () => {
 state.read.mockRejectedValue(new Error("NOT_FOUND")); const result = await GET(new Request("https://fictional.invalid"), params);
 expect(result.status).toBe(404); expect(await result.json()).toEqual({ code: "NOT_FOUND" }); expect(result.headers.get("Cache-Control")).toBe("no-store");
 state.read.mockRejectedValue(new Error("private source detail")); const failure = await GET(new Request("https://fictional.invalid"), params);
 expect(failure.status).toBe(503); expect(await failure.json()).toEqual({ code: "SHADOW_DEMO_UNAVAILABLE" });
});
it("query refusals remain typed without exposing internal diagnostics", async () => {
 state.read.mockRejectedValue(Object.assign(new Error("INVALID_SHADOW_DEMO_QUERY"), { code: "INVALID_SHADOW_DEMO_QUERY" }));
 const result = await GET(new Request("https://fictional.invalid?approved=true"), params);
 expect(result.status).toBe(400); expect(await result.json()).toEqual({ code: "INVALID_SHADOW_DEMO_QUERY" });
});

it("returns the v2 report and preserves the complete mapped value union", async () => {
 const report = { version: "shadow-demo-report.v2", jobId: "saved-job",
  customerApproval: { state: "awaiting_customer", approvals: [] },
  value: { version: "job-value.v3", status: "mapped", receipt: { sources: { jobId: "saved-job" } } } };
 state.read.mockResolvedValue(report);
 const response = await GET(new Request("https://fictional.invalid"), params);
 expect(response.status).toBe(200); expect(await response.json()).toEqual(report);
 expect(response.headers.get("Cache-Control")).toBe("no-store");
});
