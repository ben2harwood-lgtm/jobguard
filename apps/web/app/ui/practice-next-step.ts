import { deriveJobPaymentState, type InvoicePaymentFact, type JobPaymentState } from "../lib/invoice-payment-state";

type NextStep = "confirm_scope" | "prepare_quote" | "record_acceptance" | "activate_job" | "review_quote"
  | "complete_proof" | "resolve_extras" | "review_account" | "final_check" | "issue_invoice"
  | "record_payment" | "complete" | "unavailable";
type Completion = "incomplete" | "paid" | "credit_assisted" | "credit_only" | "zero_value" | "unavailable";
type Result = { nextStep: NextStep; completion: Completion; payment: JobPaymentState | null };
type Variation = {
  state: string; currentRevisionId: string | null;
  revisions: readonly { id: string; approved: boolean; rejected: boolean }[];
};
// Local selections from the existing saved read models, not a new transport.
// Undefined means unavailable; null/[] mean a successful read found no record.
type SavedFacts = {
  job: { id: string; status: "draft" | "quoting" | "accepted" | "live" | "invoiced" | "paid" | "lost";
    scopeIdentityIds: readonly string[] } | undefined;
  quote?: { jobId: string; draft: { currentRevisionId: string | null } | null } | undefined;
  delivery?: { status: string } | null | undefined;
  proof: { jobId: string; completion: { id: string; reviewRequired: boolean } | null } | undefined;
  variations: { jobId: string; variations: readonly Variation[] } | undefined;
  account: { jobId: string; account: { id: string; issueBlocked: boolean } | null } | undefined;
  lock: { jobId: string; lock: { id: string } | null } | undefined;
  check: { state: "unlocked" | "pending" | "failed" | "completed"; lockId?: string | undefined } | undefined;
  invoices: { jobId: string; invoices: readonly InvoicePaymentFact[] } | undefined;
};

/** Only session-authorized, validated saved facts enter here. No reads, writes or DOM targets. */
export function derivePracticeNextStep(facts: SavedFacts): Result {
  const result = (nextStep: NextStep, completion: Completion = "incomplete", payment: JobPaymentState | null = null): Result =>
    ({ nextStep, completion, payment });
  const unavailable = (): Result => result("unavailable", "unavailable");
  const { job, quote, delivery, proof, variations, account, lock, check, invoices } = facts;
  if (!job || [quote, proof, variations, account, lock, invoices].some(read => read && read.jobId !== job.id)) return unavailable();
  // Status is the authoritative acceptance/activation projection, not a UI flag.
  if (job.status === "lost") return result("review_quote");
  if (job.scopeIdentityIds.length === 0) return result("confirm_scope");
  if (job.status === "draft" || job.status === "quoting") {
    if (quote === undefined || delivery === undefined) return unavailable();
    return result(quote.draft?.currentRevisionId && delivery?.status === "simulated_delivery" ? "record_acceptance" : "prepare_quote");
  }
  if (job.status === "accepted") return result("activate_job");
  if (!proof || !variations || !account || !lock || !invoices) return unavailable();
  let payment: JobPaymentState;
  try {
    payment = deriveJobPaymentState(invoices.invoices);
    // The shared calculator preserves legacy unknown-source labels. This journey
    // cannot claim completion or payment progress without the source breakdown.
    if (invoices.invoices.some(invoice => invoice.paidPence === undefined || invoice.creditedPence === undefined)) return unavailable();
  } catch { return unavailable(); }
  if (!proof.completion || proof.completion.reviewRequired) return result("complete_proof");
  let unresolved = false;
  for (const variation of variations.variations) {
    if (!["draft", "priced", "approved", "rejected", "withdrawn"].includes(variation.state)) return unavailable();
    const current = variation.revisions.filter(revision => revision.id === variation.currentRevisionId);
    if ((variation.currentRevisionId !== null && current.length !== 1) || current.some(revision => revision.approved && revision.rejected)) return unavailable();
    if (variation.state === "withdrawn") continue;
    if (variation.state === "rejected") {
      if (!current[0]?.rejected) return unavailable();
      continue;
    }
    if (variation.state === "approved" && current[0]?.approved && !current[0].rejected) continue;
    unresolved = true;
  }
  if (unresolved) return result("resolve_extras");
  if (!account.account || !lock.lock || account.account.issueBlocked) return result("review_account");
  if (!check || check.lockId !== lock.lock.id || check.state === "unlocked") return unavailable();
  if (check.state !== "completed") return result("final_check");
  if (payment.state === "not_invoiced") return result("issue_invoice", "incomplete", payment);
  if (invoices.invoices.some(invoice => invoice.balancePence > 0)) return result("record_payment", "incomplete", payment);
  const anyPaid = invoices.invoices.some(invoice => invoice.paidPence! > 0);
  const anyCredit = invoices.invoices.some(invoice => invoice.creditedPence! > 0);
  return result("complete", anyPaid ? (anyCredit ? "credit_assisted" : "paid") : anyCredit ? "credit_only" : "zero_value", payment);
}
