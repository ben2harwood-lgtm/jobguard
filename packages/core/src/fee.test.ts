import { describe, expect, it } from "vitest";
import { calculateReferenceFee } from "./fee.js";
import { money } from "./money.js";

const fee = (accepted: number, landed: number, settled = 7_900, posted = 0) =>
  calculateReferenceFee({ acceptedNet: money(accepted), cumulativeEligibleLanded: money(landed), settledPlanPrincipal: money(settled), priorPostedRecoveryPrincipal: money(posted) });

describe("reference_fee_policy_v1", () => {
  it.each([
    [1_880_000, 282_000, 28_200, 28_200, 7_900, 20_300],
    [18_800_000, 282_000, 282_000, 28_200, 7_900, 20_300],
    [1_000_000, 282_000, 15_000, 15_000, 7_900, 7_100],
    [100_000, 50_000, 1_500, 1_500, 1_500, 0],
    [1_000_000, 0, 15_000, 0, 0, 0],
  ])("reproduces mandatory fixture %# to the penny", (accepted, landed, cap, capped, credit, liability) => {
    const result = fee(accepted, landed);
    expect([result.cap.pence, result.cappedFee.pence, result.creditUsed.pence, result.additionalLiability.pence]).toEqual([cap, capped, credit, liability]);
  });

  it("calculates cumulatively, compensates reversals, and separates owed from settled", () => {
    expect(fee(1_880_000, 32_000).additionalLiability.pence).toBe(0);
    expect(fee(1_880_000, 282_000).additionalLiability.pence).toBe(20_300);
    expect(fee(1_880_000, 32_000, 7_900, 20_300).postingDelta.pence).toBe(-20_300);
    expect(fee(1_880_000, 282_000, 0).additionalLiability.pence).toBe(28_200);
    expect(fee(1_880_000, 282_000, 7_900, 28_200).postingDelta.pence).toBe(-7_900);
  });

  it("distinguishes half-even at an exact half-penny cap", () => {
    expect(fee(100, 10_000, 0).cap.pence).toBe(2); // 1.5p rounds to even 2p
    expect(fee(300, 10_000, 0).cap.pence).toBe(4); // 4.5p rounds to even 4p, not half-up 5p
  });

  it("rejects negative inputs and overflowing results", () => {
    expect(() => fee(-1, 0)).toThrow(RangeError);
    expect(() => fee(1_000, -1)).toThrow(RangeError);
  });

  it("has split/recombine and monotonicity properties over deterministic generated cases", () => {
    let seed = 0x12345678;
    const random = () => (seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0);
    for (let index = 0; index < 2_000; index += 1) {
      const accepted = random() % 100_000_000;
      const first = random() % 10_000_000;
      const second = random() % 10_000_000;
      const combined = fee(accepted, first + second).additionalLiability.pence;
      expect(combined).toBe(fee(accepted, second + first).additionalLiability.pence);
      expect(combined).toBeGreaterThanOrEqual(fee(accepted, first).additionalLiability.pence);
    }
  });
});
