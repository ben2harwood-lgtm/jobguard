import { describe, expect, it } from "vitest";
import { feeBasisNote } from "./recovery-fee-note";

const none = { feeJobLiabilityPence: 0, approvedLandedNetPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0 };

describe("recovery fee basis wording", () => {
  it("says no qualifying landing exists only when none is approved and nothing was posted", () => {
    expect(feeBasisNote(none)).toBe("No approved qualifying landing yet, so no fee exists");
  });
  it("does not claim there is no landing when a qualifying landing leaves no job liability (cap or plan credit)", () => {
    const note = feeBasisNote({ ...none, approvedLandedNetPence: 5000 });
    expect(note).toBe("An approved qualifying landing exists; no fee liability remains for this job after the cap and plan credit (illustration only; nothing is charged)");
    expect(note).not.toMatch(/No approved qualifying landing/u);
  });
  it("describes a positive job liability as job-level, shared across cases, never as this case's own fee", () => {
    expect(feeBasisNote({ ...none, approvedLandedNetPence: 100000, feeJobLiabilityPence: 2100, feeObligationsPostedPence: 10000 }))
      .toBe("The fee liability shown is for the whole job: its cap and plan credit are shared by all of its cases (illustration only; nothing is charged)");
  });
  it("explains a case whose approved landing was reversed while another case still carries the job liability", () => {
    const note = feeBasisNote({ ...none, feeJobLiabilityPence: 2100, feeObligationsPostedPence: 2100, feeCompensationsPostedPence: 10000 });
    expect(note).toBe("This case's approved landing was reversed. The compensation posted adjusts the job's shared fee; it is not a fee on this case (illustration only; nothing is charged)");
    expect(note).not.toMatch(/no fee exists/u);
  });
  it("explains a case with no approved landing in a job whose fee comes from other cases", () => {
    expect(feeBasisNote({ ...none, feeJobLiabilityPence: 2100 })).toBe("This case has no approved qualifying landing; the job's fee liability comes from its other cases (illustration only; nothing is charged)");
  });
});
