import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), approve: vi.fn(), failure: vi.fn(), cookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ evidencePacks: { generate: mocks.generate, approveAttachment: mocks.approve, failure: mocks.failure } }) }));
// Both paths resolve the same physical request-scoped workspace module.
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ evidencePacks: { generate: mocks.generate, approveAttachment: mocks.approve, failure: mocks.failure } }) }));
vi.mock("../../../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
import { POST } from "./route";
import { POST as approve } from "./[packId]/attachment-approval/route";
const id = "ab000000-0000-4000-8000-000000000001", digest = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks(); mocks.cookie.mockReturnValue({ value: "session" });
  mocks.failure.mockReturnValue({ status: 409, code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
  mocks.generate.mockRejectedValue(new Error("EVIDENCE_PACK_V3_DEPENDENCY_HELD"));
  mocks.approve.mockRejectedValue(new Error("EVIDENCE_PACK_V3_DEPENDENCY_HELD"));
});
afterEach(() => vi.restoreAllMocks());
it("Next generation delegates the exact strict body and current cookie, returning an uncached hold", async () => {
  const command = { version: "evidence-pack-command.v3", commandId: id, format: "TEXT", expectedVisibleSourceRevision: digest };
  const response = await POST(new Request("https://fictional.invalid/", { method: "POST", body: JSON.stringify(command) }), { params: Promise.resolve({ id }) });
  expect(mocks.generate).toHaveBeenCalledWith("session", id, command);
  expect(response.status).toBe(409); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
});
it("Next attachment delegates the exact pack/hash binding and never fabricates approval", async () => {
  const command = { version: "evidence-pack-attachment-approval.v3", commandId: id, expectedManifestHash: digest, expectedContentHash: digest };
  const response = await approve(new Request("https://fictional.invalid/", { method: "POST", body: JSON.stringify(command) }), { params: Promise.resolve({ id, packId: id }) });
  expect(mocks.approve).toHaveBeenCalledWith("session", id, id, command);
  expect(response.status).toBe(409); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
});
