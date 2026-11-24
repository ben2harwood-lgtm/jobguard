import type { Pool } from "pg";
import type { RegisterSource, RegisterWeek } from "@jobguard/core";
import { practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const iso = (value: Date | null) => value === null ? null : value.toISOString();
type Row = { jobId: string; jobTitle: string; variationId: string; createdAt: Date; description: string; revisionId: string | null; revisionNumber: number | null;
  revisionDescription: string | null; signedDeltaPence: string | null; pricedAt: Date | null; approvedAt: Date | null; rejectedAt: Date | null };

/**
 * QW-3: every extra on the tenant's live jobs, as at the week's close. Reads append-only rows only: the latest revision
 * recorded before the close, and an approval or rejection of that revision recorded before the close. Amounts leave
 * PostgreSQL as text so no pence value passes through a float. Practice mode shares one tenant between practice
 * sessions, so only jobs this session owns (the same ownership rule as every practice job read) are listed.
 */
export class VariationRegisterRepository {
  constructor(private readonly pool: Pool) {}

  async sources(context: VerifiedTenantContext, ownerDigest: string, week: RegisterWeek): Promise<RegisterSource[]> {
    return withTenant(this.pool, context, async db => {
      const rows = await db.$client.query<Row>(`${practiceOwnedJobsSql("$3")}
        SELECT j.id AS "jobId",j.title AS "jobTitle",v.id AS "variationId",v.created_at AS "createdAt",v.description,
          r.id AS "revisionId",r.revision AS "revisionNumber",r.description AS "revisionDescription",r.signed_delta_pence::text AS "signedDeltaPence",r.created_at AS "pricedAt",
          a.approved_at AS "approvedAt",x.rejected_at AS "rejectedAt"
        FROM app.job j JOIN app.variation v ON (v.tenant_id,v.job_id)=(j.tenant_id,j.id)
        LEFT JOIN LATERAL (SELECT r.* FROM app.variation_revision r WHERE (r.tenant_id,r.job_id,r.variation_id)=(v.tenant_id,v.job_id,v.id) AND r.created_at<$2
          ORDER BY r.revision DESC LIMIT 1) r ON true
        LEFT JOIN LATERAL (SELECT a.approved_at FROM app.variation_approval a WHERE (a.tenant_id,a.revision_id)=(r.tenant_id,r.id) AND a.created_at<$2 AND a.approved_at<$2
          ORDER BY a.approved_at,a.id LIMIT 1) a ON true
        LEFT JOIN LATERAL (SELECT x.rejected_at FROM app.variation_rejection x WHERE (x.tenant_id,x.variation_id)=(v.tenant_id,v.id)
          AND x.revision_id IS NOT DISTINCT FROM r.id AND x.rejected_at<$2 ORDER BY x.rejected_at,x.id LIMIT 1) x ON true
        WHERE j.tenant_id=$1 AND j.id IN(SELECT id FROM practice_owned_job) AND j.status IN('live','invoiced','paid') AND v.created_at<$2
        ORDER BY j.id,v.created_at,v.id`, [context.tenantId, week.closesAt, ownerDigest]);
      return rows.rows.map(row => ({
        jobId: row.jobId, jobTitle: row.jobTitle, variationId: row.variationId, createdAt: row.createdAt.toISOString(), description: row.description,
        revision: row.revisionId === null ? null : { id: row.revisionId, number: row.revisionNumber!, description: row.revisionDescription!, signedDeltaPence: row.signedDeltaPence!, createdAt: row.pricedAt!.toISOString() },
        approvedAt: iso(row.approvedAt), rejectedAt: iso(row.rejectedAt),
      }));
    });
  }
}
