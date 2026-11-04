import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ClientWorkTiming } from "./client-approval";
const workTiming = { startedAt: "2026-11-03T10:00:00.000001Z", finishedAt: "2026-11-03T11:00:00.000001Z" };
it("shows both visit bounds, uncertainty and a lasting preapproval breach", () => {
  const html = renderToStaticMarkup(<ClientWorkTiming view={{ workTiming, doneWithoutRequiredPreapproval: true, approvalTimings: [{ stepIndex: 0, timing: "after_work" }] }} />);
  for (const text of [workTiming.startedAt, workTiming.finishedAt, "during this visit", "Exact times for this extra are uncertain", "Later approval does not erase this breach", "after work"]) expect(html).toContain(text);
});
it("shows an open visit and uncertain approval honestly", () => {
  const html = renderToStaticMarkup(<ClientWorkTiming view={{ workTiming: { ...workTiming, finishedAt: null }, doneWithoutRequiredPreapproval: "uncertain", approvalTimings: [{ stepIndex: 0, timing: "uncertain" }] }} />);
  expect(html).toContain("finish not recorded"); expect(html).toContain("cannot be told from the visit times");
  expect(html).not.toContain("No required client preapproval breach");
});
it("keeps an unlinked extra not derived", () => {
  const html = renderToStaticMarkup(<ClientWorkTiming view={{ workTiming: null, doneWithoutRequiredPreapproval: "not_derived", approvalTimings: [] }} />);
  expect(html).toContain("no linked visit"); expect(html).toContain("has not been derived");
});
it("shows an approval proven before work without claiming exact work times", () => {
  const html = renderToStaticMarkup(<ClientWorkTiming view={{ workTiming, doneWithoutRequiredPreapproval: false, approvalTimings: [{ stepIndex: 0, timing: "before_work" }] }} />);
  expect(html).toContain("before work"); expect(html).toContain("No required client preapproval breach was found from the visit times");
});
