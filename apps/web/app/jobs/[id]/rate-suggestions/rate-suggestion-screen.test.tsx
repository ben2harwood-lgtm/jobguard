import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { RateSuggestionScreen } from "@jobguard/api/workspace";
import { RateSuggestionScreenView } from "./rate-suggestion-screen";
it("renders sparse server result as unknown, preserves sample count and never offers acceptance", () => {
  const screen = { jobId: "practice", acceptances: [], suggestion: { status: "unknown", rate: null,
    sampleCount: 2, policyVersion: "rate-baseline.v1", query: {}, sources: [], spread: null } } as unknown as RateSuggestionScreen;
  const html = renderToStaticMarkup(createElement(RateSuggestionScreenView, { screen }));
  expect(html).toContain("Not enough to say"); expect(html).toContain("Samples: 2");
  expect(html).not.toContain("Accept practice suggestion"); expect(html).toContain("cap stay unchanged");
});
