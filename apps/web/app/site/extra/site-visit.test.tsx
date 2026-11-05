import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, it } from "vitest";
import { SiteVisit } from "./site-visit";
beforeAll(() => { (globalThis as { React?: typeof React }).React = React; });
it("requires an explicit close-out answer for an existing visit", () => {
  const html = renderToStaticMarkup(<SiteVisit jobId="fictional-job" openVisitId="fictional-visit" />);
  expect(html).toContain("Did the resident ask for anything extra?");
  expect(html).toMatch(/<button disabled="">Complete visit/);
  expect(html).toContain('<option value="" selected="">Choose an answer</option>');
});
it("offers visit start without inventing an open visit", () => {
  const html = renderToStaticMarkup(<SiteVisit jobId="fictional-job" openVisitId={null} />);
  expect(html).toContain("Start visit");
  expect(html).not.toContain("Complete visit");
  expect(html).toContain("Search schedule of rates");
});
it("adds no recent-items heading or empty-state copy before an optional response arrives", () => {
 const html = renderToStaticMarkup(<SiteVisit jobId="fictional-job" openVisitId={null} />);
 expect(html).not.toContain("Recent items");
 expect(html).not.toContain("No matching items.");
});
