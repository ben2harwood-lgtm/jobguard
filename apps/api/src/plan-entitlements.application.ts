import {
  PlanEntitlementError, evaluatePlanEntitlement, requirePlanEntitlement, parsePlanEntitlement,
  planEntitlementCheckV1, planEntitlementFailureV1, type PlanEntitlementDecision,
} from "@jobguard/core";

/**
 * Request-scoped server port; SubscriptionPlanEntitlementAuthority links MON-2A effective plans.
 * The adapter must resolve the persisted session, current membership and subject access
 * before invoking useFacts, and select the applicable immutable job track for job checks.
 * It must retain its transaction/locks through the callback. No cached or client facts.
 * Reads of retained data/exports keep their existing authorization; this port is not a read filter.
 */
export interface PlanEntitlementAuthorityPort {
  withCurrentAuthority<T>(jobId: string | undefined, useFacts: (raw: unknown) => T): Promise<T>;
}
const disabledEnablement = () => ({ version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: [] });

/** Internal server helper only. No route or business executor is installed. */
export class PlanEntitlementsApplication {
  constructor(private readonly authority: PlanEntitlementAuthorityPort, private readonly readEnablement: () => unknown = disabledEnablement) {}
  check(raw: unknown): Promise<PlanEntitlementDecision> { return this.evaluate(raw, false); }
  require(raw: unknown): Promise<PlanEntitlementDecision> { return this.evaluate(raw, true); }
  private async evaluate(raw: unknown, required: boolean): Promise<PlanEntitlementDecision> {
    const request = parsePlanEntitlement(planEntitlementCheckV1, raw);
    try {
      return await this.authority.withCurrentAuthority(request.jobId, facts => {
        const enablement = this.readEnablement();
        return required ? requirePlanEntitlement(facts, request.feature, enablement)
          : evaluatePlanEntitlement(facts, request.feature, enablement);
      });
    } catch (error) {
      if (error instanceof PlanEntitlementError) throw error;
      throw new PlanEntitlementError("ENTITLEMENT_UNAVAILABLE");
    }
  }
}
/** Same version/code shape as existing feature refusals; no source facts or internal details. */
export function planEntitlementHttpFailure(error: unknown) {
  const code = error instanceof PlanEntitlementError ? error.code : "ENTITLEMENT_UNAVAILABLE";
  return { status: code === "INVALID_ENTITLEMENT_INPUT" ? 400 : code === "ENTITLEMENT_FORBIDDEN" ? 403 : 503,
    body: planEntitlementFailureV1.parse({ version: "plan-entitlement-error.v1", code }) };
}
