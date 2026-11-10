import { afterEach, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProofStage } from "./proof-stage";
vi.mock("./watchdog-panel", () => ({ useWatchdogActive: () => true }));
afterEach(() => vi.unstubAllGlobals());
it("names the work proof honestly as a practice certificate and preserves the journey controls and identities", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(<ProofStage jobId="11111111-1111-4111-8111-111111111111"/>);
  expect(html).toContain('<h2 id="proof-title">Proof of the work</h2>');
  expect(html).toContain("Practice example: an electrical certificate");
  expect(html).not.toContain("Electrical stage proof");
  expect(html).toContain('id="work-proof"'); expect(html).toContain('aria-labelledby="proof-title"');
  for (const id of ["proof-state", "stage-status", "mandatory-decision-count", "real-external-actions"]) expect(html).toContain(`data-testid="${id}"`);
  for (const label of ["Attach generated practice image", "Check file integrity", "Complete this stage"]) expect(html).toContain(label);
});
