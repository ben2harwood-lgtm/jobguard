import { z } from "zod";
import { exactPence, exactPenceV1, parseExactPence, serializeExactPence, sumExactPence } from "./cumulative-fee.js";
import { divideRounded } from "./rational.js";
import { moneyFromBigInt } from "./money.js";
import { sha256 } from "./evidence-pack.js";
import { dashboardCanonical, dashboardCompareText, dashboardFactsV1, dashboardFreeze, dashboardParse,
  dashboardPageLimits, dashboardPeriodContains, dashboardQueryV1, EnterpriseDashboardError, projectEnterpriseDashboard } from "./enterprise-dashboard.js";

const uuid = z.guid();
const fraction = exactPenceV1;
export const storedDashboardBillingRowsV1 = z.array(z.object({
  jobId: uuid, extraId: uuid, exportLineId: uuid, revisionId: uuid, runId: uuid, factId: uuid,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/u), lineId: z.string().min(1).max(200),
  billedNet: fraction, creditedNet: fraction, paidNet: fraction, rejected: z.boolean(), complete: z.boolean(),
  allocations: z.array(uuid),
}).strict()).max(100000);
const method = Object.freeze({ version: "enterprise-dashboard-stored-billing-method.v1",
  text: "Synthetic stored ENT-6 invoice balances. Select extras by canonical capture in the half-open query interval and current authorized dimensions. Billed is net invoiced less credits; paid is ENT-6 matched extra net after reversals. Read the latest immutable allocation run at one database statement snapshot; allocation includes all invoice lines before scope filtering. Rejected and nonpositive balances contribute zero. Counts are distinct extras with positive balances. Exact fractions conserve drill-down; rounded displays use aggregate half-even. Incomplete runs are labelled. No fees or causal pilot claims." });
type Contribution = { stage: "billed" | "paid"; jobId: string; extraId: string; group: string | null;
  exportLineId: string; revisionId: string; runId: string; factId: string; inputHash: string;
  allocationIds: string[]; exactPence: ReturnType<typeof serializeExactPence> };
function totals(rows: Contribution[]) {
  const stageTotal = (stage: Contribution["stage"]) => {
    const selected = rows.filter(r => r.stage === stage), exact = sumExactPence(selected.map(r => parseExactPence(r.exactPence)));
    return { count: new Set(selected.map(r => r.extraId)).size, exactPence: serializeExactPence(exact),
      known: moneyFromBigInt(divideRounded(exact.numerator, exact.denominator, "half_even")) };
  };
  return { billed: stageTotal("billed"), paid: stageTotal("paid") };
}
const firstPerStage = <T extends { stage: string }>(rows: readonly T[], limit: number) =>
  (["billed", "paid"] as const).flatMap(stage => rows.filter(c => c.stage === stage).slice(0, limit));
/** EP-F6: each group carries the first page of its own billed and paid sources. */
function groupPage(rows: Contribution[]) {
  const limit = dashboardPageLimits.groupContributions, contributions = firstPerStage(rows, limit);
  return { contributions, contributionPage: { limit, complete: contributions.length === rows.length } };
}
/** EP-F6: the first page of each stage's drill-down, plus the requested drill-down page; never a silent cut. */
function pages(all: Contribution[], query: z.infer<typeof dashboardQueryV1>) {
  const limit = dashboardPageLimits.contributions, d = query.drilldown;
  const contributions = firstPerStage(all, limit);
  const selected = d ? all.filter(c => c.stage === d.stage && (d.group === undefined || c.group === d.group)) : [];
  return { contributions, contributionPage: { limit, complete: contributions.length === all.length },
    drilldown: d ? { stage: d.stage, ...(d.group === undefined ? {} : { group: d.group }), offset: d.offset, limit: d.limit, total: selected.length,
      complete: d.offset + d.limit >= selected.length, contributions: selected.slice(d.offset, d.offset + d.limit) } : null };
}
/** Supplied rows must come from the scoped stored-fact SELECT. This pure function grants no authority. */
export function projectStoredDashboardBilling(rawFacts: unknown, rawQuery: unknown, rawRows: unknown) {
  const facts = dashboardParse(dashboardFactsV1, rawFacts), query = dashboardParse(dashboardQueryV1, rawQuery);
  // Reuse duplicate and source validation, but billing's period is a capture cohort, not a payment window.
  projectEnterpriseDashboard(facts, query);
  const selected = new Map(facts.extras.filter(e => e.extraId === e.canonicalExtraId &&
    dashboardPeriodContains(e.capturedAt, query.from, query.until) &&
    Object.entries(query.filters).every(([k, v]) => e.dimensions[k as keyof typeof e.dimensions] === v))
    .sort((a, b) => dashboardCompareText(a.extraId, b.extraId)).map(e => [e.extraId, e]));
  const rows = dashboardParse(storedDashboardBillingRowsV1, rawRows)
    .map(row => ({ ...row, allocations: [...row.allocations].sort(dashboardCompareText) })).sort((a, b) => dashboardCompareText(a.exportLineId, b.exportLineId));
  const contributions: Contribution[] = [], held: { extraId: string; runId: string }[] = [], seen = new Set<string>();
  for (const row of rows) {
    const extra = selected.get(row.extraId);
    if (!extra) continue;
    if (extra.jobId !== row.jobId || seen.has(row.extraId)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    seen.add(row.extraId);
    if (!row.complete) held.push({ extraId: row.extraId, runId: row.runId });
    const billed = parseExactPence(row.billedNet), credit = parseExactPence(row.creditedNet);
    const remaining = exactPence(billed.numerator * credit.denominator - credit.numerator * billed.denominator, billed.denominator * credit.denominator);
    for (const [stage, exact] of [["billed", remaining], ["paid", parseExactPence(row.paidNet)]] as const) {
      if (row.rejected || exact.numerator <= 0n) continue;
      contributions.push({ stage, jobId: row.jobId, extraId: row.extraId,
        group: query.dimension === "period" ? `${query.from}/${query.until}` : extra.dimensions[query.dimension],
        exportLineId: row.exportLineId, revisionId: row.revisionId, runId: row.runId, factId: row.factId,
        inputHash: row.inputHash, allocationIds: [...row.allocations].sort(dashboardCompareText), exactPence: serializeExactPence(exact) });
    }
  }
  const groups = [...new Set(contributions.map(c => c.group))].sort((a, b) => dashboardCompareText(a ?? "", b ?? ""))
    .map(id => ({ id, totals: totals(contributions.filter(c => c.group === id)), ...groupPage(contributions.filter(c => c.group === id)) }));
  const result = { version: "enterprise-dashboard-stored-billing.v2", method, complete: held.length === 0, held,
    // Do not bind a moving wall clock: immutable run IDs/hashes and the selected sources bind this report.
    inputHash: sha256(dashboardCanonical({ method, query, extras: [...selected.values()], rows: rows.filter(r => selected.has(r.extraId)) })),
    totals: totals(contributions), ...pages(contributions, query), groups: groups.slice(query.offset, query.offset + query.limit), groupCount: groups.length };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}

const billingTotalV1 = z.object({ count: z.number().int().nonnegative(), numerator: z.string().regex(/^\d+$/u).max(400) }).strict();
const billingTotalsV1 = z.partialRecord(z.enum(["billed", "paid"]), billingTotalV1);
const billingRowV1 = z.object({ stage: z.enum(["billed", "paid"]), jobId: uuid, extraId: uuid, group: z.string().max(200).nullable(),
  exportLineId: uuid, revisionId: uuid, runId: uuid, factId: uuid, inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  allocationIds: z.array(uuid).max(100000), exactPence: fraction }).strict();
/** Database-grouped stored billing (EP-F6): exact totals over every selected row; only pages of rows are carried. */
export const storedBillingAggregateV1 = z.object({ version: z.literal("enterprise-dashboard-billing-aggregate.v1"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), scale: z.string().regex(/^[1-9]\d*$/u).max(400), totals: billingTotalsV1,
  groupCount: z.number().int().nonnegative(),
  groups: z.array(z.object({ id: z.string().max(200).nullable(), totals: billingTotalsV1,
    contributions: z.array(billingRowV1).max(2 * dashboardPageLimits.groupContributions) }).strict()).max(200),
  contributions: z.array(billingRowV1).max(2 * dashboardPageLimits.contributions),
  drilldown: z.object({ total: z.number().int().nonnegative(), contributions: z.array(billingRowV1).max(200) }).strict().nullable(),
  heldCount: z.number().int().nonnegative(), held: z.array(z.object({ extraId: uuid, runId: uuid }).strict()).max(100000).nullable(),
}).strict();
type BillingTotals = z.infer<typeof billingTotalsV1>;
/** Pure assembly of the bounded database read; numbers equal `projectStoredDashboardBilling` over the same rows. */
export function assembleStoredDashboardBilling(raw: unknown, rawQuery: unknown) {
  const agg = dashboardParse(storedBillingAggregateV1, raw), query = dashboardParse(dashboardQueryV1, rawQuery), scale = BigInt(agg.scale);
  if (agg.held === null) throw new EnterpriseDashboardError("DASHBOARD_SELECTION_TOO_LARGE");
  const d = query.drilldown;
  if ((d === undefined) !== (agg.drilldown === null) || agg.held.length !== agg.heldCount) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  const stageTotal = (t: BillingTotals, stage: "billed" | "paid") => {
    const exact = sumExactPence([exactPence(BigInt(t[stage]?.numerator ?? "0"), scale)]);
    return { count: t[stage]?.count ?? 0, exactPence: serializeExactPence(exact), known: moneyFromBigInt(divideRounded(exact.numerator, exact.denominator, "half_even")) };
  };
  const sums = (t: BillingTotals) => ({ billed: stageTotal(t, "billed"), paid: stageTotal(t, "paid") });
  // Billed balances are reduced (net of credits); paid balances keep their stored fraction, as the reference does.
  const row = (r: z.infer<typeof billingRowV1>): Contribution => ({ ...r, allocationIds: [...r.allocationIds].sort(dashboardCompareText),
    exactPence: r.stage === "billed" ? serializeExactPence(exactPence(BigInt(r.exactPence.numerator), BigInt(r.exactPence.denominator))) : r.exactPence });
  const page = (rows: { stage: string }[], t: BillingTotals, limit: number) => {
    const complete = (["billed", "paid"] as const).every(stage => {
      const returned = rows.filter(r => r.stage === stage).length, count = t[stage]?.count ?? 0;
      if (returned > count || returned > limit || (returned < count && returned < limit)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
      return returned === count;
    });
    return { limit, complete };
  };
  const result = { version: "enterprise-dashboard-stored-billing.v2", method, complete: agg.heldCount === 0, held: agg.held,
    inputHash: sha256(dashboardCanonical({ method, query, sourceHash: agg.sourceHash })),
    totals: sums(agg.totals), contributions: agg.contributions.map(row),
    contributionPage: page(agg.contributions, agg.totals, dashboardPageLimits.contributions),
    drilldown: d && agg.drilldown ? { stage: d.stage, ...(d.group === undefined ? {} : { group: d.group }), offset: d.offset, limit: d.limit,
      total: agg.drilldown.total, complete: d.offset + d.limit >= agg.drilldown.total, contributions: agg.drilldown.contributions.map(row) } : null,
    groups: agg.groups.map(g => ({ id: g.id, totals: sums(g.totals), contributions: g.contributions.map(row),
      contributionPage: page(g.contributions, g.totals, dashboardPageLimits.groupContributions) })),
    groupCount: agg.groupCount };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}
