import { PlanEntitlementError } from "@jobguard/core";
import type { Pool } from "pg";
import { withCompanyEntitlement } from "@jobguard/db";
import type { IdentityApplication } from "./auth/identity.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { PlanEntitlementsApplication } from "./plan-entitlements.application.js";

/** Request-scoped composition for normal, made-up companies. Never accepts plan,
 * track, trial, payment, agreement or enablement flags from the browser.
 * MON-3's absent persisted trial authority remains a refusal in the SQL service.
 */
export function companyPlanEntitlements(pool: Pool, identity: IdentityApplication, credentials: TenantRequestCredentials): PlanEntitlementsApplication {
  return new PlanEntitlementsApplication({
    async withCurrentDecision<T>(request: unknown, consume: (decision: unknown) => T): Promise<T> {
      if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PlanEntitlementError("ENTITLEMENT_UNAVAILABLE");
      const context = await resolveVerifiedTenantContext(identity.provider, credentials, identity.allowedOrigin);
      const digest = identity.provider.digest(`session:${credentials.sessionToken}`);
      return withCompanyEntitlement(pool, context, digest, request, async (_db, decision) => consume(decision));
    },
  });
}
