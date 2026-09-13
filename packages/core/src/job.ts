export const jobStatuses = ["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export type JobTransitionReason =
  | "start_quote" | "accept_quote" | "switch_live" | "issue_invoice" | "balance_settled"
  | "quote_lost" | "cancel_acceptance" | "reopen_quote" | "payment_reversal" | "additional_amount_due";

const legalJobTransitions: Readonly<Record<JobStatus, Readonly<Partial<Record<JobStatus, readonly JobTransitionReason[]>>>>> = {
  draft: { quoting: ["start_quote"] },
  quoting: { accepted: ["accept_quote"], lost: ["quote_lost"] },
  accepted: { live: ["switch_live"], quoting: ["cancel_acceptance"] },
  live: { invoiced: ["issue_invoice"] },
  invoiced: { paid: ["balance_settled"] },
  paid: { invoiced: ["payment_reversal", "additional_amount_due"] },
  lost: { quoting: ["reopen_quote"] },
};

export function canTransitionJob(from: JobStatus, to: JobStatus, reason: JobTransitionReason): boolean {
  return legalJobTransitions[from][to]?.includes(reason) ?? false;
}

export function assertJobTransition(from: JobStatus, to: JobStatus, reason: JobTransitionReason): void {
  if (!canTransitionJob(from, to, reason)) throw new Error(`ILLEGAL_JOB_TRANSITION:${from}:${to}:${reason}`);
}

export const progressStages = ["not_started", "in_progress", "complete"] as const;
export type ProgressStage = (typeof progressStages)[number];
export type ProgressReason = "start" | "complete" | "rework";

export function canTransitionProgress(from: ProgressStage, to: ProgressStage, reason: ProgressReason): boolean {
  return (from === "not_started" && to === "in_progress" && reason === "start")
    || (from === "in_progress" && to === "complete" && reason === "complete")
    || (from === "complete" && to === "in_progress" && reason === "rework");
}

export function projectPaymentStatus(status: JobStatus, outstandingPence: number, reversedOrAdditionalDue: boolean): JobStatus {
  if (status === "invoiced" && outstandingPence === 0) return "paid";
  if (status === "paid" && (reversedOrAdditionalDue || outstandingPence > 0)) return "invoiced";
  return status;
}
