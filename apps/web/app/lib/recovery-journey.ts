import { z } from "zod";
import { simulationFeeStatementViewV1, simulationMoneyRunResultV1, successFeeAvailabilityV1, successFeeResultV1, type SimulationMoneyReport } from "@jobguard/core";
import { recoveryAllocationViewV1 } from "../../../api/src/recovery-allocation.contracts";
import { pounds } from "./pounds";

export const recoveryJourneyUnavailable = "Not ready yet";
export const recoveryJourneyMarkers = [
  ["success-fee-net-posted", "Success fee net posted"],
  ["fee-refunded-principal", "Fee refunded principal"],
  ["value-found-yours-before-tax", "Yours before tax"],
  ["unresolved-money-differences", "Unresolved money differences"],
] as const;

/** Read real job sources only. Reference calculators and fixture totals confer no completion authority. */
export async function readRecoveryJourney(jobId: string, read: typeof fetch, signal?: AbortSignal) {
  const job = z.string().uuid().parse(jobId);
  const base = `/api/jobs/${job}`;
  const [allocationResponse, feeResponse] = await Promise.all([
    read(`${base}/recovery-allocations`, { cache: "no-store", ...(signal ? { signal } : {}) }),
    read(`${base}/success-fees`, { cache: "no-store", ...(signal ? { signal } : {}) }),
  ]);
  // Access failures never become a report, including an apparently harmless empty one.
  if (!allocationResponse.ok || !feeResponse.ok) throw new Error("Recovery journey sources unavailable");
  const allocations = recoveryAllocationViewV1.parse(await allocationResponse.json());
  const fees = successFeeAvailabilityV1.parse(await feeResponse.json());
  if (allocations.jobId !== job || fees.jobId !== job) throw new Error("Recovery journey source mismatch");
  return { jobId: job, allocations, fees };
}
export type RecoveryJourneySnapshot = Awaited<ReturnType<typeof readRecoveryJourney>>;

export const moneyCheckLinkV1 = z.object({ runId: z.string().uuid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
export type MoneyCheckLink = z.infer<typeof moneyCheckLinkV1>;
/** The URL only points at a saved run; the figures always come back from the server. */
export function moneyCheckLinkFrom(search: string): MoneyCheckLink | null {
  const query = new URLSearchParams(search);
  const parsed = moneyCheckLinkV1.safeParse({ runId: query.get("run"), sourceHash: query.get("source") });
  return parsed.success ? parsed.data : null;
}
async function moneyCheck(jobId: string, command: Record<string, string>, read: typeof fetch, signal?: AbortSignal) {
  const response = await read(`/api/jobs/${jobId}/success-fees/money-check`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "simulation-money-command.v1", commandId: crypto.randomUUID(), ...command }), ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error("Money check unavailable");
  const result = simulationMoneyRunResultV1.parse(await response.json());
  if (result.jobId !== jobId) throw new Error("Recovery journey source mismatch");
  return result;
}
/** The server's stored rows re-reconciled; writes nothing. */
export const readSavedMoneyCheck = (jobId: string, link: MoneyCheckLink, read: typeof fetch, signal?: AbortSignal) =>
  moneyCheck(jobId, { action: "read", runId: link.runId, sourceHash: link.sourceHash }, read, signal);
/** Explicit user command: gathers the current rows into a new saved run. */
export const runMoneyCheck = (jobId: string, read: typeof fetch) => moneyCheck(jobId, { action: "run" }, read);

/** The five DEMO-S figures, formatted from a saved report and nothing else. */
export function moneyCheckFigures(report: SimulationMoneyReport) {
  const yours = report.successFee.yoursBeforeTax;
  const exact = yours === null ? recoveryJourneyUnavailable
    : BigInt(yours.numerator) % BigInt(yours.denominator) === 0n ? pounds(Number(BigInt(yours.numerator) / BigInt(yours.denominator)))
    : `${yours.numerator}/${yours.denominator} pence`;
  return {
    "success-fee-net-posted": pounds(report.successFee.postedPence),
    "fee-refunded-principal": pounds(report.successFee.refundedPence),
    "value-found-yours-before-tax": exact,
    "unresolved-money-differences": String(report.unresolvedDifferenceCount),
    "real-external-actions": String(report.realExternalActions),
  } as const;
}

// The derivation count has no read of its own: start from the latest saved statement,
// then step past the server's own stale refusals. Each refused review saves nothing.
const MAX_POSTING_STEPS = 20;
export async function reviewSuccessFee(jobId: string, read: typeof fetch) {
  const statements = await read(`/api/jobs/${jobId}/success-fees/statements`, { cache: "no-store" });
  if (!statements.ok) throw new Error("Saved statements could not be read");
  const latest = simulationFeeStatementViewV1.parse(await statements.json()).statements.at(-1);
  const start = latest?.document.sourceSnapshot.postingRevision ?? 0;
  for (let expectedPostingRevision = start; expectedPostingRevision < start + MAX_POSTING_STEPS; expectedPostingRevision++) {
    const response = await read(`/api/jobs/${jobId}/success-fees`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: "success-fee-command.v1", action: "review", commandId: crypto.randomUUID(), expectedPostingRevision }) });
    const body: unknown = await response.json();
    if (response.ok) return successFeeResultV1.parse(body);
    if (response.status !== 409 || (body as { code?: string }).code !== "SUCCESS_FEE_STALE") throw new Error((body as { code?: string }).code ?? "SUCCESS_FEE_UNAVAILABLE");
  }
  throw new Error("SUCCESS_FEE_STALE");
}
export async function approveSuccessFee(jobId: string, review: z.infer<typeof successFeeResultV1>, read: typeof fetch) {
  const response = await read(`/api/jobs/${jobId}/success-fees`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "success-fee-command.v1", action: "approve", commandId: crypto.randomUUID(), expectedPostingRevision: review.postingRevision, reviewId: review.reviewId, statementHash: review.statementHash }) });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error((body as { code?: string }).code ?? "SUCCESS_FEE_UNAVAILABLE");
  return successFeeResultV1.parse(body);
}

const receiptLineRow = z.object({ allocationRevisionId: z.string().uuid(), paymentId: z.string().uuid(), direction: z.enum(["receipt", "reversal"]) }).passthrough();
const receiptLineView = z.object({ revision: z.number().int().nonnegative(), rows: z.array(receiptLineRow) }).passthrough();
const receiptLineResult = z.object({ reviewId: z.string().uuid(), approvalHash: z.string().regex(/^[a-f0-9]{64}$/u), sourceRevision: z.number().int().nonnegative(), action: z.enum(["review", "review_reverse", "approve", "reverse"]) }).passthrough();
export type ReceiptLineReview = z.infer<typeof receiptLineResult>;
export async function readReceiptLines(jobId: string, read: typeof fetch) {
  const response = await read(`/api/jobs/${jobId}/receipt-case-allocations`, { cache: "no-store" });
  if (!response.ok) throw new Error("Receipt lines unavailable");
  return receiptLineView.parse(await response.json());
}
/** Every amount in a line split is derived on the server; the page only names which saved receipt to split. */
export async function receiptLineCommand(jobId: string, command: Record<string, unknown>, read: typeof fetch) {
  const response = await read(`/api/jobs/${jobId}/receipt-case-allocations`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "receipt-case-allocation-command.v1", target: "receipt_lines", command: { version: "receipt-line-facts-command.v1", commandId: crypto.randomUUID(), ...command } }) });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error((body as { code?: string }).code ?? "RECEIPT_LINE_UNAVAILABLE");
  return receiptLineResult.parse(body);
}

/** Links go to the existing command workbenches; opening one does not mark it done. */
export function recoveryJourneySteps(jobId: string) {
  const job = z.string().uuid().parse(jobId), base = `/jobs/${job}`, guide = `${base}/recovery-journey`;
  return [
    { title: "Confirm the £18,800 baseline, send, accept and start", href: `${base}#quote` },
    { title: "Record verified proof", href: `${base}#work-proof` },
    { title: "Check materials before locking the final account", href: `${base}#things-to-check` },
    { title: "Lock the final account and issue the £22,560 customer invoice", href: `${base}#final-account-title` },
    { title: "Open two withheld-payment cases: £320 and £2,500", href: `${base}#recovery-cases` },
    { title: "Approve the exact recovery terms for each case", href: `${guide}#journey-case-terms` },
    { title: "Review eligibility, inspect the evidence pack and approve exact pursuit", href: `${base}#recovery-cases` },
    { title: "Match settled fake receipts of £384 and £3,000", href: `${base}#practice-receipts` },
    { title: "Review and approve each receipt's invoice line split", href: `${guide}#journey-receipt-lines` },
    { title: "Review and approve exact landing allocations", href: `${base}#recovery-allocations` },
    { title: "Review and post the recovery-case v3 success fee", href: `${guide}#journey-fee-posting` },
    { title: "Save and approve the exact v3 fee statement", href: `${base}#simulation-fee-statements` },
    { title: "Approve simulated collection; the fake rail reports its outcome", href: `${base}#simulation-fee-statements` },
    { title: "Reverse the £3,000 receipt and its line split", href: `${guide}#journey-receipt-lines` },
    { title: "Review and approve the allocation reversal", href: `${base}#recovery-allocations` },
    { title: "Review and post the fee compensation", href: `${guide}#journey-fee-posting` },
    { title: "Save the correction and approve the £250 simulated refund", href: `${base}#simulation-fee-statements` },
    { title: "Reconcile both books", href: `${guide}#journey-money-check` },
  ];
}
