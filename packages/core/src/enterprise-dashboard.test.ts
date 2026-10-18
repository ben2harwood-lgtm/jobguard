import { describe, expect, it } from "vitest";
import { projectEnterpriseDashboard, dashboardQueryV1 } from "./enterprise-dashboard.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const amount = (n: number) => ({ pence: n, currency: "GBP" });
const fact = (n: number) => ({ jobId: id(1), extraId: id(n), canonicalExtraId: id(n),
  dimensions: { region: id(2), team: id(3), operative: id(4), client: id(5), contract: id(6) },
  capturedAt: "2026-10-01T12:00:00.000000Z", capturedSourceId: id(n + 100), capturedValue: amount(101),
  capturedValueSourceId: id(n + 200),
  approved: null, steps: [] });
const query = { version: "enterprise-dashboard-query.v1", from: "2026-10-01T00:00:00Z", until: "2026-11-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const snapshot = (extras: unknown[]) => ({ version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-16T00:00:00Z", extras,
  billing: { status: "held", prerequisite: "ENT-6B" } });

describe("ENT-9B projection", () => {
  it("[E9-01 E9-03] conserves drill-down sums and preserves unknown captured values", () => {
    const result = projectEnterpriseDashboard(snapshot([fact(10), { ...fact(11), capturedValue: null }]), query);
    expect(result.totals.captured).toMatchObject({ count: 2, known: amount(101), unknownCount: 1 });
    expect(result.totals.captured.count).toBe(result.contributions.filter(c => c.stage === "captured").length);
    expect(result.billing).toEqual({ status: "held", prerequisite: "ENT-6B" });
    expect(result.totals.billed).toBeNull();
  });
  it("[E9-02 E9-04] counts a duplicate group once without turning captures into fees", () => {
    const a = fact(10), b = { ...fact(11), canonicalExtraId: id(10) };
    const result = projectEnterpriseDashboard(snapshot([a, b]), query);
    expect(result.totals.captured.count).toBe(1);
    expect(result.contributions[0]?.extraIds).toEqual([id(10), id(11)]);
    expect(JSON.stringify(result)).not.toContain("feePence");
  });
  it("[E9-06] intersects every dimension before pagination and cannot multiply a contribution", () => {
    const result = projectEnterpriseDashboard(snapshot([fact(10), { ...fact(11), dimensions: { ...fact(11).dimensions, team: id(7) } }]),
      { ...query, filters: { team: id(3), operative: id(4), region: id(2), client: id(5), contract: id(6) }, limit: 1 });
    expect(result.totals.captured.count).toBe(1);
    expect(result.groups).toHaveLength(1);
    expect(projectEnterpriseDashboard(snapshot([fact(10), fact(11)]), { ...query, limit: 1 }).totals.captured.count).toBe(2);
  });
  it("[E9-07] derives pending/overdue and completed timing from supplied immutable step deadlines", () => {
    const a = { ...fact(10), approved: { sourceId: id(200), revisionId: id(201), at: "2026-10-02T00:00:00Z", value: amount(100) }, steps: [
      { id: id(300), sourceIds: [id(200)], dueAt: "2026-10-03T00:00:00Z", completedAt: "2026-10-02T00:00:00Z", outcome: "approved" },
      { id: id(301), sourceIds: [id(200)], dueAt: "2026-10-03T00:00:00Z", completedAt: null, outcome: "pending" }] };
    const result = projectEnterpriseDashboard(snapshot([a]), query);
    expect(result.totals.backlog.count).toBe(1);
    expect(result.totals.overdue.count).toBe(1);
    expect(result.totals.onTime.count).toBe(1);
  });
  it("[E9-19 E9-20] reproduces hashes and method-bearing exports across row/property order", () => {
    const a = projectEnterpriseDashboard(snapshot([fact(10), fact(11)]), query);
    const { limit = 20, ...rest } = query;
    const b = projectEnterpriseDashboard(snapshot([fact(11), fact(10)]), { limit, ...rest });
    expect(a).toEqual(b);
    expect(a.method.text).toContain("UTC");
    expect(a.inputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(projectEnterpriseDashboard(snapshot([fact(10), fact(11)]), { ...query, until: "2026-10-20T00:00:00Z" }).inputHash).not.toBe(a.inputHash);
  });
  it("[E9-08 E9-20] exposes observed close-out answers as an exact ratio, with missing separate and zero denominator not computable", () => {
    const closeout = { jobId: id(1), sourceId: id(400), dimensions: fact(10).dimensions, at: "2026-10-03T00:00:00Z", answer: "yes" };
    const result = projectEnterpriseDashboard({ ...snapshot([]), closeouts: [closeout, { ...closeout, sourceId: id(401), answer: "no" }, { ...closeout, sourceId: id(402), answer: null }] }, query);
    expect(result.closeoutRate).toEqual({ status: "computed", numerator: 1, denominator: 2 });
    expect(result.totals.closeoutMissing.count).toBe(1);
    expect(projectEnterpriseDashboard(snapshot([]), query).closeoutRate).toEqual({ status: "not_computable" });
  });
  it("[E9-29] rejects authority fields, duplicate IDs, missing canonicals, unsupported versions and overflow", () => {
    expect(dashboardQueryV1.safeParse({ ...query, tenantId: id(99) }).success).toBe(false);
    expect(() => projectEnterpriseDashboard(snapshot([fact(10), fact(10)]), query)).toThrow("DASHBOARD_INVALID");
    expect(() => projectEnterpriseDashboard(snapshot([{ ...fact(10), canonicalExtraId: id(999) }]), query)).toThrow("DASHBOARD_INVALID");
    expect(() => projectEnterpriseDashboard(snapshot([fact(10)]), { ...query, version: "v2" })).toThrow("DASHBOARD_INVALID");
    expect(() => projectEnterpriseDashboard(snapshot([10, 11].map(n => ({ ...fact(n), capturedValue: amount(1_000_000_000_000) }))), query)).toThrow();
  });
  it("[E9-26] refuses advisory observations as authoritative dashboard input", () => {
    expect(() => projectEnterpriseDashboard({ ...snapshot([fact(10)]), signals: [{ kind: "order_matches_unlinked_extra" }] }, query)).toThrow("DASHBOARD_INVALID");
  });
});
