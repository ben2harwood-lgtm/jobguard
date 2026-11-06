import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InterimDraftScreen } from "./screen";
vi.stubGlobal("React", React);
it("starts with the simulation notice and no financial figures before the server book loads", () => {
  const html = renderToStaticMarkup(React.createElement(InterimDraftScreen,{jobId:"fictional"}));
  expect(html).toContain("Simulation — nothing is issued, sent or posted.");
  expect(html).toContain("Synthetic receipts are fictional");
  expect(html).toContain("Loading stored drafts");
  expect(html).not.toContain("Server reconciliation");
  expect(html).toContain('min-height:44px');
});
