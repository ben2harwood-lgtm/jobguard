import type { TenantTransaction } from "./tenant-context.js";

type Timing = "before_work" | "after_work" | "uncertain" | "not_derived";
type Breach = boolean | "uncertain" | "not_derived";
export type VisitTimingSource = {
  visit_id: string; started_at: string; completed_at: string | null;
  start_us: string; finish_us: string | null;
};
export type ApprovalTimingFact = { request_id: string; step_index: number; step_role: string; at_us: string };
export type TimingRequest = { id: string; preapproval_required: boolean | null; superseded_us: string | null };

/** Visit bounds are an interval for the extra, never a claim of an exact per-extra work time. */
export function deriveVisitApprovalTiming(visit: VisitTimingSource | undefined, requests: TimingRequest[], facts: ApprovalTimingFact[], requestId: string) {
  const timing = (at: string): Timing => {
    if (!visit) return "not_derived";
    if (BigInt(at) < BigInt(visit.start_us)) return "before_work";
    if (visit.finish_us !== null && BigInt(at) > BigInt(visit.finish_us)) return "after_work";
    return "uncertain"; // Includes equality at either bound and an unfinished visit.
  };
  const breaches: Breach[] = requests.map(request => {
    if (!visit) return "not_derived";
    if (request.preapproval_required === false) return false;
    if (request.superseded_us !== null && BigInt(request.superseded_us) < BigInt(visit.start_us)) return false;
    if (request.preapproval_required === null) return "uncertain";
    const endedDuringVisit = request.superseded_us !== null && (visit.finish_us === null || BigInt(request.superseded_us) <= BigInt(visit.finish_us));
    const approval = facts.find(f => f.request_id === request.id && f.step_role === "client_approver");
    if (!approval) return visit.finish_us === null || endedDuringVisit ? "uncertain" : true;
    const when = timing(approval.at_us);
    return when === "before_work" ? false : when === "after_work" ? (endedDuringVisit ? "uncertain" : true) : "uncertain";
  });
  // Every earlier frozen requirement remains relevant. A later approval/revision cannot erase a breach.
  const doneWithoutRequiredPreapproval: Breach = !visit ? "not_derived" : breaches.includes(true) ? true : breaches.includes("uncertain") ? "uncertain" : false;
  return {
    doneWithoutRequiredPreapproval,
    workTiming: visit ? { source: "site_visit" as const, visitId: visit.visit_id, startedAt: visit.started_at, finishedAt: visit.completed_at,
      uncertainty: "during_this_visit" as const } : null,
    approvalTimings: facts.filter(f => f.request_id === requestId).map(f => ({ stepIndex: f.step_index, timing: timing(f.at_us) })),
  };
}

/** Called only after client link and current job authority checks, within their tenant transaction. */
export async function readExtraApprovalTiming(db: TenantTransaction, tenant: string, job: string, extra: string, requestId: string) {
  const visit = (await db.$client.query<VisitTimingSource>(
    `SELECT v.id visit_id,to_char(v.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') started_at,
      to_char(v.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') completed_at,
      (extract(epoch FROM v.started_at)*1000000)::bigint::text start_us,
      (extract(epoch FROM v.completed_at)*1000000)::bigint::text finish_us
     FROM app.extra_origin o JOIN app.site_visit v ON (v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.site_visit_id)
     WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.variation_id=$3`, [tenant, job, extra])).rows[0];
  const requests = (await db.$client.query<TimingRequest>(
    `SELECT q.id,CASE WHEN (q.comparisons->>'aboveClientBeforeWorkThreshold')::boolean
        AND NOT (q.requirement->>'clientRequired')::boolean THEN NULL
        ELSE (q.comparisons->>'aboveClientBeforeWorkThreshold')::boolean END preapproval_required,
      (SELECT (extract(epoch FROM min(n.server_recorded_at))*1000000)::bigint::text FROM app.extra_approval_request n
       WHERE (n.tenant_id,n.job_id,n.variation_id)=(q.tenant_id,q.job_id,q.variation_id) AND n.request_revision>q.request_revision) superseded_us
     FROM app.extra_approval_request q JOIN app.extra_approval_request selected
       ON (selected.tenant_id,selected.job_id,selected.variation_id)=(q.tenant_id,q.job_id,q.variation_id)
     WHERE q.tenant_id=$1 AND q.job_id=$2 AND q.variation_id=$3 AND selected.id=$4 AND q.request_revision<=selected.request_revision`,
    [tenant, job, extra, requestId])).rows;
  const facts = (await db.$client.query<ApprovalTimingFact>(
    `SELECT request_id,step_index,step_role,(extract(epoch FROM server_recorded_at)*1000000)::bigint::text at_us
     FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND job_id=$2 AND variation_id=$3 ORDER BY step_index`, [tenant, job, extra])).rows;
  return deriveVisitApprovalTiming(visit, requests, facts, requestId);
}
