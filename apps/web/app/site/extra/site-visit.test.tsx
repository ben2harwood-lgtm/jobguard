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

it.each(["yes", "no"] as const)("shows the saved %s answer read-only after reload", closeoutAnswer => {
 const html = renderToStaticMarkup(<SiteVisit jobId="fictional-job" openVisitId={null} lastCompletedVisit={{ visitId: "fictional-visit", closeoutAnswer }} />);
 expect(html).toContain(`Saved answer: ${closeoutAnswer === "yes" ? "Yes" : "No"}.`);
 expect(html).toContain("Did the resident ask for anything extra?");
 expect(html).not.toContain('<select id="closeout"');
 expect(html).toContain("Start visit");
});
it("requires a fresh answer for an open visit even when an earlier visit was completed", () => {
 const html = renderToStaticMarkup(<SiteVisit jobId="fictional-job" openVisitId="new-visit" lastCompletedVisit={{ visitId: "old-visit", closeoutAnswer: "yes" }} />);
 expect(html).toMatch(/<button disabled="">Complete visit/);
 expect(html).not.toContain("Saved answer:");
 expect(html).toContain('<option value="" selected="">Choose an answer</option>');
});
