import { evaluateCommercialIntegrity, money, type D11CandidatePolicy } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";

/** Read-only evaluation path: it only reads immutable facts and returns an in-memory review queue. */
export async function getCommercialIntegrityReviewQueue(db: TenantTransaction, policy: D11CandidatePolicy, evaluatedAt: number) {
  const { rows } = await db.$client.query<{
    job_id:string; won_at:Date|null; switched_at:Date|null; quoted:string|null; accepted:string|null; final:string|null;
    activity_at:Date|null; discussed_at:Date|null; outside_at:Date|null; landing_at:Date|null;
  }>(`SELECT j.id job_id,qa.accepted_at won_at,ja.activated_at switched_at,
    coalesce(q.net_value_pence,aq.net_value_pence,qv.net_value_pence) quoted,
    coalesce(aq.net_value_pence,av.net_value_pence) accepted,
    coalesce(f.net_pence,fv.net_value_pence) final,
    a.activity_at,a.discussed_at,a.outside_at,l.landing_at
    FROM app.job j
    LEFT JOIN app.quote_version aq ON(aq.tenant_id,aq.job_id,aq.id)=
      (j.tenant_id,j.id,coalesce(j.baseline_quote_version_id,j.accepted_quote_version_id))
    LEFT JOIN LATERAL (SELECT a.accepted_at FROM app.quote_acceptance a
      LEFT JOIN app.quote_acceptance_sequence s ON(s.tenant_id,s.job_id,s.acceptance_id)=(a.tenant_id,a.job_id,a.id)
      WHERE (a.tenant_id,a.job_id,a.document_id)=(j.tenant_id,j.id,aq.id)
      ORDER BY coalesce(s.acceptance_sequence,1) DESC,a.recorded_at DESC,a.id DESC LIMIT 1) qa ON true
    LEFT JOIN LATERAL (SELECT (d.snapshot->>'netPence')::bigint net_value_pence FROM app.quote_send s
      JOIN app.quote_document_version d ON(d.tenant_id,d.job_id,d.id,d.content_hash)=
        (s.tenant_id,s.job_id,s.document_id,s.content_hash)
      WHERE s.tenant_id=j.tenant_id AND s.job_id=j.id ORDER BY s.issued_at DESC,s.id DESC LIMIT 1) q ON true
    LEFT JOIN app.final_account_draft fd ON(fd.tenant_id,fd.job_id)=(j.tenant_id,j.id)
    LEFT JOIN app.final_account_revision f ON(f.tenant_id,f.job_id,f.id)=(j.tenant_id,j.id,fd.current_revision_id)
    LEFT JOIN app.job_activation ja ON(ja.tenant_id,ja.job_id)=(j.tenant_id,j.id) AND ja.mode='synthetic_demo'
    -- Preserve historical synthetic facts only where the authoritative snapshot is absent.
    LEFT JOIN LATERAL (SELECT net_value_pence FROM app.commercial_integrity_value_fact
      WHERE tenant_id=j.tenant_id AND job_id=j.id AND value_kind='accepted' AND synthetic
      ORDER BY occurred_at DESC,id DESC LIMIT 1) av ON true
    LEFT JOIN LATERAL (SELECT net_value_pence FROM app.commercial_integrity_value_fact
      WHERE tenant_id=j.tenant_id AND job_id=j.id AND value_kind='quoted' AND synthetic
      ORDER BY occurred_at DESC,id DESC LIMIT 1) qv ON true
    LEFT JOIN LATERAL (SELECT net_value_pence FROM app.commercial_integrity_value_fact
      WHERE tenant_id=j.tenant_id AND job_id=j.id AND value_kind='final' AND synthetic
      ORDER BY occurred_at DESC,id DESC LIMIT 1) fv ON true
    LEFT JOIN LATERAL (SELECT max(occurred_at) FILTER (WHERE activity_kind='site_activity') activity_at,
      max(occurred_at) FILTER (WHERE activity_kind='recovery_discussed') discussed_at,
      max(occurred_at) FILTER (WHERE activity_kind='outside_app_settlement') outside_at
      FROM app.commercial_integrity_activity_fact WHERE tenant_id=j.tenant_id AND job_id=j.id AND synthetic) a ON true
    -- Each allocation contributes only its unreversed eligible net principal.
    LEFT JOIN LATERAL (SELECT max(x.created_at) landing_at FROM app.landing_allocation x
      WHERE x.tenant_id=j.tenant_id AND x.job_id=j.id AND x.eligible_net_pence >
        coalesce((SELECT sum(r.eligible_net_pence) FROM app.landing_reversal r
          WHERE (r.tenant_id,r.job_id,r.allocation_id)=(x.tenant_id,x.job_id,x.id)),0)) l ON true`);
  const facts = rows.map((row) => ({
    jobId: row.job_id,
    ...(row.won_at ? { wonAt: row.won_at.getTime() } : {}),
    ...(row.switched_at ? { switchedLiveAt: row.switched_at.getTime() } : {}),
    ...(row.quoted !== null ? { quotedNetValue: money(Number(row.quoted)) } : {}),
    ...(row.accepted !== null ? { acceptedNetValue: money(Number(row.accepted)) } : {}),
    ...(row.final !== null ? { finalNetValue: money(Number(row.final)) } : {}),
    ...(row.activity_at ? { lastLiveActivityAt: row.activity_at.getTime() } : {}),
    ...(row.discussed_at ? { recoveryDiscussedAt: row.discussed_at.getTime() } : {}),
    ...(row.outside_at ? { outsideAppSettlementReportedAt: row.outside_at.getTime() } : {}),
    ...(row.landing_at ? { inAppLandingAt: row.landing_at.getTime() } : {}),
  }));
  return evaluateCommercialIntegrity(facts, policy, evaluatedAt);
}
