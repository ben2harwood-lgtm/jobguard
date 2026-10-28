import { PlanEntitlementError, planEntitlementCheckV1, planEntitlementDecisionV1, planEntitlementFeatureV1, type PlanEntitlementDecision, type PlanEntitlementFeature } from "@jobguard/core";
import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";

/** Transaction-only server service. Call before receipts/business locks, including on replay.
 * SQL independently re-reads effective agreement/plan under the writers' locks.
 * An included decision is never a resource permission or a commercial approval.
 */
export async function serverEntitlement(db: TenantTransaction, actor: string, feature: PlanEntitlementFeature,
  purpose: "new_work" | "retained_read" = "new_work"): Promise<PlanEntitlementDecision> {
  planEntitlementFeatureV1.parse(feature);
  const row = (await db.$client.query<{ decision: unknown }>(
    "SELECT app.mon8_feature_decision($1,$2,$3) decision", [actor, feature, purpose])).rows[0];
  const decision = planEntitlementDecisionV1.parse(row?.decision);
  if (decision.feature !== feature) throw new PlanEntitlementError("ENTITLEMENT_UNAVAILABLE");
  return decision;
}
export async function requireServerEntitlement(db: TenantTransaction, actor: string, feature: PlanEntitlementFeature,
  purpose: "new_work" | "retained_read" = "new_work"): Promise<void> {
  const decision = await serverEntitlement(db, actor, feature, purpose);
  if (!decision.executable) throw new PlanEntitlementError(decision.entitlement === "included" ? "ENTITLEMENT_UNAVAILABLE" : "ENTITLEMENT_FORBIDDEN");
}

/** The digest and context come from the existing authenticated identity bridge.
 * The callback, including any permitted work, remains inside the authority transaction.
 */
export async function withCompanyEntitlement<T>(pool: Pool, context: VerifiedTenantContext, digest: string,
  raw: unknown, consume: (db: TenantTransaction, decision: PlanEntitlementDecision) => Promise<T>): Promise<T> {
  const request = planEntitlementCheckV1.parse(raw);
  return withTenant(pool, context, async db => {
    const row = (await db.$client.query<{ decision: unknown }>(
      "SELECT app.mon8_company_feature($1,$2,$3) decision", [digest, request.feature, request.jobId ?? null])).rows[0];
    const decision = planEntitlementDecisionV1.parse(row?.decision);
    if (decision.feature !== request.feature) throw new PlanEntitlementError("ENTITLEMENT_UNAVAILABLE");
    return consume(db, decision);
  });
}
