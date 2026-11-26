import { describe, expect, it } from "vitest";
import { matchPlanClashes, type OtherPlan } from "./v2-plan-clashes.js";

const scopeA = "6a1f0d1e-2c3b-4d5e-8f90-a1b2c3d4e5f6";
const scopeB = "7b2e1f2a-3d4c-4e5f-9a01-b2c3d4e5f6a7";
const crewA = "0b5c7a8e-1111-4a2b-9c3d-4e5f6a7b8c9d";
const crewB = "0b5c7a8e-2222-4a2b-9c3d-4e5f6a7b8c9d";
const day = "2026-12-01";
type Changes = { assigneeRef?: string | null | undefined; scheduledDate?: string | null | undefined; assignee?: string };
// An undefined change leaves the field off the task, as an unedited task has it.
const task = (key: string, changes: Changes = {}) => Object.fromEntries(Object.entries(
  { key, scopeItemId: scopeA, assigneeRef: crewA, scheduledDate: day, ...changes }).filter(([, value]) => value !== undefined),
) as OtherPlan["tasks"][number];
const other = (jobId: string, jobTitle: string, tasks: OtherPlan["tasks"]): OtherPlan => ({ jobId, jobTitle, tasks });

describe("V2-E5A same-firm clash matcher", () => {
  it("reports the same crew record on the same day on another job, by its title and date only", () => {
    const result = matchPlanClashes([task("tile"), task("grout", { assigneeRef: crewB })],
      [other("j2", "Bathroom refit", [{ ...task("paint"), scopeItemId: scopeB }])]);
    expect(result).toEqual([{ scopeItemId: scopeA, taskKey: "tile", scheduledDate: day,
      clashes: [{ jobTitle: "Bathroom refit", scheduledDate: day }] }]);
  });

  it("needs the same crew record and the same day", () => {
    const others = [other("j2", "Other", [task("a", { scheduledDate: "2026-12-02" }), task("b", { assigneeRef: crewB })])];
    expect(matchPlanClashes([task("tile")], others)).toEqual([]);
  });

  it("never matches on free-text names, and ignores tasks without a crew record or a date", () => {
    const own = [task("tile", { assigneeRef: undefined, assignee: "Sam" }), task("grout", { assigneeRef: null }),
      task("seal", { scheduledDate: null }), task("prep", { scheduledDate: undefined })];
    const others = [other("j2", "Other", [task("a", { assigneeRef: undefined, assignee: "Sam" }), task("b", { assigneeRef: null }),
      task("c", { scheduledDate: null }), task("d")])];
    expect(matchPlanClashes(own, others)).toEqual([]);
  });

  it("lists each other job once, in title order, however many of its tasks share the slot", () => {
    const others = [other("j3", "Loft", [task("a"), task("b")]), other("j2", "Bathroom", [task("c")])];
    expect(matchPlanClashes([task("tile")], others)[0]!.clashes).toEqual([
      { jobTitle: "Bathroom", scheduledDate: day }, { jobTitle: "Loft", scheduledDate: day }]);
  });

  it("returns nothing when there are no other plans", () => {
    expect(matchPlanClashes([task("tile")], [])).toEqual([]);
  });
});
