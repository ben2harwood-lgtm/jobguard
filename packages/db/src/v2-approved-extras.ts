import type { PoolClient } from "pg";

/**
 * V2-K5A-1: the one "approved extras total" rule. Each variation counts once, at its latest approved
 * revision, whatever its origin (including none). The approval must match its revision's id, number,
 * content hash and signed amount. $1 is the tenant, $2 the job. K10 switches to this in K5A-1-T.
 */
export const approvedExtrasTotalSql = `
  SELECT COALESCE(sum(latest.pence), 0)::bigint AS pence FROM (
    SELECT DISTINCT ON (a.variation_id) a.signed_delta_pence AS pence
    FROM app.variation_approval a JOIN app.variation_revision r
      ON (r.tenant_id,r.job_id,r.variation_id,r.id,r.revision,r.content_hash,r.signed_delta_pence)
       = (a.tenant_id,a.job_id,a.variation_id,a.revision_id,a.revision,a.content_hash,a.signed_delta_pence)
    WHERE (a.tenant_id,a.job_id)=($1,$2)
    ORDER BY a.variation_id, a.revision DESC, a.created_at DESC, a.id DESC
  ) latest`;

/** The approved extras total for a job, in pence. */
export async function approvedExtrasTotal(client: PoolClient, tenantId: string, jobId: string): Promise<number> {
  const { rows: [row] } = await client.query<{ pence: string }>(approvedExtrasTotalSql, [tenantId, jobId]);
  return Number(row?.pence ?? 0);
}
