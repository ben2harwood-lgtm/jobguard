import { z } from "zod";
import { londonMeterDateV1, syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";

export const meterTodayReadV1 = z.object({
  version: z.literal("meter-today-read.v1"), hypothetical: z.literal(true),
  date: londonMeterDateV1, plan: z.enum(["Solo", "Builder"]),
  countedPlaces: z.number().int().nonnegative().safe(),
  freeSmallPlaces: z.number().int().nonnegative().max(7),
}).strict().refine(value => value.freeSmallPlaces <= syntheticMeterPolicyV1[value.plan].included);
export type MeterTodayRead = z.infer<typeof meterTodayReadV1>;

/** Display only. Counted days are not committed-place command admission. */
export function meterTodayLabels(view: MeterTodayRead) {
  const policy = syntheticMeterPolicyV1[view.plan];
  const cap = policy.included + policy.extrasCap;
  return {
    count: `${view.countedPlaces} of ${policy.included} jobs on the go`,
    capacity: `${view.plan} includes ${policy.included} places, with up to ${policy.extrasCap} extra ${policy.extrasCap === 1 ? "place" : "places"}.`,
    grace: `One grace place above ${cap} places is never billed.`,
    graceUse: view.countedPlaces > cap + 1 ? "Today's count is beyond the grace place."
      : view.countedPlaces === cap + 1 ? "Today's count reaches the grace place."
      : "Today's count is below the grace place.",
    next: view.countedPlaces < policy.included ? "Next job included"
      : view.countedPlaces < cap ? "An extra place is £20 a month, billed by the day."
      : view.countedPlaces === cap ? "The next place is the free grace place."
      : view.plan === "Solo" ? "Further places need a move to Builder."
      : "Further places stay within the monthly maximum and raise an account review.",
  };
}
