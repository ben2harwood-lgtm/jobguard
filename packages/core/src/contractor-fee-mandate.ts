import { z } from "zod";
import { feeRateV1 } from "./cumulative-fee.js";
import { utcDatetimeV1 } from "./datetime.js";
import { sha256 } from "./evidence-pack.js";
import { MAX_MONEY_PENCE } from "./money.js";

const id = z.string().uuid().refine(v => v === v.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().safe().min(0).max(MAX_MONEY_PENCE);
export class EnterpriseFeeMandateError extends Error {
  constructor(readonly code: "INVALID_MANDATE" | "MANDATE_INELIGIBLE" | "MANDATE_DARK" | "OUTCOME_UNKNOWN") {
    super(code); this.name = "EnterpriseFeeMandateError";
  }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new EnterpriseFeeMandateError("INVALID_MANDATE");
  return result.data;
}

/** Synthetic selection only; scope/terms hashes refer to fictional specimens, never real contract wording. */
export const enterpriseFeeMandateSelectionV1 = z.object({
  version: z.literal("enterprise-fee-mandate-selection.v1"), tenantId: id, agreementVersionId: id,
  agreementTermsHash: hash, rate: feeRateV1, scopeHash: hash, recipientRef: id,
  policyVersion: z.literal("enterprise_site_capture_policy_v1"),
  collectionScope: z.literal("exact_statement_only"), validFrom: utcDatetimeV1, expiresAt: utcDatetimeV1,
}).strict().refine(v => Date.parse(v.validFrom) < Date.parse(v.expiresAt));
export function enterpriseFeeMandateHash(raw: unknown): string {
  return sha256(JSON.stringify(parse(enterpriseFeeMandateSelectionV1, raw)));
}

/** Record DATA, not a command, identity verification, persistence or permission to charge. No writer is exposed. */
export const enterpriseFeeMandateRecordV1 = z.object({
  version: z.literal("enterprise-fee-mandate-record.v1"), environment: z.literal("synthetic_demo"), mandateId: id,
  selection: enterpriseFeeMandateSelectionV1, termsHash: hash,
  approval: z.object({ resolution: z.literal("approved"), actorMembershipId: id, decisionId: id, commandId: id,
    approvedAt: utcDatetimeV1, termsHash: hash, noticeProcessEvidenceHash: hash }).strict(),
  state: z.enum(["active", "revoked", "cancelled", "superseded"]),
}).strict().refine(v => v.termsHash === enterpriseFeeMandateHash(v.selection) && v.approval.termsHash === v.termsHash)
  .refine(v => Date.parse(v.approval.approvedAt) <= Date.parse(v.selection.validFrom));
export type EnterpriseFeeMandateRecord = z.infer<typeof enterpriseFeeMandateRecordV1>;

const statement = z.object({ statementId: id, revisionId: id, contentHash: hash, sourceHash: hash,
  principalPence: pence, taxPence: pence }).strict();
export const enterpriseFeeMandateCheckV1 = z.object({
  version: z.literal("enterprise-fee-mandate-check.v1"), environment: z.literal("synthetic_demo"), tenantId: id,
  now: utcDatetimeV1, currentSelection: enterpriseFeeMandateSelectionV1, record: enterpriseFeeMandateRecordV1,
  currentMembershipVerified: z.literal(true), providerDefaultsDisabled: z.literal(true),
  providerMandateState: z.enum(["active", "cancelled", "unknown"]),
  billingMode: z.enum(["paid", "pilot_no_charge"]), action: z.enum(["collect", "retry", "refund"]),
  attemptState: z.enum(["not_started", "in_flight", "outcome_unknown", "definite_failure", "settled"]),
  currentStatement: statement, amountPence: pence,
  statementApproval: z.object({ ...statement.shape, resolution: z.literal("approved"), tenantId: id,
    recipientRef: id, decisionId: id, expiresAt: utcDatetimeV1 }).strict(),
}).strict();

/** Pure simulation preflight. Retry and refund authority are deliberately outside this mandate. */
export function checkSyntheticEnterpriseFeeMandate(raw: unknown) {
  const input = parse(enterpriseFeeMandateCheckV1, raw);
  const { record, statementApproval: approval, currentStatement: current } = input;
  const time = Date.parse(input.now), terms = record.selection;
  const reject = () => { throw new EnterpriseFeeMandateError("MANDATE_INELIGIBLE"); };
  if (input.attemptState === "outcome_unknown") throw new EnterpriseFeeMandateError("OUTCOME_UNKNOWN");
  if (input.billingMode === "pilot_no_charge" || record.state !== "active" || input.providerMandateState !== "active"
    || input.tenantId !== terms.tenantId || enterpriseFeeMandateHash(input.currentSelection) !== record.termsHash
    || time < Date.parse(terms.validFrom) || time >= Date.parse(terms.expiresAt)
    || input.action !== "collect" || input.attemptState !== "not_started") reject();
  if (approval.tenantId !== input.tenantId || approval.recipientRef !== terms.recipientRef
    || Date.parse(approval.expiresAt) <= time
    || Object.keys(statement.shape).some(key => current[key as keyof typeof current] !== approval[key as keyof typeof current])
    || input.amountPence === 0 || BigInt(current.principalPence) + BigInt(current.taxPence) !== BigInt(input.amountPence)) reject();
  return { version: "enterprise-fee-mandate-preflight.v1" as const, eligibleForSimulation: true as const,
    productionEnabled: false as const, realExternalActions: 0 as const };
}

/** Unconditional refusal; even valid supplied human-approval data cannot open a live rail. */
export function refuseLiveEnterpriseFeeMandate(): never {
  throw new EnterpriseFeeMandateError("MANDATE_DARK");
}
