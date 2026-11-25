import { afterEach, beforeEach, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/workspace-server", () => ({
  workspaceApplication: async () => ({ workPlan: { read }, quote: { acceptanceView: async () => ({ events: [], activeAcceptance: {} }) } }),
}));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: () => null }));
import { GET } from "./route";

const jobId = "00000000-0000-4000-8000-000000000001";
const lineScope = "00000000-0000-4000-8000-000000000010";
const extraScope = "00000000-0000-4000-8000-000000000011";
const unplannedExtra = "00000000-0000-4000-8000-000000000012";
const omission = "00000000-0000-4000-8000-000000000013";
const revision = (n: number) => `00000000-0000-4000-8000-00000000002${n}`;
const task = (scopeItemId: string, key: string) => ({ key, scopeItemId, title: key, trade: "joiner", durationMinutes: 45,
  position: 1, dependsOn: [], materialNeeds: [], proofPoints: [], customerChoices: [] });
const extrasNotPlanned = [{ scopeItemId: omission, title: "Leave out the shelf", reason: "omission", planningDropped: true }];

beforeEach(() => { vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); });
afterEach(() => { vi.unstubAllEnvs(); read.mockReset(); });

it("gives each extra's task and unplanned item its approved revision and passes extrasNotPlanned through", async () => {
  read.mockResolvedValue({ jobId, quoteRevisionId: revision(0), state: "accepted", version: 2,
    agreement: { documentId: revision(9), netPence: 100, approvedVariations: [] }, activationId: null,
    tasks: [task(lineScope, "prepare"), task(extraScope, "custom-scope-item")],
    unplanned: [{ scopeItemId: unplannedExtra, title: "Add trim", status: "Unplanned" }],
    scopeItems: [{ scopeItemId: lineScope }, { scopeItemId: extraScope, variationRevisionId: revision(1) },
      { scopeItemId: unplannedExtra, variationRevisionId: revision(2) }],
    extrasNotPlanned, changes: { added: [], changed: [], removed: [] } });
  const response = await GET(new Request(`https://company.invalid/api/v2-backend/jobs/${jobId}/work-plan`),
    { params: Promise.resolve({ id: jobId }) });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.tasks[0]).not.toHaveProperty("variationRevisionId");
  expect(body.tasks[1].variationRevisionId).toBe(revision(1));
  expect(body.unplanned).toEqual([{ scopeItemId: unplannedExtra, title: "Add trim", status: "Unplanned",
    key: "custom-scope-item", variationRevisionId: revision(2) }]);
  expect(body.extrasNotPlanned).toEqual(extrasNotPlanned);
  // Nothing else from the plan read reaches the screen.
  expect(Object.keys(body).sort()).toEqual(["acceptanceCancelled", "changes", "extrasNotPlanned", "quoteRevisionId",
    "state", "tasks", "unplanned", "version"]);
});

it("stays closed outside V2", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
  const response = await GET(new Request("https://company.invalid/x"), { params: Promise.resolve({ id: jobId }) });
  expect(response.status).toBe(404);
  expect(read).not.toHaveBeenCalled();
});
