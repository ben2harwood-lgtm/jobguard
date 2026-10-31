import { z } from "zod";
import { exactPenceV1 } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { freezeShadow } from "./shadow-domain/types.js";

const id = z.string().uuid().refine(value => value === value.toLowerCase(), "Lowercase UUID required");
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const scope = { tenantId: id, jobId: id };
const target = z.object({
  ...scope, caseId: id, workId: id, scopeItemId: id, commercialRevisionId: id, approvalId: id,
  lockId: id, accountRevisionId: id, accountLineId: id, invoiceId: id, invoiceLineId: id,
}).strict();
const amount = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const principal = exactPenceV1.refine(value =>
  /^(?:0|[1-9]\d*)$/u.test(value.numerator) && /^[1-9]\d*$/u.test(value.denominator)
  && BigInt(value.numerator) <= BigInt(MAX_MONEY_PENCE) * BigInt(value.denominator), "Invalid saved principal");
const billing = z.object({
  commercial: z.object({ ...scope, caseId: id, workId: id, scopeItemId: id, commercialRevisionId: id,
    approvalId: id, status: z.enum(["approved", "proposed", "rejected", "revoked", "superseded"]) }).strict(),
  accountLine: z.object({ ...scope, lockId: id, accountRevisionId: id, accountLineId: id,
    scopeItemId: id, commercialRevisionId: id, approvalId: id }).strict(),
  invoiceLine: z.object({ ...scope, invoiceId: id, invoiceLineId: id, accountRevisionId: id,
    accountLineId: id, scopeItemId: id, commercialRevisionId: id, approvalId: id,
    status: z.enum(["issued", "draft", "void"]), netPence: amount }).strict(),
}).strict();
const payment = z.object({
  movement: z.object({ ...scope, movementId: id, accountId: id, eventId: id, sourceHash: hash,
    state: z.enum(["settled", "pending", "reversed", "possible_duplicate"]),
    identity: z.enum(["identified", "unidentified"]), duplicateHeld: z.boolean(), grossPence: amount }).strict().nullable(),
  receipt: z.object({ ...scope, paymentId: id, invoiceId: id, amountPence: amount }).strict(),
  match: z.object({ ...scope, paymentId: id, accountId: id, settledEventId: id, matchedPence: amount }).strict().nullable(),
  allocation: z.object({ ...scope, allocationId: id, caseId: id, workId: id, invoiceId: id, invoiceLineId: id,
    paymentId: id, movementId: id, movementHash: hash, net: principal }).strict().nullable(),
}).strict();
/** Internal snapshots only, not an HTTP command or an upstream source API. Parsing cannot authenticate a row.
 * The source owner must load the exact records under its accepted authorization/freshness/lock contract.
 * SV-5 / CH-7 / M4-8 source adapters and persisted end-to-end proof remain dependency-bound.
 */
export const attributionBillingPaymentProofV1 = z.object({
  version: z.literal("attribution-billing-payment-proof.v1"), environment: z.literal("synthetic_demo"),
  productionEnabled: z.literal(false), target, billing: billing.nullable(), payment: payment.nullable(),
}).strict();
export class AttributionBillingPaymentProofError extends Error {
  readonly code = "INVALID_ATTRIBUTION_BILLING_PAYMENT_PROOF";
  constructor() { super("Invalid attribution billing/payment proof"); this.name = "AttributionBillingPaymentProofError"; }
}

/** Two conjuncts only, never full attribution/fee authority. No allocation, rounding or model output.
 * On success the saved numerator and denominator are copied byte-for-byte, including unreduced fractions.
 */
export function deriveAttributionBillingPaymentProof(raw: unknown) {
  const parsed = attributionBillingPaymentProofV1.safeParse(raw);
  if (!parsed.success) throw new AttributionBillingPaymentProofError();
  const { target: t, billing: b, payment: p } = parsed.data;
  const billingFailures: string[] = [];
  const paymentFailures: string[] = [];
  if (b === null) billingFailures.push("missing_billing_proof");
  else {
    if (b.commercial.tenantId !== t.tenantId) billingFailures.push("commercial.tenantId");
    if (b.commercial.jobId !== t.jobId) billingFailures.push("commercial.jobId");
    if (b.commercial.caseId !== t.caseId) billingFailures.push("commercial.caseId");
    if (b.commercial.workId !== t.workId) billingFailures.push("commercial.workId");
    if (b.commercial.scopeItemId !== t.scopeItemId) billingFailures.push("commercial.scopeItemId");
    if (b.commercial.commercialRevisionId !== t.commercialRevisionId) billingFailures.push("commercial.commercialRevisionId");
    if (b.commercial.approvalId !== t.approvalId) billingFailures.push("commercial.approvalId");
    if (b.accountLine.tenantId !== t.tenantId) billingFailures.push("accountLine.tenantId");
    if (b.accountLine.jobId !== t.jobId) billingFailures.push("accountLine.jobId");
    if (b.accountLine.lockId !== t.lockId) billingFailures.push("accountLine.lockId");
    if (b.accountLine.accountRevisionId !== t.accountRevisionId) billingFailures.push("accountLine.accountRevisionId");
    if (b.accountLine.accountLineId !== t.accountLineId) billingFailures.push("accountLine.accountLineId");
    if (b.accountLine.scopeItemId !== t.scopeItemId) billingFailures.push("accountLine.scopeItemId");
    if (b.accountLine.commercialRevisionId !== t.commercialRevisionId) billingFailures.push("accountLine.commercialRevisionId");
    if (b.accountLine.approvalId !== t.approvalId) billingFailures.push("accountLine.approvalId");
    if (b.invoiceLine.tenantId !== t.tenantId) billingFailures.push("invoiceLine.tenantId");
    if (b.invoiceLine.jobId !== t.jobId) billingFailures.push("invoiceLine.jobId");
    if (b.invoiceLine.invoiceId !== t.invoiceId) billingFailures.push("invoiceLine.invoiceId");
    if (b.invoiceLine.invoiceLineId !== t.invoiceLineId) billingFailures.push("invoiceLine.invoiceLineId");
    if (b.invoiceLine.accountRevisionId !== t.accountRevisionId) billingFailures.push("invoiceLine.accountRevisionId");
    if (b.invoiceLine.accountLineId !== t.accountLineId) billingFailures.push("invoiceLine.accountLineId");
    if (b.invoiceLine.scopeItemId !== t.scopeItemId) billingFailures.push("invoiceLine.scopeItemId");
    if (b.invoiceLine.commercialRevisionId !== t.commercialRevisionId) billingFailures.push("invoiceLine.commercialRevisionId");
    if (b.invoiceLine.approvalId !== t.approvalId) billingFailures.push("invoiceLine.approvalId");
    if (b.commercial.status !== "approved") billingFailures.push("commercial.status");
    if (b.invoiceLine.status !== "issued") billingFailures.push("invoiceLine.status");
  }
  if (p === null) paymentFailures.push("missing_payment_proof");
  else if (p.movement === null) paymentFailures.push("missing_movement_proof");
  else {
    if (p.movement.tenantId !== t.tenantId) paymentFailures.push("movement.tenantId");
    if (p.movement.jobId !== t.jobId) paymentFailures.push("movement.jobId");
    if (p.movement.grossPence === 0) paymentFailures.push("movement.zero");
    if (p.movement.state !== "settled") paymentFailures.push("movement.state");
    if (p.movement.identity !== "identified") paymentFailures.push("movement.identity");
    if (p.movement.duplicateHeld !== false) paymentFailures.push("movement.duplicateHeld");
    if (p.receipt.tenantId !== t.tenantId) paymentFailures.push("receipt.tenantId");
    if (p.receipt.jobId !== t.jobId) paymentFailures.push("receipt.jobId");
    if (p.receipt.invoiceId !== t.invoiceId) paymentFailures.push("receipt.invoiceId");
    if (p.receipt.amountPence !== p.movement.grossPence) paymentFailures.push("receipt.amountPence");
    if (p.match === null) paymentFailures.push("missing_match_proof");
    else {
      if (p.match.tenantId !== t.tenantId) paymentFailures.push("match.tenantId");
      if (p.match.jobId !== t.jobId) paymentFailures.push("match.jobId");
      if (p.match.paymentId !== p.receipt.paymentId) paymentFailures.push("match.paymentId");
      if (p.match.accountId !== p.movement.accountId) paymentFailures.push("match.accountId");
      if (p.match.settledEventId !== p.movement.eventId) paymentFailures.push("match.settledEventId");
      if (p.match.matchedPence !== p.receipt.amountPence) paymentFailures.push("match.matchedPence");
    }
    if (p.allocation === null) paymentFailures.push("missing_allocation_proof");
    else {
      if (b && BigInt(p.allocation.net.numerator) > BigInt(b.invoiceLine.netPence) * BigInt(p.allocation.net.denominator)) paymentFailures.push("allocation.exceeds_line_net");
      if (BigInt(p.allocation.net.numerator) === 0n) paymentFailures.push("allocation.zero");
      if (p.allocation.tenantId !== t.tenantId) paymentFailures.push("allocation.tenantId");
      if (p.allocation.jobId !== t.jobId) paymentFailures.push("allocation.jobId");
      if (p.allocation.caseId !== t.caseId) paymentFailures.push("allocation.caseId");
      if (p.allocation.workId !== t.workId) paymentFailures.push("allocation.workId");
      if (p.allocation.invoiceId !== t.invoiceId) paymentFailures.push("allocation.invoiceId");
      if (p.allocation.invoiceLineId !== t.invoiceLineId) paymentFailures.push("allocation.invoiceLineId");
      if (p.allocation.paymentId !== p.receipt.paymentId) paymentFailures.push("allocation.paymentId");
      if (p.allocation.movementId !== p.movement.movementId) paymentFailures.push("allocation.movementId");
      if (p.allocation.movementHash !== p.movement.sourceHash) paymentFailures.push("allocation.movementHash");
    }
  }
  // Billing and payment are distinct facts; an unpaid issued line remains billed.
  const billed = billingFailures.length === 0;
  const paid = billed && paymentFailures.length === 0;
  return freezeShadow({
    version: "attribution-billing-payment-result.v1" as const,
    environment: "synthetic_demo" as const, productionEnabled: false as const,
    billedThroughFinalAccountRevisionAndInvoice: billed,
    customerPaymentSettledAndAllocatedToThatLine: paid,
    billingReasons: billingFailures,
    paymentReasons: billed ? paymentFailures : ["billing_not_proven", ...paymentFailures],
    invoiceLineId: billed ? t.invoiceLineId : null,
    savedAllocationId: paid ? p!.allocation!.allocationId : null,
    supportedPaidPrincipal: paid ? p!.allocation!.net : { numerator: "0", denominator: "1" },
  });
}
