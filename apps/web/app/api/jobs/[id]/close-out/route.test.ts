import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ review: vi.fn(), pair: vi.fn(), denied: null as Response | null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fictional-session" }) }) }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ closeOut: { review: state.review } }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}), practiceFailure: () => state.denied }));
vi.mock("../../../../lib/linked-practice-entry", () => ({ enforcePracticePair: state.pair }));
import { GET } from "./route";
const context = { params: Promise.resolve({ id: "job" }) };
beforeEach(() => { vi.resetAllMocks(); state.denied = null; state.pair.mockResolvedValue(false); });

it("checks the browser pairing, then returns the review uncached", async () => {
  state.review.mockResolvedValue({ version: "v2-close-out-review.v1", environment: "synthetic_demo", review: null });
  const response = await GET(new Request("https://fictional.invalid"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(state.pair).toHaveBeenCalledWith({}, "fictional-session");
  expect(state.review).toHaveBeenCalledWith("job");
});
it("passes practice refusals through, such as another firm's job", async () => {
  state.denied = Response.json({ code: "NOT_FOUND" }, { status: 404 });
  state.review.mockRejectedValue(new Error("NOT_FOUND"));
  expect((await GET(new Request("https://fictional.invalid"), context)).status).toBe(404);
});
it("hides unexpected failures behind DATABASE_UNAVAILABLE", async () => {
  state.review.mockRejectedValue(new Error("private database diagnostics"));
  const response = await GET(new Request("https://fictional.invalid"), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
});
it("has no write export", async () => {
  expect(Object.keys(await import("./route.js")).sort()).toEqual(["GET", "dynamic"]);
});
