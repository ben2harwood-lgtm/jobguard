import { z } from "zod";
import { calculateReferenceFee, type FeeCalculation } from "./fee.js";
import { money, type Money } from "./money.js";

export const SYNTHETIC_RECOVERY_POLICY_VERSION = "reference_fee_policy_v1" as const;
export const PRODUCTION_RECOVERY_ELIGIBILITY_ENABLED = false as const;

export const recoveryModeV1 = z.enum(["synthetic_demo", "pilot_no_charge", "production"]);
export const recoveryCaseStateV1 = z.enum(["identified", "active", "partially_landed", "landed", "prevented"]);
export const syntheticLandingCommandV1 = z.object({
  version: z.literal("recovery.landing.approve.v1"), commandId: z.string().uuid(), jobId: z.string().uuid(),
  caseId: z.string().uuid(), receiptId: z.string().uuid(), evidenceId: z.string().uuid(),
  eligibilityApprovalId: z.string().uuid(), landingApprovalId: z.string().uuid(),
  grossPence: z.number().int().positive(), eligibleNetPence: z.number().int().positive(), currency: z.literal("GBP"),
  policyVersion: z.literal(SYNTHETIC_RECOVERY_POLICY_VERSION), expectedCaseRevision: z.number().int().nonnegative(),
}).strict();

export type RecoveryFeePosition = FeeCalculation & Readonly<{ cumulativeEligibleLanded: Money }>;

/** One job-level calculation: callers aggregate every case before applying the shared cap and credit. */
export function deriveCumulativeRecoveryFee(input: Readonly<{
  eligibleLandingPenceByCase: readonly (readonly number[])[];
  reversedEligiblePence?: number;
  acceptedNet: Money;
  settledPlanPrincipal: Money;
  priorPostedRecoveryPrincipal: Money;
}>): RecoveryFeePosition {
  let landed = 0n;
  for (const recoveryCase of input.eligibleLandingPenceByCase) {
    for (const amount of recoveryCase) {
      const checked = money(amount);
      if (checked.pence < 0) throw new RangeError("Landing cannot be negative");
      landed += BigInt(checked.pence);
    }
  }
  const reversed = money(input.reversedEligiblePence ?? 0);
  landed -= BigInt(reversed.pence);
  if (landed < 0n) throw new RangeError("Reversals cannot exceed cumulative landings");
  const cumulativeEligibleLanded = money(Number(landed));
  return Object.freeze({
    cumulativeEligibleLanded,
    ...calculateReferenceFee({ ...input, cumulativeEligibleLanded }),
  });
}
