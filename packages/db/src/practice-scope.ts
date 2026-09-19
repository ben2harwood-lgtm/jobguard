import type { TenantTransaction } from "./tenant-context.js";

/** Shared synthetic proof subject. Retired/proposed identities are history, not operational work. */
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
