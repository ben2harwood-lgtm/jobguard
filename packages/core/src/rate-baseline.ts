import { z } from "zod";
import { MAX_MONEY_PENCE, money, moneyFromBigInt, type Money } from "./money.js";
import { parseQuantity } from "./quantity.js";
import { divideRounded } from "./rational.js";

/** Dark, descriptive reference policy, not a commercial or tax policy. */
export const RATE_BASELINE_POLICY = Object.freeze({
  version: "rate-baseline.v1", minimumSamples: 3, recentLimit: 10, windowDays: 180,
  outlierFactor: 3, driftPercent: 20,
});
const label = z.string().trim().min(1).max(100).transform(value => value.toLowerCase());
const id = z.guid();
const instant = z.iso.datetime({ offset: true });
const units: Readonly<Record<string, string>> = { each: "each", ea: "each", unit: "each", m: "m", metre: "m", m2: "m2", "m²": "m2", kg: "kg", hour: "hour", hr: "hour" };
const rateObservationV1 = z.object({
  version: z.literal("rate-observation.v1"), id, tenantId: id, jobId: id, scopeItemId: id,
  sourceScopeRevisionId: id, effectiveAt: instant,
  unit: label, ratePrincipalPence: z.number().int().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE),
  currency: z.literal("GBP"), taxBasis: label, category: label.nullable(), region: label.nullable(),
  provenance: z.enum(["entered", "suggestion_accepted"]), kind: z.enum(["rate", "credit"]),
  // A pack without an explicit base unit and quantity is never guessed.
  pack: z.object({ baseUnit: label, size: z.string().max(30).regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u) }).strict().optional(),
}).strict();
export type RateObservationInput = z.input<typeof rateObservationV1>;
const queryV1 = z.object({
  version: z.literal("rate-query.v1"), tenantId: id, asOf: instant,
  unit: label, taxBasis: label, category: label, region: label,
}).strict();
export type RateQuery = z.input<typeof queryV1>;
export class RateBaselineError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "MIXED_TENANT" | "CONFLICTING_DUPLICATE" | "HOLDOUT_LEAKAGE" | "INVALID_ACCEPTANCE") { super(code); }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new RateBaselineError("INVALID_INPUT");
  return result.data;
}
export type ExclusionReason = "duplicate" | "credit" | "unknown_unit" | "unknown_tax" | "missing_context" | "pack_size_unknown" | "not_comparable" | "outside_window" | "outlier" | "outside_recent_limit";
export type Exclusion = Readonly<{ observationId: string; reason: ExclusionReason }>;
export type RateSource = Readonly<{
  observationId: string; jobId: string; scopeItemId: string; sourceScopeRevisionId: string;
  effectiveAt: string; originalUnit: string; packSize: string | null; provenance: "entered" | "suggestion_accepted";
}>;
type NormalizedRate = Readonly<{ tenantId: string; unit: string; taxBasis: string; category: string; region: string; rate: Money; source: RateSource }>;
type Normalization = { status: "excluded"; reason: ExclusionReason } | { status: "normalized"; value: NormalizedRate };
const supportedTax = new Set(["standard_rate_20", "zero_rate", "exempt", "outside_scope"]);

export function normalizeRateObservation(raw: unknown): Normalization {
  const row = parse(rateObservationV1, raw);
  if (row.kind === "credit" || row.ratePrincipalPence < 0) return { status: "excluded", reason: "credit" };
  if (!supportedTax.has(row.taxBasis)) return { status: "excluded", reason: "unknown_tax" };
  if (!row.category || !row.region) return { status: "excluded", reason: "missing_context" };
  let unit = units[row.unit];
  let rate = money(row.ratePrincipalPence);
  if (row.unit === "pack") {
    if (!row.pack || parseQuantity(row.pack.size).scaled === 0n) return { status: "excluded", reason: "pack_size_unknown" };
    unit = units[row.pack.baseUnit];
    const size = parseQuantity(row.pack.size);
    rate = moneyFromBigInt(divideRounded(BigInt(row.ratePrincipalPence) * size.scale, size.scaled, "half_even"));
  } else if (row.pack) {
    throw new RateBaselineError("INVALID_INPUT");
  }
  if (!unit) return { status: "excluded", reason: "unknown_unit" };
  return { status: "normalized", value: { tenantId: row.tenantId, unit, rate, taxBasis: row.taxBasis, category: row.category, region: row.region,
    source: { observationId: row.id, jobId: row.jobId, scopeItemId: row.scopeItemId, sourceScopeRevisionId: row.sourceScopeRevisionId,
      effectiveAt: row.effectiveAt, originalUnit: row.unit, packSize: row.pack?.size ?? null, provenance: row.provenance } } };
}
function median(values: readonly number[]): Money {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? money(sorted[middle]!) : moneyFromBigInt(divideRounded(BigInt(sorted[middle - 1]!) + BigInt(sorted[middle]!), 2n, "half_even"));
}
export type RateBaseline = Readonly<{
  version: "rate-suggestion.v1"; policyVersion: string; tenantId: string;
  query: RateQuery; status: "unknown" | "suggestion"; rate: Money | null; sampleCount: number;
  spread: Readonly<{ min: Money; max: Money; kind: "observed_range_not_confidence_interval" }> | null;
  drift: "unknown" | "stable" | "flagged"; sources: readonly RateSource[]; exclusions: readonly Exclusion[];
}>;

export function recentRateBaseline(rawQuery: unknown, rawRows: readonly unknown[]): RateBaseline {
  const query = parse(queryV1, rawQuery);
  const queryUnit = units[query.unit];
  if (!queryUnit || !supportedTax.has(query.taxBasis)) throw new RateBaselineError("INVALID_INPUT");
  const rows = rawRows.map(raw => parse(rateObservationV1, raw));
  // Check every row before filtering, including credits and obsolete rows.
  if (rows.some(row => row.tenantId !== query.tenantId)) throw new RateBaselineError("MIXED_TENANT");
  const seenIds = new Map<string, string>(), seenSources = new Map<string, string>();
  const eligible: NormalizedRate[] = [], exclusions: Exclusion[] = [];
  const exclude = (observationId: string, reason: ExclusionReason) => exclusions.push({ observationId, reason });
  for (const row of rows) {
    const fingerprint = JSON.stringify({ ...row, id: undefined });
    const previous = seenIds.get(row.id) ?? seenSources.get(row.sourceScopeRevisionId);
    if (previous !== undefined) {
      if (previous !== fingerprint) throw new RateBaselineError("CONFLICTING_DUPLICATE");
      exclude(row.id, "duplicate"); continue;
    }
    seenIds.set(row.id, fingerprint); seenSources.set(row.sourceScopeRevisionId, fingerprint);
    const normalized = normalizeRateObservation(row);
    if (normalized.status === "excluded") { exclude(row.id, normalized.reason); continue; }
    const value = normalized.value;
    if (value.unit !== queryUnit || value.taxBasis !== query.taxBasis || value.category !== query.category || value.region !== query.region) {
      exclude(row.id, "not_comparable"); continue;
    }
    const age = Date.parse(query.asOf) - Date.parse(row.effectiveAt);
    if (age < 0 || age > RATE_BASELINE_POLICY.windowDays * 86_400_000) { exclude(row.id, "outside_window"); continue; }
    eligible.push(value);
  }
  eligible.sort((a, b) => Date.parse(b.source.effectiveAt) - Date.parse(a.source.effectiveAt) || a.source.observationId.localeCompare(b.source.observationId));
  const recent = eligible.slice(0, RATE_BASELINE_POLICY.recentLimit);
  for (const row of eligible.slice(RATE_BASELINE_POLICY.recentLimit)) exclude(row.source.observationId, "outside_recent_limit");
  const centre = recent.length ? median(recent.map(row => row.rate.pence)).pence : 0;
  const retained = recent.filter(row => {
    const outlier = recent.length >= RATE_BASELINE_POLICY.minimumSamples && (BigInt(row.rate.pence) > BigInt(centre) * BigInt(RATE_BASELINE_POLICY.outlierFactor) || BigInt(row.rate.pence) * BigInt(RATE_BASELINE_POLICY.outlierFactor) < BigInt(centre));
    if (outlier) exclude(row.source.observationId, "outlier");
    return !outlier;
  });
  const values = retained.map(row => row.rate.pence), known = values.length >= RATE_BASELINE_POLICY.minimumSamples;
  let drift: RateBaseline["drift"] = "unknown";
  if (values.length >= 6) {
    const split = Math.floor(values.length / 2);
    const latest = median(values.slice(0, split)).pence, older = median(values.slice(split)).pence;
    drift = BigInt(Math.abs(latest - older)) * 100n > BigInt(older) * BigInt(RATE_BASELINE_POLICY.driftPercent) ? "flagged" : "stable";
  }
  return { version: "rate-suggestion.v1", policyVersion: RATE_BASELINE_POLICY.version, tenantId: query.tenantId,
    query: { ...query, unit: queryUnit }, status: known ? "suggestion" : "unknown", rate: known ? median(values) : null,
    sampleCount: values.length, spread: values.length ? { min: money(Math.min(...values)), max: money(Math.max(...values)), kind: "observed_range_not_confidence_interval" } : null,
    drift, sources: retained.map(row => row.source), exclusions };
}

/** Fixed candidate supplied before inspecting holdout. No fitting on held-out observations. */
export function evaluateRateCandidate(query: RateQuery, training: readonly unknown[], holdout: readonly unknown[], candidatePence: number) {
  const baseline = recentRateBaseline(query, training);
  const candidate = money(candidatePence);
  if (candidate.pence < 0) throw new RateBaselineError("INVALID_INPUT");
  const held = holdout.map(raw => parse(rateObservationV1, raw));
  if (held.some(row => row.tenantId !== baseline.tenantId)) throw new RateBaselineError("MIXED_TENANT");
  const trained = training.map(raw => parse(rateObservationV1, raw));
  if (held.some(row => Date.parse(row.effectiveAt) <= Date.parse(query.asOf) || trained.some(t => t.id === row.id || t.sourceScopeRevisionId === row.sourceScopeRevisionId)))
    throw new RateBaselineError("HOLDOUT_LEAKAGE");
  // Same comparability/dedup rules, but no holdout outlier removal: hard examples count.
  const seenIds = new Map<string, string>(), seenSources = new Map<string, string>();
  const exclusions: Exclusion[] = [];
  const actuals: number[] = [];
  for (const row of held) {
    const value = normalizeRateObservation(row);
    let reason: ExclusionReason | null = value.status === "excluded" ? value.reason : null;
    if (value.status === "normalized" && (value.value.unit !== baseline.query.unit || value.value.taxBasis !== baseline.query.taxBasis || value.value.category !== baseline.query.category || value.value.region !== baseline.query.region)) reason = "not_comparable";
    const fingerprint = JSON.stringify({ ...row, id: undefined });
    const previous = seenIds.get(row.id) ?? seenSources.get(row.sourceScopeRevisionId);
    if (previous !== undefined) {
      if (previous !== fingerprint) throw new RateBaselineError("CONFLICTING_DUPLICATE");
      reason = "duplicate";
    }
    seenIds.set(row.id, fingerprint); seenSources.set(row.sourceScopeRevisionId, fingerprint);
    if (reason) exclusions.push({ observationId: row.id, reason });
    else if (value.status === "normalized") actuals.push(value.value.rate.pence);
  }
  const errors = (estimate: number) => actuals.map(actual => Math.abs(actual - estimate));
  const summary = (values: number[]) => values.length ? {
    meanAbsoluteError: moneyFromBigInt(divideRounded(values.reduce((sum, value) => sum + BigInt(value), 0n), BigInt(values.length), "half_even")),
    absoluteErrorRange: { min: money(Math.min(...values)), max: money(Math.max(...values)) },
  } : null;
  return { version: "rate-evaluation.v1" as const, baseline, candidateRate: candidate, trainingCount: baseline.sampleCount, holdoutCount: held.length,
    evaluatedCount: baseline.rate ? actuals.length : 0, comparableHoldoutCount: actuals.length, exclusions,
    baselineError: baseline.rate ? summary(errors(baseline.rate.pence)) : null,
    candidateError: baseline.rate ? summary(errors(candidate.pence)) : null,
    uncertainty: "observed_error_range_only_not_statistical_confidence" as const,
    status: baseline.rate && actuals.length ? "compared" as const : "unknown" as const };
}

/** Proposal only. The future authenticated command must verify membership, revision and exact human intent. */
export function acceptRateSuggestion(suggestion: RateBaseline, raw: unknown) {
  const acceptance = parse(z.object({ version: z.literal("rate-acceptance-proposal.v1"), tenantId: id,
    currentRevisionId: id, newRevisionId: id, scopeItemId: id, actorId: id,
    acceptedRatePence: z.number().int().min(0).max(MAX_MONEY_PENCE),
  }).strict(), raw);
  if (suggestion.status !== "suggestion" || !suggestion.rate || acceptance.tenantId !== suggestion.tenantId ||
      acceptance.currentRevisionId === acceptance.newRevisionId || acceptance.acceptedRatePence !== suggestion.rate.pence)
    throw new RateBaselineError("INVALID_ACCEPTANCE");
  return { ...acceptance, versionOfAcceptance: acceptance.version,
    version: "rate-new-revision-proposal.v1" as const,
    previousRevisionId: acceptance.currentRevisionId, rate: money(suggestion.rate.pence),
    unit: suggestion.query.unit, taxBasis: suggestion.query.taxBasis, region: suggestion.query.region, category: suggestion.query.category,
    provenance: "suggestion_accepted" as const, policyVersion: suggestion.policyVersion,
    sources: suggestion.sources.map(source => ({ ...source })), requiresAuthenticatedHumanCommand: true as const };
}
