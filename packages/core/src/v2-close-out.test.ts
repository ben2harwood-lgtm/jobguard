import { describe, expect, it } from "vitest";
import { v2CloseOutLabel, v2CloseOutReview } from "./v2-close-out.js";

const none = { jobId: "job-1", openTasks: 0, extrasNotPlanned: 0, stageDraftsOpen: 0, proofMissing: 0 };

describe("V2-G6 close-out review", () => {
  it("is empty and not blocking when nothing is open", () => {
    expect(v2CloseOutReview(none)).toEqual({ jobId: "job-1", blocking: false, items: [] });
  });
  it("lists each open kind with its link; only a live stage draft blocks, and it comes first", () => {
    const review = v2CloseOutReview({ jobId: "job-1", openTasks: 2, extrasNotPlanned: 1, stageDraftsOpen: 1, proofMissing: 3 });
    expect(review.blocking).toBe(true);
    expect(review.items.map(item => [item.kind, item.blocking, item.count, item.href])).toEqual([
      ["stage_drafts_open", true, 1, "/jobs/job-1/money#payment-schedule-heading"],
      ["open_tasks", false, 2, "/jobs/job-1/work"],
      ["extras_not_planned", false, 1, "/jobs/job-1/work"],
      ["proof_missing", false, 3, "/jobs/job-1/work#final-account-title"],
    ]);
  });
  it("warnings alone never block", () => {
    expect(v2CloseOutReview({ ...none, openTasks: 4, extrasNotPlanned: 2, proofMissing: 1 }).blocking).toBe(false);
  });
  it("words each kind for one and for many", () => {
    expect(v2CloseOutLabel("open_tasks", 1)).toBe("1 plan task is not marked done");
    expect(v2CloseOutLabel("open_tasks", 3)).toBe("3 plan tasks are not marked done");
    expect(v2CloseOutLabel("extras_not_planned", 2)).toBe("2 approved extras are not in the plan");
    expect(v2CloseOutLabel("stage_drafts_open", 1)).toBe("1 stage invoice draft is not withdrawn. Withdraw it before you lock the account");
    expect(v2CloseOutLabel("stage_drafts_open", 2)).toBe("2 stage invoice drafts are not withdrawn. Withdraw them before you lock the account");
    expect(v2CloseOutLabel("proof_missing", 1)).toBe("1 piece of required proof is missing");
  });
  it("refuses facts that are not whole, non-negative counts", () => {
    expect(() => v2CloseOutReview({ ...none, openTasks: -1 })).toThrow("V2_CLOSE_OUT_FACTS_INVALID");
    expect(() => v2CloseOutReview({ ...none, proofMissing: 1.5 })).toThrow("V2_CLOSE_OUT_FACTS_INVALID");
  });
  it("escapes the job id in links", () => {
    expect(v2CloseOutReview({ ...none, jobId: "a/b", openTasks: 1 }).items[0]!.href).toBe("/jobs/a%2Fb/work");
  });
});
