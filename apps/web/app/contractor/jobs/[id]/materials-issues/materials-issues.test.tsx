import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MaterialsIssues, sourceAnswer, sourceRefusal } from "./materials-issues";
vi.stubGlobal("React", React);
it("renders labelled stores inputs, plain movement choices and 44px controls without commercial fields", () => {
  const html = renderToStaticMarkup(<MaterialsIssues jobId="fictional" />);
  for (const label of ["Stores reference", "Event reference", "Work code", "Unit", "Quantity", "Date (UTC)", "Returned to stores", "Correction to a stores record", "Check for possible extras"]) expect(html).toContain(label);
  expect(html).toContain("min-height:44px");
  expect(html).not.toMatch(/name="(?:tenant|job|actor|role|origin|price|fee)"/);
});
it("reports the server answer without comparing quantities or inventing an excess", () => {
  expect(sourceAnswer("materials", {})).toContain("saved");
  expect(sourceAnswer("evaluate", { promptIds: [] })).toContain("Nothing was raised");
  expect(sourceAnswer("evaluate", { promptIds: ["id"] })).toContain("was raised");
  expect(sourceAnswer("evaluate", { promptIds: ["old"], quarantinedComparisons: 1 })).toContain("on hold");
  expect(sourceRefusal("PROMPT_CONFLICT")).toContain("different details");
  expect(sourceRefusal("NOT_FOUND")).toContain("current access");
});
