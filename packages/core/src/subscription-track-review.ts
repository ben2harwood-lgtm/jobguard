import { z } from "zod";
import { londonMeterDateV1 } from "./jobs-on-the-go.js";
import { parseSubscription, subscriptionPlanV1 } from "./subscription.js";
const count = z.number().int().safe().nonnegative();
const suppliedPeriod = z.object({
  id: z.string().min(1).max(100), startDate: londonMeterDateV1, endDateExclusive: londonMeterDateV1,
  countedPlaces: z.array(count).min(28).max(31).readonly(),
}).strict().refine(value => {
  // These UTC instants represent date ordinals, not the duration of London local days.
  const d = new Date(`${value.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + value.countedPlaces.length);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value.endDateExclusive;
}).readonly();
export const subscriptionTrackReviewInputV1 = z.object({
  version: z.literal("subscription-track-review-input.v1"), plan: subscriptionPlanV1, committedPlaces: count,
  periods: z.array(suppliedPeriod).max(3).readonly(),
}).strict().refine(value => new Set(value.periods.map(p => p.id)).size === value.periods.length &&
  value.periods.every((p,i) => i === 0 || p.startDate === value.periods[i-1]!.endDateExclusive), "Consecutive supplied history required").readonly();
export const subscriptionTrackReviewResultV1 = z.object({
  version: z.literal("subscription-track-review-result.v1"), hypothetical: z.literal(true),
  immediate: z.boolean(), sustained: z.boolean(), trackReviewDue: z.boolean(), busyDays: z.array(count.max(31)).max(3).readonly(),
}).strict().readonly();
/** Caller supplies its trailing consecutive periods; no anchor or missing history is inferred. */
export function detectSubscriptionTrackReview(raw: unknown) {
  const input = parseSubscription(subscriptionTrackReviewInputV1, raw);
  const busyDays = input.periods.map(p => p.countedPlaces.filter(n => n > 7).length);
  const immediate = input.plan === "Builder" && input.committedPlaces > 13;
  const sustained = input.plan === "Builder" && busyDays.length === 3 && busyDays.filter(n => n >= 10).length >= 2;
  return parseSubscription(subscriptionTrackReviewResultV1, { version: "subscription-track-review-result.v1", hypothetical: true,
    immediate, sustained, trackReviewDue: immediate || sustained, busyDays });
}
export const subscriptionOnboardingInputV1 = z.object({
  version: z.literal("subscription-onboarding-input.v1"), usualJobs: count, siteStaffCapture: z.boolean(),
}).strict().readonly();
export const subscriptionOnboardingResultV1 = z.object({
  version: z.literal("subscription-onboarding-result.v1"), hypothetical: z.literal(true), recommendedTrack: z.enum(["small_builder", "contractor"]),
}).strict().readonly();
export function routeSubscriptionOnboarding(raw: unknown) {
  const input = parseSubscription(subscriptionOnboardingInputV1, raw);
  return parseSubscription(subscriptionOnboardingResultV1, { version: "subscription-onboarding-result.v1", hypothetical: true,
    recommendedTrack: input.usualJobs > 7 || input.siteStaffCapture ? "contractor" : "small_builder" });
}
