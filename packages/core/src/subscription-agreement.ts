import { z } from "zod";
import { utcDatetimeV1 } from "./datetime.js";
import { sha256 } from "./evidence-pack.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { getSubscriptionCatalogue, subscriptionPlanV1 } from "./subscription.js";

const id = z.string().uuid().refine(v => v === v.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().safe().min(0).max(MAX_MONEY_PENCE);
const revision = z.number().int().safe().positive();
export class SubscriptionAgreementError extends Error {
  constructor(readonly code: "INVALID_AGREEMENT" | "AGREEMENT_DARK" | "AGREEMENT_INELIGIBLE") {
    super(code); this.name = "SubscriptionAgreementError";
  }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new SubscriptionAgreementError("INVALID_AGREEMENT");
  return result.data;
}

/** Server-built terms specimen. Annual prices are disclosed, never enabled. */
export const subscriptionAgreementSelectionV1 = z.object({
  version: z.literal("subscription-agreement-selection.v1"),
  termsVersion: z.literal("synthetic_subscription_success_terms.v1"),
  catalogueVersion: z.literal("subscription_pricing_policy_v4"),
  tenantId: id, agreementId: id, revision, plan: subscriptionPlanV1,
  cadence: z.literal("monthly"), anchorDay: z.number().int().min(1).max(31),
  recipientRef: id, validFrom: utcDatetimeV1, expiresAt: utcDatetimeV1,
}).strict().refine(v => Date.parse(v.validFrom) < Date.parse(v.expiresAt));

export function subscriptionAgreementText(raw: unknown): string {
  const selection = parse(subscriptionAgreementSelectionV1, raw);
  const catalogue = getSubscriptionCatalogue({ version: "subscription-catalogue-request.v1", policyVersion: selection.catalogueVersion });
  // Parsed schema order is canonical; unknown fields are rejected before hashing.
  return JSON.stringify({ selection, catalogue, label: "SYNTHETIC — proposed terms, no live authority",
    billing: "Monthly from the selected anchor; Europe/London calendar days; clamp each boundary to month end. Daily proration, half-even once, largest-remainder allocation. Prices are principal excluding VAT; tax policy D02 remains required. Annual prices are reference only and annual initiation is disabled.",
    track: "Seven jobs is the small-builder line. Ten busy days above seven in two of three periods, or Builder beyond its grace place, raises human track review only. Contractor move requires signed agreement and DPA plus approved notice; existing jobs retain their switch-live terms. Pending move stays Builder within £169 per period.",
    fee: "reference_fee_policy_v3; D01 v3, D03 v3, D13 proposed. Ten percent of qualifying settled allocated unreversed recovered net principal, cumulative half-even. Builder capture, prevented cases, pre-adoption and pre-lock-disclosed signals never qualify. Final Check requires immutable lock and attribution. No subscription, discount or credit offsets a success fee. Each exact statement requires its own human approval.",
    scope: "Only selected-plan renewals, extra places within the selected monthly maximum, and approved notices. No automatic plan or track change, retries, refunds or general statement mandate. Statement collection additionally requires approval of exact current statement, recipient, principal and tax. Provider defaults for collection, retries and email must remain disabled unless separately approved within scope.",
    change: "Price, allowance, frequency, scope, anchor or recipient changes require a new human-approved revision and the approved notice policy before initiation. Notice duration is unresolved, so no automatic change is authorised by this specimen.",
    cancellation: "Revocation or cancellation blocks all future initiation immediately and requires provider-side cancellation. Pause or failed renewal blocks initiation pending new approval. In-flight or unknown outcomes require reconciliation; cancellation does not assert refund or settlement. Refunds need separate exact approval and original-settlement limits. Preserve data and exports.",
    exemptions: "pilot_no_charge never initiates collection and is never billed retrospectively. First-job trial exempts subscription only; success fee still needs exact statement approval. Subscription discounts and credits allocate to subscription only; fee credits allocate to their original fee statement only.",
  });
}
export const subscriptionAgreementHash = (raw: unknown): string => sha256(subscriptionAgreementText(raw));

/** Persisted server record contract, NOT a client command or proof of human identity. */
export const subscriptionAgreementRecordV1 = z.object({
  version: z.literal("subscription-agreement-record.v1"), environment: z.literal("synthetic_demo"),
  selection: subscriptionAgreementSelectionV1, termsHash: hash,
  approval: z.object({ resolution: z.literal("approved"), actorMembershipId: id,
    decisionId: id, commandId: id, approvedAt: utcDatetimeV1, termsHash: hash }).strict(),
  state: z.enum(["active", "revoked", "cancelled", "paused", "renewal_failed", "superseded"]),
}).strict().refine(v => v.termsHash === subscriptionAgreementHash(v.selection) && v.approval.termsHash === v.termsHash)
  .refine(v => Date.parse(v.approval.approvedAt) <= Date.parse(v.selection.validFrom));
export type SubscriptionAgreementRecord = z.infer<typeof subscriptionAgreementRecordV1>;

const statement = z.object({
  statementId: id, revision, contentHash: hash, sourceHash: hash, principalPence: pence, taxPence: pence,
}).strict();
export const subscriptionAgreementCheckV1 = z.object({
  version: z.literal("subscription-agreement-check.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, now: utcDatetimeV1, currentRevision: revision, currentTermsHash: hash,
  currentMembershipVerified: z.literal(true), providerDefaultsDisabled: z.literal(true),
  record: subscriptionAgreementRecordV1,
  action: z.enum(["renewal", "extra_places", "statement", "notice"]),
  billingMode: z.enum(["paid", "first_job_trial", "pilot_no_charge"]),
  amountPence: pence, reservedAndCollectedPeriodPence: pence,
  currentStatement: statement.optional(),
  statementApproval: z.object({ ...statement.shape, resolution: z.literal("approved"),
    agreementId: id, termsRevision: revision, termsHash: hash,
    tenantId: id, recipientRef: id, expiresAt: utcDatetimeV1, decisionId: id }).strict().optional(),
}).strict();

/** Pure preflight only. Never returns executable authority, reserves value or calls a provider. */
export function checkSyntheticSubscriptionAgreement(raw: unknown) {
  const input = parse(subscriptionAgreementCheckV1, raw);
  const { record, now, action } = input;
  const terms = record.selection;
  const time = Date.parse(now);
  const reject = () => { throw new SubscriptionAgreementError("AGREEMENT_INELIGIBLE"); };
  if (record.state !== "active" || input.tenantId !== terms.tenantId || input.currentRevision !== terms.revision
    || input.currentTermsHash !== record.termsHash || time < Date.parse(terms.validFrom) || time >= Date.parse(terms.expiresAt)) reject();
  if (input.billingMode === "pilot_no_charge") reject();
  const plan = getSubscriptionCatalogue({ version: "subscription-catalogue-request.v1", policyVersion: terms.catalogueVersion })
    .find(p => p.plan === terms.plan)!;
  if (action === "renewal" || action === "extra_places") {
    if (input.billingMode === "first_job_trial" || input.amountPence === 0
      || BigInt(input.amountPence) + BigInt(input.reservedAndCollectedPeriodPence) > BigInt(plan.maximumPence)
      || (action === "renewal" && input.amountPence > plan.monthlyPence)) reject();
  } else if (action === "statement") {
    const current = input.currentStatement;
    const approval = input.statementApproval;
    if (!current || !approval) return reject();
    if (approval.tenantId !== input.tenantId || approval.recipientRef !== terms.recipientRef
      || approval.agreementId !== terms.agreementId || approval.termsRevision !== terms.revision
      || approval.termsHash !== record.termsHash
      || Date.parse(approval.expiresAt) <= time || Object.keys(statement.shape).some(key => current[key as keyof typeof current] !== approval[key as keyof typeof current])
      || BigInt(current.principalPence) + BigInt(current.taxPence) !== BigInt(input.amountPence)
      || input.amountPence === 0) reject();
  } else if (input.amountPence !== 0) reject();
  return { version: "subscription-agreement-preflight.v1" as const, eligibleForSimulation: true as const,
    productionEnabled: false as const, realExternalActions: 0 as const };
}

/** Unconditional server-side refusal: approvals and environment flags cannot enable live execution. */
export function refuseLiveSubscriptionAgreement(): never {
  throw new SubscriptionAgreementError("AGREEMENT_DARK");
}
