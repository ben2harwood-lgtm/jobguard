import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyWorkPlanEdits, workPlanEditV1, type WorkPlanTask } from "./v2-work-plan-edits.js";

const scopeItemId = "6a1f0d1e-2c3b-4d5e-8f90-a1b2c3d4e5f6";
const crewA = "0b5c7a8e-1111-4a2b-9c3d-4e5f6a7b8c9d";
const command = (changes: Record<string, unknown>) => ({
  version: "work-plan-edit.v1", commandId: "c0a80101-0000-4000-8000-000000000001",
  quoteRevisionId: "c0a80101-0000-4000-8000-000000000002", expectedVersion: 3, scopeItemId, taskKey: "tile", changes,
});
const source = { description: "Tile the kitchen", category: "Tiling", quantity: "1", unit: "item" };
const task: WorkPlanTask = { key: "tile", scopeItemId, title: "Tile", trade: "tiler", durationMinutes: 60, position: 1,
  dependsOn: [], materialNeeds: [], proofPoints: [], customerChoices: [] };
const project = (...changes: Record<string, unknown>[]) => applyWorkPlanEdits(
  [{ scope_item_id: scopeItemId, source, template_task_key: "tile" }], [task],
  changes.map(change => ({ scope_item_id: scopeItemId, template_task_key: "tile", quote_revision_id: "r",
    changes: workPlanEditV1.parse(command(change)).changes, source }))).tasks[0]!;

describe("V2-C3C assigneeRef on work-plan-edit.v1", () => {
  it("leaves an old edit's saved changes and replay hash byte for byte unchanged", () => {
    const old = { durationMinutes: 90, assignee: "Sam (tiler)" };
    const parsed = workPlanEditV1.parse(command(old));
    // The repository saves JSON.stringify(changes) and replays by equality, so the text must not move.
    expect(JSON.stringify(parsed.changes)).toBe(JSON.stringify(old));
    expect("assigneeRef" in parsed.changes).toBe(false);
    expect(createHash("sha256").update(JSON.stringify(parsed.changes)).digest("hex"))
      .toBe(createHash("sha256").update('{"durationMinutes":90,"assignee":"Sam (tiler)"}').digest("hex"));
  });

  it("keeps old free-text assignees readable and lets a crew record replace them", () => {
    expect(project({ assignee: "Sam (tiler)" })).toMatchObject({ assignee: "Sam (tiler)" });
    const linked = project({ assignee: "Sam (tiler)" }, { assigneeRef: crewA.toUpperCase() });
    expect(linked.assigneeRef).toBe(crewA);
    expect("assignee" in linked).toBe(false);
    const cleared = project({ assigneeRef: crewA }, { assigneeRef: null });
    expect(cleared.assigneeRef).toBeNull();
    expect("assigneeRef" in project({ assigneeRef: crewA }, { assignee: "Typed name" })).toBe(false);
  });

  it("refuses an edit that names both a typed name and a crew record, or a non-uuid record", () => {
    expect(workPlanEditV1.safeParse(command({ assignee: "Sam", assigneeRef: crewA })).success).toBe(false);
    expect(workPlanEditV1.safeParse(command({ assigneeRef: "Sam" })).success).toBe(false);
  });
});
