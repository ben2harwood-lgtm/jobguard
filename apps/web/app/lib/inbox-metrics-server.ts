import "server-only";
import type { Pool } from "pg";
import { authorizePracticeJob, InboxMetricsRepository, InboxRelevanceRepository, PracticeAccessError } from "@jobguard/db";

/** The existing practice authority requires an active owner AND immutable job ownership.
 * Never accept tenant, membership, advisory budget or metric events from this read's caller.
 */
export async function readInboxDashboard(pool: Pool, sessionId: string | undefined, jobId: string) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
  const owner = await authorizePracticeJob(pool, sessionId, jobId);
  const [metrics, inbox] = await Promise.all([
    new InboxMetricsRepository(pool).read(owner.context, {
      version: "inbox-metrics.v1", environment: "synthetic_demo", jobId, asOf: new Date().toISOString(),
    }),
    new InboxRelevanceRepository(pool).view(owner.context, jobId, owner.membershipId, owner.digest),
  ]);
  const mandatory = new Map<string, { ruleId: string; ruleVersion: string; count: number }>();
  for (const item of inbox.mandatory) {
    const key = JSON.stringify([item.ruleId, item.ruleRevision]);
    const row = mandatory.get(key) ?? { ruleId: item.ruleId, ruleVersion: item.ruleRevision, count: 0 };
    row.count++;
    mandatory.set(key, row);
  }
  // Explicit projection: no source messages, recipients, names, IDs, ingestion data or scores.
  return {
    version: "inbox-dashboard.v1" as const, environment: "synthetic_demo" as const, asOf: metrics.asOf,
    mandatoryBlockers: [...mandatory.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.ruleVersion.localeCompare(b.ruleVersion)),
    byRule: metrics.byRule.map(row => {
      const observed = Object.values(row.laterOutcomes).reduce((total, count) => total + count, 0);
      return {
        ruleId: row.ruleId, ruleVersion: row.ruleVersion, findings: row.findings, decisions: row.decisions,
        convertedFindings: row.convertedFindings, findingToDecisionRate: row.findingToDecisionRate,
        confirmed: row.confirmed, dismissed: row.dismissed, duplicateCount: row.reasons.duplicate,
        coalescedCount: row.coalescedCount, meanTimeToDecisionMs: row.meanTimeToDecisionMs,
        laterOutcomes: { unknown: row.decisions - observed, recorded: observed === 0 ? null : {
          useful: row.laterOutcomes.useful, no_issue: row.laterOutcomes.no_issue,
          cancelled: row.laterOutcomes.cancelled, reversed: row.laterOutcomes.reversed,
        } },
      };
    }),
  };
}
export type InboxDashboard = Awaited<ReturnType<typeof readInboxDashboard>>;
