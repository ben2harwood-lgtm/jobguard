import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { sha256 } from "./evidence-pack.js";
import { instantV1 } from "./receipt-allocation.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";

const uuid = z.guid({ error: "Invalid uuid" }).transform(v => v.toLowerCase());
const moneyV1 = z.object({ pence: z.number().int().nonnegative().max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
export const dashboardDimensions = ["region", "team", "operative", "client", "contract", "period"] as const;
const dimensions = z.object({ region: uuid.nullable(), team: uuid, operative: uuid.nullable(), client: uuid, contract: uuid }).strict();
/** Activity and stored-billing stages a drill-down may page through. */
export const dashboardDrilldownStages = ["captured", "approved", "backlog", "overdue", "onTime", "late", "closeoutYes", "closeoutNo", "closeoutMissing", "billed", "paid"] as const;
/** Offsets are bounded by the server's integer range, not by a row cap. */
const pageOffset = z.number().int().min(0).max(1_000_000_000);
export const dashboardQueryV1 = z.object({ version: z.literal("enterprise-dashboard-query.v1"),
  from: instantV1, until: instantV1, dimension: z.enum(dashboardDimensions),
  filters: dimensions.partial(), offset: pageOffset, limit: z.number().int().min(1).max(200),
  // EP-F6: one drill-down page. `group` absent = the whole total; present (null = unattributed) = that group's figure.
  drilldown: z.object({ stage: z.enum(dashboardDrilldownStages), group: z.string().min(1).max(200).nullable().optional(),
    offset: pageOffset, limit: z.number().int().min(1).max(200) }).strict().optional(),
}).strict().refine(v => compareServerInstants(v.from, v.until) < 0, "Invalid interval");
const stepV1 = z.object({ id: uuid, dueAt: instantV1.nullable(), completedAt: instantV1.nullable(),
  sourceIds: z.array(uuid).min(1).max(10),
  outcome: z.enum(["pending", "approved", "rejected", "superseded", "withdrawn", "duplicate"]) }).strict();
export const dashboardExtraV1 = z.object({ jobId: uuid, extraId: uuid, canonicalExtraId: uuid, dimensions,
  capturedAt: instantV1, capturedSourceId: uuid, capturedValue: moneyV1.nullable(),
  capturedValueSourceId: uuid.nullable(),
  approved: z.object({ sourceId: uuid, revisionId: uuid, at: instantV1, value: moneyV1 }).strict().nullable(),
  steps: z.array(stepV1).max(100),
}).strict();
export const dashboardFactsV1 = z.object({ version: z.literal("enterprise-dashboard-facts.v1"), cutoff: instantV1,
  extras: z.array(dashboardExtraV1).max(100000),
  closeouts: z.array(z.object({ jobId: uuid, sourceId: uuid, dimensions, at: instantV1, answer: z.enum(["yes", "no"]).nullable() }).strict()).max(100000).prefault([]),
  billing: z.object({ status: z.literal("held"), prerequisite: z.literal("ENT-6B") }).strict(),
}).strict();
export type DashboardFacts = z.infer<typeof dashboardFactsV1>;
export type DashboardExtra = z.infer<typeof dashboardExtraV1>;
export class EnterpriseDashboardError extends Error {
  constructor(readonly code: "DASHBOARD_INVALID" | "NOT_FOUND" | "MODE_FORBIDDEN" | "DASHBOARD_PREREQUISITE_REQUIRED" | "DASHBOARD_UNAVAILABLE" | "DASHBOARD_SELECTION_TOO_LARGE") { super(code); }
  toJSON() { return { version: "enterprise-dashboard-error.v1", code: this.code }; }
}
export function dashboardParse<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  return result.data;
}
export const dashboardMethod = Object.freeze({ version: "enterprise-dashboard-method.v1",
  text: "Synthetic observation: half-open UTC interval; captured groups attributed to canonical capture time and current authorized job dimensions; one active duplicate group counts once. Known whole-pence subtotals and unknown counts are separate. Approved means current immutable approval outcome. Backlog counts pending requirement steps at cutoff; timing compares immutable step deadlines. Close-out rate is observed yes / (yes + no) answers on completed visits in the interval; missing answers are separate, zero denominator is not_computable. Billing and settlement await ENT-6B. These observations do not calculate fees or job completion; this is not an approved pilot baseline method." });
export function dashboardCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(dashboardCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => dashboardCompareText(a, b))
    .map(([key, v]) => `${JSON.stringify(key)}:${dashboardCanonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const dashboardCompareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const dashboardPeriodContains = (at: string, from: string, until: string) => compareServerInstants(at, from) >= 0 && compareServerInstants(at, until) < 0;
export function dashboardFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) dashboardFreeze(child); Object.freeze(value); }
  return value;
}
const activityStages = ["captured", "approved", "backlog", "overdue", "onTime", "late", "closeoutYes", "closeoutNo", "closeoutMissing"] as const;
type Stage = typeof activityStages[number];
type Contribution = { stage: Stage; jobId: string; extraIds: string[]; sourceIds: string[]; value: z.infer<typeof moneyV1> | null; group: string | null };
const stages: Stage[] = [...activityStages];
function totals(rows: Contribution[]) {
  return Object.fromEntries(stages.map(stage => {
    const items = rows.filter(c => c.stage === stage);
    return [stage, { count: items.length, known: moneyFromBigInt(items.reduce((n, c) => n + BigInt(c.value?.pence ?? 0), 0n)), unknownCount: items.filter(c => c.value === null).length }];
  })) as Record<Stage, { count: number; known: ReturnType<typeof moneyFromBigInt>; unknownCount: number }>;
}
/** Internal projection over supplied, already authorized facts. It is not an authentication boundary. No signal input is accepted. */
export function projectEnterpriseDashboard(raw: unknown, rawQuery: unknown) {
  const input = dashboardParse(dashboardFactsV1, raw), query = dashboardParse(dashboardQueryV1, rawQuery);
  input.extras.sort((a, b) => dashboardCompareText(a.extraId, b.extraId));
  input.closeouts.sort((a, b) => dashboardCompareText(a.sourceId, b.sourceId));
  const byId = new Map(input.extras.map(e => [e.extraId, e]));
  if (byId.size !== input.extras.length) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  for (const e of input.extras) {
    const canonical = byId.get(e.canonicalExtraId);
    if (!canonical || canonical.canonicalExtraId !== canonical.extraId || canonical.jobId !== e.jobId ||
        new Set(e.steps.map(s => s.id)).size !== e.steps.length || compareServerInstants(e.capturedAt, input.cutoff) > 0 ||
        (e.capturedValue !== null && e.capturedValueSourceId === null) ||
        (e.approved && compareServerInstants(e.approved.at, input.cutoff) > 0)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    e.steps.sort((a, b) => dashboardCompareText(a.id, b.id));
  }
  const inPeriod = (at: string) => dashboardPeriodContains(at, query.from, query.until);
  const contributions: Contribution[] = [], membersByCanonical = new Map<string, DashboardExtra[]>();
  for (const e of input.extras) { const members = membersByCanonical.get(e.canonicalExtraId) ?? []; members.push(e); membersByCanonical.set(e.canonicalExtraId, members); }
  const matches = (d: z.infer<typeof dimensions>) => Object.entries(query.filters).every(([key, value]) => d[key as keyof typeof d] === value);
  for (const e of input.extras.filter(e => e.extraId === e.canonicalExtraId)) {
    if (!inPeriod(e.capturedAt) || !matches(e.dimensions)) continue;
    const members = membersByCanonical.get(e.extraId)!;
    const group = query.dimension === "period" ? `${query.from}/${query.until}` : e.dimensions[query.dimension];
    const add = (stage: Stage, sourceIds: string[], value: Contribution["value"] = null) => contributions.push({ stage, jobId: e.jobId, extraIds: members.map(m => m.extraId), sourceIds: [...sourceIds].sort(dashboardCompareText), value, group });
    add("captured", [...members.map(m => m.capturedSourceId), ...(e.capturedValueSourceId ? [e.capturedValueSourceId] : [])], e.capturedValue);
    if (e.approved) add("approved", [e.approved.sourceId, e.approved.revisionId], e.approved.value);
    for (const step of e.steps) {
      if (step.completedAt && compareServerInstants(step.completedAt, input.cutoff) > 0) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
      if (step.outcome === "pending") {
        add("backlog", [step.id, ...step.sourceIds]);
        if (step.dueAt && compareServerInstants(input.cutoff, step.dueAt) > 0) add("overdue", [step.id, ...step.sourceIds]);
      } else if (step.outcome === "approved" && step.completedAt && step.dueAt) {
        add(compareServerInstants(step.completedAt, step.dueAt) <= 0 ? "onTime" : "late", [step.id, ...step.sourceIds]);
      }
    }
  }
  if (new Set(input.closeouts.map(c => c.sourceId)).size !== input.closeouts.length) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  for (const c of input.closeouts) {
    if (compareServerInstants(c.at, input.cutoff) > 0) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    if (!inPeriod(c.at) || !matches(c.dimensions)) continue;
    contributions.push({ stage: c.answer === "yes" ? "closeoutYes" : c.answer === "no" ? "closeoutNo" : "closeoutMissing", jobId: c.jobId,
      extraIds: [], sourceIds: [c.sourceId], value: null, group: query.dimension === "period" ? `${query.from}/${query.until}` : c.dimensions[query.dimension] });
  }
  const grouped = new Map<string | null, Contribution[]>();
  for (const c of contributions) { const rows = grouped.get(c.group) ?? []; rows.push(c); grouped.set(c.group, rows); }
  const groups = [...grouped].sort(([a], [b]) => dashboardCompareText(a ?? "", b ?? "")).map(([id, rows]) => {
    return { id, totals: totals(rows), closeoutRate: observedCloseoutRate(rows), contributions: rows };
  });
  const method = { ...dashboardMethod, hash: sha256(dashboardCanonical(dashboardMethod)) };
  const inputHash = sha256(dashboardCanonical({ input, query, method }));
  const result = { version: "enterprise-dashboard-report.v1", environment: "synthetic_demo", cutoff: input.cutoff, method, inputHash,
    totals: { ...totals(contributions), billed: null, paid: null }, contributions, groups: groups.slice(query.offset, query.offset + query.limit),
    groupCount: groups.length, billing: input.billing, closeoutRate: observedCloseoutRate(contributions) };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}
/** First-page sizes for each drill-down returned with a report; further pages use `query.drilldown`. */
export const dashboardPageLimits = Object.freeze({ contributions: 200, groupContributions: 20 });
type DashboardQuery = z.infer<typeof dashboardQueryV1>;
/** Server-built selection for the bounded database read. Values come only from the parsed query. */
export function dashboardSelectionParams(query: DashboardQuery, resource: "activity" | "billing" = "activity") {
  const d = query.drilldown;
  return { resource, from: query.from, until: query.until, filters: query.filters, dimension: query.dimension, periodLabel: `${query.from}/${query.until}`,
    groupOffset: query.offset, groupLimit: query.limit, pageLimit: dashboardPageLimits.contributions, groupPageLimit: dashboardPageLimits.groupContributions,
    drill: d ? { stage: d.stage, hasGroup: d.group !== undefined, group: d.group ?? null, offset: d.offset, limit: d.limit } : null };
}
const stageTotalV1 = z.object({ count: z.number().int().nonnegative(), known: z.string().regex(/^\d+$/u), unknownCount: z.number().int().nonnegative() }).strict();
const stageTotalsV1 = z.partialRecord(z.enum(activityStages), stageTotalV1);
const contributionV1 = z.object({ stage: z.enum(activityStages), jobId: uuid, extraIds: z.array(uuid).max(100000), sourceIds: z.array(uuid).max(100000),
  value: moneyV1.nullable(), group: z.string().max(200).nullable() }).strict();
const pageRows = z.array(contributionV1).max(activityStages.length * dashboardPageLimits.contributions);
/** Database-aggregated activity (EP-F6). Totals cover every selected row; only pages of rows are carried. */
export const dashboardAggregateV1 = z.object({ version: z.literal("enterprise-dashboard-aggregate.v1"), cutoff: instantV1,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), totals: stageTotalsV1, groupCount: z.number().int().nonnegative(),
  groups: z.array(z.object({ id: z.string().max(200).nullable(), totals: stageTotalsV1,
    contributions: z.array(contributionV1).max(activityStages.length * dashboardPageLimits.groupContributions) }).strict()).max(200),
  contributions: pageRows, drilldown: z.object({ total: z.number().int().nonnegative(), contributions: z.array(contributionV1).max(200) }).strict().nullable(),
}).strict();
type AggregateTotals = z.infer<typeof stageTotalsV1>;
const aggregateTotals = (t: AggregateTotals) => Object.fromEntries(stages.map(stage => [stage, { count: t[stage]?.count ?? 0,
  known: moneyFromBigInt(BigInt(t[stage]?.known ?? "0")), unknownCount: t[stage]?.unknownCount ?? 0 }])) as Record<Stage, { count: number; known: ReturnType<typeof moneyFromBigInt>; unknownCount: number }>;
const aggregateRate = (t: AggregateTotals) => {
  const numerator = t.closeoutYes?.count ?? 0, denominator = numerator + (t.closeoutNo?.count ?? 0);
  return denominator ? { status: "computed", numerator, denominator } : { status: "not_computable" };
};
/** Says, per drill-down, whether the returned page holds every contribution behind its figure. */
function pageState(rows: readonly { stage: string }[], t: AggregateTotals, limit: number) {
  const complete = stages.every(stage => {
    const returned = rows.filter(r => r.stage === stage).length, count = t[stage]?.count ?? 0;
    if (returned > count || returned > limit || (returned < count && returned < limit)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    return returned === count;
  });
  return { limit, complete };
}
/** Pure assembly of the bounded database read into the report shape. It is not an authentication boundary. */
export function assembleEnterpriseDashboardReport(raw: unknown, rawQuery: unknown) {
  const agg = dashboardParse(dashboardAggregateV1, raw), query = dashboardParse(dashboardQueryV1, rawQuery);
  const sorted = <T extends { extraIds: string[]; sourceIds: string[] }>(rows: T[]) => rows.map(r => ({ ...r,
    extraIds: [...r.extraIds].sort(dashboardCompareText), sourceIds: [...r.sourceIds].sort(dashboardCompareText) }));
  const method = { ...dashboardMethod, hash: sha256(dashboardCanonical(dashboardMethod)) };
  const inputHash = sha256(dashboardCanonical({ sourceHash: agg.sourceHash, cutoff: agg.cutoff, query, method }));
  const d = query.drilldown;
  if ((d === undefined) !== (agg.drilldown === null)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  const result = { version: "enterprise-dashboard-report.v2", environment: "synthetic_demo", cutoff: agg.cutoff, method, inputHash,
    totals: { ...aggregateTotals(agg.totals), billed: null, paid: null }, contributions: sorted(agg.contributions),
    contributionPage: pageState(agg.contributions, agg.totals, dashboardPageLimits.contributions),
    groups: agg.groups.map(g => ({ id: g.id, totals: aggregateTotals(g.totals), closeoutRate: aggregateRate(g.totals), contributions: sorted(g.contributions),
      contributionPage: pageState(g.contributions, g.totals, dashboardPageLimits.groupContributions) })),
    groupCount: agg.groupCount, billing: { status: "held", prerequisite: "ENT-6B" } as const, closeoutRate: aggregateRate(agg.totals),
    drilldown: d && agg.drilldown ? { stage: d.stage, ...(d.group === undefined ? {} : { group: d.group }), offset: d.offset, limit: d.limit, total: agg.drilldown.total,
      complete: d.offset + agg.drilldown.contributions.length >= agg.drilldown.total, contributions: sorted(agg.drilldown.contributions) } : null };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}
function observedCloseoutRate(rows: Contribution[]) {
  const numerator = rows.filter(c => c.stage === "closeoutYes").length, denominator = rows.filter(c => c.stage === "closeoutYes" || c.stage === "closeoutNo").length;
  return denominator ? { status: "computed", numerator, denominator } : { status: "not_computable" };
}
