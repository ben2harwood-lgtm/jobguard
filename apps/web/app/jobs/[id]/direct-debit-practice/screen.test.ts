import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi, afterEach } from "vitest";
import { DirectDebitPracticeHistory, DirectDebitPracticeScreen } from "./screen";
vi.stubGlobal("React", React);
afterEach(() => vi.unstubAllGlobals());
it("labels the screen as fictional and never implies a real collection", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(DirectDebitPracticeScreen, { jobId: "fictional" }));
  expect(html).toContain("No bank or real Direct Debit is involved");
  expect(html).toContain("No money is collected");
});
it("shows stored request, confirmed, reversal and blocking labels without turning them into paid", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(DirectDebitPracticeHistory, { view: {
    version: "debit-practice-view.v1", mandate: "Mandate cancelled or revoked", blocksNewCollection: true,
    payments: [{ label: "Practice payment 1", state: "Payment requested — not paid" },
      { label: "Practice payment 2", state: "Collection confirmed — awaiting payout" },
      { label: "Practice payment 3", state: "Payment charged back" }],
    history: [{ sequence: 1, label: "Payment requested — not paid", current: false },
      { sequence: 2, label: "Mandate cancelled or revoked", current: true }], nextAction: null,
  } }));
  for (const label of ["Payment requested — not paid", "Collection confirmed — awaiting payout", "Payment charged back", "New collection blocked by mandate state.", "(current)"]) expect(html).toContain(label);
  expect(html).not.toContain("Payment paid out");
  expect(html.indexOf("<li>Payment requested")).toBeLessThan(html.indexOf("<li>Mandate cancelled"));
});
