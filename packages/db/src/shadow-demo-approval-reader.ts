import type { Pool } from "pg";
import { z } from "zod";
import { authorizePracticeJob } from "./practice-session.js";
import { withTenant } from "./tenant-context.js";

const approval = z.object({ variationId: z.string().uuid(), approvedAt: z.string().datetime(), method: z.literal("customer_portal") }).strict();
/** Synthetic server owner connection only: private provenance stays private to SQL.
 * Reauthenticate job ownership on every read, and never inspect catches before lock. */
export class ShadowDemoApprovalReader {
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
 async read(jobId: string) {
  const auth = await authorizePracticeJob(this.pool, this.sessionId, jobId);
  return withTenant(this.pool, auth.context, async db => {
   const locked = (await db.$client.query("SELECT id FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [auth.context.tenantId, jobId])).rows[0];
   if (!locked) return { complete: false, approvals: [] };
   const rows = await db.$client.query<{ variationId: string; approvedAt: Date | null }>(`
    SELECT v.id "variationId", a.approved_at "approvedAt"
    FROM app.extra_origin o
    JOIN app.variation v ON (v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id)
    LEFT JOIN (app.variation_approval a JOIN app.customer_variation_approval p
     ON (p.tenant_id,p.variation_approval_id)=(a.tenant_id,a.id)
     JOIN app.customer_portal_session s ON (s.tenant_id,s.id)=(p.tenant_id,p.customer_session_id))
     ON (a.tenant_id,a.job_id,a.variation_id,a.revision_id)=(v.tenant_id,v.job_id,v.id,v.current_revision_id)
      AND s.job_id=v.job_id AND a.method='customer_authenticated'
    WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.kind='jobguard_catch'
    ORDER BY v.id`, [auth.context.tenantId, jobId]);
   const approvals = rows.rows.flatMap(row => row.approvedAt === null ? [] : [approval.parse({ variationId: row.variationId, approvedAt: row.approvedAt.toISOString(), method: "customer_portal" })]);
   return { complete: rows.rows.length > 0 && approvals.length === rows.rows.length, approvals };
  });
 }
}
