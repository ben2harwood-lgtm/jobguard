import { moneyFromBigInt, type Money } from "./money.js";
import { multiplyRatio } from "./rational.js";

export const REFERENCE_FEE_POLICY_VERSION = "reference_fee_policy_v1" as const;
export const BASE_PLAN_PRINCIPAL = 7_900n;

export type FeeCalculation = Readonly<{
  policyVersion: typeof REFERENCE_FEE_POLICY_VERSION;
  cap: Money; cappedFee: Money; creditUsed: Money; additionalLiability: Money; postingDelta: Money;
}>;

export function calculateReferenceFee(input: Readonly<{
  acceptedNet: Money; cumulativeEligibleLanded: Money; settledPlanPrincipal: Money; priorPostedRecoveryPrincipal: Money;
}>): FeeCalculation {
  const accepted = BigInt(input.acceptedNet.pence);
  const landed = BigInt(input.cumulativeEligibleLanded.pence);
  const settled = BigInt(input.settledPlanPrincipal.pence);
  if (accepted < 0n || landed < 0n || settled < 0n) throw new RangeError("Fee inputs cannot be negative");
  const cap = multiplyRatio(accepted, 15n, 1000n, "half_even");
  const uncappedFee = multiplyRatio(landed, 1n, 10n, "half_even");
  const cappedFee = uncappedFee < cap ? uncappedFee : cap;
  const eligibleSettlement = settled < BASE_PLAN_PRINCIPAL ? settled : BASE_PLAN_PRINCIPAL;
  const creditUsed = eligibleSettlement < cappedFee ? eligibleSettlement : cappedFee;
  const additionalLiability = cappedFee - creditUsed;
  const postingDelta = additionalLiability - BigInt(input.priorPostedRecoveryPrincipal.pence);
  return Object.freeze({
    policyVersion: REFERENCE_FEE_POLICY_VERSION,
    cap: moneyFromBigInt(cap), cappedFee: moneyFromBigInt(cappedFee), creditUsed: moneyFromBigInt(creditUsed),
    additionalLiability: moneyFromBigInt(additionalLiability), postingDelta: moneyFromBigInt(postingDelta),
  });
}
