import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { exposureScheduleFixture } from "@jobguard/core";
import { ExposureCurvePreview, PreventionChecks } from "./prevention-checks";

it("renders each stage's figures alongside its source and dates", () => {
  const html = renderToStaticMarkup(<ExposureCurvePreview schedule={exposureScheduleFixture()}/>);
  expect(html).toContain("£1,000.00");
  expect(html).toContain("£3,000.00");
  expect(html).toContain("£0.00");
  expect(html.match(/synthetic-stage-schedule.v1/g)).toHaveLength(3);
  expect(html.match(/Retrieved:/g)).toHaveLength(3);
  expect(html.match(/Observed:/g)).toHaveLength(3);
  expect(html.match(/data-exposure-segment/g)).toHaveLength(2);
  for (const stage of exposureScheduleFixture().stages) expect(html).toContain(stage.date);
  expect(html).toContain("Fictional schedule preview, independent of this job");
});
it("renders unknown instead of figures for stale or missing data", () => {
  const schedule = exposureScheduleFixture();
  schedule.stages[0]!.source!.observedAt = "2026-09-01T00:00:00.000Z";
  schedule.stages[1]!.cumulativeReceipts = null;
  schedule.stages[2]!.source = null;
  const html = renderToStaticMarkup(<ExposureCurvePreview schedule={schedule}/>);
  expect(html).toContain("unknown — stale");
  expect(html).toContain("unknown — missing");
  expect(html).not.toContain("£");
  expect(html).not.toContain("clear");
  expect(html).not.toContain("<circle");
  expect(html).not.toContain("data-exposure-segment");
});
it("leaves a gap in the curve where a stage is unknown", () => {
  const schedule = exposureScheduleFixture(); schedule.stages[1]!.source = null;
  const html = renderToStaticMarkup(<ExposureCurvePreview schedule={schedule}/>);
  expect(html.match(/<circle/g)).toHaveLength(2);
  expect(html).not.toContain("data-exposure-segment");
});
it("keeps the exposure preview absent from the normal prevention panel", () => {
  const html = renderToStaticMarkup(<PreventionChecks jobId="11111111-1111-4111-8111-111111111111"/>);
  expect(html).not.toContain('data-testid="exposure-curve"');
  expect(html).not.toContain("£");
});
