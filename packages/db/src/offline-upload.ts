import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export interface OfflineCommercialBinding {
 expectedRevision: number; acceptedQuoteVersionId: string | null; authorizationId: string;
 actionType: string; recipient: string; contentHash: string; amountPence: number; currency: "GBP"; policyVersion: string;
}
/** Read-only preflight. No offline request can renew or create an authorization or execute outbound work. */
export async function reviewOfflineCommercialIntent(pool: Pool, context: VerifiedTenantContext, membershipId: string, jobId: string, intent: OfflineCommercialBinding) {
 return withTenant(pool, context, async db => {
  const row = (await db.$client.query<{
   revision: number; accepted_quote_version_id: string | null; authorization_id: string | null;
   active: boolean; action_type: string; recipient: string | null; content_hash: string;
   amount_pence: string | null; currency: string | null; policy_version: string; aggregate_revision: number;
  }>(`SELECT j.revision,j.accepted_quote_version_id,a.id authorization_id,
   (a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved') active,
   a.action_type,a.recipient,a.content_hash,a.amount_pence,a.currency,a.policy_version,a.aggregate_revision
   FROM app.job j JOIN app.membership m ON m.tenant_id=j.tenant_id AND m.id=$3
   AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   LEFT JOIN app.action_authorization a ON a.tenant_id=j.tenant_id AND a.id=$4 AND a.actor_membership_id=m.id
   AND EXISTS(SELECT 1 FROM app.decision d WHERE d.tenant_id=a.tenant_id AND d.id=a.decision_id AND d.subject_type='job' AND d.subject_ref=j.id::text)
   LEFT JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id
   WHERE j.tenant_id=$1 AND j.id=$2`, [context.tenantId, jobId, membershipId, intent.authorizationId])).rows[0];
  if (!row) return "PERMISSION_REVOKED" as const;
  if (row.accepted_quote_version_id !== intent.acceptedQuoteVersionId) return "ACCEPTED_VERSION_CHANGED" as const;
  if (row.revision !== intent.expectedRevision) return "STALE_REVISION" as const;
  if (!row.authorization_id || !row.active) return "APPROVAL_EXPIRED" as const;
  if (row.amount_pence === null || Number(row.amount_pence) !== intent.amountPence || row.currency !== intent.currency) return "STALE_PRICE" as const;
  if (row.action_type !== intent.actionType || row.recipient !== intent.recipient || row.content_hash !== intent.contentHash || row.policy_version !== intent.policyVersion || row.aggregate_revision !== intent.expectedRevision) return "AUTHORITY_CHANGED" as const;
  return "ONLINE_REVIEW_REQUIRED" as const;
 });
}
