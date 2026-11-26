import { describe, expect, it } from "vitest";
import { extraNotPlannedReason } from "./work-plan-command";

const scopeItemId = "00000000-0000-4000-8000-000000000010";

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
