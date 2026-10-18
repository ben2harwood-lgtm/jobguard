import { z } from "zod";
import { parsePlanEntitlement } from "./plan-entitlements.js";
export const contractorEntitlementFeatureV1 = z.enum(["operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"]);
const revision = z.number().int().positive().max(2147483647);
/** Internal transaction projection, not a bearer credential or commercial approval. */
export const contractorEntitlementAuthorityV1 = z.object({
 version: z.literal("contractor-entitlement-authority.v1"), environment: z.literal("synthetic_demo"),
 tenantId: z.string().uuid(), membershipId: z.string().uuid(), identityUserId: z.string().uuid(),
 assignment: z.object({ id: z.string().uuid(), revision, track: z.enum(["contractor", "small_builder"]), agreementReference: z.string().regex(/^synthetic-agreement:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u) }).strict().readonly().nullable(),
 status: z.object({ id: z.string().uuid(), revision, status: z.enum(["active", "inactive", "suspended"]) }).strict().readonly().nullable(),
}).strict().refine(v => v.assignment !== null || v.status === null).readonly();
export type ContractorEntitlementAuthority = z.infer<typeof contractorEntitlementAuthorityV1>;
export const contractorEntitlementEnablementV1 = z.object({ version: z.literal("contractor-entitlement-enablement.v1"), environment: z.literal("synthetic_demo"), enabled: z.array(contractorEntitlementFeatureV1).max(5).refine(v => new Set(v).size === v.length) }).strict().readonly();
/** No grants/scopes are inferred. Retained records always need their own current authorization. */
export function evaluateContractorEntitlement(raw: unknown, rawFeature: unknown, rawEnablement: unknown = { version: "contractor-entitlement-enablement.v1", environment: "synthetic_demo", enabled: [] }) {
 const authority = parsePlanEntitlement(contractorEntitlementAuthorityV1, raw);
 const feature = parsePlanEntitlement(contractorEntitlementFeatureV1, rawFeature);
 const enablement = parsePlanEntitlement(contractorEntitlementEnablementV1, rawEnablement);
 const newWorkEligible = authority.assignment?.track === "contractor" && authority.status?.status === "active";
 return Object.freeze({ version: "contractor-entitlement-decision.v1" as const, environment: "synthetic_demo" as const, feature, newWorkEligible, executable: newWorkEligible && enablement.enabled.includes(feature), retainedRead: "requires_current_scope_permission" as const });
}
