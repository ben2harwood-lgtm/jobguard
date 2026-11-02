import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InboxMetricsDashboard } from "./inbox-metrics-dashboard";
import type { InboxDashboard } from "../lib/inbox-metrics-server";
vi.stubGlobal("React", React);
const empty: InboxDashboard = { version: "inbox-dashboard.v1", environment: "synthetic_demo", asOf: "2026-11-02T00:00:00Z", mandatoryBlockers: [], byRule: [] };
const row: InboxDashboard["byRule"][number] = { ruleId: "proof", ruleVersion: "v1", findings: 2, decisions: 2,
  convertedFindings: 2, findingToDecisionRate: 1, confirmed: 0, dismissed: 0, duplicateCount: 0, coalescedCount: 0,
  meanTimeToDecisionMs: null, laterOutcomes: { unknown: 2, recorded: null } };
it("does not invent measurements for an empty store", () => {
  const html = renderToStaticMarkup(<InboxMetricsDashboard view={empty} />);
  expect(html).toContain("No outcome metrics recorded for this job"); expect(html).toContain("are unknown"); expect(html).not.toContain("0.0%");
});
it("distinguishes unobserved time/outcomes from measured zero and keeps mandatory blockers separate", () => {
  const html = renderToStaticMarkup(<InboxMetricsDashboard view={{ ...empty, mandatoryBlockers: [{ ruleId: "approval", ruleVersion: "v2", count: 2 }], byRule: [row] }} />);
  for (const text of ["Mandatory blockers", "advisory cap never hides", "approval", "v2", "100.0%", "Unknown — no later outcomes recorded", "2 Decisions have unknown later outcomes."]) expect(html).toContain(text);
  expect(html).not.toContain("0 seconds"); expect(html).not.toMatch(/score|rank/iu);
});
it("shows measured zero time, duplicates, coalescing and latest later outcomes separately by version", () => {
  const view = { ...empty, byRule: [{ ...row, meanTimeToDecisionMs: 0, dismissed: 1, duplicateCount: 1, coalescedCount: 2, laterOutcomes: { unknown: 1, recorded: { useful: 0, no_issue: 0, cancelled: 0, reversed: 1 } } }, { ...row, ruleVersion: "v2" }] };
  const html = renderToStaticMarkup(<InboxMetricsDashboard view={view} />);
  for (const text of ["0 seconds", "reversed: 1", "1 Decisions have unknown later outcomes.", 'aria-label="proof v1"', 'aria-label="proof v2"', "Duplicates / coalesced findings"]) expect(html).toContain(text);
});
