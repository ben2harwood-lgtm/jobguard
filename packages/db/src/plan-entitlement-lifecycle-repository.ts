import { PlanEntitlementError, parsePlanEntitlement, planEntitlementFactsV1 } from "@jobguard/core";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export interface PlanEntitlementLifecycleRepositoryPort {
  withCurrentAuthority<T>(context: VerifiedTenantContext, digest: string, jobId: string | undefined, consume: (facts: unknown) => T): Promise<T>;
}
/** No cache, writes or retained-read filtering; consume under the existing writer locks. */
export class PlanEntitlementLifecycleRepository implements PlanEntitlementLifecycleRepositoryPort {
  constructor(private readonly pool: Pool) {}
  async withCurrentAuthority<T>(context: VerifiedTenantContext, digest: string, jobId: string | undefined, consume: (facts: unknown) => T): Promise<T> {
    if (!z.string().regex(/^[a-f0-9]{64}$/u).safeParse(digest).success ||
      (jobId !== undefined && !z.guid().safeParse(jobId).success)) throw new PlanEntitlementError("INVALID_ENTITLEMENT_INPUT");
    try {
      return await withTenant(this.pool, context, async db => {
        const row = (await db.$client.query("SELECT app.mon8_subscription_context($1,$2,$3) facts", [context.tenantId, digest, jobId ?? null])).rows[0];
        return consume(parsePlanEntitlement(planEntitlementFactsV1, row?.facts));
      });
    } catch (error) {
      if (error instanceof PlanEntitlementError) throw error;
      throw new PlanEntitlementError("ENTITLEMENT_UNAVAILABLE");
    }
  }
}
