import { describe, expect, it } from "vitest";
import { deriveVisitApprovalTiming, type ApprovalTimingFact, type VisitTimingSource } from "../src/extra-approval-timing.js";

const visit: VisitTimingSource = { visit_id: "fictional-visit", started_at: "2026-11-03T10:00:00.000001Z", completed_at: "2026-11-03T11:00:00.000001Z", start_us: "1793700000000001", finish_us: "1793703600000001" };
const requests = [{ id: "first", preapproval_required: true, superseded_us: null }];
const fact = (at_us: string, request_id = "first"): ApprovalTimingFact => ({ request_id, at_us, step_index: 0, step_role: "client_approver" });
describe("ENT-5 visit-derived approval timing", () => {
  it.each([
    ["1793700000000000", "before_work", false],
    [visit.start_us, "uncertain", "uncertain"],
    ["1793701800000000", "uncertain", "uncertain"],
    [visit.finish_us!, "uncertain", "uncertain"],
    ["1793703600000002", "after_work", true],
  ])("compares microsecond %s honestly: %s", (at, timing, breach) => {
    expect(deriveVisitApprovalTiming(visit, requests, [fact(at)], "first")).toMatchObject({ doneWithoutRequiredPreapproval: breach,
      workTiming: { uncertainty: "during_this_visit" }, approvalTimings: [{ stepIndex: 0, timing }] });
  });
  it("does not infer a finish or a breach from an open visit", () => {
    const open = { ...visit, finish_us: null, completed_at: null };
    expect(deriveVisitApprovalTiming(open, requests, [], "first").doneWithoutRequiredPreapproval).toBe("uncertain");
    expect(deriveVisitApprovalTiming(open, requests, [fact("1793703600000002")], "first").approvalTimings[0]?.timing).toBe("uncertain");
  });
  it("flags completed work still awaiting required client approval, including company approvals already given", () => {
    expect(deriveVisitApprovalTiming(visit, requests, [{ ...fact(visit.start_us), step_role: "supervisor" }], "first").doneWithoutRequiredPreapproval).toBe(true);
  });
  it("later approval and a revision without preapproval cannot erase an earlier breach", () => {
    const revised = [...requests, { id: "later", preapproval_required: false, superseded_us: null }];
    const late = fact("1793703600000002");
    expect(deriveVisitApprovalTiming(visit, requests, [], "first").doneWithoutRequiredPreapproval).toBe(true);
    expect(deriveVisitApprovalTiming(visit, revised, [late], "later").doneWithoutRequiredPreapproval).toBe(true);
  });
  it("keeps no linked visit not derived, even with approvals", () => {
    expect(deriveVisitApprovalTiming(undefined, requests, [fact(visit.start_us)], "first")).toEqual({ doneWithoutRequiredPreapproval: "not_derived", workTiming: null, approvalTimings: [{ stepIndex: 0, timing: "not_derived" }] });
  });
  it("ignores a requirement superseded before the visit and preserves uncertainty during it", () => {
    expect(deriveVisitApprovalTiming(visit, [{ ...requests[0]!, superseded_us: "1793700000000000" }], [], "first").doneWithoutRequiredPreapproval).toBe(false);
    expect(deriveVisitApprovalTiming(visit, [{ ...requests[0]!, superseded_us: visit.start_us }], [], "first").doneWithoutRequiredPreapproval).toBe("uncertain");
  });
  it("keeps a held threshold composition uncertain", () => {
    expect(deriveVisitApprovalTiming(visit, [{ id: "first", preapproval_required: null, superseded_us: null }], [], "first").doneWithoutRequiredPreapproval).toBe("uncertain");
  });
  it("does not invent a preapproval requirement", () => {
    expect(deriveVisitApprovalTiming(visit, [{ id: "first", preapproval_required: false, superseded_us: null }], [], "first").doneWithoutRequiredPreapproval).toBe(false);
  });
});
