import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { workspace, read, acceptanceView, failure } = vi.hoisted(() => ({
  workspace: vi.fn(), read: vi.fn(), acceptanceView: vi.fn(), failure: vi.fn(),
}));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: failure }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: jobId }) };
const notPlanned = [
  { scopeItemId: "22222222-2222-4222-8222-222222222222", title: "No-charge extra", reason: "direction_unknown", planningDropped: false },
  { scopeItemId: "33333333-3333-4333-8333-333333333333", title: "Omit the upstand tiling", reason: "omission", planningDropped: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
  workspace.mockResolvedValue({ workPlan: { read }, quote: { acceptanceView } });
  read.mockResolvedValue({ state: "draft", tasks: [], unplanned: [], quoteRevisionId: jobId, version: 0,
    changes: { added: [], changed: [], removed: [] }, scopeItems: [], templateKey: "trades.v1", extrasNotPlanned: notPlanned });
  failure.mockReturnValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2-WP-FIX work-plan route", () => {
  it("passes the extras the plan can't place through unchanged", async () => {
    const response = await GET(new Request(`http://127.0.0.1/api/v2-backend/jobs/${jobId}/work-plan`), params);
    expect(response.status).toBe(200);
    expect((await response.json()).extrasNotPlanned).toEqual(notPlanned);
  });
});
