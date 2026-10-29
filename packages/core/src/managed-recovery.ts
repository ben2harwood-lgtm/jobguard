import { z } from "zod";
import { utcDatetimeV1 } from "./datetime.js";
import { sha256 } from "./evidence-pack.js";
import { calculateCumulativeFee, exactPenceV1, parseExactPence } from "./cumulative-fee.js";
import { moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";

export const MANAGED_RECOVERY_TERMS = "managed-recovery.synthetic-terms.v1";
export const managedRecoveryOfferingEnabled = false;
const id = z.guid().transform(v => v.toLowerCase());
const scope = { tenantId: id, jobId: id, caseId: id };
const selection = z.discriminatedUnion("service", [
  z.object({ service: z.literal("drafted_for_you"), points: z.literal(5) }).strict(),
  z.object({ service: z.literal("solicitor_letter"), points: z.literal(10) }).strict(),
]);
export const managedRecoveryCommandV1 = z.object({
  version: z.literal("managed-recovery-election-command.v1"), commandId: id, caseId: id,
  termsVersion: z.literal(MANAGED_RECOVERY_TERMS), selection,
}).strict();
const election = z.object({
  ...scope, commandId: id, actorMembershipId: id, electedAt: utcDatetimeV1,
  termsVersion: z.literal(MANAGED_RECOVERY_TERMS), selection,
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
export const managedRecoveryStateV1 = z.object({
  version: z.literal("managed-recovery-state.v1"), environment: z.literal("synthetic_demo"),
  ...scope, pursuitStartedAt: utcDatetimeV1.nullable(), election: election.nullable(),
}).strict();
export type ManagedRecoveryState = z.infer<typeof managedRecoveryStateV1>;
export class ManagedRecoveryError extends Error {
  constructor(readonly code: "INVALID_MANAGED_RECOVERY" | "MANAGED_RECOVERY_CONFLICT" | "PURSUIT_ALREADY_STARTED") {
    super(code); this.name = "ManagedRecoveryError";
  }
}
const fail = (): never => { throw new ManagedRecoveryError("INVALID_MANAGED_RECOVERY"); };
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  return result.success ? result.data : fail();
}
function binding(e: Omit<z.infer<typeof election>, "bindingHash">): string {
  return sha256(JSON.stringify([
    "managed-recovery-election.v1", e.tenantId, e.jobId, e.caseId, e.commandId,
    e.actorMembershipId, e.electedAt, e.termsVersion, e.selection.service, e.selection.points,
  ]));
}
function state(raw: unknown): ManagedRecoveryState {
  const s = parse(managedRecoveryStateV1, raw), e = s.election;
  if (e && (e.tenantId !== s.tenantId || e.jobId !== s.jobId || e.caseId !== s.caseId ||
    binding(e) !== e.bindingHash || (s.pursuitStartedAt !== null && Date.parse(e.electedAt) > Date.parse(s.pursuitStartedAt)))) fail();
  return s;
}
const contextV1 = z.object({
  environment: z.literal("synthetic_demo"), ...scope, actorMembershipId: id,
  canApprove: z.literal(true), now: utcDatetimeV1,
}).strict();
function authorized(rawState: unknown, rawContext: unknown) {
  const s = state(rawState), c = parse(contextV1, rawContext);
  if (s.tenantId !== c.tenantId || s.jobId !== c.jobId || s.caseId !== c.caseId) fail();
  return { s, c };
}

/**
 * Pure preparation only. Context/state must be reconstructed by a future authenticated,
 * locked command boundary, never accepted from a client. Hashing is binding, not authority.
 * No persistence, provider, ledger or live offering is supplied by this module.
 */
export function electManagedRecovery(rawState: unknown, rawCommand: unknown, rawContext: unknown): ManagedRecoveryState {
  const { s, c } = authorized(rawState, rawContext), command = parse(managedRecoveryCommandV1, rawCommand);
  if (command.caseId !== s.caseId) fail();
  if (s.election) {
    const e = s.election;
    if (e.commandId === command.commandId && e.actorMembershipId === c.actorMembershipId &&
      e.termsVersion === command.termsVersion && e.selection.service === command.selection.service &&
      e.selection.points === command.selection.points) return s;
    throw new ManagedRecoveryError("MANAGED_RECOVERY_CONFLICT");
  }
  if (s.pursuitStartedAt !== null) throw new ManagedRecoveryError("PURSUIT_ALREADY_STARTED");
  const e = { tenantId: s.tenantId, jobId: s.jobId, caseId: s.caseId, commandId: command.commandId,
    actorMembershipId: c.actorMembershipId, electedAt: c.now, termsVersion: command.termsVersion, selection: command.selection };
  return state({ ...s, election: { ...e, bindingHash: binding(e) } });
}

/** Irreversible marker, including failed/unknown pursuit attempts; no external action occurs. */
export function startManagedRecoveryPursuit(rawState: unknown, rawContext: unknown): ManagedRecoveryState {
  const { s, c } = authorized(rawState, rawContext);
  return state({ ...s, pursuitStartedAt: s.pursuitStartedAt ?? c.now });
}

const invoiceInputV1 = z.object({
  version: z.literal("managed-recovery-invoice-preview.v1"), environment: z.literal("synthetic_demo"),
  ...scope, cumulativeQualifyingPrincipal: exactPenceV1,
}).strict();
/**
 * Separate cumulative service-charge document preview, never issuance or a posting delta.
 * Synthetic reference: points apply to current qualifying principal, half-even once.
 * D01's exact service table, reversal/collection policy and D02 remain unapproved.
 * Caller supplies current verified principal after reversals; this does not allocate money,
 * read a locked bill or access shadow data. Replaying the projection cannot charge anything.
 */
export function previewManagedRecoveryInvoice(rawState: unknown, rawInput: unknown) {
  const s = state(rawState), input = parse(invoiceInputV1, rawInput);
  if (s.tenantId !== input.tenantId || s.jobId !== input.jobId || s.caseId !== input.caseId) fail();
  const principal = parseExactPence(input.cumulativeQualifyingPrincipal);
  if (principal.numerator < 0n) fail();
  const successFee = calculateCumulativeFee({
    version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: "reference_fee_policy_v3", numerator: "10", denominator: "100" },
    cumulativeQualifyingPrincipal: input.cumulativeQualifyingPrincipal,
    priorNetPostedPence: 0, priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: null,
  });
  const e = s.election;
  return {
    version: "managed-recovery-invoice-preview.v1" as const, environment: "synthetic_demo" as const,
    tenantId: s.tenantId, jobId: s.jobId, caseId: s.caseId,
    offeringEnabled: managedRecoveryOfferingEnabled, realExternalActions: 0 as const,
    warning: "Practice preview — proposed terms; nothing issued or charged", vatLabel: "VAT not calculated",
    successFee,
    // No opt-in means no service-charge document, even for a case with qualifying recovery.
    serviceChargeInvoice: e === null ? null : {
      kind: "managed_recovery_service_charge" as const, label: "Managed-recovery service charge",
      electionHash: e.bindingHash, termsVersion: e.termsVersion, service: e.selection.service, points: e.selection.points,
      principal: moneyFromBigInt(divideRounded(principal.numerator * BigInt(e.selection.points), principal.denominator * 100n, "half_even")),
    },
  };
}
