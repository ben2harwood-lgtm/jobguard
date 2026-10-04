import { describe, expect, it } from "vitest";
import { feeBasisNote } from "./recovery-fee-note";

describe("recovery fee basis wording", () => {
  it("says no qualifying landing exists only when none has been approved", () => {
    expect(feeBasisNote({ feeIllustrativePence: 0, approvedLandedNetPence: 0 })).toBe("No approved qualifying landing yet, so no fee exists");
  });
  it("does not claim there is no landing when a qualifying landing carries a zero fee (cap or plan credit)", () => {
    const note = feeBasisNote({ feeIllustrativePence: 0, approvedLandedNetPence: 5000 });
    expect(note).toBe("An approved qualifying landing exists; no additional fee after the cap and plan credit (illustration only; nothing is charged)");
    expect(note).not.toMatch(/No approved qualifying landing/u);
  });
  it("describes a positive fee as a reference illustration", () => {
    expect(feeBasisNote({ feeIllustrativePence: 500, approvedLandedNetPence: 5000 })).toBe("Reference fee on approved qualifying landings (illustration only; nothing is charged)");
  });
});
