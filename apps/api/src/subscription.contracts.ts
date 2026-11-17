import { z } from "zod";

/** Schema definitions only. No subscription route or execution authority is registered. */
export const subscriptionCatalogueQueryV1 = z.object({
  version: z.literal("subscription-catalogue-query.v1"), policyVersion: z.literal("subscription_pricing_policy_v4"),
}).strict().readonly();
export const subscriptionOnboardingAssessmentV1 = z.object({
  version: z.literal("subscription-onboarding-input.v1"), usualJobs: z.number().int().safe().nonnegative(), siteStaffCapture: z.boolean(),
}).strict().readonly();
