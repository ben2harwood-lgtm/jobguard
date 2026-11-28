import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { assembleEnterpriseDashboardReport, deriveBaseline, enterpriseSignals, projectStoredDashboardBilling } from "@jobguard/core";
import { BaselineView, DashboardView, EnterpriseDashboard, practiceTeamBindings } from "./enterprise-dashboard";
vi.stubGlobal("React", React);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const facts = { version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-28T00:00:00Z", extras: [{ jobId: id(1), extraId: id(2), canonicalExtraId: id(2), capturedAt: "2026-10-01T00:00:00Z", capturedSourceId: id(3), capturedValueSourceId: null, capturedValue: null, approved: null, steps: [], dimensions: { region: null, team: id(4), operative: id(5), client: id(6), contract: id(7) } }], closeouts: [], billing: { status: "held", prerequisite: "ENT-6B" } };
const row = { jobId: id(1), extraId: id(2), exportLineId: id(8), revisionId: id(9), runId: id(10), factId: id(11), inputHash: "a".repeat(64), lineId: "extra", billedNet: { numerator: "100", denominator: "1" }, creditedNet: { numerator: "0", denominator: "1" }, paidNet: { numerator: "1", denominator: "3" }, rejected: false, complete: false, allocations: [id(12)] };
// The database-aggregated (EP-F6) equivalent of `facts` under `query`: one unpriced captured extra in team 4.
const captured = { stage: "captured", jobId: id(1), extraIds: [id(2)], sourceIds: [id(3)], value: null, group: id(4) };
const capturedTotals = { captured: { count: 1, known: "0", unknownCount: 1 } };
const activityReport = () => assembleEnterpriseDashboardReport({ version: "enterprise-dashboard-aggregate.v1", cutoff: facts.cutoff, sourceHash: "b".repeat(64),
  totals: capturedTotals, groupCount: 1, groups: [{ id: id(4), totals: capturedTotals, contributions: [captured] }], contributions: [captured], drilldown: null }, query);
const signals = enterpriseSignals({ version: "enterprise-signal-facts.v1", extras: [], orderLines: [], billedVariations: [], closeouts: [], outlierPolicy: null });
it("renders exact billing with source/revision/allocation drill-down, partial-run warning, unknown capture and advisory labels", () => {
  const html = renderToStaticMarkup(<DashboardView activity={{ report: activityReport(), signals }} billing={projectStoredDashboardBilling(facts, query, [row])}/>);
  for (const text of ["1/3 pence", "Incomplete allocation runs", "unknown values 1", "Advisory only", "They do not prove a variation or fee entitlement.", id(1), id(2), id(8), id(9), id(10), id(11), id(12), "Methods and reproducibility"]) expect(html).toContain(text);
  expect(html).not.toMatch(/<button[^>]*>Approve/u); expect(html).not.toMatch(/<button[^>]*>Charge/u);
});
it("shows credited/reversed balances as zero from the stored read model, without reconstructing or adding stale figures", () => {
  const billing = projectStoredDashboardBilling(facts, query, [{ ...row, complete: true, creditedNet: row.billedNet, paidNet: { numerator: "0", denominator: "1" } }]);
  const html = renderToStaticMarkup(<DashboardView activity={{ report: activityReport(), signals }} billing={billing}/>);
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

it("displays the possible unmatched-variation advisory with fact/run citations and no commercial action", () => {
  const advisory = enterpriseSignals({ version: "enterprise-signal-facts.v1", extras: [], orderLines: [], billedVariations: [{ jobId: id(1), sourceId: id(30), sourceIds: [id(31)], kind: "variation", extraId: null }], closeouts: [], outlierPolicy: null });
  const report = activityReport(), billing = projectStoredDashboardBilling(facts, query, [row]);
  const before = JSON.stringify([report, billing]);
  const html = renderToStaticMarkup(<DashboardView activity={{ report, signals: advisory }} billing={billing}/>);
  for (const text of ["Possible billed variation without a JobGuard extra", "Advisory only", id(30), id(31), "They do not prove a variation or fee entitlement."]) expect(html).toContain(text);
  expect(html).not.toMatch(/<button[^>]*>(Approve|Charge|Price)/u);
  expect(JSON.stringify([report, billing])).toBe(before);
});

it("binds the first two practice teams in the given order", () => {
  const teams = [{ id: id(8), name: "First team" }, { id: id(3), name: "Second team" }, { id: id(4), name: "Third team" }];
  expect(practiceTeamBindings(teams)).toBe(`fictional-pilot=${id(8)}\nfictional-rest=${id(3)}`);
  expect(practiceTeamBindings(teams.slice(0, 1))).toBe("");
  expect(renderToStaticMarkup(<EnterpriseDashboard/>)).not.toContain("Use two practice teams");
});

it("gives each figure its own source pages: a partial group figure offers Next, and a requested page replaces only that figure's list", () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ ...captured, extraIds: [id(100 + i)], sourceIds: [id(200 + i)] }));
  const totals = { captured: { count: 21, known: "0", unknownCount: 21 } };
  const report = assembleEnterpriseDashboardReport({ version: "enterprise-dashboard-aggregate.v1", cutoff: facts.cutoff, sourceHash: "b".repeat(64), totals, groupCount: 1,
    groups: [{ id: id(4), totals, contributions: rows.slice(0, 20) }], contributions: rows, drilldown: null }, query);
  const billing = projectStoredDashboardBilling(facts, query, [row]), onPage = () => undefined;
  const first = renderToStaticMarkup(<DashboardView activity={{ report, signals }} billing={billing} onPage={onPage}/>);
  expect(first).toContain("Sources 1–20 of 21");
  expect(first).toMatch(/<button type="button">Next sources<\/button>/u);
  expect(first.split(`extras ${id(120)}`).length).toBe(2); // the 21st source: in the complete total, not the group's first page
  // Billing groups list their own sources, not a slice of the global first page.
  expect(first).toContain(`billed · job ${id(1)} · extra ${id(2)}`);
  const paged = renderToStaticMarkup(<DashboardView activity={{ report, signals }} billing={billing} onPage={onPage}
    drill={{ key: `activity|captured|${id(4)}`, offset: 20, total: 21, rows: [rows[20]] }}/>);
  expect(paged).toContain("Sources 21–21 of 21");
  expect(paged).toContain(`extras ${id(120)} · sources ${id(220)}`);
  expect(paged).toMatch(/<button type="button">Previous sources<\/button> <button type="button" disabled="">Next sources<\/button>/u);
  // The total's own list is unchanged by the group's page.
  expect(paged.split(`extras ${id(119)}`).length).toBe(2);
});
