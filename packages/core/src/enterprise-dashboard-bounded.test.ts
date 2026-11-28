// EP-F6: the bounded report says when a page is partial and refuses a page that silently lost rows.
import { expect, it } from "vitest";
import { assembleEnterpriseDashboardReport, dashboardPageLimits, dashboardQueryV1, dashboardSelectionParams } from "./enterprise-dashboard.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const row = (n: number) => ({ stage: "captured", jobId: id(1), extraIds: [id(n)], sourceIds: [id(n + 1000)], value: { pence: 100, currency: "GBP" }, group: id(9) });
const aggregate = (count: number, rows: number, groupRows = Math.min(rows, dashboardPageLimits.groupContributions)) => ({
  version: "enterprise-dashboard-aggregate.v1", cutoff: "2026-10-28T00:00:00Z", sourceHash: "c".repeat(64),
  totals: { captured: { count, known: String(count * 100), unknownCount: 0 } }, groupCount: 1,
  groups: [{ id: id(9), totals: { captured: { count, known: String(count * 100), unknownCount: 0 } }, contributions: Array.from({ length: groupRows }, (_, i) => row(i + 10)) }],
  contributions: Array.from({ length: rows }, (_, i) => row(i + 10)), drilldown: null });

it("labels complete and partial pages; totals count every source, beyond the old 100,000 cap", () => {
  const complete = assembleEnterpriseDashboardReport(aggregate(3, 3), query);
  expect(complete.contributionPage).toEqual({ limit: 200, complete: true });
  expect(complete.groups[0]!.contributionPage).toEqual({ limit: 20, complete: true });
  const large = assembleEnterpriseDashboardReport(aggregate(250000, 200), query);
  expect(large.totals.captured).toMatchObject({ count: 250000, known: { pence: 25000000 } });
  expect(large.contributionPage).toEqual({ limit: 200, complete: false });
  expect(large.groups[0]!.contributionPage).toEqual({ limit: 20, complete: false });
});

it("refuses a short page that is not the last page, and drill-down replies that do not match the request", () => {
  expect(() => assembleEnterpriseDashboardReport(aggregate(5, 4), query)).toThrow("DASHBOARD_INVALID");
  expect(() => assembleEnterpriseDashboardReport(aggregate(5, 5, 4), query)).toThrow("DASHBOARD_INVALID");
  expect(() => assembleEnterpriseDashboardReport(aggregate(3, 3), { ...query, drilldown: { stage: "captured", offset: 0, limit: 10 } })).toThrow("DASHBOARD_INVALID");
  const drilled = assembleEnterpriseDashboardReport({ ...aggregate(3, 3), drilldown: { total: 3, contributions: [row(11)] } },
    { ...query, drilldown: { stage: "captured", group: null, offset: 1, limit: 1 } });
  expect(drilled.drilldown).toMatchObject({ stage: "captured", group: null, offset: 1, limit: 1, total: 3, complete: false });
});

it("builds the database selection only from the parsed query", () => {
  const parsed = dashboardQueryV1.parse({ ...query, filters: { team: id(9).toUpperCase(), operative: null }, drilldown: { stage: "approved", offset: 4, limit: 2 } });
  expect(dashboardSelectionParams(parsed)).toEqual({ from: query.from, until: query.until, filters: { team: id(9), operative: null }, dimension: "team",
    periodLabel: `${query.from}/${query.until}`, groupOffset: 0, groupLimit: 20, pageLimit: 200, groupPageLimit: 20,
    drill: { stage: "approved", hasGroup: false, group: null, offset: 4, limit: 2 } });
  for (const extra of [{ sql: "x" }, { drilldown: { stage: "captured", offset: 0, limit: 201 } }, { drilldown: { stage: "fee", offset: 0, limit: 1 } }])
    expect(dashboardQueryV1.safeParse({ ...query, ...extra }).success).toBe(false);
});
