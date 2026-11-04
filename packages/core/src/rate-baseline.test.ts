import { describe, expect, it } from "vitest";
import { acceptRateSuggestion, evaluateRateCandidate, normalizeRateObservation, recentRateBaseline, type RateObservationInput, type RateQuery } from "./rate-baseline.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = uuid(1);
const query: RateQuery = { version: "rate-query.v1", tenantId, asOf: "2026-06-01T00:00:00Z", unit: "each", taxBasis: "standard_rate_20", category: "brick", region: "london" };
function row(n: number, ratePrincipalPence = 100, extra: Partial<RateObservationInput> = {}): RateObservationInput {
  return { version: "rate-observation.v1", id: uuid(100 + n), tenantId, jobId: uuid(2), scopeItemId: uuid(3), sourceScopeRevisionId: uuid(200 + n),
    effectiveAt: `2026-05-${String(n).padStart(2, "0")}T00:00:00Z`, unit: "each", ratePrincipalPence, currency: "GBP", taxBasis: "standard_rate_20", category: "brick", region: "london", provenance: "entered", kind: "rate", ...extra };
}
const history = () => [row(1, 100), row(2, 110), row(3, 120)];
const held = (n: number, rate: number, extra: Partial<RateObservationInput> = {}) => row(n, rate, { effectiveAt: "2026-06-02T00:00:00Z", ...extra });

describe("dark rate baseline v1, synthetic evidence only", () => {
  it("normalises aliases and context, preserves source revisions, and never mutates inputs", () => {
    const input = history().map(r => ({ ...r, unit: " EA ", category: " Brick ", region: " London ", taxBasis: " STANDARD_RATE_20 " }));
    const before = structuredClone(input);
    const result = recentRateBaseline(query, input);
    expect(result).toMatchObject({ status: "suggestion", rate: { pence: 110, currency: "GBP" }, sampleCount: 3, spread: { min: { pence: 100 }, max: { pence: 120 } }, drift: "unknown" });
    expect(result.sources.map(s => s.sourceScopeRevisionId)).toEqual(input.toReversed().map(r => r.sourceScopeRevisionId));
    expect(input).toEqual(before);
  });
  it("converts changed pack sizes to the declared base unit using exact half-even rounding", () => {
    const result = recentRateBaseline(query, [row(1, 1000, { unit: "pack", pack: { baseUnit: "ea", size: "10" } }), row(2, 2000, { unit: "pack", pack: { baseUnit: "each", size: "20" } }), row(3)]);
    expect(result.rate?.pence).toBe(100);
    expect(result.sources.map(s => s.packSize)).toEqual([null, "20", "10"]);
    expect(normalizeRateObservation(row(4, 201, { unit: "pack", pack: { baseUnit: "each", size: "2" } }))).toMatchObject({ value: { rate: { pence: 100 } } });
  });
  it("names unknown pack sizes, unknown units, unknown tax and missing context", () => {
    const result = recentRateBaseline(query, [row(1, 100, { unit: "pack" }), row(2, 100, { unit: "box" }), row(3, 100, { taxBasis: "gross_20" }), row(4, 100, { region: null }), row(5, 100, { unit: "pack", pack: { baseUnit: "each", size: "0" } })]);
    expect(result.exclusions.map(e => e.reason)).toEqual(["pack_size_unknown", "unknown_unit", "unknown_tax", "missing_context", "pack_size_unknown"]);
    expect(result.rate).toBeNull();
  });
  it("keeps tax, dimensional units, region and category apart rather than guessing equivalence", () => {
    const result = recentRateBaseline(query, [row(1, 100, { taxBasis: "exempt" }), row(2, 100, { unit: "m2" }), row(3, 100, { region: "leeds" }), row(4, 100, { category: "labour" })]);
    expect(result.exclusions.every(e => e.reason === "not_comparable")).toBe(true);
    expect(result.sampleCount).toBe(0);
  });
  it("deduplicates a replay and the same source with another ID", () => {
    const rows = history();
    expect(recentRateBaseline(query, [...rows, rows[0], { ...rows[0], id: uuid(900) }])).toMatchObject({ sampleCount: 3, exclusions: [{ reason: "duplicate" }, { reason: "duplicate" }] });
  });
  it("refuses conflicting same-ID or same-source replays", () => {
    expect(() => recentRateBaseline(query, [row(1), row(1, 200)])).toThrow("CONFLICTING_DUPLICATE");
    expect(() => recentRateBaseline(query, [row(1), row(2, 200, { sourceScopeRevisionId: row(1).sourceScopeRevisionId })])).toThrow("CONFLICTING_DUPLICATE");
  });
  it("excludes explicitly named credits and negative adjustments, without interpreting them as cheap rates", () => {
    const result = recentRateBaseline(query, [...history(), row(4, 100, { kind: "credit" }), row(5, -100)]);
    expect(result.sampleCount).toBe(3);
    expect(result.exclusions.map(e => e.reason)).toEqual(["credit", "credit"]);
  });
  it("reports outliers and rechecks the minimum after exclusion", () => {
    const result = recentRateBaseline(query, [row(1), row(2), row(3, 10_000)]);
    expect(result).toMatchObject({ status: "unknown", rate: null, sampleCount: 2, exclusions: [{ reason: "outlier" }] });
    expect(recentRateBaseline(query, [...history(), row(4, 10_000)]).rate?.pence).toBe(110);
  });
  it("returns unknown with no invented rate for empty and sparse histories", () => {
    for (const rows of [[], [row(1)], [row(1), row(2)]]) expect(recentRateBaseline(query, rows)).toMatchObject({ status: "unknown", rate: null, drift: "unknown" });
    expect(recentRateBaseline(query, []).spread).toBeNull();
  });
  it("treats zero rates as data and uses half-even for median ties", () => {
    expect(recentRateBaseline(query, [row(1, 0), row(2, 0), row(3, 0)]).rate?.pence).toBe(0);
    expect(recentRateBaseline(query, [row(1, 100), row(2, 100), row(3, 101), row(4, 101)]).rate?.pence).toBe(100);
  });
  it("rejects mixed tenants before filtering even excluded credit rows", () => {
    expect(() => recentRateBaseline(query, [...history(), row(4, -100, { tenantId: uuid(999) })])).toThrow("MIXED_TENANT");
  });
  it("limits the time window and sample count with explicit reasons", () => {
    const result = recentRateBaseline(query, [...Array.from({ length: 12 }, (_, i) => row(i + 1)), row(13, 100, { effectiveAt: "2025-01-01T00:00:00Z" }), held(14, 100)]);
    expect(result.sampleCount).toBe(10);
    expect(result.exclusions.filter(e => e.reason === "outside_window")).toHaveLength(2);
    expect(result.exclusions.filter(e => e.reason === "outside_recent_limit")).toHaveLength(2);
  });
  it("flags descriptive drift only with enough older and recent evidence", () => {
    const rates = [100, 100, 100, 130, 130, 130];
    expect(recentRateBaseline(query, rates.map((r, i) => row(i + 1, r))).drift).toBe("flagged");
    expect(recentRateBaseline(query, rates.map((_, i) => row(i + 1, 100))).drift).toBe("stable");
  });
  it("validates versioned boundaries and refuses ambiguous pack metadata", () => {
    expect(() => recentRateBaseline({ ...query, version: "v0" }, [])).toThrow("INVALID_INPUT");
    expect(() => normalizeRateObservation(row(1, 1.5))).toThrow("INVALID_INPUT");
    expect(() => normalizeRateObservation(row(1, 100, { pack: { baseUnit: "each", size: "10" } }))).toThrow("INVALID_INPUT");
  });
});

describe("held-out synthetic comparison", () => {
  it("compares on the same held-out samples with counts and explicitly descriptive uncertainty", () => {
    const result = evaluateRateCandidate(query, history(), [held(4, 120), held(5, 140)], 130);
    expect(result).toMatchObject({ status: "compared", trainingCount: 3, holdoutCount: 2, evaluatedCount: 2,
      baselineError: { meanAbsoluteError: { pence: 20 }, absoluteErrorRange: { min: { pence: 10 }, max: { pence: 30 } } },
      candidateError: { meanAbsoluteError: { pence: 10 } }, uncertainty: "observed_error_range_only_not_statistical_confidence" });
  });
  it("keeps hard holdout outliers and deduplicates holdout samples", () => {
    const sample = held(4, 10_000);
    const result = evaluateRateCandidate(query, history(), [sample, sample, held(5, 100, { kind: "credit" })], 100);
    expect(result).toMatchObject({ evaluatedCount: 1, exclusions: [{ reason: "duplicate" }, { reason: "credit" }], baselineError: { meanAbsoluteError: { pence: 9890 } } });
  });
  it("refuses conflicting held-out replays instead of hiding them from the score", () => {
    expect(() => evaluateRateCandidate(query, history(), [held(4, 100), held(4, 200)], 100)).toThrow("CONFLICTING_DUPLICATE");
  });
  it("does not claim a comparison with sparse training or no comparable holdout", () => {
    expect(evaluateRateCandidate(query, [row(1)], [held(4, 100)], 100)).toMatchObject({ status: "unknown", evaluatedCount: 0, baselineError: null, candidateError: null });
    expect(evaluateRateCandidate(query, history(), [held(4, 100, { region: "leeds" })], 100).status).toBe("unknown");
  });
  it("refuses temporal leakage, repeated source leakage and cross-tenant holdouts", () => {
    expect(() => evaluateRateCandidate(query, history(), [row(4)], 100)).toThrow("HOLDOUT_LEAKAGE");
    expect(() => evaluateRateCandidate(query, history(), [held(4, 100, { sourceScopeRevisionId: row(1).sourceScopeRevisionId })], 100)).toThrow("HOLDOUT_LEAKAGE");
    expect(() => evaluateRateCandidate(query, history(), [held(4, 100, { tenantId: uuid(999) })], 100)).toThrow("MIXED_TENANT");
  });
});

describe("human acceptance is only a new revision proposal", () => {
  const acceptance = { version: "rate-acceptance-proposal.v1", tenantId, currentRevisionId: uuid(500), newRevisionId: uuid(501), scopeItemId: uuid(3), actorId: uuid(4), acceptedRatePence: 110 };
  it("preserves the old revision and source provenance without writing any state", () => {
    const suggestion = recentRateBaseline(query, history()), before = structuredClone(suggestion);
    const proposal = acceptRateSuggestion(suggestion, acceptance);
    expect(proposal).toMatchObject({ version: "rate-new-revision-proposal.v1", previousRevisionId: uuid(500), newRevisionId: uuid(501), rate: { pence: 110 }, requiresAuthenticatedHumanCommand: true });
    expect(proposal.sources).toEqual(suggestion.sources);
    proposal.sources.pop();
    expect(suggestion).toEqual(before);
  });
  it("refuses unknown rates, other tenants, overwrites and changed accepted amounts", () => {
    expect(() => acceptRateSuggestion(recentRateBaseline(query, []), acceptance)).toThrow("INVALID_ACCEPTANCE");
    for (const extra of [{ tenantId: uuid(999) }, { newRevisionId: uuid(500) }, { acceptedRatePence: 120 }])
      expect(() => acceptRateSuggestion(recentRateBaseline(query, history()), { ...acceptance, ...extra })).toThrow("INVALID_ACCEPTANCE");
  });
});
