import { z } from "zod";
import { instantV1, billingInvoiceLineV1, exactPenceV1, parseExactPence, EnterpriseDashboardError, dashboardExtraV1, dashboardParse, dashboardQueryV1, dashboardFactsV1, dashboardPeriodContains, enterpriseSignalFactsV1, enterpriseSignals, projectEnterpriseDashboard } from "@jobguard/core";
export const storedBilledSignalRowsV1 = z.object({ version: z.literal("enterprise-billed-signal-rows.v1"), rows: z.array(z.object({
  jobId: z.guid(), sourceId: z.guid(), runId: z.guid(), at: instantV1, recordedAt: instantV1,
  dimensions: dashboardExtraV1.shape.dimensions, line: billingInvoiceLineV1,
  billedNet: exactPenceV1, creditedNet: exactPenceV1, rejected: z.boolean(), complete: z.boolean(),
}).strict()).max(100000) }).strict();
/** Internal stored SELECT rows, never caller-supplied authority. Invoice dates select the window;
 * current job dimensions select scope. Unattributed invoice lines cannot identify an operative. */
function billedSignals(raw: unknown, query: z.infer<typeof dashboardQueryV1>, cutoff: string) {
  const { rows } = dashboardParse(storedBilledSignalRowsV1, raw);
  const seen = new Set<string>(), selected = new Map<string, { jobId: string; sourceId: string; sourceIds: string[]; kind: "variation"; extraId: null }>();
  for (const row of rows) {
    const key = `${row.sourceId}/${row.line.externalInvoiceLineId}`;
    if (seen.has(key)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    seen.add(key);
    if (query.dimension === "operative" || "operative" in query.filters ||
      !Object.entries(query.filters).every(([k, v]) => row.dimensions[k as keyof typeof row.dimensions] === v) ||
      !dashboardPeriodContains(row.at, query.from, query.until) ||
      !dashboardPeriodContains(row.at, row.at, cutoff) ||
      !dashboardPeriodContains(row.recordedAt, row.recordedAt, cutoff) ||
      row.line.kind !== "other" || row.line.match !== null || row.rejected || !row.complete) continue;
    const billed = parseExactPence(row.billedNet), credit = parseExactPence(row.creditedNet);
    if (billed.numerator < 0n || credit.numerator < 0n) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    if (billed.numerator * credit.denominator <= credit.numerator * billed.denominator) continue;
    const prior = selected.get(row.sourceId);
    if (prior && (prior.jobId !== row.jobId || prior.sourceIds[0] !== row.runId)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    // One observation per invoice fact; its full composition and latest run are the citations.
    selected.set(row.sourceId, { jobId: row.jobId, sourceId: row.sourceId, sourceIds: [row.runId], kind: "variation", extraId: null });
  }
  return [...selected.values()];
}
/** Pure adapter over the same authorized SELECT as the dashboard. No database writes or business commands. */
export function scopedEnterpriseSignals(rawFacts: unknown, rawQuery: unknown, rawSignals: unknown, rawBilling?: unknown) {
  const facts = dashboardParse(dashboardFactsV1, rawFacts), query = dashboardParse(dashboardQueryV1, rawQuery);
  const input = dashboardParse(enterpriseSignalFactsV1, rawSignals);
  const matches = (d: z.infer<typeof dashboardExtraV1>["dimensions"]) => Object.entries(query.filters).every(([key, value]) => d[key as keyof typeof d] === value);
  const inPeriod = (at: string) => dashboardPeriodContains(at, query.from, query.until);
  const report = projectEnterpriseDashboard(facts, query);
  const extras = new Set(report.contributions.flatMap(c => c.extraIds));
  const jobs = new Set(report.contributions.map(c => c.jobId));
  const closeouts = facts.closeouts.filter(c => inPeriod(c.at) && matches(c.dimensions) && c.dimensions.operative !== null)
    .map(c => ({ jobId: c.jobId, sourceId: c.sourceId, at: c.at, operativeId: c.dimensions.operative!, answer: c.answer }));
  const populationSourceIds = closeouts.filter(c => c.answer !== null).map(c => c.sourceId);
  return enterpriseSignals({ ...input, extras: input.extras.filter(e => extras.has(e.extraId)),
    orderLines: input.orderLines.filter(l => jobs.has(l.jobId) && inPeriod(l.at)),
    billingSource: rawBilling === undefined ? "unconfigured" : "scoped_stored_other_lines",
    billedVariations: billedSignals(rawBilling === undefined ? { version: "enterprise-billed-signal-rows.v1", rows: [] } : rawBilling, query, facts.cutoff),
    closeouts, outlierPolicy: populationSourceIds.length ? { version: "synthetic-closeout-rule.v1", from: query.from, until: query.until,
      minimumAnswered: 5, maximumNoRate: { numerator: 3, denominator: 4 }, populationSourceIds,
      text: "Synthetic reference observation only: at least five answered visits per operative and strictly more than 75% no answers in the selected UTC window. Comparison sources are only currently authorized answered visits in this selection; no personnel or commercial conclusion." } : null });
}
