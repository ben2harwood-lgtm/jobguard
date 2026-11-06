import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RecurringExtrasScreen } from "./recurring-extras-screen";
import { money, type RecurringExtras } from "@jobguard/core";
const sparse: RecurringExtras = { version: "recurring-extras.v1", policyVersion: "rate-baseline.v1", asOf: "2026-11-04T12:00:00Z", status: "not_enough_to_say", suggestions: [] };
it("renders no price when sparse and no acceptance controls", () => {
  const html = renderToStaticMarkup(<RecurringExtrasScreen result={sparse} />);
  expect(html).toContain("Not enough to say"); expect(html).not.toContain("£");
  expect(html).not.toMatch(/<(button|form|input|select)\b/u);
});
it("renders observed rates and source IDs as text only", () => {
  const html = renderToStaticMarkup(<RecurringExtrasScreen result={{ ...sparse, status: "suggestions", suggestions: [{ description: "add sockets", unit: "each", jobCount: 3, lowest: money(100), highest: money(200), median: money(150), sources: [{ variationId: "variation-source", jobId: "job-source", revisionId: "revision-source", observationId: "observation-source" }] }] }} />);
  for (const text of ["3 distinct jobs", "£1.00", "£2.00", "£1.50", "variation-source", "job-source", "not a confidence interval"]) expect(html).toContain(text);
  expect(html).not.toMatch(/<(button|form|input|select)\b/u);
});
