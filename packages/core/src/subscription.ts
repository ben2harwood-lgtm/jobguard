import { z } from "zod";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";

export class SubscriptionError extends Error {
  constructor(readonly code: "INVALID_SUBSCRIPTION_INPUT" | "ANNUAL_SUBSCRIPTION_UNAVAILABLE" | "SUBSCRIPTION_MAGNITUDE_EXCEEDED") {
    super(code); this.name = "SubscriptionError";
  }
}
export function parseSubscription<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new SubscriptionError("INVALID_SUBSCRIPTION_INPUT");
  return result.data;
}
const policy = syntheticMeterPolicyV1;
export const subscriptionPlanV1 = z.enum(["Solo", "Builder"]);
export const subscriptionCatalogueRequestV1 = z.object({
  version: z.literal("subscription-catalogue-request.v1"), policyVersion: z.literal(policy.version),
}).strict().readonly();
const common = {
  schemaVersion: z.literal(1), policyVersion: z.literal(policy.version), status: z.literal(policy.status),
  currency: z.literal("GBP"), extraPlacePence: z.literal(policy.extraPlacePence),
};
export const subscriptionCatalogueRowV1 = z.discriminatedUnion("plan", [
  z.object({ ...common, plan: z.literal("Solo"), monthlyPence: z.literal(policy.Solo.monthlyPence), annualPence: z.literal(29000),
    included: z.literal(policy.Solo.included), extrasCap: z.literal(policy.Solo.extrasCap), maximumPence: z.literal(policy.Solo.maximumPence) }).strict(),
  z.object({ ...common, plan: z.literal("Builder"), monthlyPence: z.literal(policy.Builder.monthlyPence), annualPence: z.literal(69000),
    included: z.literal(policy.Builder.included), extrasCap: z.literal(policy.Builder.extrasCap), maximumPence: z.literal(policy.Builder.maximumPence) }).strict(),
]).readonly();
const catalogue = Object.freeze((["Solo", "Builder"] as const).map(plan => subscriptionCatalogueRowV1.parse({
  schemaVersion: 1, policyVersion: policy.version, status: policy.status, currency: "GBP", plan,
  ...policy[plan], extraPlacePence: policy.extraPlacePence, annualPence: plan === "Solo" ? 29000 : 69000,
})));
export function getSubscriptionCatalogue(raw: unknown) {
  parseSubscription(subscriptionCatalogueRequestV1, raw);
  return catalogue;
}

/** Settled selection fields only. No anchor policy, acceptance, approval or authority is implied. */
export const subscriptionTermsSelectionV1 = z.object({
  version: z.literal("subscription-terms-selection.v1"), catalogueVersion: z.literal(policy.version), plan: subscriptionPlanV1,
  cadence: z.enum(["monthly", "annual"]).default("monthly"), expectedRevision: z.number().int().safe().nonnegative(),
  termsVersion: z.string().trim().min(1).max(100),
}).strict().readonly();
export const subscriptionAnnualAvailable = false;
export function selectSubscriptionTerms(raw: unknown) {
  const selection = parseSubscription(subscriptionTermsSelectionV1, raw);
  if (selection.cadence === "annual") throw new SubscriptionError("ANNUAL_SUBSCRIPTION_UNAVAILABLE");
  return selection;
}

/** Unaccepted change description only; effective dates, approvals and execution remain held. */
export const subscriptionPlanChangeSelectionV1 = subscriptionTermsSelectionV1.unwrap().omit({ version: true, plan: true }).extend({
  version: z.literal("subscription-plan-change-selection.v1"), fromPlan: subscriptionPlanV1, toPlan: subscriptionPlanV1,
}).strict().readonly();
