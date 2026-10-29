import { PlanEntitlementError } from "@jobguard/core";
import type { PlanEntitlementLifecycleRepositoryPort } from "@jobguard/db";
import { resolveVerifiedTenantContext } from "./auth/principal-bridge.js";
import type { SubscriptionAuthorityPort } from "./subscription.application.js";
import type { PlanEntitlementAuthorityPort } from "./plan-entitlements.application.js";

/** Request-scoped adapter using MON-2A's real company session, never client plan/trial/payment flags. */
export class SubscriptionPlanEntitlementAuthority implements PlanEntitlementAuthorityPort {
  constructor(private readonly authority: SubscriptionAuthorityPort,
    private readonly repository: PlanEntitlementLifecycleRepositoryPort, private readonly sessionHandle: unknown) {}
  async withCurrentAuthority<T>(jobId: string | undefined, consume: (facts: unknown) => T): Promise<T> {
    const synthetic = () => {
      if (this.authority.environment() !== "synthetic_demo") throw new PlanEntitlementError("ENTITLEMENT_UNAVAILABLE");
    };
    synthetic();
    const { credentials, digest } = await this.authority.resolve(this.sessionHandle);
    const context = await resolveVerifiedTenantContext(this.authority.provider, credentials, this.authority.allowedOrigin);
    synthetic();
    return this.repository.withCurrentAuthority(context, digest, jobId, consume);
  }
}
