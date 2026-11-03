import type { Pool } from "pg";
import { ContractorError, evaluateContractorEntitlement, contractorEntitlementAuthorityV1, parsePlanEntitlement, type ContractorEntitlementAuthority } from "@jobguard/core";
import { contractorSessionContext } from "./contractor-session-context.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
/** Server-only callback: consume the projection inside this transaction, never cache it as authority. */
export class ContractorEntitlementAuthorityRepository {
 constructor(private readonly pool: Pool) {}
 async requireFeature(sessionId: string, feature: "operative_roles" | "site_origin_capture"): Promise<void> {
  await this.withAuthority(sessionId, async (_db, authority) => {
   const decision = evaluateContractorEntitlement(authority, feature, {
    version: "contractor-entitlement-enablement.v1", environment: "synthetic_demo", enabled: [feature],
   });
   if (!decision.executable) throw new ContractorError("FORBIDDEN");
  });
 }
 async withAuthority<T>(sessionId: string, consume: (db: TenantTransaction, authority: ContractorEntitlementAuthority) => Promise<T>): Promise<T> {
  const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
  try {
   return await withTenant(this.pool, context, async db => {
    const row = (await db.$client.query<{ authority: unknown }>("SELECT app.mon8_contractor_agreement_context($1) authority", [sessionId])).rows[0];
    const authority = parsePlanEntitlement(contractorEntitlementAuthorityV1, row?.authority);
    return consume(db, authority);
   });
  } catch (error) {
   const message = (error as { message?: string }).message;
   if (message === "FORBIDDEN" || message === "MODE_FORBIDDEN") throw new ContractorError(message);
   throw error;
  }
 }
}
