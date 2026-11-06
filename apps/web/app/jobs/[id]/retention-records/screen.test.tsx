import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { RetentionRecordScreen } from "./screen";
it("always labels the screen as a simulation with no issue or fee eligibility", () => {
  const html = renderToStaticMarkup(createElement(RetentionRecordScreen, { jobId: "fictional-job" }));
  expect(html).toContain("Simulation only"); expect(html).toContain("No notice or invoice is issued");
  expect(html).toContain("not a fee-eligible recovery"); expect(html).toContain("adds no fee");
  expect(html).toContain("min-height:44px");
});
