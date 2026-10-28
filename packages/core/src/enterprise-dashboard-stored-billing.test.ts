import { expect, it } from "vitest";
import { projectStoredDashboardBilling } from "./enterprise-dashboard-stored-billing.js";
import { exactPence, parseExactPence, serializeExactPence, sumExactPence } from "./cumulative-fee.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z",
  dimension: "team", filters: {}, offset: 0, limit: 20 };
const extra = (n: number) => ({ jobId: id(1), extraId: id(n), canonicalExtraId: id(n), capturedAt: "2026-10-01T00:00:00Z",
  capturedSourceId: id(30 + n), capturedValueSourceId: null, capturedValue: null, approved: null, steps: [],
  dimensions: { region: id(2), team: id(10 + n), operative: id(3), client: id(4), contract: id(5) } });
const facts = { version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-28T00:00:00Z", extras: [extra(6), extra(7)],
  closeouts: [], billing: { status: "held", prerequisite: "ENT-6B" } };
const fraction = (n: number, d = 1) => ({ numerator: String(n), denominator: String(d) });
const row = (n: number) => ({ jobId: id(1), extraId: id(n), exportLineId: id(40 + n), revisionId: id(50 + n),
  runId: id(60 + n), factId: id(70 + n), inputHash: "a".repeat(64), lineId: "extra", billedNet: fraction(100),
  creditedNet: fraction(10), paidNet: fraction(1, 3), rejected: false, complete: true, allocations: [id(90), id(91)] });
it("stored balances conserve exact drill-downs and groups; only the aggregate display rounds", () => {
  const result = projectStoredDashboardBilling(facts, query, [row(6), row(7)]);
  expect(result.totals.billed.known.pence).toBe(180);
  expect(result.totals.paid.exactPence).toEqual(fraction(2, 3));
  expect(result.totals.paid.known.pence).toBe(1);
  for (const stage of ["billed", "paid"] as const) {
    const drill = result.contributions.filter(c => c.stage === stage).map(c => parseExactPence(c.exactPence));
    expect(serializeExactPence(sumExactPence(drill))).toEqual(result.totals[stage].exactPence);
    expect(serializeExactPence(sumExactPence(result.groups.map(g => parseExactPence(g.totals[stage].exactPence)))))
      .toEqual(result.totals[stage].exactPence);
  }
  expect(result.contributions.every(c => c.runId && c.factId && c.exportLineId && c.allocationIds.length === 2)).toBe(true);
});
it("reproduces across row order, allocation order and a later unchanged read snapshot", () => {
  const a = projectStoredDashboardBilling(facts, query, [row(6), row(7)]);
  const b = projectStoredDashboardBilling({ ...facts, cutoff: "2026-10-29T00:00:00Z" }, query,
    [row(7), { ...row(6), allocations: [...row(6).allocations].reverse() }]);
  expect(b).toEqual(a);
  expect(a.method.text).toContain("ENT-6");
});
it("intersects dimensions and capture period and never counts non-canonical or unauthorized extras", () => {
  const result = projectStoredDashboardBilling(facts, { ...query, filters: { team: id(16) }, dimension: "operative" }, [row(6), row(7), row(8)]);
  expect(result.totals.billed.count).toBe(1);
  expect(result.groups[0]?.id).toBe(id(3));
  expect(result.contributions.every(c => c.extraId === id(6))).toBe(true);
  expect(projectStoredDashboardBilling(facts, { ...query, until: "2026-02-01T00:00:00Z" }, [row(6)]).contributions).toEqual([]);
});
it("keeps held runs explicit and applies credits, reversals and rejection without negative counts", () => {
  const held = projectStoredDashboardBilling(facts, query, [{ ...row(6), complete: false, paidNet: fraction(0) }]);
  expect(held.complete).toBe(false); expect(held.held).toEqual([{ extraId: id(6), runId: id(66) }]);
  expect(held.totals.paid.count).toBe(0);
  expect(projectStoredDashboardBilling(facts, query, [{ ...row(6), rejected: true }]).contributions).toEqual([]);
  expect(projectStoredDashboardBilling(facts, query, [{ ...row(6), creditedNet: fraction(100), paidNet: fraction(0) }]).contributions).toEqual([]);
});
it("refuses duplicate or cross-job stored matches and malformed fractions", () => {
  expect(() => projectStoredDashboardBilling(facts, query, [row(6), row(6)])).toThrow("DASHBOARD_INVALID");
  expect(() => projectStoredDashboardBilling(facts, query, [{ ...row(6), jobId: id(99) }])).toThrow("DASHBOARD_INVALID");
  expect(() => projectStoredDashboardBilling(facts, query, [{ ...row(6), paidNet: fraction(1, 0) }])).toThrow("DASHBOARD_INVALID");
  expect(serializeExactPence(exactPence(0n))).toEqual(fraction(0));
});
