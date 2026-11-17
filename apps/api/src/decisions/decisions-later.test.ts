import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), evaluate: vi.fn(), list: vi.fn() }));
vi.mock("../practice-access.js", () => ({ PracticeAccess: class { command = mocks.access; } }));
vi.mock("@jobguard/db", () => ({ DEMO_TENANT_ID: "11111111-1111-4111-8111-111111111111",
  withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => fn({}),
  evaluateDecisionChecks: mocks.evaluate, listDecisionInbox: mocks.list,
  listPracticeFindingScopes: vi.fn(), persistFindings: vi.fn(), suppressAdvisoryFinding: vi.fn(), UserCommandDispatcher: class {} }));
import { DecisionsApplication } from "./decisions.application.js";
const command = { version: "finding-evaluation-command.v1", commandId: "a1000000-0000-4000-8000-000000000001",
  tenantId: "11111111-1111-4111-8111-111111111111", jobId: "a1000000-0000-4000-8000-000000000002" };
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ context: {}, digest: "d".repeat(64) }); });
it("L063 completion proof comes from current persisted proof through the repository", async () => {
  const first = { version: "decision-inbox.v1", decisions: [], counts: { mandatory: 0, advisory: 0, pending: 0 }, evaluation: { created: 0, replayed: 0 } };
  mocks.evaluate.mockResolvedValue(first);
  expect(await new DecisionsApplication({} as Pool).evaluate(command)).toEqual(first);
  expect(mocks.evaluate).toHaveBeenCalledWith({}, command, "d".repeat(64), expect.any(Function));
});
it("L065 same check ID replays the entire original response without rebuilding the inbox", async () => {
  const first = { version: "decision-inbox.v1", decisions: [], counts: { mandatory: 0, advisory: 0, pending: 0 }, evaluation: { created: 0, replayed: 0 } };
  mocks.evaluate.mockResolvedValue(first);
  const app = new DecisionsApplication({} as Pool);
  expect(await app.evaluate(command)).toEqual(await app.evaluate(command));
  expect(mocks.list).not.toHaveBeenCalled();
});
it("L065 changed job/payload conflicts are typed", async () => {
  mocks.evaluate.mockRejectedValue(new Error("IDEMPOTENCY_CONFLICT"));
  await expect(new DecisionsApplication({} as Pool).evaluate(command)).rejects.toMatchObject({ code: "CONFLICT" });
});
it("L065 authority is checked before parsing or replay", async () => {
  mocks.access.mockRejectedValue(Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" }));
  await expect(new DecisionsApplication({} as Pool).evaluate({ ...command, version: "invalid" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(mocks.evaluate).not.toHaveBeenCalled();
});
