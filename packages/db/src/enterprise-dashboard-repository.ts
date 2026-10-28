import type { Pool } from "pg";
import type { BillingStatus, BillingAllocation } from "@jobguard/core";
import { z } from "zod";
import { EnterpriseDashboardError, dashboardParse, dashboardQueryV1, dashboardFactsV1, projectEnterpriseDashboard, projectStoredDashboardBilling, enterpriseSignalFactsV1 } from "@jobguard/core";
import { scopedEnterpriseSignals } from "./enterprise-dashboard-signals.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { enterpriseDashboardSourceSql, enterpriseDashboardScopeLockSql } from "./enterprise-dashboard-queries.js";

/** ENT-6B must supply full composition and exact allocation references bound to the same source snapshot.
 * No fake/empty successful implementation is wired. The supplied-fact core projector confers no authority.
 */
export interface EnterpriseDashboardBillingReadPort {
  readAtSnapshot(snapshotReference: string, authorizedJobIds: readonly string[]): Promise<
    { status: "held"; prerequisite: "ENT-6B" } |
    { status: "available"; snapshotReference: string; facts: readonly BillingStatus[]; allocations: readonly BillingAllocation[] }
  >;
}
/** Read-only application repository; existing session/scope routines re-check authority in one SELECT snapshot. */
export class EnterpriseDashboardRepository {
  constructor(private readonly pool: Pool) {}
  /** Billed/paid only; no fee reads, signals, transport or UI. */
  async readBilling(context: VerifiedTenantContext, sessionId: string, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    if (!z.guid().safeParse(sessionId).success) throw new EnterpriseDashboardError("NOT_FOUND");
    const query = dashboardParse(dashboardQueryV1, raw);
    return withTenant(this.pool, context, async db => {
      await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
      const row = (await db.$client.query<{ authorized: boolean; facts: unknown; billing: unknown }>(
        enterpriseDashboardSourceSql, [sessionId, context.tenantId])).rows[0];
      if (!row?.authorized) throw new EnterpriseDashboardError("NOT_FOUND");
      const facts = dashboardParse(dashboardFactsV1, row.facts);
      for (const [key, value] of Object.entries(query.filters)) {
        if (!facts.extras.some(e => e.dimensions[key as keyof typeof e.dimensions] === value))
          throw new EnterpriseDashboardError("NOT_FOUND");
      }
      return projectStoredDashboardBilling(facts, query, row.billing);
    });
  }
  async read(context: VerifiedTenantContext, sessionId: string, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    if (!z.guid({ error: "Invalid uuid" }).safeParse(sessionId).success) throw new EnterpriseDashboardError("NOT_FOUND");
    const query = dashboardParse(dashboardQueryV1, raw);
    return withTenant(this.pool, context, async db => {
      await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
      const row = (await db.$client.query<{ authorized: boolean; facts: unknown; signals: unknown }>(enterpriseDashboardSourceSql, [sessionId, context.tenantId])).rows[0];
      if (!row?.authorized) throw new EnterpriseDashboardError("NOT_FOUND");
      const facts = dashboardParse(dashboardFactsV1, row.facts);
      for (const [key, value] of Object.entries(query.filters)) {
        const visible = [...facts.extras, ...facts.closeouts].some(e => e.dimensions[key as keyof typeof e.dimensions] === value);
        if (!visible) throw new EnterpriseDashboardError("NOT_FOUND");
      }
      const report = projectEnterpriseDashboard(facts, query), signalFacts = dashboardParse(enterpriseSignalFactsV1, row.signals);
      const signals = scopedEnterpriseSignals(facts, query, signalFacts);
      return { report, signals };
    });
  }
}
