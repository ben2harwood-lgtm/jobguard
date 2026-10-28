import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { deriveBaseline, enterpriseSignals, projectEnterpriseDashboard, projectStoredDashboardBilling } from "@jobguard/core";
import { BaselineView, DashboardView, EnterpriseDashboard } from "./enterprise-dashboard";
vi.stubGlobal("React", React);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const facts = { version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-28T00:00:00Z", extras: [{ jobId: id(1), extraId: id(2), canonicalExtraId: id(2), capturedAt: "2026-10-01T00:00:00Z", capturedSourceId: id(3), capturedValueSourceId: null, capturedValue: null, approved: null, steps: [], dimensions: { region: null, team: id(4), operative: id(5), client: id(6), contract: id(7) } }], closeouts: [], billing: { status: "held", prerequisite: "ENT-6B" } };
const row = { jobId: id(1), extraId: id(2), exportLineId: id(8), revisionId: id(9), runId: id(10), factId: id(11), inputHash: "a".repeat(64), lineId: "extra", billedNet: { numerator: "100", denominator: "1" }, creditedNet: { numerator: "0", denominator: "1" }, paidNet: { numerator: "1", denominator: "3" }, rejected: false, complete: false, allocations: [id(12)] };
const signals = { ...enterpriseSignals({ version: "enterprise-signal-facts.v1", extras: [], orderLines: [], billedVariations: [], closeouts: [], outlierPolicy: null }), billing: { status: "held", prerequisite: "ENT-6B persisted billed-variation source" } };
it("renders exact billing with source/revision/allocation drill-down, partial-run warning, unknown capture and advisory labels", () => {
  const html = renderToStaticMarkup(<DashboardView activity={{ report: projectEnterpriseDashboard(facts, query), signals }} billing={projectStoredDashboardBilling(facts, query, [row])}/>);
  for (const text of ["1/3 pence", "Incomplete allocation runs", "unknown values 1", "Advisory only", "Unmatched-variation signal omitted: ENT-6 requires an export match for every billed extra.", id(1), id(2), id(8), id(9), id(10), id(11), id(12), "Methods and reproducibility"]) expect(html).toContain(text);
  expect(html).not.toMatch(/<button[^>]*>Approve/u); expect(html).not.toMatch(/<button[^>]*>Charge/u);
});
it("shows credited/reversed balances as zero from the stored read model, without reconstructing or adding stale figures", () => {
  const billing = projectStoredDashboardBilling(facts, query, [{ ...row, complete: true, creditedNet: row.billedNet, paidNet: { numerator: "0", denominator: "1" } }]);
  const html = renderToStaticMarkup(<DashboardView activity={{ report: projectEnterpriseDashboard(facts, query), signals }} billing={billing}/>);
  expect(html).toContain("paid: 0 extras · net £0.00"); expect(html).toContain("billed: 0 extras · net £0.00"); expect(html).not.toContain("1/3 pence");
});
it("renders baseline job/extra sums, exact ratios, incomplete values and reproducible method bindings", () => {
  const report = deriveBaseline({ version: "baseline-history.v1", environment: "synthetic_demo", sourceNamespace: "fictional", sourceBatchId: "batch-1", sourceRevision: "v1", startMonth: "2026-01", endMonthExclusive: "2026-07", teamIds: ["pilot", "rest"], jobs: [{ sourceJobId: "historical-job", teamId: "pilot", month: "2026-01", extras: [{ sourceExtraId: "historical-extra", sourceWorkId: "work", reportedNet: null }] }, { sourceJobId: "zero-extra-job", teamId: "rest", month: "2026-02", extras: [] }] }, { version: "baseline-cohorts.v1", pilotTeamIds: ["pilot"], restTeamIds: ["rest"] });
  const html = renderToStaticMarkup(<BaselineView baseline={{ report, content: JSON.stringify(report), format: "json" }}/>);
  for (const text of ["historical-job", "historical-extra", "zero-extra-job", "Unknown value", "incomplete", report.method.text, report.inputHash, report.outputHash]) expect(html).toContain(text);
});
it("starts empty and offers explicit scope/period, baseline bindings and comparison controls", () => {
  const html = renderToStaticMarkup(<EnterpriseDashboard/>);
  for (const text of ["Contractor dashboard", "Group by", "Filter ID", "Import history", "Stored batch ID", "Compare baseline"]) expect(html).toContain(text);
  expect(html).not.toContain("Billed variation without");
});

it("keeps the export format label separate from option text for exact accessible-name selection", () => {
  const html = renderToStaticMarkup(<EnterpriseDashboard/>);
  expect(html).toContain('<label for="baseline-output-format">Export format</label>');
  expect(html).toContain('<select id="baseline-output-format" name="outputFormat">');
  expect(html).not.toContain('<label>Export format <select');
});
