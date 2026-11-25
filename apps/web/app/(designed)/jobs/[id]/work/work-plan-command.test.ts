import { describe, expect, it } from "vitest";
import { extraDirectionCommand, extraNotPlannedReason, workPlanEditCommand } from "./work-plan-command";

const plan = { quoteRevisionId: "00000000-0000-4000-8000-000000000001", version: 3 };
const scopeItemId = "00000000-0000-4000-8000-000000000010";
const variationRevisionId = "00000000-0000-4000-8000-000000000020";
const changes = { trade: "joiner", scheduledDate: "2026-12-10" };

describe("workPlanEditCommand", () => {
  it("names no revision for a quote line's task", () => {
    expect(workPlanEditCommand(plan, { key: "prepare", scopeItemId }, changes)).toEqual({ version: "work-plan-edit.v1",
      quoteRevisionId: plan.quoteRevisionId, expectedVersion: 3, taskKey: "prepare", scopeItemId, changes });
  });

  it("names the approved revision for an extra's task", () => {
    expect(workPlanEditCommand(plan, { key: "custom-scope-item", scopeItemId, variationRevisionId }, changes)).toEqual({
      version: "work-plan-edit.v1", quoteRevisionId: plan.quoteRevisionId, expectedVersion: 3, taskKey: "custom-scope-item",
      scopeItemId, variationRevisionId, changes });
  });

  it("names the approved revision for an unplanned extra, so the replay key changes with the revision", () => {
    const unplanned = { key: "custom-scope-item", scopeItemId, title: "Add trim", variationRevisionId };
    const first = workPlanEditCommand(plan, unplanned, { position: 2, trade: "joiner", durationMinutes: 45 });
    expect(first.variationRevisionId).toBe(variationRevisionId);
    expect(first).not.toHaveProperty("title");
    const next = workPlanEditCommand(plan, { ...unplanned, variationRevisionId: "00000000-0000-4000-8000-000000000021" },
      { position: 2, trade: "joiner", durationMinutes: 45 });
    expect(JSON.stringify(next)).not.toBe(JSON.stringify(first));
  });
});

describe("extraNotPlannedReason", () => {
  const extra = { scopeItemId, title: "Move the socket", planningDropped: false };
  it("gives a plain reason for each kind", () => {
    expect(extraNotPlannedReason({ ...extra, reason: "omission" })).toBe("removed work, nothing to plan");
    expect(extraNotPlannedReason({ ...extra, reason: "direction_unknown" }))
      .toBe("no price change: say whether it adds or removes work");
    expect(extraNotPlannedReason({ ...extra, reason: "omission", planningDropped: true }))
      .toBe("removed work, nothing to plan · planning on this extra was set aside");
  });
});

// C3B-2 (Q48)
describe("extraDirectionCommand", () => {
  it("binds the answer to the shown plan version and revision", () => {
    expect(extraDirectionCommand(plan, { variationRevisionId }, "adds_work")).toEqual({
      version: "work-plan-extra-direction.v1", quoteRevisionId: plan.quoteRevisionId, expectedVersion: 3,
      variationRevisionId, direction: "adds_work" });
    expect(extraDirectionCommand(plan, { variationRevisionId }, "removes_work").direction).toBe("removes_work");
  });
});
