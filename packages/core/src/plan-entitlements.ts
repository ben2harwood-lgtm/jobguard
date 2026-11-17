import { z } from "zod";
import { getSubscriptionCatalogue, subscriptionPlanV1 } from "./subscription.js";

/** MON-8's complete feature vocabulary. Unassigned features are refused by the schema. */
export const planEntitlementFeatures = Object.freeze([
  "watchdog", "final_check", "invoices", "recovery_cases", "pay_now", "accounting_export",
  "operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso",
] as const);
export const planEntitlementFeatureV1 = z.enum(planEntitlementFeatures);
export type PlanEntitlementFeature = z.infer<typeof planEntitlementFeatureV1>;
const smallBuilderFeatures: ReadonlySet<PlanEntitlementFeature> = new Set([
  "watchdog", "final_check", "invoices", "recovery_cases", "pay_now", "accounting_export",
]);
const catalogue = getSubscriptionCatalogue({ version: "subscription-catalogue-request.v1", policyVersion: "subscription_pricing_policy_v4" });
const catalogueVersion = catalogue[0]!.policyVersion;

/** Internal projection only: the server port supplies these facts after current authorization. */
export const planEntitlementFactsV1 = z.discriminatedUnion("track", [
  z.object({ version: z.literal("plan-entitlement-facts.v1"), track: z.literal("small_builder"),
    plan: subscriptionPlanV1, catalogueVersion: z.literal(catalogueVersion) }).strict(),
  // No positive contractor agreement basis has been authorized for this piece.
  z.object({ version: z.literal("plan-entitlement-facts.v1"), track: z.literal("contractor"),
    agreementAuthority: z.literal("held") }).strict(),
]).readonly();
export const planEntitlementEnablementV1 = z.object({
  version: z.literal("plan-entitlement-enablement.v1"), environment: z.literal("synthetic_demo"),
  enabled: z.array(planEntitlementFeatureV1).max(planEntitlementFeatures.length)
    .refine(values => new Set(values).size === values.length),
}).strict().readonly();
export const planEntitlementCheckV1 = z.object({
  version: z.literal("plan-entitlement-check.v1"), feature: planEntitlementFeatureV1,
  jobId: z.guid({ error: "Invalid uuid" }).optional(),
}).strict().readonly();
export const planEntitlementErrorCodes = ["INVALID_ENTITLEMENT_INPUT", "ENTITLEMENT_FORBIDDEN", "ENTITLEMENT_UNAVAILABLE"] as const;
export type PlanEntitlementErrorCode = typeof planEntitlementErrorCodes[number];
export class PlanEntitlementError extends Error {
  constructor(readonly code: PlanEntitlementErrorCode) { super(code); this.name = "PlanEntitlementError"; }
}
export function parsePlanEntitlement<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PlanEntitlementError("INVALID_ENTITLEMENT_INPUT");
  return parsed.data;
}
export const planEntitlementDecisionV1 = z.object({
  version: z.literal("plan-entitlement-decision.v1"), environment: z.literal("synthetic_demo"),
  feature: planEntitlementFeatureV1, entitlement: z.enum(["included", "excluded", "held"]),
  executable: z.boolean(), reason: z.enum(["available", "feature_disabled", "track_forbidden", "agreement_authority_held"]),
}).strict().superRefine((value, context) => {
  const valid = value.reason === "available" ? value.entitlement === "included" && value.executable
    : value.reason === "feature_disabled" ? value.entitlement === "included" && !value.executable
    : value.reason === "track_forbidden" ? value.entitlement === "excluded" && !value.executable
    : value.entitlement === "held" && !value.executable;
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid entitlement decision" });
}).readonly();
export type PlanEntitlementDecision = z.infer<typeof planEntitlementDecisionV1>;
export const planEntitlementFailureV1 = z.object({
  version: z.literal("plan-entitlement-error.v1"), code: z.enum(planEntitlementErrorCodes),
}).strict().readonly();

/** Pure eligibility only; never membership, commercial approval or a durable execution permit. */
export function evaluatePlanEntitlement(rawFacts: unknown, rawFeature: unknown, rawEnablement: unknown): PlanEntitlementDecision {
  const facts = parsePlanEntitlement(planEntitlementFactsV1, rawFacts);
  const feature = parsePlanEntitlement(planEntitlementFeatureV1, rawFeature);
  const enablement = parsePlanEntitlement(planEntitlementEnablementV1, rawEnablement);
  let entitlement: PlanEntitlementDecision["entitlement"] = "excluded";
  let reason: PlanEntitlementDecision["reason"] = "track_forbidden";
  if (facts.track === "small_builder" && smallBuilderFeatures.has(feature)) {
    entitlement = "included";
    reason = enablement.enabled.includes(feature) ? "available" : "feature_disabled";
  } else if (facts.track === "contractor" && !smallBuilderFeatures.has(feature)) {
    entitlement = "held";
    reason = "agreement_authority_held";
  }
  return planEntitlementDecisionV1.parse({ version: "plan-entitlement-decision.v1", environment: "synthetic_demo",
    feature, entitlement, executable: reason === "available", reason });
}
export function requirePlanEntitlement(rawFacts: unknown, rawFeature: unknown, rawEnablement: unknown): PlanEntitlementDecision {
  const decision = evaluatePlanEntitlement(rawFacts, rawFeature, rawEnablement);
  if (!decision.executable) throw new PlanEntitlementError(decision.entitlement === "included" ? "ENTITLEMENT_UNAVAILABLE" : "ENTITLEMENT_FORBIDDEN");
  return decision;
}

/** No meter, billing calculation or independent price list; the parent's proposed catalogue owns these values. */
export function planEntitlementCapacity(rawFacts: unknown) {
  const facts = parsePlanEntitlement(planEntitlementFactsV1, rawFacts);
  if (facts.track !== "small_builder") return null;
  const row = catalogue.find(candidate => candidate.plan === facts.plan)!;
  return Object.freeze({ version: "plan-entitlement-capacity.v1" as const, plan: row.plan,
    catalogueVersion: row.policyVersion, catalogueStatus: row.status,
    included: row.included, extrasCap: row.extrasCap, maximumPence: row.maximumPence });
}
