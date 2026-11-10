import type { InboxFinding } from "./inbox-relevance.js";

/** A projection of the current, server-authorized xa_queue read. Never supply unfiltered requests. */
export type ExtraApprovalInboxRow = Readonly<{
  job_id: string;
  variation_id: string;
  request_id: string;
  step_index: number;
}>;

export function extraApprovalInboxFindings(rows: readonly ExtraApprovalInboxRow[]): readonly InboxFinding[] {
  return rows.map(row => ({
    findingId: `${row.request_id}:${row.step_index}`,
    findingRevision: 1,
    jobId: row.job_id,
    lane: "mandatory",
    ruleId: "extra-approval",
    ruleRevision: "extra-approval-inbox.v1",
    action: "review-extra-approval",
    recipient: null,
    amount: null,
    sourceRevision: `${row.request_id}:${row.step_index}`,
    sourceReference: `#extra-${row.variation_id}`,
    title: "Review extra",
    explanation: "Your approval step is waiting.",
    permittedAction: "Review extra",
  }));
}
