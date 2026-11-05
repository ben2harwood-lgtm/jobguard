import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MustDecide } from "./must-decide";

it("renders separate accessible links without prices or approval actions", () => {
  const queue = ["one", "two"].map(id => ({ job_id: "job", variation_id: id, request_id: `request-${id}`, step_index: 0, net_pence: "789123", escalated: true }));
  const html = renderToStaticMarkup(createElement(MustDecide, { queue }));
  expect(html).toContain('aria-labelledby="must-decide-heading"');
  expect(html).toContain('href="#extra-one"');
  expect(html).toContain('href="#extra-two"');
  expect(html).toContain("min-height:44px");
  expect(html).not.toMatch(/789123|£|GBP|<button/);
});

it("replaces a decided or no-longer-authorized queue without retaining old items", () => {
  const html = renderToStaticMarkup(createElement(MustDecide, { queue: [] }));
  expect(html).toContain("No extras waiting for your decision.");
  expect(html).not.toContain("href=");
});
