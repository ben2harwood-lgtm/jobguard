import type { TenantTransaction } from "./tenant-context.js";

/** Operational proof must always name confirmed work, never reserved/retired history. */
export async function listConfirmedPracticeScopes(
  db: TenantTransaction, tenantId: string, jobId: string, limit: 1 | 2,
): Promise<Array<{ id: string }>> {
  return (await db.$client.query<{ id: string }>(
    `SELECT id FROM app.scope_identity
     WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed'
     ORDER BY created_at,id LIMIT $3`,
    [tenantId, jobId, limit],
  )).rows;
}

/**
 * Draft finding previews retain their existing reserved-scope fixture. Once a
 * job leaves draft, findings and operational proof use the same confirmed set.
 * Read lifecycle and identity in one query; never fall back to retired scope or
 * treat a draft finding as authority to complete work.
 */
export async function listPracticeFindingScopes(
  db: TenantTransaction, tenantId: string, jobId: string, limit: 1 | 2,
): Promise<Array<{ id: string }>> {
  return (await db.$client.query<{ id: string }>(
    `SELECT s.id FROM app.scope_identity s
     JOIN app.job j ON (j.tenant_id,j.id)=(s.tenant_id,s.job_id)
     WHERE s.tenant_id=$1 AND s.job_id=$2
       AND ((j.status='draft' AND s.state='reserved')
         OR (j.status<>'draft' AND s.state='confirmed'))
     ORDER BY s.created_at,s.id LIMIT $3`,
    [tenantId, jobId, limit],
  )).rows;
}
