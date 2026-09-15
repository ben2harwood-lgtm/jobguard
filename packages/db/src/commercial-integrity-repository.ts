import { evaluateCommercialIntegrity, money, type D11CandidatePolicy } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";

/** Read-only evaluation path: it only reads immutable facts and returns an in-memory review queue. */
export async function getCommercialIntegrityReviewQueue(db: TenantTransaction, policy: D11CandidatePolicy, evaluatedAt: number) {
  const { rows } = await db.$client.query<{
    job_id:string; won_at:Date|null; switched_at:Date|null; quoted:string|null; accepted:string|null; final:string|null;
    activity_at:Date|null; discussed_at:Date|null; outside_at:Date|null; landing_at:Date|null;
  }>(`SELECT j.id job_id,min(qa.accepted_at) won_at,min(ja.activated_at) switched_at,
    max(v.net_value_pence)FILTER(WHERE v.value_kind='quoted') quoted,max(v.net_value_pence)FILTER(WHERE v.value_kind='accepted') accepted,
    max(v.net_value_pence)FILTER(WHERE v.value_kind='final') final,max(a.occurred_at)FILTER(WHERE a.activity_kind='site_activity') activity_at,
    max(a.occurred_at)FILTER(WHERE a.activity_kind='recovery_discussed') discussed_at,max(a.occurred_at)FILTER(WHERE a.activity_kind='outside_app_settlement') outside_at,
    max(l.created_at) landing_at FROM app.job j LEFT JOIN app.quote_acceptance qa ON(qa.tenant_id,qa.job_id)=(j.tenant_id,j.id)
    LEFT JOIN app.job_activation ja ON(ja.tenant_id,ja.job_id)=(j.tenant_id,j.id) AND ja.mode='synthetic_demo'
    LEFT JOIN app.commercial_integrity_value_fact v ON(v.tenant_id,v.job_id)=(j.tenant_id,j.id) AND v.synthetic
    LEFT JOIN app.commercial_integrity_activity_fact a ON(a.tenant_id,a.job_id)=(j.tenant_id,j.id) AND a.synthetic
    LEFT JOIN app.landing_allocation l ON(l.tenant_id,l.job_id)=(j.tenant_id,j.id)
    GROUP BY j.id`);
  const facts = rows.map((row) => ({
    jobId: row.job_id,
    ...(row.won_at ? { wonAt: row.won_at.getTime() } : {}),
    ...(row.switched_at ? { switchedLiveAt: row.switched_at.getTime() } : {}),
    ...(row.quoted ? { quotedNetValue: money(Number(row.quoted)) } : {}),
    ...(row.accepted ? { acceptedNetValue: money(Number(row.accepted)) } : {}),
    ...(row.final ? { finalNetValue: money(Number(row.final)) } : {}),
    ...(row.activity_at ? { lastLiveActivityAt: row.activity_at.getTime() } : {}),
    ...(row.discussed_at ? { recoveryDiscussedAt: row.discussed_at.getTime() } : {}),
    ...(row.outside_at ? { outsideAppSettlementReportedAt: row.outside_at.getTime() } : {}),
    ...(row.landing_at ? { inAppLandingAt: row.landing_at.getTime() } : {}),
  }));
  return evaluateCommercialIntegrity(facts, policy, evaluatedAt);
}
