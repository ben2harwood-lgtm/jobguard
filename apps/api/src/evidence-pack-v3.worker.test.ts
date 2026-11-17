import { expect, it, vi } from "vitest";
import { executeEvidencePackV3 } from "./evidence-pack-v3.worker.js";
const id = "11111111-1111-4111-8111-111111111111";
const task = { version: "evidence-pack-task.v3", tenantId: id, commandId: id };
const material = { tenantId: id, jobId: id, caseId: id, lifecycle: { state: "pre_lock" }, records: [] };
const context = { tenantId: id } as never;
function fixture() {
  const repo = { prepare: vi.fn().mockResolvedValue({ command: {}, visibleRevision: "a".repeat(64), material }), completeMustSurface: vi.fn(), finish: vi.fn() };
  const check = vi.fn();
  const run = () => executeEvidencePackV3(context, task, repo as never, check, "synthetic_demo");
  return { repo, check, run };
}
it("pre-lock must-surface handoff precedes completion, reread and checked writer", async () => {
  const f = fixture(); await f.run();
  expect(f.repo.prepare).toHaveBeenCalledTimes(2);
  expect(f.check).toHaveBeenCalledWith(id);
  expect(f.check.mock.invocationCallOrder[0]).toBeLessThan(f.repo.completeMustSurface.mock.invocationCallOrder[0]!);
  expect(f.repo.completeMustSurface.mock.invocationCallOrder[0]).toBeLessThan(f.repo.finish.mock.invocationCallOrder[0]!);
});
it("failure in must-surface never becomes an all-clear or pack", async () => {
  const f = fixture(); f.check.mockRejectedValue(new Error("producer failed"));
  await expect(f.run()).rejects.toThrow("producer failed");
  expect(f.repo.finish).not.toHaveBeenCalled(); expect(f.repo.completeMustSurface).not.toHaveBeenCalled();
});
it("post-lock uses the worker material without invoking pre-lock detection", async () => {
  const f = fixture(); f.repo.prepare.mockResolvedValue({ command: {}, material: { ...material, lifecycle: { state: "post_lock", lockedAt: "2026-10-28T12:00:00.000001Z", evidenceCutoff: "2026-10-28T12:00:00.000001Z" } } });
  await f.run(); expect(f.check).not.toHaveBeenCalled(); expect(f.repo.finish).toHaveBeenCalledTimes(1);
});
it("tenant mismatch and non-synthetic execution fail before producer access", async () => {
  const f = fixture();
  for (const [scope,environment] of [[{ tenantId: "22222222-2222-4222-8222-222222222222" }, "synthetic_demo"], [context, "production"]] as const) await expect(executeEvidencePackV3(scope as never, task, f.repo as never, f.check, environment)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
  expect(f.repo.prepare).not.toHaveBeenCalled();
});
