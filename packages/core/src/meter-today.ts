import { z } from "zod";
import { londonMeterDateV1, syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";

export const meterTodayReadV1 = z.object({
  version: z.literal("meter-today-read.v1"), hypothetical: z.literal(true),
  date: londonMeterDateV1, plan: z.enum(["Solo", "Builder"]),
  countedPlaces: z.number().int().nonnegative().safe(),
  freeSmallPlaces: z.number().int().nonnegative().max(7),
  // The saved Decision raised when Builder's grace place was crossed. Absent when none exists.
  trackReviewDecisionId: z.string().uuid().optional(),
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

/** One row per metered place; shared jobs retain each original job reference. */
export const meterTodayJobsReadV1 = z.object({
  version: z.literal("meter-today-jobs-read.v1"),
  meter: meterTodayReadV1,
  places: z.array(z.object({
    jobIds: z.array(z.string().uuid()).min(1),
    kind: z.enum(["place", "shared_place", "free_small_place"]),
  }).strict()),
}).strict().superRefine((value, ctx) => {
  const ids = value.places.flatMap(place => place.jobIds);
  if (value.places.length !== value.meter.countedPlaces + value.meter.freeSmallPlaces ||
    value.places.filter(place => place.kind === "free_small_place").length !== value.meter.freeSmallPlaces ||
    new Set(ids).size !== ids.length ||
    value.places.some(place => place.kind === "place" && place.jobIds.length !== 1 ||
      place.kind === "shared_place" && place.jobIds.length < 2)) {
    ctx.addIssue({ code: "custom", message: "Meter job list disagrees with today's count" });
  }
});
export type MeterTodayJobsRead = z.infer<typeof meterTodayJobsReadV1>;
