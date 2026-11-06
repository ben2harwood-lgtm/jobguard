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
    expect(deriveVisitApprovalTiming(visit, requests, [fact(at)], "first", "finished")).toMatchObject({ doneWithoutRequiredPreapproval: breach,
      workTiming: { uncertainty: "during_this_visit" }, approvalTimings: [{ stepIndex: 0, timing }] });
  });
  it("does not infer a finish or a breach from an open visit", () => {
    const open = { ...visit, finish_us: null, completed_at: null };
    expect(deriveVisitApprovalTiming(open, requests, [], "first", "finished").doneWithoutRequiredPreapproval).toBe("uncertain");
    expect(deriveVisitApprovalTiming(open, requests, [fact("1793703600000002")], "first").approvalTimings[0]?.timing).toBe("uncertain");
  });
  it("flags operative-reported finished work still awaiting required client approval, including company approvals already given", () => {
    expect(deriveVisitApprovalTiming(visit, requests, [{ ...fact(visit.start_us), step_role: "supervisor" }], "first", "finished").doneWithoutRequiredPreapproval).toBe(true);
  });
  it("later approval and a revision without preapproval cannot erase an earlier breach", () => {
    const revised = [...requests, { id: "later", preapproval_required: false, superseded_us: null }];
    const late = fact("1793703600000002");
    expect(deriveVisitApprovalTiming(visit, requests, [], "first", "finished").doneWithoutRequiredPreapproval).toBe(true);
    expect(deriveVisitApprovalTiming(visit, revised, [late], "later", "finished").doneWithoutRequiredPreapproval).toBe(true);
  });
  it.each(["not_started", undefined, "under_way", "finished"] as const)("qualifies visit evidence with statement %s before and after late approval", status => {
    const expected = status === "under_way" || status === "finished" ? true : "uncertain";
    expect(deriveVisitApprovalTiming(visit, requests, [], "first", status).doneWithoutRequiredPreapproval).toBe(expected);
    expect(deriveVisitApprovalTiming(visit, requests, [fact("1793703600000002")], "first", status).doneWithoutRequiredPreapproval).toBe(expected);
    const revised = [...requests, { id: "later", preapproval_required: false, superseded_us: null }];
    expect(deriveVisitApprovalTiming(visit, revised, [fact("1793703600000002")], "later", status).doneWithoutRequiredPreapproval).toBe(expected);
  });
  it("keeps no linked visit not derived, even with approvals", () => {
    expect(deriveVisitApprovalTiming(undefined, requests, [fact(visit.start_us)], "first", "finished")).toEqual({ doneWithoutRequiredPreapproval: "not_derived", workTiming: null, approvalTimings: [{ stepIndex: 0, timing: "not_derived" }] });
  });
  it("ignores a requirement superseded before the visit and preserves uncertainty during it", () => {
    expect(deriveVisitApprovalTiming(visit, [{ ...requests[0]!, superseded_us: "1793700000000000" }], [], "first", "finished").doneWithoutRequiredPreapproval).toBe(false);
    expect(deriveVisitApprovalTiming(visit, [{ ...requests[0]!, superseded_us: visit.start_us }], [], "first", "finished").doneWithoutRequiredPreapproval).toBe("uncertain");
  });
  it("keeps a held threshold composition uncertain", () => {
    expect(deriveVisitApprovalTiming(visit, [{ id: "first", preapproval_required: null, superseded_us: null }], [], "first", "finished").doneWithoutRequiredPreapproval).toBe("uncertain");
  });
  it("does not invent a preapproval requirement", () => {
    expect(deriveVisitApprovalTiming(visit, [{ id: "first", preapproval_required: false, superseded_us: null }], [], "first", "finished").doneWithoutRequiredPreapproval).toBe(false);
  });
});

it("a proceed statement preserves its snapshot breach without inventing visit times, across later approval and revision", () => {
 const historical = [{ ...requests[0]!, superseded_us: "1" }, { id: "later", preapproval_required: false, superseded_us: null }];
 for (const source of [visit, undefined]) {
  expect(deriveVisitApprovalTiming(source, historical, [fact("1793703600000002")], "later", "not_started", ["first"]).doneWithoutRequiredPreapproval).toBe(true);
  expect(deriveVisitApprovalTiming(source, [{ ...requests[0]!, preapproval_required: false }], [], "first", undefined, ["first"]).doneWithoutRequiredPreapproval).toBe(source ? false : "not_derived");
  expect(deriveVisitApprovalTiming(source, [{ ...requests[0]!, preapproval_required: null }], [], "first", undefined, ["first"]).doneWithoutRequiredPreapproval).toBe(source ? "uncertain" : "not_derived");
 }
});
