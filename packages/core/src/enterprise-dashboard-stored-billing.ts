import { z } from "zod";
import { exactPence, exactPenceV1, parseExactPence, serializeExactPence, sumExactPence } from "./cumulative-fee.js";
import { divideRounded } from "./rational.js";
import { moneyFromBigInt } from "./money.js";
import { sha256 } from "./evidence-pack.js";
import { dashboardCanonical, dashboardCompareText, dashboardFactsV1, dashboardFreeze, dashboardParse,
  dashboardPeriodContains, dashboardQueryV1, EnterpriseDashboardError, projectEnterpriseDashboard } from "./enterprise-dashboard.js";

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
    .map(id => ({ id, totals: totals(contributions.filter(c => c.group === id)) }));
  const result = { version: "enterprise-dashboard-stored-billing.v1", method, complete: held.length === 0, held,
    // Do not bind a moving wall clock: immutable run IDs/hashes and the selected sources bind this report.
    inputHash: sha256(dashboardCanonical({ method, query, extras: [...selected.values()], rows: rows.filter(r => selected.has(r.extraId)) })),
    totals: totals(contributions), contributions, groups: groups.slice(query.offset, query.offset + query.limit), groupCount: groups.length };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}
