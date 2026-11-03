import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adopt: vi.fn(), read: vi.fn(), preview: vi.fn(), assessCatch: vi.fn() }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ imports: mocks }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
import { JobImportV3Error } from "@jobguard/api/workspace";
import { POST as CATCH } from "./catch/route";
import { GET, POST } from "./route";
import { POST as PREVIEW } from "./preview/route";
afterEach(() => vi.resetAllMocks());
const context = { params: Promise.resolve({ id: "source-job" }) };
it("routes preview and exact intent without accepting a tenant or actor from a URL", async () => {
  mocks.preview.mockResolvedValue({ version: "job-import-preview-result.v3" });
  const raw = { version: "job-import-preview.v3" };
  const response = await PREVIEW(new Request("https://app.invalid", { method: "POST", body: JSON.stringify(raw) }), context);
  expect(response.status).toBe(200); expect(mocks.preview).toHaveBeenCalledWith("source-job", raw);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("maps live capacity holds to 409, with no success-shaped receipt", async () => {
  mocks.adopt.mockRejectedValue(new JobImportV3Error("METER_PLACE_SOURCE_HANDOFF_HELD"));
  const response = await POST(new Request("https://app.invalid", { method: "POST", body: "{}" }), context);
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ code: "METER_PLACE_SOURCE_HANDOFF_HELD" });
});
it("does not cache stored imports and preserves a session denial", async () => {
  mocks.read.mockRejectedValue(new JobImportV3Error("FORBIDDEN"));
  const response = await GET(new Request("https://app.invalid"), context);
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ code: "FORBIDDEN" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("catch refusal carries a plain dependency reason, no fee or allocation receipt", async () => {
  mocks.assessCatch.mockRejectedValue(new JobImportV3Error("ATTRIBUTION_UNAVAILABLE"));
  const raw = { version: "import-catch-command.v1", commandId: "intent", baselineId: "baseline" };
  const response = await CATCH(new Request("https://app.invalid", { method: "POST", body: JSON.stringify(raw) }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "ATTRIBUTION_UNAVAILABLE", reason: expect.stringContaining("SV-6") });
  expect(mocks.assessCatch).toHaveBeenCalledWith("source-job", raw);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
