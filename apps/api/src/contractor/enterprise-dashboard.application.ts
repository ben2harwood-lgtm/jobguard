import type { Pool } from "pg";
import { z } from "zod";
import { EnterpriseDashboardError } from "@jobguard/core";
import { contractorSessionContext, EnterpriseDashboardRepository, type VerifiedTenantContext } from "@jobguard/db";
const principalV1 = z.object({ sessionId: z.guid({ error: "Invalid uuid" }) }).strict();
/** Internal read application; no HTTP route or UI. Input cannot select actor, tenant or grants. */
export class EnterpriseDashboardApplication {
  constructor(private readonly pool: Pool) {}
  async read(principal: unknown, query: unknown) {
    return this.execute(principal, query, "read");
  }
  async readBilling(principal: unknown, query: unknown) {
    return this.execute(principal, query, "readBilling");
  }
  private execute(principal: unknown, query: unknown, operation: "read"): ReturnType<EnterpriseDashboardRepository["read"]>;
  private execute(principal: unknown, query: unknown, operation: "readBilling"): ReturnType<EnterpriseDashboardRepository["readBilling"]>;
  private async execute(principal: unknown, query: unknown, operation: "read" | "readBilling") {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    const parsed = principalV1.safeParse(principal);
    if (!parsed.success) throw new EnterpriseDashboardError("NOT_FOUND");
    try {
      const context: VerifiedTenantContext = await contractorSessionContext(this.pool, parsed.data.sessionId);
      return await new EnterpriseDashboardRepository(this.pool)[operation](context, parsed.data.sessionId, query);
    } catch (error) {
      if (error instanceof EnterpriseDashboardError) throw error;
      if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") throw new EnterpriseDashboardError("NOT_FOUND");
      throw new EnterpriseDashboardError("DASHBOARD_UNAVAILABLE");
    }
  }
}
