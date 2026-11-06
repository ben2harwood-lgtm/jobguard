import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DuplicateCandidates } from "./duplicate-candidates";

vi.stubGlobal("React", React);

it("keeps duplicate loading visible without competing with the approval status", () => {
  const html = renderToStaticMarkup(<main>
    <DuplicateCandidates jobId="fictional-job" onChange={async () => {}} />
    <p role="status">Mandatory approval overdue.</p>
  </main>);
  expect(html).toContain("Loading possible duplicates…");
  expect(html.match(/role="status"/gu)).toHaveLength(1);
  expect(html).toContain('<p role="status">Mandatory approval overdue.</p>');
});
