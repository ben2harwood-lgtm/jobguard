import { z } from "zod";
import { computeSuppliedMeterPeriod, suppliedMeterPeriodV1, suppliedMeterPeriodResultV1 } from "./jobs-on-the-go.js";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";
import { parseSubscription, SubscriptionError } from "./subscription.js";

export const subscriptionPeriodPreviewV1 = z.object({
  version: z.literal("subscription-period-preview.v1"), meter: suppliedMeterPeriodV1,
}).strict().readonly();
export const subscriptionPeriodPreviewResultV1 = suppliedMeterPeriodResultV1.unwrap().extend({
  version: z.literal("subscription-period-preview-result.v1"),
}).strict().readonly();

/** Hypothetical scalar and unallocated daily contributions, delegated to MON-1. Never an issue or settlement. */
export function computeSubscriptionPeriod(raw: unknown) {
  const input = parseSubscription(subscriptionPeriodPreviewV1, raw);
  const calculation = computeSuppliedMeterPeriod(input.meter);
  return parseSubscription(subscriptionPeriodPreviewResultV1, { ...calculation, version: "subscription-period-preview-result.v1" });
}

/** Signed arithmetic only. Does not apply a correction, select a period, or choose a collection/refund policy. */
export const subscriptionExactContributionV1 = z.object({
  version: z.literal("subscription-exact-contribution.v1"),
  numeratorPence: z.string().max(16).regex(/^(?:0|-?[1-9]\d*)$/u), denominator: z.number().int().min(1).max(366),
}).strict().readonly();
export function roundSubscriptionContribution(raw: unknown) {
  const input = parseSubscription(subscriptionExactContributionV1, raw);
  const numerator = BigInt(input.numeratorPence), denominator = BigInt(input.denominator), limit = BigInt(MAX_MONEY_PENCE) * denominator;
  if (numerator > limit || numerator < -limit) throw new SubscriptionError("SUBSCRIPTION_MAGNITUDE_EXCEEDED");
  return moneyFromBigInt(divideRounded(numerator, denominator, "half_even"));
}
