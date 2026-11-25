import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PilotInvoiceDraftPanel } from "./pilot-invoice-draft";
vi.mock("./designed-ui", () => ({ Card: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section> }));
it("marks the handoff as draft-only and keeps unsupported/unknown cases closed", () => {
  const fetch = vi.fn();
  const html = renderToStaticMarkup(<PilotInvoiceDraftPanel jobId="fictional" pilotFetch={fetch}/>);
  for (const text of ["Draft — This is not a VAT invoice", "Unknown answers", "Builder statements", "Credit notes need separate review", "outside JobGuard"])
    expect(html).toContain(text);
  expect(html).not.toMatch(/>Issue|>Send|>Mark paid/u);
  expect(fetch).not.toHaveBeenCalled();
});
