import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { v2CloseOutReview } from "@jobguard/core";
import { V2CloseOutCard } from "./v2-close-out";

const facts = { jobId: "job-1", openTasks: 0, extrasNotPlanned: 0, stageDraftsOpen: 0, proofMissing: 0 };

describe("V2-G6 Before you close this job", () => {
  it("says nothing is open when the review is empty", () => {
    const html = renderToStaticMarkup(<V2CloseOutCard review={v2CloseOutReview(facts)}/>);
    expect(html).toContain("Before you close this job");
    expect(html).toContain("Nothing open. You can complete the final account.");
  });
  it("marks a live stage draft as must fix and the rest as reminders, each with its link", () => {
    const html = renderToStaticMarkup(<V2CloseOutCard review={v2CloseOutReview({ ...facts, stageDraftsOpen: 1, openTasks: 2 })}/>);
    expect(html).toContain("<strong>Must fix: </strong>1 stage invoice draft is not withdrawn");
    expect(html).toContain("Check: </span>2 plan tasks are not marked done");
    expect(html).toContain('href="/jobs/job-1/money#payment-schedule-heading"');
    expect(html).toContain('href="/jobs/job-1/work"');
    expect(html).toContain("You cannot lock the account until the must-fix item is done.");
    expect(html).toContain("The checks are reminders only.");
    expect(html).not.toContain("You can still complete the final account.");
    expect(html).toContain("min-height:44px");
  });
});
