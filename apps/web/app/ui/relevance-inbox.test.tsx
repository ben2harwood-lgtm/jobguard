import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ nullCalls: 0, lane: "advisory" }));
vi.mock("./watchdog-panel", () => ({ useWatchdogActive: () => true }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => {
    if (initial !== null) return react.useState(initial);
    state.nullCalls++;
    const item = { id: "decision", title: "Check", lane: state.lane, explanation: "Recorded facts", permittedAction: "Inspect", amountPence: null,
      sources: [], ruleId: "rule", ruleRevision: "rule.v1", findingRevision: 1 };
    return [state.nullCalls === 1 ? { mandatory: [], advisory: [item], availableAdvisory: 1, advisoryBudget: 5, metrics: { dismissed: 0 } } : item, vi.fn()];
  } };
});
import { RelevanceInbox } from "./relevance-inbox";
vi.stubGlobal("React", React);
beforeEach(() => { state.nullCalls = 0; state.lane = "advisory"; });
it("offers exactly the fixed optional feedback reasons when dismissing advisory work", () => {
  const html = renderToStaticMarkup(<RelevanceInbox jobId="job" />);
  expect(html).toContain('aria-label="Feedback reason (optional)"');
  for (const reason of ["useful", "already_handled", "incorrect", "not_relevant", "duplicate"]) expect(html).toContain(`value="${reason}"`);
  expect(html).toContain('value="" selected=""');
  expect(html).toContain("Dismiss advisory check");
});
it("does not add a dismiss action or a feedback picker for mandatory work", () => {
  state.lane = "mandatory";
  const html = renderToStaticMarkup(<RelevanceInbox jobId="job" />);
  expect(html).not.toContain("Dismiss advisory check"); expect(html).not.toContain("Feedback reason");
  expect(html).toContain("Recorded facts");
});
