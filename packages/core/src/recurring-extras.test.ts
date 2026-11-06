import { describe, expect, it } from "vitest";
import { recurringExtras, type RecurringExtraObservation } from "./recurring-extras.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), asOf = "2026-11-04T12:00:00.000Z";
const row = (n: number, overrides: Partial<RecurringExtraObservation> = {}): RecurringExtraObservation => ({
  version: "recurring-extra-observation.v1", tenantId, jobId: id(n + 10), variationId: id(n + 20), revisionId: id(n + 30),
  observationId: id(n + 40), description: " Add  sockets ", unit: "each", ratePence: 100 + n,
  approvedAt: asOf, state: "approved", withdrawn: false, ...overrides,
});
const read = (rows: RecurringExtraObservation[]) => recurringExtras({ version: "recurring-extras-query.v1", tenantId, asOf }, rows);
describe("recurring approved extras", () => {
  it("requires three distinct jobs and keeps provenance", () => {
    expect(read([row(1), row(2)])).toMatchObject({ status: "not_enough_to_say", suggestions: [] });
    expect(read([row(1), row(2), row(3)])).toMatchObject({ status: "suggestions", suggestions: [{ description: "add sockets", jobCount: 3, lowest: { pence: 101 }, highest: { pence: 103 }, median: { pence: 102 }, sources: [{ variationId: id(21) }, { variationId: id(22) }, { variationId: id(23) }] }] });
  });
  it("counts a variation once and the same job cannot supply the threshold", () => {
    expect(read([row(1), row(1), row(2), row(3, { jobId: row(2).jobId })]).suggestions).toEqual([]);
    expect(read([row(1), row(1), row(2), row(3)]).suggestions[0]?.sources).toHaveLength(3);
    expect(() => read([row(1), row(1, { ratePence: 999 })])).toThrow("CONFLICTING_DUPLICATE");
  });
  it("keeps exact wording and units separate", () => {
    expect(read([row(1), row(2), row(3, { unit: "hour" }), row(4, { description: "add socket" })]).suggestions).toEqual([]);
    expect(read([row(1), row(2), row(3, { description: "ADD   SOCKETS" })]).suggestions).toHaveLength(1);
  });
  it("excludes unapproved, rejected, withdrawn, old and future work", () => {
    for (const change of [{ state: "draft" }, { state: "priced" }, { state: "rejected" }, { withdrawn: true }, { approvedAt: "2025-01-01T00:00:00Z" }, { approvedAt: "2026-11-05T00:00:00Z" }] as Partial<RecurringExtraObservation>[]) {
      expect(read([row(1), row(2), row(3, change)]).suggestions).toEqual([]);
    }
  });
  it("uses half-even even medians and rejects mixed tenants before filtering", () => {
    expect(read([row(1), row(2), row(3), row(4)]).suggestions[0]?.median.pence).toBe(102);
    expect(read([row(1, { ratePence: 100 }), row(2, { ratePence: 101 }), row(3, { ratePence: 102 }), row(4, { ratePence: 104 })]).suggestions[0]?.median.pence).toBe(102);
    expect(() => read([row(1, { tenantId: id(999), state: "rejected" })])).toThrow("MIXED_TENANT");
  });
  it("includes the exact window boundary, validates money and never mutates inputs", () => {
    const boundary = new Date(Date.parse(asOf) - 180 * 86400000).toISOString();
    const rows = [row(1), row(2), row(3, { approvedAt: boundary })];
    const before = JSON.stringify(rows);
    expect(read(rows).suggestions).toHaveLength(1);
    expect(JSON.stringify(rows)).toBe(before);
    expect(read([row(1), row(2), row(3, { approvedAt: new Date(Date.parse(boundary) - 1).toISOString() })]).suggestions).toEqual([]);
    expect(() => read([row(1, { ratePence: Number.MAX_SAFE_INTEGER + 1 })])).toThrow();
  });
});
