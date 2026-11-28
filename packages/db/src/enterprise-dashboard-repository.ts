import { mapRequestBindingRefusal } from "./request-binding-error.js";
import type { Pool } from "pg";
import type { BillingStatus, BillingAllocation } from "@jobguard/core";
import { z } from "zod";
import { EnterpriseDashboardError, dashboardParse, dashboardQueryV1, dashboardFactsV1, assembleEnterpriseDashboardReport, assembleStoredDashboardBilling, dashboardSelectionParams, enterpriseSignalFactsV1 } from "@jobguard/core";
import { scopedEnterpriseSignals, storedBilledSignalRowsV1 } from "./enterprise-dashboard-signals.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { dashboardInputBound, enterpriseDashboardSelectionSql, enterpriseDashboardScopeLockSql } from "./enterprise-dashboard-queries.js";

type SelectionRow = { authorized: boolean; integrity: boolean; billing_integrity: boolean | null; activity_visible: boolean; billing_visible: boolean;
  counts: { members: number; visits: number; order_lines: number; billed_signals: number };
  report: unknown; facts: unknown; signals: unknown; signal_billing: unknown; billing_report: unknown };

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
  /** Billed/paid only; no fee reads, signals, transport or UI. Period/dimension selection runs in the database. */
  async readBilling(context: VerifiedTenantContext, sessionId: string, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    if (!z.guid().safeParse(sessionId).success) throw new EnterpriseDashboardError("NOT_FOUND");
    const query = dashboardParse(dashboardQueryV1, raw);
    return mapRequestBindingRefusal(withTenant(this.pool, context, async db => {
      const row = await this.select(db.$client, context, sessionId, query, "billing");
      if (!row.billing_visible) throw new EnterpriseDashboardError("NOT_FOUND");
      if (row.billing_integrity !== true) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
      // Grouped, summed and paged in the database; only an oversized held-run list refuses (never truncates).
      return assembleStoredDashboardBilling(row.billing_report, query);
    }), () => new EnterpriseDashboardError("NOT_FOUND"));
  }
  async read(context: VerifiedTenantContext, sessionId: string, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    if (!z.guid({ error: "Invalid uuid" }).safeParse(sessionId).success) throw new EnterpriseDashboardError("NOT_FOUND");
    const query = dashboardParse(dashboardQueryV1, raw);
    return mapRequestBindingRefusal(withTenant(this.pool, context, async db => {
      const row = await this.select(db.$client, context, sessionId, query, "activity");
      if (!row.activity_visible) throw new EnterpriseDashboardError("NOT_FOUND");
      const report = assembleEnterpriseDashboardReport(row.report, query);
      // Signals are advisory and need their full selected inputs; a selection over the bound says so instead.
      if (row.facts === null || row.signals === null || row.signal_billing === null)
        return { report, signals: { version: "enterprise-signals-bounded.v1", status: "selection_too_large", bound: dashboardInputBound, counts: row.counts } as const };
      const facts = dashboardParse(dashboardFactsV1, row.facts);
      const signals = scopedEnterpriseSignals(facts, query, dashboardParse(enterpriseSignalFactsV1, row.signals), dashboardParse(storedBilledSignalRowsV1, row.signal_billing));
      return { report, signals };
    }), () => new EnterpriseDashboardError("NOT_FOUND"));
  }
  /** One SELECT snapshot under the shared tenant gate; authority is re-resolved by the database for every request. */
  private async select(client: { query: Pool["query"] }, context: VerifiedTenantContext, sessionId: string, query: z.infer<typeof dashboardQueryV1>, resource: "activity" | "billing") {
    await client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
    const row = (await client.query<SelectionRow>(enterpriseDashboardSelectionSql, [sessionId, context.tenantId, dashboardSelectionParams(query, resource)])).rows[0];
    if (!row?.authorized) throw new EnterpriseDashboardError("NOT_FOUND");
    if (!row.integrity) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    return row;
  }
}
