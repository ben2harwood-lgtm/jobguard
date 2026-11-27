import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { workspace, read, quoteGet, planRead, failure } = vi.hoisted(() => ({
  workspace: vi.fn(), read: vi.fn(), quoteGet: vi.fn(), planRead: vi.fn(), failure: vi.fn(),
}));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: failure }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const quotedId = "11111111-1111-4111-8111-111111111112";
const extraId = "11111111-1111-4111-8111-111111111113";
const proposalId = "11111111-1111-4111-8111-111111111114";
const params = { params: Promise.resolve({ id: jobId }) };
const request = () => new Request(`https://fictional.invalid/api/v2-backend/jobs/${jobId}/measurements`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
  workspace.mockResolvedValue({ measurements: { read }, quote: { get: quoteGet }, workPlan: { read: planRead } });
  failure.mockReturnValue(null);
  read.mockResolvedValue([quotedId, extraId, proposalId].map(scopeItemId => ({ scopeItemId, version: 0, measurement: null })));
  // The approved extra has a reserved scope identity, so it is not on confirmed scope.
  quoteGet.mockResolvedValue({ scope: [{ scopeItemId: quotedId, description: "Tile floor" }], revisions: [], draft: null });
  planRead.mockResolvedValue({ scopeItems: [
    { scopeItemId: quotedId, description: "Tile floor", category: "tiling", quantity: "6", unit: "m2" },
    { scopeItemId: extraId, description: "Extra skirting", category: "joinery", quantity: "4", unit: "m",
      variationRevisionId: "11111111-1111-4111-8111-111111111115" },
  ] });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2 measurements route", () => {
  it("lists an approved extra for its first measurement and still hides unapproved proposals", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    const { items } = await response.json();
    expect(items.map((item: { scopeItemId: string }) => item.scopeItemId)).toEqual([quotedId, extraId]);
    expect(items[1]).toMatchObject({ status: "needs_input", measurement: null,
      quoted: { description: "Extra skirting", quantity: "4", unit: "m" } });
  });
});
