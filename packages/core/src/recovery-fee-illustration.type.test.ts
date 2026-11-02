import { expect, it } from "vitest";
import { deriveRecoveryFeeIllustration, type RecoveryFeeIllustrationInputV1 } from "./recovery-fee-illustration.js";
it("S6-05-E type boundary is checked by tsc", () => {
  const check = (input: RecoveryFeeIllustrationInputV1) => {
    // @ts-expect-error a raw receipt is not a qualified-source envelope
    deriveRecoveryFeeIllustration({ receipt: 80000 });
    // @ts-expect-error production cannot be selected
    const production: RecoveryFeeIllustrationInputV1 = { ...input, environment: "production" };
    // @ts-expect-error no subscription offset input
    const offset: RecoveryFeeIllustrationInputV1 = { ...input, subscriptionOffset: 6900 };
    const result = deriveRecoveryFeeIllustration(input);
    // @ts-expect-error no commercial posting claim
    const posted = result.postingDelta;
    // @ts-expect-error exact principal is not integer Money
    const pence: number = result.exactQualifyingPrincipal.pence;
    return [production, offset, posted, pence];
  };
  expect(typeof check).toBe("function");
});
