import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { V2ChoiceAllowances } from "./v2-choice-allowances";
it("shows a loading state and the practice boundary without approve or send actions", () => {
  const html = renderToStaticMarkup(<V2ChoiceAllowances jobId="11111111-1111-4111-8111-111111111111"/>);
  expect(html).toContain("Customer choices and allowances");
  expect(html).toContain("nothing is sent or charged");
  expect(html).toContain("nothing is added to the price until you approve it");
  expect(html).toContain("Amounts exclude VAT");
  expect(html).toContain("Loading customer choices");
  expect(html).not.toMatch(/Approve|Send/u);
});
