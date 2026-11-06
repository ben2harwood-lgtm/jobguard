import { z } from "zod";
import { evaluateDraftQuote } from "./quote.js";
import { assembleDraftFinalAccount } from "./final-account.js";
import { assertReviewConfirmable, proposalReviewV1, reconciliationSummary } from "./review.js";
import { evaluateProofGate, type ProofCandidate, type ProofRequirement } from "./proof.js";
import { MAX_MONEY_PENCE, money } from "./money.js";

/** Presentation only. Adapters validate API responses and scope them with server authority.
 * These models grant no permission, execute no requests and never write commercial facts.
 * Native wiring, secure cache, device proof and D08 remain separate gates.
 */
export const coreLoopActionsV1 = {
  capture: { path: "/api/jobs/capture", contract: "job_capture_v1", mode: "capture_intent" },
  saveReview: { path: "/api/jobs/[id]/review", contract: "proposal_review_command_v1", mode: "edit_intent" },
  confirmReview: { path: "/api/jobs/[id]/confirm", contract: "proposal_review_confirm_v1", mode: "online_only" },
  saveQuote: { path: "/api/jobs/[id]/quotes", contract: "quote_draft_command_v1", mode: "edit_intent" },
  acceptQuote: { path: "/api/jobs/[id]/quotes/acceptance", contract: "quote-acceptance-command.v1", mode: "online_only" },
  switchLive: { path: "/api/jobs/[id]/quotes/activation", contract: "practice-activation-command.v1", mode: "online_only" },
  sendQuote: { path: "/api/jobs/[id]/quotes/delivery", contract: "quote-send-command.v1", mode: "online_only" },
  dismissDecision: { path: "/api/decisions", contract: "decision-resolution-command.v1", mode: "online_only" },
  completeProof: { path: "/api/jobs/[id]/proof", contract: "practice-proof-command.v1", mode: "online_only" },
  proposeVariation: { path: "/api/jobs/[id]/variations", contract: "variation-command.v1", mode: "edit_intent" },
  approveVariation: { path: "/api/jobs/[id]/variations", contract: "variation-command.v1", mode: "online_only" },
  assembleFinalAccount: { path: "/api/jobs/[id]/final-account", contract: "final-account.assemble.v1", mode: "online_only" },
  issueInvoice: { path: "/api/jobs/[id]/customer-invoices", contract: "practice-customer-invoice.issue.v1", mode: "online_only" },
  recordPayment: { path: "/api/jobs/[id]/customer-invoices/[invoiceId]/receipts", contract: "practice-customer-receipt.record.v1", mode: "online_only" },
} as const;
export type CoreLoopActionV1 = keyof typeof coreLoopActionsV1;

const snapshot = z.object({
  tenantId: z.guid(), jobId: z.guid(), subjectId: z.guid(), revision: z.number().int().nonnegative().safe(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
export const coreLoopActionContextV1 = z.object({
  version: z.literal("core-loop-action-context.v1"), environment: z.literal("synthetic_demo"),
  online: z.boolean(), authorized: z.boolean(), connectionId: z.guid(),
  refreshedConnectionId: z.guid().nullable(), current: snapshot,
  review: z.object({ action: z.enum(Object.keys(coreLoopActionsV1) as [CoreLoopActionV1, ...CoreLoopActionV1[]]),
    connectionId: z.guid(), snapshot }).strict().nullable(),
}).strict();
export type CoreLoopActionContextV1 = z.infer<typeof coreLoopActionContextV1>;
export type CoreLoopActionAvailabilityV1 = {
  mode: "capture_intent" | "edit_intent" | "online_only";
  state: "local_intent_only" | "review_required" | "ready_for_server_validation" | "blocked";
  reason: "offline" | "forbidden" | "refresh_required" | "exact_review_required" | null;
  automaticExecution: false;
};

/** A reconnect MUST receive a new connectionId from the adapter. Review is a current
 * person gesture bound to that connection, action and exact snapshot, never restored
 * from the offline queue. Server authorization/idempotency/audit remain mandatory.
 */
export function coreLoopActionAvailabilityV1(action: CoreLoopActionV1, raw: unknown): CoreLoopActionAvailabilityV1 {
  const context = coreLoopActionContextV1.parse(raw), mode = coreLoopActionsV1[action].mode;
  const result = (state: CoreLoopActionAvailabilityV1["state"], reason: CoreLoopActionAvailabilityV1["reason"]): CoreLoopActionAvailabilityV1 =>
    ({ mode, state, reason, automaticExecution: false });
  if (!context.authorized) return result("blocked", "forbidden");
  if (mode !== "online_only") return result("local_intent_only", null);
  if (!context.online) return result("blocked", "offline");
  if (context.refreshedConnectionId !== context.connectionId) return result("review_required", "refresh_required");
  const review = context.review;
  if (!review || review.connectionId !== context.connectionId || review.action !== action ||
    (Object.keys(context.current) as (keyof typeof context.current)[]).some(key => review.snapshot[key] !== context.current[key]))
    return result("review_required", "exact_review_required");
  return result("ready_for_server_validation", null);
}

function screen<T>(name: string, data: T, actions: readonly CoreLoopActionV1[]) {
  return { version: "core-loop-view.v1" as const, environment: "synthetic_demo" as const,
    screen: name, data, actions: actions.map(action => ({ action, ...coreLoopActionsV1[action], automaticExecution: false as const })) };
}

export function walkReviewViewV1(raw: unknown) {
  const review = proposalReviewV1.parse(raw);
  let confirmable = true;
  try { assertReviewConfirmable(review); } catch { confirmable = false; }
  return screen("walk_review", { review, summary: reconciliationSummary(review), confirmable,
    localEditsAreCanonical: false as const, voiceProcessing: "online_only" as const }, ["capture", "saveReview", "confirmReview"]);
}

// Same shape used by the web job list. Delivery and payment facts stay independent.
export const coreLoopJobSummaryV1 = z.object({
  id: z.guid(), tenantId: z.guid(), title: z.string(), customerLabel: z.string(), siteLabel: z.string().prefault("Details needed"),
  status: z.enum(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"]),
  document: z.object({ kind: z.enum(["none", "quote", "invoice", "unknown"]), reference: z.string().nullable(),
    delivery: z.enum(["not_sent", "queued", "outcome_unknown", "delivered", "unknown"]) }),
  customerPayment: z.enum(["not_due", "due", "part_paid", "settled", "unknown"]), pilotNoCharge: z.boolean(), updatedLabel: z.string(),
});
export const coreLoopJobsResponseV1 = z.object({ version: z.literal(1), tenantId: z.guid(), jobs: z.array(coreLoopJobSummaryV1) });
export function jobListViewV1(raw: unknown, verifiedTenantId: string) {
  const data = coreLoopJobsResponseV1.parse(raw);
  if (data.tenantId !== verifiedTenantId || data.jobs.some(job => job.tenantId !== verifiedTenantId)) throw new Error("TENANT_FORBIDDEN");
  return screen("job_list", data, []);
}

export function quotePreviewViewV1(input: Parameters<typeof evaluateDraftQuote>[0]) {
  return screen("quote_preview", evaluateDraftQuote(input), ["saveQuote", "sendQuote"]);
}
export function acceptanceIntentViewV1(raw: unknown) {
  const context = coreLoopActionContextV1.parse(raw);
  return screen("acceptance_intent", { snapshot: context.current,
    acceptance: coreLoopActionAvailabilityV1("acceptQuote", context),
    switchLive: coreLoopActionAvailabilityV1("switchLive", context),
    acceptanceIsActivation: false as const }, ["acceptQuote", "switchLive"]);
}

export const coreLoopInboxItemV1 = z.object({ id: z.guid(), jobId: z.guid(), title: z.string(), detail: z.string(),
  classification: z.enum(["mandatory", "advisory"]), resolution: z.enum(["open", "approved", "dismissed", "rejected", "expired", "revoked", "superseded"]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u), source: z.object({ snapshotRevision: z.number().int().nonnegative().safe() }) });
export function inboxViewV1(raw: unknown, jobId: string) {
  const decisions = z.array(coreLoopInboxItemV1).parse(raw);
  if (decisions.some(item => item.jobId !== jobId)) throw new Error("JOB_FORBIDDEN");
  return screen("inbox", { decisions, dismissalAuthorizesAction: false as const }, ["dismissDecision"]);
}
export function proofViewV1(requirement: ProofRequirement, candidate: ProofCandidate, permission: "granted" | "denied" | "unavailable") {
  return screen("proof", { gate: evaluateProofGate(requirement, candidate), mediaPermission: permission,
    recovery: permission === "granted" ? "capture_or_select" : "select_existing_or_text_note",
    localPhotoIsVerifiedProof: false as const }, ["completeProof"]);
}

/** API's already calculated approved/pending totals are preserved; never reprice on device. */
export function variationsViewV1(raw: unknown) {
  const data = z.object({ jobId: z.guid(), baselinePence: z.number().int().safe(), approvedAdditionsPence: z.number().int().safe(),
    approvedOmissionsPence: z.number().int().safe(), pendingExtrasPence: z.number().int().safe() }).parse(raw);
  return screen("variations", { ...data, baseline: money(data.baselinePence), additions: money(data.approvedAdditionsPence),
    omissions: money(data.approvedOmissionsPence), pending: money(data.pendingExtrasPence), pendingIsBillable: false as const }, ["proposeVariation", "approveVariation"]);
}
export function finalAccountPreviewViewV1(input: Parameters<typeof assembleDraftFinalAccount>[0]) {
  return screen("final_account_preview", assembleDraftFinalAccount(input), ["assembleFinalAccount", "issueInvoice"]);
}

const invoicePence = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const coreLoopInvoicePreviewV1 = z.object({ id: z.guid(), finalAccountRevisionId: z.guid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  netPence: invoicePence, taxPence: invoicePence, totalPence: invoicePence,
  balancePence: invoicePence, customerCreditPence: invoicePence });
export function invoicePreviewViewV1(raw: unknown) {
  const invoice = coreLoopInvoicePreviewV1.parse(raw);
  return screen("invoice_preview", { invoice, totals: { net: money(invoice.netPence), tax: money(invoice.taxPence), total: money(invoice.totalPence) } }, ["issueInvoice"]);
}
export function paymentRecordViewV1(raw: unknown, localIntent: "none" | "queued" | "sending" | "needs_review") {
  const invoice = coreLoopInvoicePreviewV1.parse(raw);
  return screen("payment_record", { invoice, balance: money(invoice.balancePence), credit: money(invoice.customerCreditPence),
    localIntent, localIntentIsSettlement: false as const, recoveryEligibility: "server_only" as const }, ["recordPayment"]);
}
