import { describe, expect, it } from "vitest";
import { deriveCumulativeRecoveryFee, money } from "./index.js";

describe("cumulative recovery fee derivation", () => {
  it("is split-independent and shares cap and credit across cases", () => {
    const common = { acceptedNet: money(1_880_000), settledPlanPrincipal: money(7_900), priorPostedRecoveryPrincipal: money(0) };
    const split = deriveCumulativeRecoveryFee({ ...common, eligibleLandingPenceByCase: [[32_000], [100_000, 150_000]] });
    const combined = deriveCumulativeRecoveryFee({ ...common, eligibleLandingPenceByCase: [[282_000]] });
    expect(split).toEqual(combined);
    expect(split.cap.pence).toBe(28_200);
    expect(split.creditUsed.pence).toBe(7_900);
    expect(split.additionalLiability.pence).toBe(20_300);
  });

  it("produces only the cumulative delta and compensates a reversal", () => {
    const result = deriveCumulativeRecoveryFee({ acceptedNet: money(1_880_000), eligibleLandingPenceByCase: [[282_000]],
      reversedEligiblePence: 250_000, settledPlanPrincipal: money(7_900), priorPostedRecoveryPrincipal: money(20_300) });
    expect(result.additionalLiability.pence).toBe(0);
    expect(result.postingDelta.pence).toBe(-20_300);
  });

  it("uses half-even at an exact cap half-penny", () => {
    expect(deriveCumulativeRecoveryFee({ acceptedNet: money(100), eligibleLandingPenceByCase: [[100]], settledPlanPrincipal: money(0), priorPostedRecoveryPrincipal: money(0) }).cap.pence).toBe(2);
  });
});
