import { describe, expect, it } from "vitest";
import { enterpriseSignals } from "./enterprise-signal.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-02T00:00:00Z";
const extra = { jobId: id(1), extraId: id(2), sourceId: id(3), sorVersionId: id(4), sorCode: "SYNTHETIC", linked: false,
  withdrawal: { sourceId: id(5), at, reason: "already_on_order", scopeItemId: id(6) } };
const line = { jobId: id(1), sourceId: id(7), scopeItemId: id(6), sorVersionId: id(4), sorCode: "SYNTHETIC", at: "2026-10-03T00:00:00Z", quantity: "2", previousQuantity: "1", unit: "item", previousUnit: "item" };
const base = { version: "enterprise-signal-facts.v1", extras: [extra], orderLines: [line], billedVariations: [], closeouts: [], outlierPolicy: null };
describe("ENT-9B advisory observations", () => {
  it("[E9-23] cites exact unlinked order matches and later quantity increases", () => {
    const result = enterpriseSignals(base);
    expect(result.observations.map(s => s.kind).sort()).toEqual(["order_matches_unlinked_extra", "withdrawn_then_quantity_increased"]);
    expect(result.observations.every(s => s.jobId === id(1) && s.extraIds.includes(id(2)) && s.sourceIds.length >= 2)).toBe(true);
  });
  it("[E9-23] remains silent for wrong jobs, linked extras, price-only revisions and earlier increases", () => {
    for (const changed of [{ ...line, jobId: id(9) }, { ...line, quantity: "1" }, { ...line, at: "2026-10-01T00:00:00Z" }, { ...line, previousUnit: "m" }]) {
      expect(enterpriseSignals({ ...base, extras: [{ ...extra, linked: true }], orderLines: [changed] }).observations).toEqual([]);
    }
  });
  it("[E9-23] reports billed variations lacking an extra, excludes ordinary lines and existing links", () => {
    const billed = { jobId: id(1), sourceId: id(8), kind: "variation", extraId: null };
    expect(enterpriseSignals({ ...base, extras: [], orderLines: [], billedVariations: [billed] }).observations).toHaveLength(1);
    for (const row of [{ ...billed, kind: "original_order" }, { ...billed, extraId: id(2) }])
      expect(enterpriseSignals({ ...base, extras: [], orderLines: [], billedVariations: [row] }).observations).toEqual([]);
  });
  it("[E9-24] refuses an unconfigured outlier assertion", () => {
    expect(enterpriseSignals(base).outliers).toEqual({ status: "held", prerequisite: "versioned outlier policy" });
  });
  it("[E9-24] applies only an explicit supplied synthetic policy, cites comparison population and stays silent below the sample", () => {
    const closeout = (n: number, answer: string | null) => ({ jobId: id(1), sourceId: id(n), operativeId: id(20), at, answer });
    const outlierPolicy = { version: "synthetic-closeout-rule.v1", from: "2026-10-01T00:00:00Z", until: "2026-11-01T00:00:00Z", minimumAnswered: 2,
      maximumNoRate: { numerator: 1, denominator: 2 }, populationSourceIds: [id(30), id(31)], text: "Synthetic supplied comparison; no personnel conclusion." };
    const observations = enterpriseSignals({ ...base, extras: [], orderLines: [], closeouts: [closeout(10, "no"), closeout(11, "no")], outlierPolicy }).observations;
    expect(observations).toHaveLength(1);
    expect(observations[0]?.sourceIds).toEqual([id(10), id(11), id(30), id(31)]);
    expect(enterpriseSignals({ ...base, extras: [], orderLines: [], closeouts: [closeout(10, "no"), closeout(11, null)], outlierPolicy }).observations).toEqual([]);
  });
  it("[E9-25 E9-26 E9-27 E9-28] returns deterministic citations without mutating inputs or commercial facts", () => {
    const bytes = JSON.stringify(base);
    const first = enterpriseSignals(base);
    expect(enterpriseSignals(JSON.parse(bytes))).toEqual(first);
    expect(JSON.stringify(base)).toBe(bytes);
    expect(Object.isFrozen(first.observations)).toBe(true);
    expect(Object.keys(first.observations[0]!).sort()).toEqual(["extraIds", "id", "jobId", "kind", "sourceIds"]);
  });
});
