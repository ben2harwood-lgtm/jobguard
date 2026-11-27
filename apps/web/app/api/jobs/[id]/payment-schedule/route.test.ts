import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), set: vi.fn() }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ paymentSchedule: state }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "job" }) };
beforeEach(() => vi.resetAllMocks());
it.each(["read", "set"] as const)("returns an uncached JSON code for unexpected %s failures", async method => {
  state[method].mockRejectedValue(new Error("private database diagnostics"));
  const request = new Request("https://fictional.invalid", { method: "POST", body: "{}" });
  const response = await (method === "read" ? GET : POST)(request, context);
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
});
it("preserves typed schedule conflicts", async () => {
  state.set.mockRejectedValue(new Error("SCHEDULE_STALE"));
  const response = await POST(new Request("https://fictional.invalid", { method: "POST", body: "{}" }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "SCHEDULE_STALE" });
});
it.each([["STAGE_NOT_DUE", 409], ["STAGE_DRAFT_LIVE", 409], ["STAGE_DRAFT_NOT_FOUND", 409], ["STAGE_DRAFT_COMMAND_CONFLICT", 409],
  ["SCHEDULE_INVALID", 400]] as const)("K5B-1 maps the stage draft code %s to %i", async (code, status) => {
  state.set.mockRejectedValue(new Error(code));
  const response = await POST(new Request("https://fictional.invalid", { method: "POST",
    body: JSON.stringify({ version: "v2-stage-draft-command.v1" }) }), context);
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code });
});
