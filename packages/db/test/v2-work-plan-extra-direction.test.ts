import { describe, expect, it } from "vitest";
import { workPlanExtraDirectionV1 } from "../src/v2-work-plan-edits.js";

// C3B-2 (Q48): the builder's answer for an approved no-charge extra.
describe("workPlanExtraDirectionV1", () => {
  const command = { version: "work-plan-extra-direction.v1", commandId: "00000000-0000-4000-8000-00000000000A",
    quoteRevisionId: "00000000-0000-4000-8000-000000000001", expectedVersion: 0,
    variationRevisionId: "00000000-0000-4000-8000-000000000002", direction: "adds_work" };

  it("accepts both directions and lower-cases ids", () => {
    expect(workPlanExtraDirectionV1.parse(command).commandId).toBe("00000000-0000-4000-8000-00000000000a");
    expect(workPlanExtraDirectionV1.parse({ ...command, direction: "removes_work" }).direction).toBe("removes_work");
  });

  it("is strict about the direction, the version, the ids and extra fields", () => {
    for (const bad of [{ ...command, direction: "sideways" }, { ...command, version: "work-plan-edit.v1" },
      { ...command, variationRevisionId: "not-a-uuid" }, { ...command, expectedVersion: -1 },
      { ...command, scopeItemId: command.quoteRevisionId }, { ...command, signedDeltaPence: 0 }]) {
      expect(workPlanExtraDirectionV1.safeParse(bad).success).toBe(false);
    }
    const { variationRevisionId: _missing, ...noRevision } = command;
    expect(workPlanExtraDirectionV1.safeParse(noRevision).success).toBe(false);
  });
});
