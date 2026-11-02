import * as React from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { RecoveryJourney } from "./recovery-journey";

it("DEMO-J2 first paint contains no money outcome, zero difference or source identities before access is checked", () => {
  (globalThis as { React?: typeof React }).React = React;
  const html = renderToString(React.createElement(RecoveryJourney, { jobId: "10000000-0000-4000-8000-000000000001" }));
  expect(html).toContain("Loading saved recovery sources");
  for (const marker of ["success-fee-net-posted", "fee-refunded-principal", "value-found-yours-before-tax", "unresolved-money-differences", "real-external-actions", "Saved source report"]) expect(html).not.toContain(marker);
});
