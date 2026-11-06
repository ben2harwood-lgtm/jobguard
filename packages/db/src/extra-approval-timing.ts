import type { TenantTransaction } from "./tenant-context.js";

type Timing = "before_work" | "after_work" | "uncertain" | "not_derived";
export type OperativeWorkStatus = "not_started" | "under_way" | "finished";
type Breach = boolean | "uncertain" | "not_derived";
export type VisitTimingSource = {
  visit_id: string; started_at: string; completed_at: string | null;
  start_us: string; finish_us: string | null;
};
export type ApprovalTimingFact = { request_id: string; step_index: number; step_role: string; at_us: string };
export type TimingRequest = { id: string; preapproval_required: boolean | null; superseded_us: string | null };

/** Visit bounds are an interval for the extra, never a claim of an exact per-extra work time. */
export function deriveVisitApprovalTiming(visit: VisitTimingSource | undefined, requests: TimingRequest[], facts: ApprovalTimingFact[], requestId: string, workStatus?: OperativeWorkStatus, proceedRequestIds: readonly string[] = []) {
  const timing = (at: string): Timing => {
    if (!visit) return "not_derived";
    if (BigInt(at) < BigInt(visit.start_us)) return "before_work";
    if (visit.finish_us !== null && BigInt(at) > BigInt(visit.finish_us)) return "after_work";
    return "uncertain"; // Includes equality at either bound and an unfinished visit.
  };
  const breaches: Breach[] = requests.map(request => {
    if (request.preapproval_required === true && proceedRequestIds.includes(request.id)) return true;
    if (!visit) return "not_derived";
    if (request.preapproval_required === false) return false;
    if (request.superseded_us !== null && BigInt(request.superseded_us) < BigInt(visit.start_us)) return false;
    if (request.preapproval_required === null) return "uncertain";
    const endedDuringVisit = request.superseded_us !== null && (visit.finish_us === null || BigInt(request.superseded_us) <= BigInt(visit.finish_us));
    const approval = facts.find(f => f.request_id === request.id && f.step_role === "client_approver");
    const workReportedDone = workStatus === "under_way" || workStatus === "finished";
    if (!approval) return visit.finish_us === null || endedDuringVisit || !workReportedDone ? "uncertain" : true;
    const when = timing(approval.at_us);
    return when === "before_work" ? false : when === "after_work" ? (endedDuringVisit || !workReportedDone ? "uncertain" : true) : "uncertain";
  });
  // Every earlier frozen requirement remains relevant. A later approval/revision cannot erase a breach.
  const doneWithoutRequiredPreapproval: Breach = breaches.includes(true) ? true : !visit ? "not_derived" : breaches.includes("uncertain") ? "uncertain" : false;
  return {
    doneWithoutRequiredPreapproval,
    workTiming: visit ? { source: "site_visit" as const, visitId: visit.visit_id, startedAt: visit.started_at, finishedAt: visit.completed_at,
      uncertainty: "during_this_visit" as const } : null,
    approvalTimings: facts.filter(f => f.request_id === requestId).map(f => ({ stepIndex: f.step_index, timing: timing(f.at_us) })),
  };
}

/** Called only after client link and current job authority checks, within their tenant transaction. */
export async function readExtraApprovalTiming(db: TenantTransaction, tenant: string, job: string, extra: string, requestId: string) {
  const result = (await db.$client.query<{ timing: {
    visit: VisitTimingSource | null; requests: TimingRequest[]; facts: ApprovalTimingFact[]; workStatus: OperativeWorkStatus | null;
  } }>("SELECT app.xc_timing($1,$2,$3,$4) timing", [tenant, job, extra, requestId])).rows[0]!.timing;
  const proceed = (await db.$client.query<{ ids: string[] }>(
    "SELECT app.xa_proceed_breaches($1,$2) ids", [job, extra])).rows[0]?.ids ?? [];
  return deriveVisitApprovalTiming(result.visit ?? undefined, result.requests, result.facts, requestId, result.workStatus ?? undefined, proceed);
}
