import { z } from "zod";
import { dashboardExtraV1, dashboardParse, dashboardQueryV1, dashboardFactsV1, dashboardPeriodContains, enterpriseSignalFactsV1, enterpriseSignals, projectEnterpriseDashboard } from "@jobguard/core";
/** Pure adapter over the same authorized SELECT as the dashboard. No database writes or business commands. */
export function scopedEnterpriseSignals(rawFacts: unknown, rawQuery: unknown, rawSignals: unknown) {
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
    // ENT-6 currently requires an export match for every extra invoice line. An unmatched variation
    // cannot be a valid stored fact, so do not infer one from quarantined or unrelated invoice data.
    billedVariations: [],
    closeouts, outlierPolicy: populationSourceIds.length ? { version: "synthetic-closeout-rule.v1", from: query.from, until: query.until,
      minimumAnswered: 5, maximumNoRate: { numerator: 3, denominator: 4 }, populationSourceIds,
      text: "Synthetic reference observation only: at least five answered visits per operative and strictly more than 75% no answers in the selected UTC window. Comparison sources are only currently authorized answered visits in this selection; no personnel or commercial conclusion." } : null });
}
