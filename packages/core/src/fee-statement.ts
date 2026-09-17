import { z } from "zod";
import { BASE_PLAN_PRINCIPAL, calculateReferenceFee } from "./fee.js";
import { addMoney, money, moneyFromBigInt, subtractMoney, type Money } from "./money.js";

export const feeStatementInputV1 = z.object({
  version: z.literal("fee-statement.v1"),
  mode: z.enum(["synthetic_demo", "pilot_no_charge"]),
  tenantId: z.string().uuid(), jobId: z.string().uuid(),
  acceptedNetPence: z.number().int().nonnegative(), settledBasePlanPence: z.number().int().nonnegative(),
  priorPostedRecoveryPence: z.number().int(), priorRecoveryPaymentsPence: z.number().int().nonnegative(),
  outcomes: z.array(z.object({
    sourceId: z.string().uuid(), caseId: z.string().uuid(), state: z.enum(["eligible", "prevented", "reversed"]),
    eligibleNetPence: z.number().int().nonnegative(), grossCashPence: z.number().int().nonnegative(),
    evidenceId: z.string().uuid().nullable(), evidenceState: z.enum(["verified", "pending", "rejected"]).nullable(),
    reversesSourceId: z.string().uuid().nullable(),
  }).strict()),
}).strict();

export type FeeStatementInputV1 = z.infer<typeof feeStatementInputV1>;
export const feeWhatIfInputV1 = z.object({
  version: z.literal("fee-what-if.v1"),
  acceptedNetPence: z.number().int().min(0).max(1_000_000_000_000),
  eligibleNetPence: z.number().int().min(0).max(1_000_000_000_000),
  settledBasePlanPence: z.number().int().min(0).max(7_900),
}).strict();
export type FeeWhatIfInputV1 = z.infer<typeof feeWhatIfInputV1>;

/** A side-effect-free candidate-policy calculation. It deliberately has no posting identifier. */
export function calculateFeeWhatIf(raw: unknown) {
  const input = feeWhatIfInputV1.parse(raw);
  const calculation = calculateReferenceFee({acceptedNet:money(input.acceptedNetPence),cumulativeEligibleLanded:money(input.eligibleNetPence),settledPlanPrincipal:money(input.settledBasePlanPence),priorPostedRecoveryPrincipal:money(0)});
  const totalPlatformPrincipal=addMoney(money(Number(BASE_PLAN_PRINCIPAL)),calculation.additionalLiability);
  return Object.freeze({version:"fee-what-if-result.v1" as const,policyVersion:calculation.policyVersion,acceptedNet:money(input.acceptedNetPence),eligibleNet:money(input.eligibleNetPence),recoveryCap:calculation.cap,cappedFee:calculation.cappedFee,baseCredit:calculation.creditUsed,additionalFee:calculation.additionalLiability,incrementalRetained:subtractMoney(money(input.eligibleNetPence),calculation.additionalLiability),totalPlatformPrincipal,benefitAfterPlatformPrincipal:subtractMoney(money(input.eligibleNetPence),totalPlatformPrincipal)});
}
export type FeeStatement = Readonly<{
  version: "fee-statement.v1"; mode: "synthetic_demo" | "pilot_no_charge"; policyVersion: "reference_fee_policy_v1";
  labels: readonly string[]; basePlan: Readonly<{ obligation: Money; settled: Money; creditEarned: Money }>;
  eligibleOutcomes: readonly Readonly<{ sourceId: string; caseId: string; state: string; eligiblePrincipal: Money; grossCash: Money; proofHref: string | null; reversesSourceId: string | null }>[];
  principal: Readonly<{ eligibleLanded: Money; cap: Money; cumulativeFee: Money; creditUsed: Money; additionalLiability: Money; incrementalRetained: Money; totalPlatformPrincipal: Money; netBenefitAfterTotalPlatformPrincipal: Money }>;
  grossCash: Readonly<{ landed: Money; note: string }>;
  history: Readonly<{ priorNetPostings: Money; priorPayments: Money; compensation: Money }>;
  collectiblePlatformBalance: null;
}>;

/** Read-only projection. Source rows remain authoritative; this function has no effect or persistence port. */
export function projectFeeStatement(raw: unknown): FeeStatement {
  const input = feeStatementInputV1.parse(raw);
  let eligible = 0n, gross = 0n;
  const outcomes = input.outcomes.map((outcome) => {
    const sign = outcome.state === "reversed" ? -1n : outcome.state === "eligible" ? 1n : 0n;
    if (outcome.state === "eligible" && outcome.evidenceState !== "verified") throw new Error("Eligible outcomes require verified proof");
    eligible += sign * BigInt(outcome.eligibleNetPence); gross += sign * BigInt(outcome.grossCashPence);
    return Object.freeze({ sourceId: outcome.sourceId, caseId: outcome.caseId, state: outcome.state,
      eligiblePrincipal: money(outcome.eligibleNetPence), grossCash: money(outcome.grossCashPence),
      proofHref: outcome.evidenceState === "verified" && outcome.evidenceId ? `/api/jobs/${input.jobId}/evidence/${outcome.evidenceId}` : null,
      reversesSourceId: outcome.reversesSourceId });
  });
  if (eligible < 0n || gross < 0n) throw new Error("Reversals cannot exceed immutable landing sources");
  const eligibleLanded = moneyFromBigInt(eligible);
  const calculation = calculateReferenceFee({ acceptedNet: money(input.acceptedNetPence), cumulativeEligibleLanded: eligibleLanded,
    settledPlanPrincipal: money(input.settledBasePlanPence), priorPostedRecoveryPrincipal: money(input.priorPostedRecoveryPence) });
  const base = money(Number(BASE_PLAN_PRINCIPAL));
  const totalPlatformPrincipal = addMoney(base, calculation.additionalLiability);
  return Object.freeze({ version: "fee-statement.v1", mode: input.mode, policyVersion: calculation.policyVersion,
    labels: Object.freeze(["ILLUSTRATIVE ONLY", "NOT A PLATFORM TAX INVOICE", "NOT MONEY COLLECTED", "VAT EXCLUDED"]),
    basePlan: Object.freeze({ obligation: base, settled: money(input.settledBasePlanPence), creditEarned: calculation.creditUsed }),
    eligibleOutcomes: Object.freeze(outcomes),
    principal: Object.freeze({ eligibleLanded, cap: calculation.cap, cumulativeFee: calculation.cappedFee, creditUsed: calculation.creditUsed,
      additionalLiability: calculation.additionalLiability, incrementalRetained: subtractMoney(eligibleLanded, calculation.additionalLiability),
      totalPlatformPrincipal, netBenefitAfterTotalPlatformPrincipal: subtractMoney(eligibleLanded, totalPlatformPrincipal) }),
    grossCash: Object.freeze({ landed: moneyFromBigInt(gross), note: "Gross receipt view only; it is not principal benefit and does not calculate VAT or cash due." }),
    history: Object.freeze({ priorNetPostings: money(input.priorPostedRecoveryPence), priorPayments: money(input.priorRecoveryPaymentsPence),
      compensation: calculation.postingDelta.pence < 0 ? money(-calculation.postingDelta.pence) : money(0) }),
    collectiblePlatformBalance: null });
}
