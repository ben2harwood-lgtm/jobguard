import type { Pool } from "pg";
import { v2JobProfit } from "@jobguard/core";
import { PracticeAccessError, practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Read one statement snapshot of builder-owned commercial records, never findings. */
export class V2JobProfitRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string, actor: { membershipId: string; identityUserId: string; digest: string }) {
    return withTenant(this.pool, context, async db => {
      const owner = await db.$client.query(`SELECT 1 FROM app.membership
        WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
        AND id=app.current_actor() AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,
      [context.tenantId, actor.membershipId, actor.identityUserId]);
      if (!owner.rowCount) throw new PracticeAccessError("NOT_FOUND");
      const result = await db.$client.query<{ quoted: string | null; extras: string; costs: string }>(`
        ${practiceOwnedJobsSql()}
        SELECT q.net_pence::text quoted,
          (SELECT coalesce(sum(r.signed_delta_pence),0)::text
           FROM app.variation_approval a
           JOIN app.variation_revision r ON (r.tenant_id,r.job_id,r.id)=(a.tenant_id,a.job_id,a.revision_id)
           WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id
           AND NOT EXISTS (SELECT 1 FROM app.variation_approval newer
             WHERE (newer.tenant_id,newer.job_id,newer.variation_id)=(a.tenant_id,a.job_id,a.variation_id)
             AND newer.revision>a.revision)) extras,
          (SELECT coalesce(sum(CASE f.document_type WHEN 'credit' THEN -f.net_pence ELSE f.net_pence END),0)::text
           FROM app.supplier_document d
           JOIN LATERAL (SELECT r.document_type,r.net_pence FROM app.supplier_fact_revision r
             WHERE (r.tenant_id,r.job_id,r.document_id)=(d.tenant_id,d.job_id,d.id)
             ORDER BY r.revision DESC LIMIT 1) f ON true
           WHERE d.tenant_id=j.tenant_id AND d.job_id=j.id AND d.status='ready'
           AND NOT EXISTS (SELECT 1 FROM app.supplier_bill_supersession s
             JOIN app.supplier_fact_revision original ON
               (original.tenant_id,original.job_id,original.id)=(s.tenant_id,s.job_id,s.original_fact_revision_id)
             JOIN app.supplier_fact_revision replacement ON
               (replacement.tenant_id,replacement.job_id,replacement.id)=(s.tenant_id,s.job_id,s.replacement_fact_revision_id)
             WHERE replacement.document_id<>original.document_id AND (s.tenant_id,s.job_id,original.document_id)=(d.tenant_id,d.job_id,d.id))) costs
        FROM app.job j JOIN practice_owned_job owned ON owned.id=j.id
        LEFT JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=
          (j.tenant_id,j.id,coalesce(j.baseline_quote_version_id,j.accepted_quote_version_id))
        LEFT JOIN app.quote_revision q ON (q.tenant_id,q.job_id,q.id)=(d.tenant_id,d.job_id,d.quote_revision_id)
        WHERE j.tenant_id=$1 AND j.id=$2`, [context.tenantId, jobId, actor.digest]);
      const row = result.rows[0];
      if (!row) throw new PracticeAccessError("NOT_FOUND");
      return v2JobProfit(row.quoted, row.extras, row.costs);
    });
  }
}
