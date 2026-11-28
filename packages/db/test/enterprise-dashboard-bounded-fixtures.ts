// EP-F6 test helpers: compare the bounded database report with the reference projection over full facts.
import { expect } from "vitest";
import { dashboardPageLimits, type projectEnterpriseDashboard } from "@jobguard/core";

type Reference = ReturnType<typeof projectEnterpriseDashboard>;
type Row = Reference["contributions"][number];
/** The first `limit` rows of each stage, in the reference order: what one bounded page must hold. */
export function firstPerStage(rows: readonly Row[], limit: number) {
  const seen = new Map<string, number>();
  return rows.filter(r => { const n = seen.get(r.stage) ?? 0; seen.set(r.stage, n + 1); return n < limit; });
}
/**
 * Every figure, group and returned source row equals the reference projection. Only the report version, its two
 * hashes (they bind the bounded read's own source hash) and the page labels differ. Pages must say whether they
 * are complete, and a complete page must hold every reference row.
 */
export function expectSameAsReference(bounded: { [key: string]: unknown }, reference: Reference) {
  const { version, inputHash, outputHash, contributionPage, drilldown, groups, contributions, ...rest } = bounded as Record<string, unknown> & {
    contributionPage: { limit: number; complete: boolean }; groups: { contributionPage: { limit: number; complete: boolean }; contributions: Row[] }[]; contributions: Row[] };
  const { version: _v, inputHash: _i, outputHash: _o, groups: referenceGroups, contributions: referenceRows, ...referenceRest } = reference;
  expect(version).toBe("enterprise-dashboard-report.v2");
  expect([inputHash, outputHash].every(h => typeof h === "string" && /^[a-f0-9]{64}$/u.test(h))).toBe(true);
  expect(drilldown).toBeNull();
  expect(rest).toEqual(referenceRest);
  expect(contributions).toEqual(firstPerStage(referenceRows, dashboardPageLimits.contributions));
  expect(contributionPage).toEqual({ limit: dashboardPageLimits.contributions, complete: contributions.length === referenceRows.length });
  expect(groups.map(({ contributionPage: page, contributions: rows, ...g }) => {
    const expected = referenceGroups.find(r => r.id === (g as { id: string | null }).id)!;
    expect(rows).toEqual(firstPerStage(expected.contributions, dashboardPageLimits.groupContributions));
    expect(page).toEqual({ limit: dashboardPageLimits.groupContributions, complete: rows.length === expected.contributions.length });
    return { ...g, contributions: expected.contributions };
  })).toEqual(referenceGroups);
}
